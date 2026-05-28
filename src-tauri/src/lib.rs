mod git;
mod review_bridge;
mod watcher;

use git::AppState;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use tauri::Manager;

pub use review_bridge::{find_bun, sidecar_script_path};

static LAUNCH_PATH: OnceLock<PathBuf> = OnceLock::new();

/// Record an initial repository path supplied by `cub [path]` on the command
/// line. Called before Tauri is built so the frontend can pick it up on mount.
pub fn set_launch_path(path: PathBuf) {
    let _ = LAUNCH_PATH.set(path);
}

#[tauri::command]
fn get_launch_path() -> Option<String> {
    LAUNCH_PATH.get().map(|p| p.to_string_lossy().to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let stop_flag = Arc::new(AtomicBool::new(false));

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState {
            repo: Mutex::new(None),
            bridge: Mutex::new(None),
            event_listener: Mutex::new(None),
            event_listener_stop: stop_flag.clone(),
            clone_cancels: Mutex::new(HashMap::new()),
            watcher: Mutex::new(None),
            watcher_generation: AtomicU64::new(0),
            walker_generation: Arc::new(AtomicU64::new(0)),
            walker_cancel: Arc::new(AtomicBool::new(false)),
        })
        .setup(|app| {
            let state = app.state::<AppState>();
            match review_bridge::start_review_server(state.inner()) {
                Ok(port) => {
                    let handle = review_bridge::start_event_listener(
                        app.handle().clone(),
                        port,
                        state.event_listener_stop.clone(),
                    );
                    if let Ok(mut guard) = state.event_listener.lock() {
                        *guard = Some(handle);
                    }
                }
                Err(e) => {
                    eprintln!("failed to start review server on launch: {e}");
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            git::open_repo,
            git::get_repo_status,
            git::get_branch_diff,
            git::get_branch_file_contents_batch,
            git::get_file_contents_batch,
            git::stage_file,
            git::unstage_file,
            git::stage_all,
            git::commit,
            git::unstage_all,
            git::clone_repo,
            git::cancel_clone,
            git::cleanup_path,
            git::init_repo,
            git::get_repo_branch,
            git::discard_file,
            git::list_branches,
            git::checkout_branch,
            git::get_head_state,
            git::get_commit_details_batch,
            git::get_commit_diff,
            git::get_commit_patch,
            git::get_root_commit_file_contents_batch,
            git::list_commits_stream,
            review_bridge::submit_review,
            get_launch_path,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    let stop = stop_flag;
    app.run(move |app_handle, event| {
        if let tauri::RunEvent::Exit = event {
            let state: &AppState = app_handle.state::<AppState>().inner();

            // 1. Signal the SSE listener thread to stop reconnecting.
            state.event_listener_stop.store(true, Ordering::Relaxed);

            // 2. Kill the sidecar bridge BEFORE touching the listener. The
            //    listener thread is blocked inside `BufReader::lines()` doing
            //    a synchronous socket read; the stop flag alone can't wake it.
            //    Killing the bridge closes the SSE peer, the read returns,
            //    and the loop falls through to the stop-flag check.
            //    Without this ordering the listener stays parked forever and
            //    the exit handler hangs on `join()` — the prod app would
            //    freeze on Cmd+Q and only force-quit could clear it.
            if let Ok(mut guard) = state.bridge.lock() {
                if let Some(mut child) = guard.take() {
                    let _ = child.kill();
                    let _ = child.wait();
                }
            }

            // 3. Detach the listener handle. The thread will observe the
            //    closed socket (or the stop flag on its next iteration) and
            //    return on its own; the OS reaps it when the process exits.
            //    We deliberately do not `join()` — a stuck SSE read here is
            //    exactly the freeze we just fixed, and the thread holds no
            //    resources we need to flush.
            if let Ok(mut guard) = state.event_listener.lock() {
                drop(guard.take());
            }

            // 4. Drop the file watcher so the notify background thread exits.
            if let Ok(mut guard) = state.watcher.lock() {
                *guard = None;
            }

            // Redundant but defensive: any other listener spinning on this
            // shared flag will see it set.
            stop.store(true, Ordering::Relaxed);
        }
    });
}

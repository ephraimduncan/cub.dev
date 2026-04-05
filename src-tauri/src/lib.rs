mod git;
mod review_bridge;

use git::AppState;
use std::sync::Mutex;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppState {
            repo: Mutex::new(None),
            bridge: Mutex::new(None),
        })
        .setup(|app| {
            let state = app.state::<AppState>();
            if let Err(e) = review_bridge::start_review_server(state.inner()) {
                eprintln!("failed to start review server on launch: {e}");
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            git::open_repo,
            git::get_repo_status,
            git::get_file_contents,
            git::stage_file,
            git::unstage_file,
            git::stage_all,
            git::commit,
            git::unstage_all,
            review_bridge::submit_review,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

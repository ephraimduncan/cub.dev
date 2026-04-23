use std::path::{Component, Path};
use std::time::Duration;

use notify::{RecommendedWatcher, RecursiveMode};
use notify_debouncer_full::{
    new_debouncer, DebounceEventResult, Debouncer, RecommendedCache,
};
use tauri::{AppHandle, Emitter};

/// Debounced filesystem watcher. Dropping it stops the background thread and
/// releases the watch on the underlying directory.
pub struct RepoWatcher {
    _debouncer: Debouncer<RecommendedWatcher, RecommendedCache>,
}

/// Start a recursive watch on `workdir`. Events inside `.git` are filtered
/// out; everything else is coalesced with a 300 ms debounce and emits a
/// single `repo:changed` Tauri event to the frontend.
pub fn start(workdir: &Path, app: AppHandle) -> Result<RepoWatcher, String> {
    let mut debouncer = new_debouncer(
        Duration::from_millis(300),
        None,
        move |result: DebounceEventResult| match result {
            Ok(events) => {
                let relevant = events.iter().any(|ev| {
                    ev.event
                        .paths
                        .iter()
                        .any(|p| !path_is_git_internal(p))
                });
                if relevant {
                    let _ = app.emit("repo:changed", ());
                }
            }
            Err(errors) => {
                for err in errors {
                    eprintln!("[cub-watcher] error: {err}");
                }
            }
        },
    )
    .map_err(|e| format!("failed to create watcher: {e}"))?;

    debouncer
        .watch(workdir, RecursiveMode::Recursive)
        .map_err(|e| format!("failed to watch {}: {e}", workdir.display()))?;

    Ok(RepoWatcher {
        _debouncer: debouncer,
    })
}

fn path_is_git_internal(path: &Path) -> bool {
    path.components().any(|c| match c {
        Component::Normal(name) => name == ".git",
        _ => false,
    })
}

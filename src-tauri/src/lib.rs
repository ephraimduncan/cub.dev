mod git;

use git::AppState;
use std::sync::Mutex;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppState {
            repo: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            git::open_repo,
            git::get_repo_status,
            git::get_file_diff,
            git::stage_file,
            git::unstage_file,
            git::stage_all,
            git::commit,
            git::unstage_all,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

use std::collections::HashMap;
use std::path::Path;
use std::process::Child;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::Instant;

use git2::{Repository, Status, StatusOptions};
use git2::build::{CheckoutBuilder, RepoBuilder};
use git2::{FetchOptions, RemoteCallbacks};
use serde::Serialize;
use serde_json::json;
use tauri::{AppHandle, Emitter, State};

// Temporary perf instrumentation. Emits perf:log events to the frontend and
// also prints to stderr so logs show up in the terminal that launched the
// Tauri process. Remove once the lag investigation is done.
fn perf_event(app: &AppHandle, op: &str, extra: serde_json::Value) {
    eprintln!("[cub-perf] rust:{op} {extra}");
    let mut payload = match extra {
        serde_json::Value::Object(m) => m,
        _ => serde_json::Map::new(),
    };
    payload.insert("op".to_string(), serde_json::Value::String(op.to_string()));
    let _ = app.emit("perf:log", serde_json::Value::Object(payload));
}

fn ms_since(start: Instant) -> f64 {
    let d = start.elapsed();
    (d.as_secs_f64() * 1000.0 * 100.0).round() / 100.0
}

pub struct AppState {
    pub repo: Mutex<Option<Repository>>,
    pub bridge: Mutex<Option<Child>>,
    pub event_listener: Mutex<Option<JoinHandle<()>>>,
    pub event_listener_stop: Arc<AtomicBool>,
    pub clone_cancels: Mutex<HashMap<String, Arc<AtomicBool>>>,
    pub watcher: Mutex<Option<crate::watcher::RepoWatcher>>,
}

fn restart_watcher(app: &AppHandle, state: &AppState, workdir: &Path) {
    let new_watcher = match crate::watcher::start(workdir, app.clone()) {
        Ok(w) => Some(w),
        Err(e) => {
            eprintln!("[cub-watcher] failed to start: {e}");
            None
        }
    };
    if let Ok(mut guard) = state.watcher.lock() {
        *guard = new_watcher;
    }
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "snake_case")]
pub enum ChangeKind {
    Added,
    Modified,
    Deleted,
    Renamed,
    Typechange,
}

#[derive(Serialize, Clone)]
pub struct FileEntry {
    pub path: String,
    pub kind: ChangeKind,
    pub additions: u32,
    pub deletions: u32,
}

#[derive(Serialize)]
pub struct RepoStatus {
    pub staged: Vec<FileEntry>,
    pub unstaged: Vec<FileEntry>,
    pub untracked: Vec<String>,
}

/// Open a git repository at `path` and store it in app state.
/// Returns the absolute workdir path on success.
#[tauri::command]
pub fn open_repo(
    path: String,
    app: AppHandle,
    state: State<AppState>,
) -> Result<String, String> {
    let repo = Repository::discover(&path).map_err(|e| format!("failed to open repo: {e}"))?;
    let workdir_path = repo
        .workdir()
        .ok_or_else(|| "bare repositories are not supported".to_string())?
        .to_path_buf();
    let workdir = workdir_path.to_string_lossy().to_string();
    *state
        .repo
        .lock()
        .map_err(|e| format!("lock poisoned: {e}"))? = Some(repo);
    restart_watcher(&app, state.inner(), &workdir_path);
    Ok(workdir)
}

fn count_diff_lines(
    diff: &git2::Diff,
) -> Result<HashMap<String, (u32, u32)>, String> {
    let mut counts: HashMap<String, (u32, u32)> = HashMap::new();

    diff.foreach(
        &mut |_delta, _progress| true,
        None,
        None,
        Some(&mut |delta, _hunk, line| {
            if let Some(path) = delta.new_file().path().and_then(|p| p.to_str()) {
                let entry = counts.entry(path.to_string()).or_insert((0, 0));
                match line.origin() {
                    '+' => entry.0 += 1,
                    '-' => entry.1 += 1,
                    _ => {}
                }
            }
            true
        }),
    )
    .map_err(|e| format!("failed to iterate diff: {e}"))?;

    Ok(counts)
}

#[tauri::command]
pub fn get_repo_status(
    app: AppHandle,
    state: State<AppState>,
) -> Result<RepoStatus, String> {
    let total_start = Instant::now();
    let lock_start = Instant::now();
    let lock = state
        .repo
        .lock()
        .map_err(|e| format!("lock poisoned: {e}"))?;
    let lock_ms = ms_since(lock_start);
    let repo = lock.as_ref().ok_or("no repository open")?;

    let mut opts = StatusOptions::new();
    opts.include_untracked(true).recurse_untracked_dirs(true);

    let statuses_start = Instant::now();
    let statuses = repo
        .statuses(Some(&mut opts))
        .map_err(|e| format!("failed to get status: {e}"))?;
    let statuses_ms = ms_since(statuses_start);
    let statuses_count = statuses.len();

    let head_tree = repo
        .revparse_single("HEAD^{tree}")
        .ok()
        .and_then(|obj| obj.into_tree().ok());

    let staged_diff_start = Instant::now();
    let staged_diff = repo
        .diff_tree_to_index(head_tree.as_ref(), None, None)
        .map_err(|e| format!("failed to diff staged: {e}"))?;
    let staged_diff_ms = ms_since(staged_diff_start);

    let staged_count_start = Instant::now();
    let staged_counts = count_diff_lines(&staged_diff)?;
    let staged_count_ms = ms_since(staged_count_start);

    let unstaged_diff_start = Instant::now();
    let unstaged_diff = repo
        .diff_index_to_workdir(None, None)
        .map_err(|e| format!("failed to diff unstaged: {e}"))?;
    let unstaged_diff_ms = ms_since(unstaged_diff_start);

    let unstaged_count_start = Instant::now();
    let unstaged_counts = count_diff_lines(&unstaged_diff)?;
    let unstaged_count_ms = ms_since(unstaged_count_start);

    let mut staged = Vec::new();
    let mut unstaged = Vec::new();
    let mut untracked = Vec::new();

    let classify_start = Instant::now();
    for entry in statuses.iter() {
        let path = match entry.path() {
            Some(p) => p.to_string(),
            None => continue,
        };
        let s = entry.status();

        if s.intersects(
            git2::Status::INDEX_NEW
                | git2::Status::INDEX_MODIFIED
                | git2::Status::INDEX_DELETED
                | git2::Status::INDEX_RENAMED
                | git2::Status::INDEX_TYPECHANGE,
        ) {
            let kind = if s.contains(git2::Status::INDEX_NEW) {
                ChangeKind::Added
            } else if s.contains(git2::Status::INDEX_MODIFIED) {
                ChangeKind::Modified
            } else if s.contains(git2::Status::INDEX_DELETED) {
                ChangeKind::Deleted
            } else if s.contains(git2::Status::INDEX_RENAMED) {
                ChangeKind::Renamed
            } else {
                ChangeKind::Typechange
            };
            let (additions, deletions) = staged_counts
                .get(&path)
                .copied()
                .unwrap_or((0, 0));
            staged.push(FileEntry {
                path: path.clone(),
                kind,
                additions,
                deletions,
            });
        }

        if s.intersects(
            git2::Status::WT_MODIFIED
                | git2::Status::WT_DELETED
                | git2::Status::WT_RENAMED
                | git2::Status::WT_TYPECHANGE,
        ) {
            let kind = if s.contains(git2::Status::WT_MODIFIED) {
                ChangeKind::Modified
            } else if s.contains(git2::Status::WT_DELETED) {
                ChangeKind::Deleted
            } else if s.contains(git2::Status::WT_RENAMED) {
                ChangeKind::Renamed
            } else {
                ChangeKind::Typechange
            };
            let (additions, deletions) = unstaged_counts
                .get(&path)
                .copied()
                .unwrap_or((0, 0));
            unstaged.push(FileEntry {
                path: path.clone(),
                kind,
                additions,
                deletions,
            });
        }

        if s.contains(git2::Status::WT_NEW) {
            untracked.push(path);
        }
    }
    let classify_ms = ms_since(classify_start);

    perf_event(
        &app,
        "get_repo_status",
        json!({
            "totalMs": ms_since(total_start),
            "lockWaitMs": lock_ms,
            "statusesMs": statuses_ms,
            "statusesCount": statuses_count,
            "stagedDiffMs": staged_diff_ms,
            "stagedCountLinesMs": staged_count_ms,
            "stagedFiles": staged.len(),
            "unstagedDiffMs": unstaged_diff_ms,
            "unstagedCountLinesMs": unstaged_count_ms,
            "unstagedFiles": unstaged.len(),
            "untrackedFiles": untracked.len(),
            "classifyMs": classify_ms,
        }),
    );

    Ok(RepoStatus {
        staged,
        unstaged,
        untracked,
    })
}

/// Return the old (HEAD) and new (workdir) contents of a file for client-side diffing.
/// This gives `@pierre/diffs` `parseDiffFromFile` full file contents so hunk
/// expansion and custom hunk separators work correctly.
#[derive(Serialize)]
pub struct FileContentsResponse {
    pub name: String,
    /// None when the file is absent on the HEAD side.
    pub old_content: Option<String>,
    /// True when the HEAD side exists but is not valid UTF-8 text.
    pub old_binary: bool,
    /// None when the file is absent on the workdir side.
    pub new_content: Option<String>,
    /// True when the workdir side exists but is not valid UTF-8 text.
    pub new_binary: bool,
}

struct FileSideContent {
    content: Option<String>,
    is_binary: bool,
}

impl FileSideContent {
    /// File is absent from this side (no tree entry, or file doesn't exist on disk).
    fn absent() -> Self {
        Self { content: None, is_binary: false }
    }
}

fn decode_file_side(bytes: &[u8]) -> FileSideContent {
    match std::str::from_utf8(bytes) {
        Ok(text) => FileSideContent {
            content: Some(text.to_owned()),
            is_binary: false,
        },
        Err(_) => FileSideContent {
            content: None,
            is_binary: true,
        },
    }
}

fn read_head_file(repo: &Repository, path: &Path) -> Result<FileSideContent, String> {
    let Some(tree) = repo
        .revparse_single("HEAD^{tree}")
        .ok()
        .and_then(|obj| obj.into_tree().ok())
    else {
        return Ok(FileSideContent::absent());
    };

    let Ok(entry) = tree.get_path(path) else {
        return Ok(FileSideContent::absent());
    };

    let object = entry
        .to_object(repo)
        .map_err(|e| format!("cannot read HEAD object for {}: {e}", path.display()))?;
    let blob = object
        .into_blob()
        .map_err(|_| format!("HEAD entry for {} is not a blob", path.display()))?;

    Ok(decode_file_side(blob.content()))
}

fn read_workdir_file(workdir: &Path, path: &Path) -> Result<FileSideContent, String> {
    let abs = workdir.join(path);
    let canonical_abs = match abs.canonicalize() {
        Ok(p) => p,
        Err(_) => {
            if !abs.exists() {
                return Ok(FileSideContent::absent());
            }
            return Err(format!("cannot canonicalize {}: file exists but path resolution failed", path.display()));
        }
    };
    let canonical_workdir = workdir
        .canonicalize()
        .map_err(|e| format!("cannot canonicalize workdir: {e}"))?;
    if !canonical_abs.starts_with(&canonical_workdir) {
        return Err("path traversal detected".to_string());
    }

    let bytes = std::fs::read(&canonical_abs)
        .map_err(|e| format!("cannot read {}: {e}", path.display()))?;

    Ok(decode_file_side(&bytes))
}

fn read_index_file(repo: &Repository, path: &Path) -> Result<FileSideContent, String> {
    let index = repo.index().map_err(|e| format!("failed to get index: {e}"))?;
    let entry = match index.get_path(path, 0) {
        Some(e) => e,
        None => return Ok(FileSideContent::absent()),
    };
    let blob = repo
        .find_blob(entry.id)
        .map_err(|e| format!("cannot read index blob for {}: {e}", path.display()))?;
    Ok(decode_file_side(blob.content()))
}

#[tauri::command]
pub fn get_file_contents(
    path: String,
    staged: Option<bool>,
    app: AppHandle,
    state: State<AppState>,
) -> Result<FileContentsResponse, String> {
    let total_start = Instant::now();
    let lock_start = Instant::now();
    let lock = state
        .repo
        .lock()
        .map_err(|e| format!("lock poisoned: {e}"))?;
    let lock_ms = ms_since(lock_start);
    let repo = lock.as_ref().ok_or("no repository open")?;
    let workdir = repo.workdir().ok_or("bare repository")?;
    let relative_path = Path::new(&path);

    let head_start = Instant::now();
    let old_side = read_head_file(repo, relative_path)?;
    let head_ms = ms_since(head_start);

    let side = if staged.unwrap_or(false) { "index" } else { "workdir" };
    let new_start = Instant::now();
    let new_side = if staged.unwrap_or(false) {
        read_index_file(repo, relative_path)?
    } else {
        read_workdir_file(workdir, relative_path)?
    };
    let new_ms = ms_since(new_start);

    let total_ms = ms_since(total_start);
    // Filter out the firehose: only emit when a single call is slow. 600
    // parallel fast calls would otherwise drown the console.
    if total_ms >= 8.0 || lock_ms >= 5.0 {
        perf_event(
            &app,
            "get_file_contents:slow",
            json!({
                "path": &path,
                "side": side,
                "totalMs": total_ms,
                "lockWaitMs": lock_ms,
                "headMs": head_ms,
                "newMs": new_ms,
                "oldBinary": old_side.is_binary,
                "newBinary": new_side.is_binary,
                "oldLen": old_side.content.as_ref().map(|s| s.len()).unwrap_or(0),
                "newLen": new_side.content.as_ref().map(|s| s.len()).unwrap_or(0),
            }),
        );
    }

    Ok(FileContentsResponse {
        name: path,
        old_content: old_side.content,
        old_binary: old_side.is_binary,
        new_content: new_side.content,
        new_binary: new_side.is_binary,
    })
}

fn stage_path(repo: &Repository, path: &str) -> Result<(), String> {
    let repo_path = Path::new(path);
    let workdir = repo.workdir().ok_or("bare repository")?;
    let exists_in_workdir = workdir.join(repo_path).exists();

    let mut index = repo
        .index()
        .map_err(|e| format!("failed to get index: {e}"))?;

    if exists_in_workdir {
        index
            .add_path(repo_path)
            .map_err(|e| format!("failed to stage file: {e}"))?;
    } else {
        let status = match repo.status_file(repo_path) {
            Ok(status) => status,
            Err(_) => return Ok(()),
        };

        if !status.intersects(
            Status::WT_DELETED
                | Status::WT_RENAMED
                | Status::WT_TYPECHANGE
                | Status::INDEX_DELETED
                | Status::INDEX_RENAMED
                | Status::INDEX_TYPECHANGE,
        ) {
            return Ok(());
        }

        index
            .remove_path(repo_path)
            .map_err(|e| format!("failed to stage file: {e}"))?;
    }

    index
        .write()
        .map_err(|e| format!("failed to write index: {e}"))?;

    Ok(())
}

fn unstage_path(repo: &Repository, path: &str) -> Result<(), String> {
    let head_result = repo.revparse_single("HEAD");

    match head_result {
        Ok(head_obj) => {
            repo.reset_default(Some(&head_obj), [path])
                .map_err(|e| format!("failed to unstage file: {e}"))?;
        }
        Err(_) => {
            // No HEAD yet (initial commit) — remove from index directly
            let mut index = repo
                .index()
                .map_err(|e| format!("failed to get index: {e}"))?;
            index
                .remove_path(Path::new(path))
                .map_err(|e| format!("failed to unstage file: {e}"))?;
            index
                .write()
                .map_err(|e| format!("failed to write index: {e}"))?;
        }
    }

    Ok(())
}

fn collect_paths(repo: &Repository, flags: Status) -> Result<Vec<String>, String> {
    let mut opts = StatusOptions::new();
    opts.include_untracked(true).recurse_untracked_dirs(true);

    let statuses = repo
        .statuses(Some(&mut opts))
        .map_err(|e| format!("failed to get status: {e}"))?;

    let mut paths = Vec::new();
    for entry in statuses.iter() {
        if entry.status().intersects(flags) {
            if let Some(path) = entry.path() {
                paths.push(path.to_string());
            }
        }
    }

    paths.sort();
    paths.dedup();
    Ok(paths)
}

#[tauri::command]
pub fn stage_file(path: String, state: State<AppState>) -> Result<(), String> {
    let lock = state
        .repo
        .lock()
        .map_err(|e| format!("lock poisoned: {e}"))?;
    let repo = lock.as_ref().ok_or("no repository open")?;

    stage_path(repo, &path)
}

#[tauri::command]
pub fn stage_all(state: State<AppState>) -> Result<(), String> {
    let lock = state
        .repo
        .lock()
        .map_err(|e| format!("lock poisoned: {e}"))?;
    let repo = lock.as_ref().ok_or("no repository open")?;

    let paths = collect_paths(
        repo,
        Status::WT_NEW
            | Status::WT_MODIFIED
            | Status::WT_DELETED
            | Status::WT_RENAMED
            | Status::WT_TYPECHANGE,
    )?;

    let workdir = repo.workdir().ok_or("bare repository")?;

    let mut index = repo
        .index()
        .map_err(|e| format!("failed to get index: {e}"))?;

    for path in &paths {
        let repo_path = Path::new(path);
        let exists_in_workdir = workdir.join(repo_path).exists();

        if exists_in_workdir {
            index
                .add_path(repo_path)
                .map_err(|e| format!("failed to stage file: {e}"))?;
        } else {
            let status = match repo.status_file(repo_path) {
                Ok(status) => status,
                Err(_) => continue,
            };

            if !status.intersects(
                Status::WT_DELETED
                    | Status::WT_RENAMED
                    | Status::WT_TYPECHANGE
                    | Status::INDEX_DELETED
                    | Status::INDEX_RENAMED
                    | Status::INDEX_TYPECHANGE,
            ) {
                continue;
            }

            index
                .remove_path(repo_path)
                .map_err(|e| format!("failed to stage file: {e}"))?;
        }
    }

    index
        .write()
        .map_err(|e| format!("failed to write index: {e}"))?;

    Ok(())
}

#[tauri::command]
pub fn unstage_file(path: String, state: State<AppState>) -> Result<(), String> {
    let lock = state
        .repo
        .lock()
        .map_err(|e| format!("lock poisoned: {e}"))?;
    let repo = lock.as_ref().ok_or("no repository open")?;

    unstage_path(repo, &path)
}

#[tauri::command]
pub fn unstage_all(state: State<AppState>) -> Result<(), String> {
    let lock = state
        .repo
        .lock()
        .map_err(|e| format!("lock poisoned: {e}"))?;
    let repo = lock.as_ref().ok_or("no repository open")?;

    for path in collect_paths(
        repo,
        Status::INDEX_NEW
            | Status::INDEX_MODIFIED
            | Status::INDEX_DELETED
            | Status::INDEX_RENAMED
            | Status::INDEX_TYPECHANGE,
    )? {
        unstage_path(repo, &path)?;
    }

    Ok(())
}

#[tauri::command]
pub fn discard_file(path: String, state: State<AppState>) -> Result<(), String> {
    let lock = state
        .repo
        .lock()
        .map_err(|e| format!("lock poisoned: {e}"))?;
    let repo = lock.as_ref().ok_or("no repository open")?;
    let workdir = repo.workdir().ok_or("bare repository")?;

    let relative_path = Path::new(&path);
    let canonical_workdir = workdir
        .canonicalize()
        .map_err(|e| format!("cannot canonicalize workdir: {e}"))?;
    let target = canonical_workdir.join(relative_path);
    let safe_target = if target.exists() {
        target
            .canonicalize()
            .map_err(|e| format!("cannot canonicalize target: {e}"))?
    } else {
        let parent = target.parent().ok_or("invalid path")?;
        let parent_canonical = parent
            .canonicalize()
            .map_err(|e| format!("cannot canonicalize parent: {e}"))?;
        parent_canonical.join(target.file_name().unwrap_or_default())
    };
    if !safe_target.starts_with(&canonical_workdir) {
        return Err("path traversal detected".to_string());
    }

    let status = repo
        .status_file(relative_path)
        .map_err(|e| format!("failed to status file: {e}"))?;
    let index_dirty = status.intersects(
        Status::INDEX_NEW
            | Status::INDEX_MODIFIED
            | Status::INDEX_DELETED
            | Status::INDEX_RENAMED
            | Status::INDEX_TYPECHANGE,
    );

    // Pure untracked file or directory: remove from disk, no git state to touch.
    if status.contains(Status::WT_NEW) && !index_dirty {
        if safe_target.is_dir() {
            std::fs::remove_dir_all(&safe_target)
                .map_err(|e| format!("remove failed: {e}"))?;
        } else if safe_target.exists() {
            std::fs::remove_file(&safe_target)
                .map_err(|e| format!("remove failed: {e}"))?;
        }
        return Ok(());
    }

    // If index has uncommitted changes for this path, reset to HEAD first.
    if index_dirty {
        match repo.revparse_single("HEAD") {
            Ok(head_obj) => {
                repo.reset_default(Some(&head_obj), [&path])
                    .map_err(|e| format!("reset_default failed: {e}"))?;
            }
            Err(_) => {
                // No HEAD yet (initial commit): drop from index directly.
                let mut index = repo
                    .index()
                    .map_err(|e| format!("failed to get index: {e}"))?;
                let _ = index.remove_path(relative_path);
                index
                    .write()
                    .map_err(|e| format!("failed to write index: {e}"))?;
            }
        }
    }

    // Restore workdir from HEAD for that path, if HEAD exists.
    if repo.revparse_single("HEAD").is_ok() {
        let mut cb = CheckoutBuilder::new();
        cb.force();
        cb.path(&path);
        repo.checkout_head(Some(&mut cb))
            .map_err(|e| format!("checkout_head failed: {e}"))?;
    }

    // Staged-new with no HEAD counterpart: after reset the file is untracked. Remove it.
    if let Ok(post) = repo.status_file(relative_path) {
        let post_index_dirty = post.intersects(
            Status::INDEX_NEW
                | Status::INDEX_MODIFIED
                | Status::INDEX_DELETED
                | Status::INDEX_RENAMED
                | Status::INDEX_TYPECHANGE,
        );
        if post.contains(Status::WT_NEW) && !post_index_dirty {
            if safe_target.is_dir() {
                std::fs::remove_dir_all(&safe_target).ok();
            } else if safe_target.exists() {
                std::fs::remove_file(&safe_target).ok();
            }
        }
    }

    Ok(())
}

#[tauri::command]
pub fn commit(message: String, state: State<AppState>) -> Result<String, String> {
    let lock = state
        .repo
        .lock()
        .map_err(|e| format!("lock poisoned: {e}"))?;
    let repo = lock.as_ref().ok_or("no repository open")?;

    if message.trim().is_empty() {
        return Err("commit message cannot be empty".to_string());
    }

    let mut index = repo
        .index()
        .map_err(|e| format!("failed to get index: {e}"))?;

    let tree_oid = index
        .write_tree()
        .map_err(|e| format!("failed to write tree: {e}"))?;

    // Reject empty commits (no changes staged)
    if let Ok(head_ref) = repo.head() {
        if let Ok(head_commit) = head_ref.peel_to_commit() {
            if head_commit.tree_id() == tree_oid {
                return Err("nothing to commit: index matches HEAD".to_string());
            }
        }
    }

    let tree = repo
        .find_tree(tree_oid)
        .map_err(|e| format!("failed to find tree: {e}"))?;

    let sig = repo
        .signature()
        .map_err(|e| format!("failed to get signature: {e}"))?;

    let oid = match repo.head() {
        Ok(head_ref) => {
            let parent = head_ref
                .peel_to_commit()
                .map_err(|e| format!("failed to peel HEAD to commit: {e}"))?;
            repo.commit(Some("HEAD"), &sig, &sig, &message, &tree, &[&parent])
                .map_err(|e| format!("failed to create commit: {e}"))?
        }
        Err(_) => {
            repo.commit(Some("HEAD"), &sig, &sig, &message, &tree, &[])
                .map_err(|e| format!("failed to create initial commit: {e}"))?
        }
    };

    Ok(oid.to_string())
}

#[derive(Serialize, Clone)]
pub struct CloneProgress {
    pub id: String,
    pub phase: &'static str,
    pub received_objects: usize,
    pub total_objects: usize,
    pub indexed_objects: usize,
    pub received_bytes: usize,
    pub checkout_current: usize,
    pub checkout_total: usize,
}

#[tauri::command]
pub fn clone_repo(
    url: String,
    dest: String,
    id: String,
    app: AppHandle,
    state: State<AppState>,
) -> Result<String, String> {
    let cancel = Arc::new(AtomicBool::new(false));
    state
        .clone_cancels
        .lock()
        .map_err(|e| format!("lock poisoned: {e}"))?
        .insert(id.clone(), cancel.clone());

    let result = (|| -> Result<Repository, String> {
        let mut cb = RemoteCallbacks::new();
        let a1 = app.clone();
        let i1 = id.clone();
        let c1 = cancel.clone();
        cb.transfer_progress(move |p| {
            if c1.load(Ordering::SeqCst) {
                return false;
            }
            let _ = a1.emit(
                "clone:progress",
                CloneProgress {
                    id: i1.clone(),
                    phase: "fetch",
                    received_objects: p.received_objects(),
                    total_objects: p.total_objects(),
                    indexed_objects: p.indexed_objects(),
                    received_bytes: p.received_bytes(),
                    checkout_current: 0,
                    checkout_total: 0,
                },
            );
            true
        });
        let mut fo = FetchOptions::new();
        fo.remote_callbacks(cb);

        let mut co = CheckoutBuilder::new();
        let a2 = app.clone();
        let i2 = id.clone();
        let c2 = cancel.clone();
        co.progress(move |_, cur, tot| {
            if c2.load(Ordering::SeqCst) {
                return;
            }
            let _ = a2.emit(
                "clone:progress",
                CloneProgress {
                    id: i2.clone(),
                    phase: "checkout",
                    received_objects: 0,
                    total_objects: 0,
                    indexed_objects: 0,
                    received_bytes: 0,
                    checkout_current: cur,
                    checkout_total: tot,
                },
            );
        });

        RepoBuilder::new()
            .fetch_options(fo)
            .with_checkout(co)
            .clone(&url, Path::new(&dest))
            .map_err(|e| {
                if cancel.load(Ordering::SeqCst) {
                    "clone cancelled".to_string()
                } else {
                    format!("clone failed: {e}")
                }
            })
    })();

    if let Ok(mut guard) = state.clone_cancels.lock() {
        guard.remove(&id);
    }

    let repo = result?;
    let workdir_path = repo
        .workdir()
        .ok_or_else(|| "bare repositories are not supported".to_string())?
        .to_path_buf();
    let workdir = workdir_path.to_string_lossy().to_string();
    *state
        .repo
        .lock()
        .map_err(|e| format!("lock poisoned: {e}"))? = Some(repo);
    restart_watcher(&app, state.inner(), &workdir_path);
    Ok(workdir)
}

#[tauri::command]
pub fn cancel_clone(id: String, state: State<AppState>) -> Result<(), String> {
    if let Some(flag) = state
        .clone_cancels
        .lock()
        .map_err(|e| format!("lock poisoned: {e}"))?
        .get(&id)
    {
        flag.store(true, Ordering::SeqCst);
    }
    Ok(())
}

#[tauri::command]
pub fn cleanup_path(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if p.exists() {
        std::fs::remove_dir_all(p).map_err(|e| format!("cleanup failed: {e}"))?;
    }
    Ok(())
}

#[tauri::command]
pub fn init_repo(
    path: String,
    app: AppHandle,
    state: State<AppState>,
) -> Result<String, String> {
    std::fs::create_dir_all(&path).map_err(|e| format!("mkdir failed: {e}"))?;
    let repo = Repository::init(&path).map_err(|e| format!("init failed: {e}"))?;
    let workdir_path = repo
        .workdir()
        .ok_or_else(|| "bare repositories are not supported".to_string())?
        .to_path_buf();
    let workdir = workdir_path.to_string_lossy().to_string();
    *state
        .repo
        .lock()
        .map_err(|e| format!("lock poisoned: {e}"))? = Some(repo);
    restart_watcher(&app, state.inner(), &workdir_path);
    Ok(workdir)
}

#[tauri::command]
pub fn get_repo_branch(path: String) -> Result<Option<String>, String> {
    let repo = Repository::discover(&path).map_err(|e| format!("open: {e}"))?;
    let head = match repo.head() {
        Ok(h) => h,
        Err(_) => return Ok(None),
    };
    Ok(head.shorthand().map(|s| s.to_string()))
}
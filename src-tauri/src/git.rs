use std::collections::HashMap;
use std::path::Path;
use std::process::Child;
use std::sync::Mutex;

use git2::{Repository, Status, StatusOptions};
use serde::Serialize;
use tauri::State;

pub struct AppState {
    pub repo: Mutex<Option<Repository>>,
    pub bridge: Mutex<Option<Child>>,
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
pub fn open_repo(path: String, state: State<AppState>) -> Result<String, String> {
    let repo = Repository::discover(&path).map_err(|e| format!("failed to open repo: {e}"))?;
    let workdir = repo
        .workdir()
        .ok_or_else(|| "bare repositories are not supported".to_string())?
        .to_string_lossy()
        .to_string();
    *state
        .repo
        .lock()
        .map_err(|e| format!("lock poisoned: {e}"))? = Some(repo);
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
pub fn get_repo_status(state: State<AppState>) -> Result<RepoStatus, String> {
    let lock = state
        .repo
        .lock()
        .map_err(|e| format!("lock poisoned: {e}"))?;
    let repo = lock.as_ref().ok_or("no repository open")?;

    let mut opts = StatusOptions::new();
    opts.include_untracked(true).recurse_untracked_dirs(true);

    let statuses = repo
        .statuses(Some(&mut opts))
        .map_err(|e| format!("failed to get status: {e}"))?;

    let head_tree = repo
        .revparse_single("HEAD^{tree}")
        .ok()
        .and_then(|obj| obj.into_tree().ok());

    let staged_diff = repo
        .diff_tree_to_index(head_tree.as_ref(), None, None)
        .map_err(|e| format!("failed to diff staged: {e}"))?;
    let staged_counts = count_diff_lines(&staged_diff)?;

    let unstaged_diff = repo
        .diff_index_to_workdir(None, None)
        .map_err(|e| format!("failed to diff unstaged: {e}"))?;
    let unstaged_counts = count_diff_lines(&unstaged_diff)?;

    let mut staged = Vec::new();
    let mut unstaged = Vec::new();
    let mut untracked = Vec::new();

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
    if !abs.exists() {
        return Ok(FileSideContent::absent());
    }

    let bytes = std::fs::read(&abs)
        .map_err(|e| format!("cannot read {}: {e}", path.display()))?;

    Ok(decode_file_side(&bytes))
}

#[tauri::command]
pub fn get_file_contents(
    path: String,
    state: State<AppState>,
) -> Result<FileContentsResponse, String> {
    let lock = state
        .repo
        .lock()
        .map_err(|e| format!("lock poisoned: {e}"))?;
    let repo = lock.as_ref().ok_or("no repository open")?;
    let workdir = repo.workdir().ok_or("bare repository")?;
    let relative_path = Path::new(&path);

    let old_side = read_head_file(repo, relative_path)?;
    let new_side = read_workdir_file(workdir, relative_path)?;

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
pub fn commit(message: String, state: State<AppState>) -> Result<String, String> {
    let lock = state
        .repo
        .lock()
        .map_err(|e| format!("lock poisoned: {e}"))?;
    let repo = lock.as_ref().ok_or("no repository open")?;

    let mut index = repo
        .index()
        .map_err(|e| format!("failed to get index: {e}"))?;

    let tree_oid = index
        .write_tree()
        .map_err(|e| format!("failed to write tree: {e}"))?;

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
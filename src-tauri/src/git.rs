use std::collections::HashMap;
use std::path::Path;
use std::sync::Mutex;

use git2::{DiffFormat, DiffOptions, Repository, StatusOptions};
use serde::Serialize;
use tauri::State;

pub struct AppState {
    pub repo: Mutex<Option<Repository>>,
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

/// Generate a unified diff (git format) for a single file vs HEAD.
/// Includes both staged and unstaged changes.
/// Output is suitable for `@pierre/diffs` PatchDiff component.
#[tauri::command]
pub fn get_file_diff(path: String, state: State<AppState>) -> Result<String, String> {
    let lock = state
        .repo
        .lock()
        .map_err(|e| format!("lock poisoned: {e}"))?;
    let repo = lock.as_ref().ok_or("no repository open")?;

    // Resolve HEAD tree. None for repos with no commits (unborn HEAD).
    let head_tree = repo
        .revparse_single("HEAD^{tree}")
        .ok()
        .and_then(|obj| obj.into_tree().ok());

    let mut opts = DiffOptions::new();
    opts.pathspec(&path).include_untracked(true);

    let diff = repo
        .diff_tree_to_workdir_with_index(head_tree.as_ref(), Some(&mut opts))
        .map_err(|e| format!("failed to generate diff: {e}"))?;

    let mut output = String::new();
    diff.print(DiffFormat::Patch, |_delta, _hunk, line| {
        // Content lines (+, -, space) need their prefix character prepended.
        // Header lines (file headers, hunk headers, binary markers) have
        // their content pre-formatted by libgit2.
        if matches!(line.origin(), '+' | '-' | ' ') {
            output.push(line.origin());
        }
        if let Ok(content) = std::str::from_utf8(line.content()) {
            output.push_str(content);
        }
        true
    })
    .map_err(|e| format!("failed to format diff: {e}"))?;

    // Untracked files aren't in HEAD or the index, so the tree-to-workdir
    // diff produces nothing. Build the patch from working directory contents.
    if output.is_empty() {
        let workdir = repo.workdir().ok_or("bare repository")?;
        let abs = workdir.join(&path);
        let bytes = std::fs::read(&abs)
            .map_err(|e| format!("cannot read {path}: {e}"))?;
        output = match std::str::from_utf8(&bytes) {
            Ok(text) => format_new_file_patch(&path, text),
            Err(_) => format!(
                "diff --git a/{path} b/{path}\nnew file mode 100644\nBinary files /dev/null and b/{path} differ\n"
            ),
        };
    }

    if output.is_empty() {
        return Err(format!("no changes found for {path}"));
    }

    Ok(output)
}

fn format_new_file_patch(path: &str, contents: &str) -> String {
    let mut out = format!(
        "diff --git a/{path} b/{path}\nnew file mode 100644\n--- /dev/null\n+++ b/{path}\n"
    );
    let lines: Vec<&str> = contents.lines().collect();
    if lines.is_empty() {
        return out;
    }
    out.push_str(&format!("@@ -0,0 +1,{} @@\n", lines.len()));
    for line in &lines {
        out.push('+');
        out.push_str(line);
        out.push('\n');
    }
    if !contents.ends_with('\n') {
        out.push_str("\\ No newline at end of file\n");
    }
    out
}

#[tauri::command]
pub fn stage_file(path: String, state: State<AppState>) -> Result<(), String> {
    let lock = state
        .repo
        .lock()
        .map_err(|e| format!("lock poisoned: {e}"))?;
    let repo = lock.as_ref().ok_or("no repository open")?;

    let mut index = repo
        .index()
        .map_err(|e| format!("failed to get index: {e}"))?;

    index
        .add_path(Path::new(&path))
        .map_err(|e| format!("failed to stage file: {e}"))?;

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

    match repo.revparse_single("HEAD") {
        Ok(head_obj) => {
            repo.reset_default(Some(&head_obj), [path.as_str()])
                .map_err(|e| format!("failed to unstage file: {e}"))?;
        }
        Err(_) => {
            // No HEAD yet (initial commit) — remove from index directly
            let mut index = repo
                .index()
                .map_err(|e| format!("failed to get index: {e}"))?;
            index
                .remove_path(Path::new(&path))
                .map_err(|e| format!("failed to unstage file: {e}"))?;
            index
                .write()
                .map_err(|e| format!("failed to write index: {e}"))?;
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
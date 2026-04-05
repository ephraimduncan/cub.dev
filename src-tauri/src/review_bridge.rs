use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::git::AppState;

const SERVER_INFO_FILENAME: &str = "review-bridge.json";
const SERVER_START_TIMEOUT: Duration = Duration::from_secs(3);

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ActionType {
    ChangeRequest,
    Question,
    Nit,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewComment {
    pub file_path: String,
    pub line_start: u32,
    pub line_end: u32,
    pub comment: String,
    pub action_type: ActionType,
}

#[derive(Debug, Serialize)]
pub struct SubmitReviewResponse {
    pub submitted_count: usize,
}

#[derive(Debug, Deserialize)]
struct ServerInfo {
    port: u16,
}

fn state_dir() -> Result<PathBuf, String> {
    let home = std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
        .ok_or_else(|| "failed to resolve home directory".to_string())?;
    Ok(home.join(".cub"))
}

fn server_info_path() -> Result<PathBuf, String> {
    Ok(state_dir()?.join(SERVER_INFO_FILENAME))
}

fn workspace_root() -> Result<PathBuf, String> {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .map(Path::to_path_buf)
        .ok_or_else(|| "failed to resolve workspace root".to_string())
}

fn sidecar_script_path() -> Result<PathBuf, String> {
    let path = workspace_root()?.join("sidecar").join("cub-mcp.js");
    if path.exists() {
        Ok(path)
    } else {
        Err(format!("missing sidecar script at {}", path.display()))
    }
}

fn read_server_info() -> Result<Option<ServerInfo>, String> {
    let path = server_info_path()?;
    match std::fs::read_to_string(&path) {
        Ok(raw) => serde_json::from_str(&raw)
            .map(Some)
            .map_err(|e| format!("invalid server info at {}: {e}", path.display())),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(err) => Err(format!("failed to read server info at {}: {err}", path.display())),
    }
}

fn server_base_url(info: &ServerInfo) -> String {
    format!("http://127.0.0.1:{}", info.port)
}

fn server_is_healthy(info: &ServerInfo) -> bool {
    ureq::get(&format!("{}/health", server_base_url(info)))
        .call()
        .is_ok()
}

fn spawn_server_process(script_path: &Path) -> Result<Child, String> {
    let root = workspace_root()?;

    let spawn_with = |runtime: &str| {
        Command::new(runtime)
            .arg(script_path)
            .arg("server")
            .current_dir(&root)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
    };

    match spawn_with("node") {
        Ok(child) => Ok(child),
        Err(node_err) => spawn_with("bun").map_err(|bun_err| {
            format!("failed to spawn review server with node ({node_err}) or bun ({bun_err})")
        }),
    }
}

fn wait_for_server_ready(child: &mut Child) -> Result<ServerInfo, String> {
    let start = Instant::now();
    while start.elapsed() < SERVER_START_TIMEOUT {
        if let Some(status) = child
            .try_wait()
            .map_err(|e| format!("failed to poll review server: {e}"))?
        {
            return Err(format!("review server exited before becoming ready: {status}"));
        }

        if let Some(info) = read_server_info()? {
            if server_is_healthy(&info) {
                return Ok(info);
            }
        }

        thread::sleep(Duration::from_millis(50));
    }

    Err("timed out waiting for review server to start".to_string())
}

fn ensure_server_running(state: &AppState) -> Result<ServerInfo, String> {
    if let Some(info) = read_server_info()? {
        if server_is_healthy(&info) {
            return Ok(info);
        }
    }

    {
        let mut guard = state.bridge.lock().map_err(|e| format!("lock poisoned: {e}"))?;
        if let Some(child) = guard.as_mut() {
            if child.try_wait().ok().flatten().is_some() {
                *guard = None;
            }
        }
    }

    let script = sidecar_script_path()?;
    let mut child = spawn_server_process(&script)?;
    let info = wait_for_server_ready(&mut child)?;

    *state.bridge.lock().map_err(|e| format!("lock poisoned: {e}"))? = Some(child);

    Ok(info)
}

pub fn start_review_server(state: &AppState) -> Result<(), String> {
    ensure_server_running(state).map(|_| ())
}

fn validate_comments(comments: &[ReviewComment]) -> Result<(), String> {
    if comments.is_empty() {
        return Err("cannot submit an empty review".to_string());
    }

    for c in comments {
        if c.file_path.trim().is_empty() {
            return Err("review comment file path cannot be empty".to_string());
        }
        if c.comment.trim().is_empty() {
            return Err("review comment text cannot be empty".to_string());
        }
        if c.line_end < c.line_start {
            return Err(format!(
                "invalid line range for {}: {}..{}",
                c.file_path, c.line_start, c.line_end
            ));
        }
    }

    Ok(())
}

#[derive(Deserialize)]
struct SubmitResponse {
    ok: bool,
    #[serde(default)]
    accepted_count: Option<usize>,
    #[serde(default)]
    error: Option<String>,
}

#[tauri::command]
pub fn submit_review(
    comments: Vec<ReviewComment>,
    state: State<AppState>,
) -> Result<SubmitReviewResponse, String> {
    validate_comments(&comments)?;

    let info = ensure_server_running(state.inner())?;
    let url = format!("{}/reviews", server_base_url(&info));

    let response: SubmitResponse = ureq::post(&url)
        .header("Content-Type", "application/json")
        .send_json(&serde_json::json!({ "comments": comments }))
        .map_err(|e| format!("failed to submit review: {e}"))?
        .body_mut()
        .read_json()
        .map_err(|e| format!("failed to read server response: {e}"))?;

    if !response.ok {
        let msg = response.error.unwrap_or_else(|| "unknown error".to_string());
        return Err(format!("review server rejected submission: {msg}"));
    }

    let submitted_count = response
        .accepted_count
        .ok_or_else(|| "server omitted accepted_count".to_string())?;

    Ok(SubmitReviewResponse { submitted_count })
}

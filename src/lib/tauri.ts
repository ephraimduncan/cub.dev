import { invoke } from "@tauri-apps/api/core";

export type ChangeKind =
  | "added"
  | "modified"
  | "deleted"
  | "renamed"
  | "typechange";

export interface FileEntry {
  path: string;
  kind: ChangeKind;
  additions: number;
  deletions: number;
}

export interface RepoStatus {
  staged: FileEntry[];
  unstaged: FileEntry[];
  untracked: string[];
}

export function openRepo(path: string): Promise<string> {
  return invoke<string>("open_repo", { path });
}

export function getRepoStatus(): Promise<RepoStatus> {
  return invoke<RepoStatus>("get_repo_status");
}

export function getFileDiff(path: string): Promise<string> {
  return invoke<string>("get_file_diff", { path });
}

export function stageFile(path: string): Promise<void> {
  return invoke<void>("stage_file", { path });
}

export function stageAll(): Promise<void> {
  return invoke<void>("stage_all");
}

export function unstageFile(path: string): Promise<void> {
  return invoke<void>("unstage_file", { path });
}

export function unstageAll(): Promise<void> {
  return invoke<void>("unstage_all");
}

export function commit(message: string): Promise<string> {
  return invoke<string>("commit", { message });
}

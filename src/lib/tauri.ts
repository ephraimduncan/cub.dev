import { invoke } from "@tauri-apps/api/core";

// Mirrors src-tauri/src/git.rs types

export type ChangeKind =
  | "added"
  | "modified"
  | "deleted"
  | "renamed"
  | "typechange";

export interface FileEntry {
  path: string;
  kind: ChangeKind;
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

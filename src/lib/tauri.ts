import { invoke } from "@tauri-apps/api/core";
import type { ReviewComment } from "@/types/comments";
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

export interface FileContentsResponse {
  name: string;
  old_content: string | null;
  old_binary: boolean;
  new_content: string | null;
  new_binary: boolean;
}

export function getFileContents(
  path: string,
  staged = false,
): Promise<FileContentsResponse> {
  return invoke<FileContentsResponse>("get_file_contents", { path, staged });
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

export interface CommentIdMapping {
  key: string;
  id: string;
}

export interface SubmitReviewResponse {
  submitted_count: number;
  comment_ids: CommentIdMapping[];
}

export function submitReview(
  comments: ReviewComment[],
): Promise<SubmitReviewResponse> {
  return invoke<SubmitReviewResponse>("submit_review", { comments });
}

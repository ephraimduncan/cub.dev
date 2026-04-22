import type { AnnotationSide } from "@pierre/diffs";

export type ActionType = "change-request" | "question" | "nit";

export type CommentStatus =
  | "draft"
  | "pending"
  | "acknowledged"
  | "resolved"
  | "dismissed";

export interface CommentMetadata {
  key: string;
  filePath: string;
  lineStart: number;
  lineEnd: number;
  side: AnnotationSide;
  status: CommentStatus;
  text?: string;
  actionType?: ActionType;
  /** Server-assigned UUID, set after submit */
  commentId?: string;
  /** Agent's resolution summary */
  summary?: string;
  /** Agent's dismiss reason */
  dismissReason?: string;
}

export interface ReviewComment {
  key: string;
  file_path: string;
  line_start: number;
  line_end: number;
  comment: string;
  action_type: ActionType;
}

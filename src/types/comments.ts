import type { AnnotationSide } from "@pierre/diffs";

export type ActionType = "change-request" | "question" | "nit";

export interface CommentMetadata {
  key: string;
  filePath: string;
  isForm: boolean;
  lineStart: number;
  lineEnd: number;
  side: AnnotationSide;
  text?: string;
  actionType?: ActionType;
}

export interface ReviewComment {
  file_path: string;
  line_start: number;
  line_end: number;
  comment: string;
  action_type: ActionType;
}

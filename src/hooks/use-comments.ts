import { useCallback, useMemo, useState } from "react";
import type { AnnotationSide, DiffLineAnnotation } from "@pierre/diffs";
import type {
  ActionType,
  CommentMetadata,
  CommentStatus,
  ReviewComment,
} from "@/types/comments";

type AnnotationMap = Map<string, DiffLineAnnotation<CommentMetadata>[]>;

export function useComments() {
  const [annotationsByFile, setAnnotationsByFile] = useState<AnnotationMap>(
    new Map(),
  );

  // ── Derived counts ──────────────────────────────────────────────

  /** True only when a blank draft form (no text yet) is open — blocks new annotations. */
  const hasOpenForm = useMemo(() => {
    for (const annotations of annotationsByFile.values()) {
      if (annotations.some((a) => a.metadata.status === "draft" && !a.metadata.text))
        return true;
    }
    return false;
  }, [annotationsByFile]);

  /** Count of comments ready to submit (drafts with text) + already submitted (non-draft). */
  const totalCommentCount = useMemo(() => {
    let count = 0;
    for (const annotations of annotationsByFile.values()) {
      count += annotations.filter((a) => {
        if (a.metadata.status === "draft") return !!a.metadata.text;
        return true;
      }).length;
    }
    return count;
  }, [annotationsByFile]);

  const pendingCount = useMemo(() => {
    let count = 0;
    for (const annotations of annotationsByFile.values()) {
      count += annotations.filter((a) => a.metadata.status === "pending").length;
    }
    return count;
  }, [annotationsByFile]);

  const acknowledgedCount = useMemo(() => {
    let count = 0;
    for (const annotations of annotationsByFile.values()) {
      count += annotations.filter((a) => a.metadata.status === "acknowledged").length;
    }
    return count;
  }, [annotationsByFile]);

  const resolvedCount = useMemo(() => {
    let count = 0;
    for (const annotations of annotationsByFile.values()) {
      count += annotations.filter((a) =>
        a.metadata.status === "resolved" || a.metadata.status === "dismissed",
      ).length;
    }
    return count;
  }, [annotationsByFile]);

  // ── Mutations ───────────────────────────────────────────────────

  const addFormAnnotation = useCallback(
    (
      filePath: string,
      side: AnnotationSide,
      lineStart: number,
      lineEnd: number,
    ) => {
      const key = `${filePath}:${side}:${lineEnd}`;
      setAnnotationsByFile((prev) => {
        const existing = prev.get(filePath) ?? [];
        if (existing.some((a) => a.metadata.key === key)) return prev;
        const next = new Map(prev);
        next.set(filePath, [
          ...existing,
          {
            side,
            lineNumber: lineEnd,
            metadata: {
              key,
              filePath,
              status: "draft" as const,
              lineStart,
              lineEnd,
              side,
            },
          },
        ]);
        return next;
      });
    },
    [],
  );

  const cancelAnnotation = useCallback(
    (filePath: string, side: AnnotationSide, lineNumber: number) => {
      const key = `${filePath}:${side}:${lineNumber}`;
      setAnnotationsByFile((prev) => {
        const existing = prev.get(filePath);
        if (!existing) return prev;
        const filtered = existing.filter((a) => a.metadata.key !== key);
        const next = new Map(prev);
        if (filtered.length === 0) {
          next.delete(filePath);
        } else {
          next.set(filePath, filtered);
        }
        return next;
      });
    },
    [],
  );

  const submitAnnotation = useCallback(
    (
      filePath: string,
      side: AnnotationSide,
      lineNumber: number,
      text: string,
      actionType: ActionType,
    ) => {
      const key = `${filePath}:${side}:${lineNumber}`;
      setAnnotationsByFile((prev) => {
        const existing = prev.get(filePath);
        if (!existing) return prev;
        const next = new Map(prev);
        next.set(
          filePath,
          existing.map((a) =>
            a.metadata.key === key
              ? {
                  ...a,
                  metadata: { ...a.metadata, status: "draft" as const, text, actionType },
                }
              : a,
          ),
        );
        return next;
      });
    },
    [],
  );

  const deleteAnnotation = useCallback(
    (filePath: string, side: AnnotationSide, lineNumber: number) => {
      cancelAnnotation(filePath, side, lineNumber);
    },
    [cancelAnnotation],
  );

  const collectAllComments = useCallback((): ReviewComment[] => {
    const comments: ReviewComment[] = [];
    for (const annotations of annotationsByFile.values()) {
      for (const a of annotations) {
        if (a.metadata.status === "draft" && a.metadata.text && a.metadata.actionType) {
          comments.push({
            key: a.metadata.key,
            file_path: a.metadata.filePath,
            line_start: a.metadata.lineStart,
            line_end: a.metadata.lineEnd,
            comment: a.metadata.text,
            action_type: a.metadata.actionType,
          });
        }
      }
    }
    return comments;
  }, [annotationsByFile]);

  /** After server confirms submission, stamp each annotation with its server ID and mark pending. */
  const markSubmitted = useCallback(
    (commentIds: Map<string, string>) => {
      setAnnotationsByFile((prev) => {
        const next = new Map<string, DiffLineAnnotation<CommentMetadata>[]>();
        for (const [file, annotations] of prev) {
          next.set(
            file,
            annotations.map((a) => {
              const serverId = commentIds.get(a.metadata.key);
              if (serverId) {
                return {
                  ...a,
                  metadata: {
                    ...a.metadata,
                    status: "pending" as const,
                    commentId: serverId,
                  },
                };
              }
              return a;
            }),
          );
        }
        return next;
      });
    },
    [],
  );

  /** Update a comment's status when the agent acts on it (via Tauri event). */
  const updateCommentStatus = useCallback(
    (
      commentId: string,
      status: CommentStatus,
      summary?: string | null,
      dismissReason?: string | null,
    ) => {
      setAnnotationsByFile((prev) => {
        const next = new Map<string, DiffLineAnnotation<CommentMetadata>[]>();
        let changed = false;
        for (const [file, annotations] of prev) {
          const updated = annotations.map((a) => {
            if (a.metadata.commentId === commentId) {
              changed = true;
              return {
                ...a,
                metadata: {
                  ...a.metadata,
                  status,
                  summary: summary ?? a.metadata.summary,
                  dismissReason: dismissReason ?? a.metadata.dismissReason,
                },
              };
            }
            return a;
          });
          next.set(file, updated);
        }
        return changed ? next : prev;
      });
    },
    [],
  );

  /** Clear only resolved/dismissed comments. Draft and in-flight comments survive. */
  const clearResolved = useCallback(() => {
    setAnnotationsByFile((prev) => {
      const next = new Map<string, DiffLineAnnotation<CommentMetadata>[]>();
      for (const [file, annotations] of prev) {
        const kept = annotations.filter(
          (a) => a.metadata.status !== "resolved" && a.metadata.status !== "dismissed",
        );
        if (kept.length > 0) {
          next.set(file, kept);
        }
      }
      return next;
    });
  }, []);

  /** Clear all comments (used on full reset). */
  const clearAll = useCallback(() => {
    setAnnotationsByFile(new Map());
  }, []);

  return {
    annotationsByFile,
    hasOpenForm,
    totalCommentCount,
    pendingCount,
    acknowledgedCount,
    resolvedCount,
    addFormAnnotation,
    cancelAnnotation,
    submitAnnotation,
    deleteAnnotation,
    collectAllComments,
    markSubmitted,
    updateCommentStatus,
    clearResolved,
    clearAll,
  };
}

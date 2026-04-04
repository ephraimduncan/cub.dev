import { useCallback, useMemo, useState } from "react";
import type { AnnotationSide, DiffLineAnnotation } from "@pierre/diffs";
import type { ActionType, CommentMetadata, ReviewComment } from "@/types/comments";

type AnnotationMap = Map<string, DiffLineAnnotation<CommentMetadata>[]>;

export function useComments() {
  const [annotationsByFile, setAnnotationsByFile] = useState<AnnotationMap>(
    new Map(),
  );

  const hasOpenForm = useMemo(() => {
    for (const annotations of annotationsByFile.values()) {
      if (annotations.some((a) => a.metadata.isForm)) return true;
    }
    return false;
  }, [annotationsByFile]);

  const totalCommentCount = useMemo(() => {
    let count = 0;
    for (const annotations of annotationsByFile.values()) {
      count += annotations.filter((a) => !a.metadata.isForm).length;
    }
    return count;
  }, [annotationsByFile]);

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
              isForm: true,
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
                  metadata: { ...a.metadata, isForm: false, text, actionType },
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
        if (!a.metadata.isForm && a.metadata.text && a.metadata.actionType) {
          comments.push({
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

  const clearAll = useCallback(() => {
    setAnnotationsByFile(new Map());
  }, []);

  return {
    annotationsByFile,
    hasOpenForm,
    totalCommentCount,
    addFormAnnotation,
    cancelAnnotation,
    submitAnnotation,
    deleteAnnotation,
    collectAllComments,
    clearAll,
  };
}

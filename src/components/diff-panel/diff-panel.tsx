import { useCallback, useEffect, useMemo, useRef } from "react";
import type {
  AnnotationSide,
  DiffLineAnnotation,
  FileDiffMetadata,
} from "@pierre/diffs";
import { parseDiffFromFile } from "@pierre/diffs";
import { DiffToolbar } from "./diff-toolbar";
import { DiffCard, type DiffCardHandle } from "./diff-card";
import type { ChangeKind, FileEntry } from "@/lib/tauri";
import type { FileDiffContents } from "@/hooks/use-diffs";
import type { ActionType, CommentMetadata } from "@/types/comments";

interface DiffPanelProps {
  files: FileEntry[];
  diffs: Map<string, FileDiffContents>;
  loading: boolean;
  diffStyle: "unified" | "split";
  onDiffStyleChange: (style: "unified" | "split") => void;
  allExpanded: boolean;
  onToggleExpandAll: () => void;
  scrollToPath: string | null;
  onScrollComplete: () => void;
  annotationsByFile: Map<string, DiffLineAnnotation<CommentMetadata>[]>;
  hasOpenForm: boolean;
  totalCommentCount: number;
  pendingCount: number;
  acknowledgedCount: number;
  resolvedCount: number;
  onAddAnnotation: (
    filePath: string,
    side: AnnotationSide,
    lineStart: number,
    lineEnd: number,
  ) => void;
  onCancelAnnotation: (
    filePath: string,
    side: AnnotationSide,
    lineNumber: number,
  ) => void;
  onSubmitAnnotation: (
    filePath: string,
    side: AnnotationSide,
    lineNumber: number,
    text: string,
    actionType: ActionType,
  ) => void;
  onDeleteAnnotation: (
    filePath: string,
    side: AnnotationSide,
    lineNumber: number,
  ) => void;
  onSubmitReview: () => void;
  onClearResolved: () => void;
  submittingReview: boolean;
}

const EMPTY_ANNOTATIONS: DiffLineAnnotation<CommentMetadata>[] = [];

type ParsedFile =
  | {
      contentKind: "text";
      filePath: string;
      fileDiff: FileDiffMetadata;
      additions: number;
      deletions: number;
      kind: ChangeKind;
    }
  | {
      contentKind: "binary";
      filePath: string;
      additions: number;
      deletions: number;
      kind: ChangeKind;
      oldBinary: boolean;
      newBinary: boolean;
    };

export function DiffPanel({
  files,
  diffs,
  loading,
  diffStyle,
  onDiffStyleChange,
  allExpanded,
  onToggleExpandAll,
  scrollToPath,
  onScrollComplete,
  annotationsByFile,
  hasOpenForm,
  totalCommentCount,
  pendingCount,
  acknowledgedCount,
  resolvedCount,
  onAddAnnotation,
  onCancelAnnotation,
  onSubmitAnnotation,
  onDeleteAnnotation,
  onSubmitReview,
  onClearResolved,
  submittingReview,
}: DiffPanelProps) {
  const cardHandles = useRef<Map<string, DiffCardHandle>>(new Map());
  const refCallbacks = useRef<
    Map<string, (handle: DiffCardHandle | null) => void>
  >(new Map());
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  const getCardRef = useCallback((path: string) => {
    const existing = refCallbacks.current.get(path);
    if (existing) return existing;
    const callback = (handle: DiffCardHandle | null) => {
      if (handle) {
        cardHandles.current.set(path, handle);
      } else {
        cardHandles.current.delete(path);
        refCallbacks.current.delete(path);
      }
    };
    refCallbacks.current.set(path, callback);
    return callback;
  }, []);

  const lastScrolledRef = useRef<string | null>(null);
  useEffect(() => {
    if (!scrollToPath) return;
    if (scrollToPath === lastScrolledRef.current) {
      onScrollComplete();
      return;
    }
    lastScrolledRef.current = scrollToPath;
    const handle = cardHandles.current.get(scrollToPath);
    const container = scrollContainerRef.current;
    if (handle && container) {
      const wasOpen = handle.isOpen();
      if (!wasOpen) handle.expand();
      const el = handle.element;
      if (el) {
        let shouldScroll = true;
        if (wasOpen) {
          const cRect = container.getBoundingClientRect();
          const eRect = el.getBoundingClientRect();
          shouldScroll =
            eRect.top < cRect.top || eRect.bottom > cRect.bottom;
        }
        if (shouldScroll) {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }
    }
    onScrollComplete();
  }, [scrollToPath, onScrollComplete]);

  const parseCacheRef = useRef<
    WeakMap<FileDiffContents, FileDiffMetadata>
  >(new WeakMap());

  const parsedFiles = useMemo(() => {
    const result: ParsedFile[] = [];
    const cache = parseCacheRef.current;
    for (const file of files) {
      const contents = diffs.get(file.path);
      if (!contents) continue;

      if (contents.kind === "binary") {
        result.push({
          contentKind: "binary",
          filePath: file.path,
          additions: file.additions,
          deletions: file.deletions,
          kind: file.kind,
          oldBinary: contents.oldBinary,
          newBinary: contents.newBinary,
        });
        continue;
      }

      let fileDiff = cache.get(contents);
      if (!fileDiff) {
        fileDiff = parseDiffFromFile(contents.oldFile, contents.newFile);
        cache.set(contents, fileDiff);
      }

      result.push({
        contentKind: "text",
        filePath: file.path,
        fileDiff,
        additions: file.additions,
        deletions: file.deletions,
        kind: file.kind,
      });
    }
    return result;
  }, [files, diffs]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading diffs...</p>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full min-w-0 flex-col overflow-hidden bg-background">
      <DiffToolbar
        diffStyle={diffStyle}
        onDiffStyleChange={onDiffStyleChange}
        allExpanded={allExpanded}
        onToggleExpandAll={onToggleExpandAll}
        commentCount={totalCommentCount}
        pendingCount={pendingCount}
        acknowledgedCount={acknowledgedCount}
        resolvedCount={resolvedCount}
        onSubmitReview={onSubmitReview}
        onClearResolved={onClearResolved}
        submittingReview={submittingReview}
      />
      <div ref={scrollContainerRef} className="min-h-0 flex-1 overflow-auto">
        {parsedFiles.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-muted-foreground">
              No changes to review
            </p>
          </div>
        ) : (
          parsedFiles.map((parsedFile) => (
            <DiffCard
              key={parsedFile.filePath}
              ref={getCardRef(parsedFile.filePath)}
              filePath={parsedFile.filePath}
              additions={parsedFile.additions}
              deletions={parsedFile.deletions}
              kind={parsedFile.kind}
              diffStyle={diffStyle}
              expanded={allExpanded}
              annotations={
                annotationsByFile.get(parsedFile.filePath) ?? EMPTY_ANNOTATIONS
              }
              hasOpenForm={hasOpenForm}
              onAddAnnotation={onAddAnnotation}
              onCancelAnnotation={onCancelAnnotation}
              onSubmitAnnotation={onSubmitAnnotation}
              onDeleteAnnotation={onDeleteAnnotation}
              {...(parsedFile.contentKind === "text"
                ? {
                    contentKind: "text" as const,
                    fileDiff: parsedFile.fileDiff,
                  }
                : {
                    contentKind: "binary" as const,
                    oldBinary: parsedFile.oldBinary,
                    newBinary: parsedFile.newBinary,
                  })}
            />
          ))
        )}
      </div>
    </div>
  );
}

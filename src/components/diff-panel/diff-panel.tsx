import { useCallback, useEffect, useMemo, useRef } from "react";
import type {
  AnnotationSide,
  DiffLineAnnotation,
  FileDiffMetadata,
} from "@pierre/diffs";
import { parseDiffFromFile } from "@pierre/diffs";
import { DiffToolbar } from "./diff-toolbar";
import { DiffCard } from "./diff-card";
import type { ChangeKind, FileEntry } from "@/lib/tauri";
import type { FileDiffContents } from "@/hooks/use-diffs";
import type { ActionType, CommentMetadata } from "@/types/comments";

interface DiffPanelProps {
  files: FileEntry[];
  diffs: Map<string, FileDiffContents>;
  stagedPaths: Set<string>;
  unstaged: FileEntry[];
  diffStyle: "unified" | "split";
  onDiffStyleChange: (style: "unified" | "split") => void;
  allExpanded: boolean;
  onToggleExpandAll: () => void;
  scrollToPath: string | null;
  onScrollComplete: () => void;
  annotationsByFile: Map<string, DiffLineAnnotation<CommentMetadata>[]>;
  hasOpenForm: boolean;
  totalCommentCount: number;
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
  onToggleStage: (path: string) => void;
  onSubmitReview: () => void;
  submittingReview: boolean;
}

function getStageState(
  path: string,
  stagedPaths: Set<string>,
  unstaged: FileEntry[],
): "staged" | "unstaged" | "partial" {
  const isStaged = stagedPaths.has(path);
  const isUnstaged = unstaged.some((f) => f.path === path);
  if (isStaged && isUnstaged) return "partial";
  if (isStaged) return "staged";
  return "unstaged";
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
  stagedPaths,
  unstaged,
  diffStyle,
  onDiffStyleChange,
  allExpanded,
  onToggleExpandAll,
  scrollToPath,
  onScrollComplete,
  annotationsByFile,
  hasOpenForm,
  totalCommentCount,
  onAddAnnotation,
  onCancelAnnotation,
  onSubmitAnnotation,
  onDeleteAnnotation,
  onToggleStage,
  onSubmitReview,
  submittingReview,
}: DiffPanelProps) {
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const refCallbacks = useRef<
    Map<string, (el: HTMLDivElement | null) => void>
  >(new Map());

  const getCardRef = useCallback((path: string) => {
    const existing = refCallbacks.current.get(path);
    if (existing) return existing;
    const callback = (el: HTMLDivElement | null) => {
      if (el) {
        cardRefs.current.set(path, el);
      } else {
        cardRefs.current.delete(path);
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
    const el = cardRefs.current.get(scrollToPath);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    onScrollComplete();
  }, [scrollToPath, onScrollComplete]);

  // Cache parsed FileDiffMetadata keyed by the FileDiffContents reference.
  // `useDiffs` preserves those references across status refreshes, so stage/
  // unstage toggles hit the cache and avoid re-parsing every file.
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

  return (
    <div className="flex h-full w-full min-w-0 flex-col overflow-hidden">
      <DiffToolbar
        diffStyle={diffStyle}
        onDiffStyleChange={onDiffStyleChange}
        allExpanded={allExpanded}
        onToggleExpandAll={onToggleExpandAll}
        commentCount={totalCommentCount}
        onSubmitReview={onSubmitReview}
        submittingReview={submittingReview}
      />
      <div className="min-h-0 flex-1 overflow-auto">
        {parsedFiles.length === 0 ? (
          <div className="flex h-full items-center justify-center py-20">
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
              stageState={getStageState(
                parsedFile.filePath,
                stagedPaths,
                unstaged,
              )}
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
              onToggleStage={onToggleStage}
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

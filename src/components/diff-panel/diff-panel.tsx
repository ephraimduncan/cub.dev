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
  loading: boolean;
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
  onToggleStage: (path: string) => void;
  onSubmitReview: () => void;
  onClearResolved: () => void;
  submittingReview: boolean;
}

function getStageState(
  path: string,
  stagedPaths: Set<string>,
  unstagedPaths: Set<string>,
): "staged" | "unstaged" | "partial" {
  const isStaged = stagedPaths.has(path);
  const isUnstaged = unstagedPaths.has(path);
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
  loading,
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
  pendingCount,
  acknowledgedCount,
  resolvedCount,
  onAddAnnotation,
  onCancelAnnotation,
  onSubmitAnnotation,
  onDeleteAnnotation,
  onToggleStage,
  onSubmitReview,
  onClearResolved,
  submittingReview,
}: DiffPanelProps) {
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const unstagedPaths = useMemo(
    () => new Set(unstaged.map((f) => f.path)),
    [unstaged],
  );

  const setCardRef = useCallback(
    (path: string) => (el: HTMLDivElement | null) => {
      if (el) {
        cardRefs.current.set(path, el);
      } else {
        cardRefs.current.delete(path);
      }
    },
    [],
  );

  // Parse full file contents into FileDiffMetadata with isPartial=false,
  // enabling hunk expansion and custom hunk separators.
  const parsedFiles = useMemo(() => {
    const result: ParsedFile[] = [];
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

      result.push({
        contentKind: "text",
        filePath: file.path,
        fileDiff: parseDiffFromFile(contents.oldFile, contents.newFile),
        additions: file.additions,
        deletions: file.deletions,
        kind: file.kind,
      });
    }
    return result;
  }, [files, diffs]);

  useEffect(() => {
    if (!scrollToPath) return;
    const el = cardRefs.current.get(scrollToPath);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      onScrollComplete();
    }
  }, [scrollToPath, onScrollComplete, parsedFiles]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading diffs...</p>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full min-w-0 flex-col overflow-hidden">
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
              ref={setCardRef(parsedFile.filePath)}
              filePath={parsedFile.filePath}
              additions={parsedFile.additions}
              deletions={parsedFile.deletions}
              kind={parsedFile.kind}
              stageState={getStageState(
                parsedFile.filePath,
                stagedPaths,
                unstagedPaths,
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

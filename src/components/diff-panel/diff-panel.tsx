import { useCallback, useEffect, useMemo, useRef } from "react";
import type { AnnotationSide, DiffLineAnnotation, FileDiffMetadata } from "@pierre/diffs";
import { parsePatchFiles } from "@pierre/diffs";
import { DiffToolbar } from "./diff-toolbar";
import { DiffCard } from "./diff-card";
import type { ChangeKind, FileEntry } from "@/lib/tauri";
import type { ActionType, CommentMetadata } from "@/types/comments";

interface DiffPanelProps {
  files: FileEntry[];
  diffs: Map<string, string>;
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

interface ParsedFile {
  filePath: string;
  fileDiff: FileDiffMetadata;
  additions: number;
  deletions: number;
  kind: ChangeKind;
}

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
  onAddAnnotation,
  onCancelAnnotation,
  onSubmitAnnotation,
  onDeleteAnnotation,
  onToggleStage,
  onSubmitReview,
}: DiffPanelProps) {
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

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

  useEffect(() => {
    if (!scrollToPath) return;
    const el = cardRefs.current.get(scrollToPath);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    onScrollComplete();
  }, [scrollToPath, onScrollComplete]);

  // Pre-parse all patches once, producing FileDiffMetadata per file.
  // parsePatchFiles returns ParsedPatch[] (one per commit). Each patch has a
  // `files` array of FileDiffMetadata. We flatten into a lookup keyed by path.
  const parsedFiles = useMemo(() => {
    const result: ParsedFile[] = [];
    for (const file of files) {
      const patch = diffs.get(file.path);
      if (!patch) continue;
      const parsed = parsePatchFiles(patch, file.path);
      // Each single-file patch produces one ParsedPatch with one file entry.
      const fileDiff = parsed[0]?.files[0];
      if (fileDiff) {
        result.push({ filePath: file.path, fileDiff, additions: file.additions, deletions: file.deletions, kind: file.kind });
      }
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
    <div className="flex h-full w-full min-w-0 flex-col overflow-hidden">
      <DiffToolbar
        diffStyle={diffStyle}
        onDiffStyleChange={onDiffStyleChange}
        allExpanded={allExpanded}
        onToggleExpandAll={onToggleExpandAll}
        commentCount={totalCommentCount}
        onSubmitReview={onSubmitReview}
      />
      <div className="flex-1 min-h-0 overflow-auto">
          {parsedFiles.length === 0 ? (
            <div className="flex h-full items-center justify-center py-20">
              <p className="text-sm text-muted-foreground">No changes to review</p>
            </div>
          ) : (
            parsedFiles.map(({ filePath, fileDiff, additions, deletions, kind }) => (
              <DiffCard
                key={filePath}
                ref={setCardRef(filePath)}
                filePath={filePath}
                fileDiff={fileDiff}
                additions={additions}
                deletions={deletions}
                kind={kind}
                stageState={getStageState(filePath, stagedPaths, unstaged)}
                diffStyle={diffStyle}
                expanded={allExpanded}
                annotations={annotationsByFile.get(filePath) ?? EMPTY_ANNOTATIONS}
                hasOpenForm={hasOpenForm}
                onAddAnnotation={onAddAnnotation}
                onCancelAnnotation={onCancelAnnotation}
                onSubmitAnnotation={onSubmitAnnotation}
                onDeleteAnnotation={onDeleteAnnotation}
                onToggleStage={onToggleStage}
              />
            ))
          )}
      </div>
    </div>
  );
}

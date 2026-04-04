import { useCallback, useEffect, useRef } from "react";
import type { AnnotationSide, DiffLineAnnotation } from "@pierre/diffs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DiffToolbar } from "./diff-toolbar";
import { DiffCard } from "./diff-card";
import type { FileEntry } from "@/lib/tauri";
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
  onStageAll: () => void;
  onUnstageAll: () => void;
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
  onStageAll,
  onUnstageAll,
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
        onStageAll={onStageAll}
        onUnstageAll={onUnstageAll}
        commentCount={totalCommentCount}
        onSubmitReview={onSubmitReview}
      />
      <ScrollArea className="min-h-0 flex-1">
          {files.length === 0 ? (
            <div className="flex h-full items-center justify-center py-20">
              <p className="text-sm text-muted-foreground">No changes to review</p>
            </div>
          ) : (
            files.map((file) => {
              const patch = diffs.get(file.path);
              if (!patch) return null;
              return (
                <DiffCard
                  key={file.path}
                  ref={setCardRef(file.path)}
                  filePath={file.path}
                  patch={patch}
                  stageState={getStageState(file.path, stagedPaths, unstaged)}
                  diffStyle={diffStyle}
                  expanded={allExpanded}
                  annotations={annotationsByFile.get(file.path) ?? EMPTY_ANNOTATIONS}
                  hasOpenForm={hasOpenForm}
                  onAddAnnotation={onAddAnnotation}
                  onCancelAnnotation={onCancelAnnotation}
                  onSubmitAnnotation={onSubmitAnnotation}
                  onDeleteAnnotation={onDeleteAnnotation}
                  onToggleStage={onToggleStage}
                />
              );
            })
          )}
      </ScrollArea>
    </div>
  );
}

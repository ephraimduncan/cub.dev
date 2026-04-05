import { forwardRef, memo, useCallback, useLayoutEffect, useState } from "react";
import type {
  AnnotationSide,
  DiffLineAnnotation,
  FileDiffMetadata,
  SelectedLineRange,
} from "@pierre/diffs";
import { FileDiff } from "@pierre/diffs/react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { CommentForm } from "@/components/comments/comment-form";
import { CommentBubble } from "@/components/comments/comment-bubble";
import { cn } from "@/lib/utils";
import { IconChevronDown } from "@tabler/icons-react";
import type { ChangeKind } from "@/lib/tauri";
import type { ActionType, CommentMetadata } from "@/types/comments";

type StageState = "staged" | "unstaged" | "partial";

const STATUS_COLORS: Record<string, string> = {
  added: "text-emerald-500",
  modified: "text-amber-500",
  deleted: "text-red-500",
  renamed: "text-blue-500",
  typechange: "text-purple-500",
};

interface DiffCardProps {
  filePath: string;
  fileDiff: FileDiffMetadata;
  additions: number;
  deletions: number;
  kind: ChangeKind;
  stageState: StageState;
  diffStyle: "unified" | "split";
  expanded: boolean;
  annotations: DiffLineAnnotation<CommentMetadata>[];
  hasOpenForm: boolean;
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
}

export const DiffCard = memo(forwardRef<HTMLDivElement, DiffCardProps>(
  function DiffCard(
    {
      filePath,
      fileDiff,
      additions,
      deletions,
      kind,
      stageState,
      diffStyle,
      expanded,
      annotations,
      hasOpenForm,
      onAddAnnotation,
      onCancelAnnotation,
      onSubmitAnnotation,
      onDeleteAnnotation,
      onToggleStage,
    },
    ref,
  ) {
    const [isOpen, setIsOpen] = useState(expanded);

    // Sync when parent toggles expand/collapse all.
    // useLayoutEffect (not useEffect) to update before paint — no visible flicker.
    // keepMounted on CollapsibleContent avoids re-mount cost on subsequent toggles.
    useLayoutEffect(() => {
      setIsOpen(expanded);
    }, [expanded]);
    const [selectedLines, setSelectedLines] = useState<SelectedLineRange | null>(null);

    const handleToggleStage = useCallback(() => onToggleStage(filePath), [filePath, onToggleStage]);

    const parts = filePath.split("/");
    const filename = parts.pop() ?? filePath;
    const dir = parts.length > 0 ? parts.join("/") + "/" : "";

    const handleLineSelectionEnd = useCallback(
      (range: SelectedLineRange | null) => {
        setSelectedLines(range);
        if (range == null) return;
        const derivedSide = range.endSide ?? range.side;
        const side: AnnotationSide =
          derivedSide === "deletions" ? "deletions" : "additions";
        const lineStart = Math.min(range.start, range.end);
        const lineEnd = Math.max(range.start, range.end);
        onAddAnnotation(filePath, side, lineStart, lineEnd);
        setSelectedLines(null);
      },
      [filePath, onAddAnnotation],
    );

    const handleGutterClick = useCallback(
      (range: SelectedLineRange) => {
        if (range.side != null) {
          onAddAnnotation(filePath, range.side as AnnotationSide, range.start, range.start);
        }
      },
      [filePath, onAddAnnotation],
    );

    const renderAnnotation = useCallback(
      (annotation: DiffLineAnnotation<CommentMetadata>) => {
        if (annotation.metadata.isForm) {
          return (
            <CommentForm
              onSubmit={(text, actionType) =>
                onSubmitAnnotation(
                  filePath,
                  annotation.side,
                  annotation.lineNumber,
                  text,
                  actionType,
                )
              }
              onCancel={() =>
                onCancelAnnotation(filePath, annotation.side, annotation.lineNumber)
              }
            />
          );
        }
        return (
          <CommentBubble
            text={annotation.metadata.text!}
            actionType={annotation.metadata.actionType!}
            onDelete={() =>
              onDeleteAnnotation(filePath, annotation.side, annotation.lineNumber)
            }
          />
        );
      },
      [filePath, onSubmitAnnotation, onCancelAnnotation, onDeleteAnnotation],
    );

    const checkboxChecked =
      stageState === "staged"
        ? true
        : stageState === "unstaged"
          ? false
          : "mixed";

    return (
      <div ref={ref} className="min-w-0 w-full overflow-clip">
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <CollapsibleTrigger
            render={<button type="button" />}
            className="flex w-full items-center gap-2 border-b bg-muted/30 px-3 py-2 cursor-pointer text-left"
          >
            <IconChevronDown
              className={cn(
                "size-4 text-muted-foreground transition-transform",
                !isOpen && "-rotate-90",
              )}
            />
            <Checkbox
              checked={checkboxChecked === "mixed" ? false : checkboxChecked}
              indeterminate={checkboxChecked === "mixed"}
              onClick={(e) => {
                e.stopPropagation();
                handleToggleStage();
              }}
              className="size-4"
            />
            <span className={cn("shrink-0 text-sm font-medium", STATUS_COLORS[kind] ?? "text-foreground")}>{filename}</span>
            {dir && (
              <span className="truncate text-xs text-muted-foreground">{dir}</span>
            )}
            <span className="ml-auto flex shrink-0 gap-1.5 font-mono text-xs">
              {additions > 0 && <span className="text-green-600 dark:text-green-400">+{additions}</span>}
              {deletions > 0 && <span className="text-red-600 dark:text-red-400">-{deletions}</span>}
            </span>
          </CollapsibleTrigger>
          <CollapsibleContent keepMounted>
            <FileDiff<CommentMetadata>
              fileDiff={fileDiff}
              className="min-w-0 overflow-hidden"
              style={{
                "--diffs-font-family": "'Berkeley Mono', monospace",
                "--diffs-font-size": "14px",
                "--diffs-line-height": "20px",
              } as React.CSSProperties}
              options={{
                themeType: "system",
                diffStyle,
                overflow: "wrap",
                lineDiffType: "word-alt",
                disableFileHeader: true,
                enableLineSelection: !hasOpenForm,
                enableGutterUtility: !hasOpenForm,
                onLineSelectionEnd: handleLineSelectionEnd,
                onGutterUtilityClick: handleGutterClick,
              }}
              lineAnnotations={annotations}
              selectedLines={selectedLines}
              renderAnnotation={renderAnnotation}
              disableWorkerPool
            />
          </CollapsibleContent>
        </Collapsible>
      </div>
    );
  },
));

DiffCard.displayName = "DiffCard";

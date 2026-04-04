import { forwardRef, memo, useCallback, useState } from "react";
import type {
  AnnotationSide,
  DiffLineAnnotation,
  SelectedLineRange,
} from "@pierre/diffs";
import { PatchDiff } from "@pierre/diffs/react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { CommentForm } from "@/components/comments/comment-form";
import { CommentBubble } from "@/components/comments/comment-bubble";
import { cn } from "@/lib/utils";
import { IconChevronDown, IconMinus } from "@tabler/icons-react";
import type { ActionType, CommentMetadata } from "@/types/comments";

type StageState = "staged" | "unstaged" | "partial";

interface DiffCardProps {
  filePath: string;
  patch: string;
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
      patch,
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
      <div ref={ref} className="min-w-0 w-full overflow-hidden">
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <div className="flex items-center gap-1.5 border-b bg-muted/30 px-3 py-1">
            <CollapsibleTrigger className="flex items-center">
              <IconChevronDown
                className={cn(
                  "size-3.5 text-muted-foreground transition-transform",
                  !isOpen && "-rotate-90",
                )}
              />
            </CollapsibleTrigger>
            <Checkbox
              checked={checkboxChecked === "mixed" ? false : checkboxChecked}
              indeterminate={checkboxChecked === "mixed"}
              onClick={(e) => {
                e.stopPropagation();
                handleToggleStage();
              }}
              className="size-3.5"
            />
            {checkboxChecked === "mixed" && (
              <IconMinus className="absolute size-2.5 text-primary pointer-events-none" />
            )}
            <span className="text-xs font-medium">{filename}</span>
            {dir && (
              <span className="text-[10px] text-muted-foreground">{dir}</span>
            )}
            <div className="ml-auto flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-5 px-1.5 text-[10px]"
                onClick={handleToggleStage}
              >
                {stageState === "staged" ? "Unstage" : "Stage"}
              </Button>
            </div>
          </div>
          <CollapsibleContent>
            <PatchDiff<CommentMetadata>
              patch={patch}
              className="min-w-0 overflow-hidden"
              style={{
                "--diffs-font-family": "'Berkeley Mono', monospace",
                "--diffs-font-size": "14px",
                "--diffs-line-height": "20px",
              } as React.CSSProperties}
              options={{
                theme: { dark: "pierre-dark", light: "pierre-light" },
                themeType: "system",
                diffStyle,
                lineDiffType: "word-alt",
                overflow: "wrap",
                disableFileHeader: true,
                enableLineSelection: !hasOpenForm,
                enableGutterUtility: !hasOpenForm,
                onLineSelectionEnd: handleLineSelectionEnd,
                onGutterUtilityClick: handleGutterClick,
              }}
              lineAnnotations={annotations}
              selectedLines={selectedLines}
              renderAnnotation={renderAnnotation}
            />
          </CollapsibleContent>
        </Collapsible>
      </div>
    );
  },
));

DiffCard.displayName = "DiffCard";

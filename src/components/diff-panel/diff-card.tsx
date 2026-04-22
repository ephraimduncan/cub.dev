import {
  forwardRef,
  memo,
  useCallback,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import type {
  AnnotationSide,
  DiffLineAnnotation,
  FileDiffMetadata,
  SelectedLineRange,
} from "@pierre/diffs";
import { FileDiff as PierreFileDiff } from "@pierre/diffs/react";
import { getAnnotationTarget } from "./annotation-target";
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

const DIFF_CODE_STYLE = {
  "--diffs-font-family": "'App Mono', monospace",
  "--diffs-font-size": "14px",
  "--diffs-line-height": "20px",
} as React.CSSProperties;

interface DiffCardBaseProps {
  filePath: string;
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

type DiffCardProps = DiffCardBaseProps &
  (
    | {
        contentKind: "text";
        fileDiff: FileDiffMetadata;
      }
    | {
        contentKind: "binary";
        oldBinary: boolean;
        newBinary: boolean;
      }
  );

function getBinaryDiffMessage(
  kind: ChangeKind,
  oldBinary: boolean,
  newBinary: boolean,
): string {
  if (kind === "added") return "Binary file added. Text diff unavailable.";
  if (kind === "deleted") return "Binary file deleted. Text diff unavailable.";
  if (!oldBinary && newBinary) {
    return "File now contains binary data. Text diff unavailable.";
  }
  if (oldBinary && !newBinary) {
    return "Previous version is binary. Text diff unavailable.";
  }
  return "Binary file changed. Text diff unavailable.";
}

export const DiffCard = memo(
  forwardRef<HTMLDivElement, DiffCardProps>(function DiffCard(
    {
      filePath,
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
      ...contentProps
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
    const [selectedLines, setSelectedLines] =
      useState<SelectedLineRange | null>(null);

    const handleToggleStage = useCallback(
      () => onToggleStage(filePath),
      [filePath, onToggleStage],
    );

    const parts = filePath.split("/");
    const filename = parts.pop() ?? filePath;
    const dir = parts.length > 0 ? parts.join("/") + "/" : "";

    const addAnnotationForRange = useCallback(
      (range: SelectedLineRange) => {
        const target = getAnnotationTarget(range);
        onAddAnnotation(
          filePath,
          target.side,
          target.lineStart,
          target.lineEnd,
        );
      },
      [filePath, onAddAnnotation],
    );

    const handleLineSelectionEnd = useCallback(
      (range: SelectedLineRange | null) => {
        setSelectedLines(range);
        if (range == null) return;
        addAnnotationForRange(range);
        setSelectedLines(null);
      },
      [addAnnotationForRange],
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
                onCancelAnnotation(
                  filePath,
                  annotation.side,
                  annotation.lineNumber,
                )
              }
            />
          );
        }
        return (
          <CommentBubble
            text={annotation.metadata.text!}
            actionType={annotation.metadata.actionType!}
            onDelete={() =>
              onDeleteAnnotation(
                filePath,
                annotation.side,
                annotation.lineNumber,
              )
            }
          />
        );
      },
      [filePath, onSubmitAnnotation, onCancelAnnotation, onDeleteAnnotation],
    );

    const fileDiffOptions = useMemo(
      () => ({
        themeType: "system" as const,
        diffStyle,
        overflow: "wrap" as const,
        lineDiffType: "word-alt" as const,
        disableFileHeader: true,
        expansionLineCount: 5,
        hunkSeparators: "line-info" as const,
        enableLineSelection: !hasOpenForm,
        enableGutterUtility: !hasOpenForm,
        onLineSelectionEnd: handleLineSelectionEnd,
        onGutterUtilityClick: addAnnotationForRange,
      }),
      [addAnnotationForRange, diffStyle, handleLineSelectionEnd, hasOpenForm],
    );

    const textFileDiff =
      contentProps.contentKind === "text" ? contentProps.fileDiff : null;
    const binaryMessage =
      contentProps.contentKind === "binary"
        ? getBinaryDiffMessage(
            kind,
            contentProps.oldBinary,
            contentProps.newBinary,
          )
        : null;
    const content = useMemo(
      () =>
        contentProps.contentKind === "text" ? (
          <PierreFileDiff<CommentMetadata>
            fileDiff={textFileDiff!}
            className="min-w-0 overflow-hidden"
            style={DIFF_CODE_STYLE}
            options={fileDiffOptions}
            lineAnnotations={annotations}
            selectedLines={selectedLines}
            renderAnnotation={renderAnnotation}
            disableWorkerPool
          />
        ) : (
          <div className="px-4 py-6 text-sm text-muted-foreground">
            <p>{binaryMessage}</p>
          </div>
        ),
      [
        annotations,
        binaryMessage,
        contentProps.contentKind,
        fileDiffOptions,
        renderAnnotation,
        selectedLines,
        textFileDiff,
      ],
    );

    return (
      <div ref={ref} className="min-w-0 w-full overflow-clip">
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <CollapsibleTrigger
            render={<button type="button" />}
            className="flex w-full cursor-pointer items-center gap-2 border-b bg-muted/30 px-3 py-3 text-left"
          >
            <IconChevronDown
              className={cn(
                "size-4 text-muted-foreground transition-transform",
                !isOpen && "-rotate-90",
              )}
            />
            <Checkbox
              checked={stageState === "staged"}
              indeterminate={stageState === "partial"}
              onClick={(e) => {
                e.stopPropagation();
                handleToggleStage();
              }}
              className="size-4"
            />
            <span
              className={cn(
                "shrink-0 text-sm font-medium",
                STATUS_COLORS[kind] ?? "text-foreground",
              )}
            >
              {filename}
            </span>
            {dir && (
              <span className="truncate text-xs text-muted-foreground">
                {dir}
              </span>
            )}
            <span className="ml-auto flex shrink-0 gap-1.5 font-mono text-xs">
              {additions > 0 && (
                <span className="text-green-600 dark:text-green-400">
                  +{additions}
                </span>
              )}
              {deletions > 0 && (
                <span className="text-red-600 dark:text-red-400">
                  -{deletions}
                </span>
              )}
            </span>
          </CollapsibleTrigger>
          <CollapsibleContent keepMounted>{content}</CollapsibleContent>
        </Collapsible>
      </div>
    );
  }),
);

DiffCard.displayName = "DiffCard";

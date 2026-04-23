import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
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
import {
  createPerfAggregator,
  type ExpandAllCardMetric,
  type ExpandAllSession,
} from "@/lib/perf";
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
import {
  FILE_STATUS,
  DIFF_ADDITION_COLOR,
  DIFF_DELETION_COLOR,
} from "@/lib/status";
import type { ActionType, CommentMetadata } from "@/types/comments";

const DIFF_CODE_STYLE = {
  "--diffs-font-family": "'App Mono', monospace",
  "--diffs-font-size": "13px",
  "--diffs-line-height": "19px",
  "--diffs-gap-block": "4px",
} as React.CSSProperties;

// Shared aggregators so 600 DiffCard mounts produce a single summary log
// rather than 600 lines. Flush is debounced to the end of the mount burst.
const mountAgg = createPerfAggregator("DiffCard", "mountPaint");
const renderAgg = createPerfAggregator("DiffCard", "renderCommit");
let flushTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    mountAgg.flush(15);
    renderAgg.flush(15);
  }, 500);
}

interface DiffCardBaseProps {
  filePath: string;
  additions: number;
  deletions: number;
  kind: ChangeKind;
  diffStyle: "unified" | "split";
  expanded: boolean;
  expandAllSession: ExpandAllSession | null;
  onExpandAllMetric: (metric: ExpandAllCardMetric) => void;
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

export interface DiffCardHandle {
  element: HTMLDivElement | null;
  isOpen: () => boolean;
  expand: () => void;
}

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
  forwardRef<DiffCardHandle, DiffCardProps>(function DiffCard(
    {
      filePath,
      additions,
      deletions,
      kind,
      diffStyle,
      expanded,
      expandAllSession,
      onExpandAllMetric,
      annotations,
      hasOpenForm,
      onAddAnnotation,
      onCancelAnnotation,
      onSubmitAnnotation,
      onDeleteAnnotation,
      ...contentProps
    },
    ref,
  ) {
    const renderStartRef = useRef(performance.now());
    renderStartRef.current = performance.now();

    const [isOpen, setIsOpen] = useState(expanded);
    const isOpenRef = useRef(isOpen);
    isOpenRef.current = isOpen;
    const elementRef = useRef<HTMLDivElement | null>(null);
    const mountStartRef = useRef(performance.now());
    const previousExpandedRef = useRef(expanded);
    const openTransitionRef = useRef<ExpandAllSession | null>(null);
    const mountedContentSessionRef = useRef<number | null>(null);
    const committedContentSessionRef = useRef<number | null>(null);
    const contentKind = contentProps.contentKind;

    useEffect(() => {
      const ms = performance.now() - mountStartRef.current;
      mountAgg.record(filePath, ms);
      scheduleFlush();
      // Only fire on mount.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useLayoutEffect(() => {
      const ms = performance.now() - renderStartRef.current;
      renderAgg.record(filePath, ms);
      scheduleFlush();
    });

    useImperativeHandle(
      ref,
      () => ({
        get element() {
          return elementRef.current;
        },
        isOpen: () => isOpenRef.current,
        expand: () => setIsOpen(true),
      }),
      [],
    );

    // Sync when parent toggles expand/collapse all.
    // useLayoutEffect (not useEffect) to update before paint — no visible flicker.
    useLayoutEffect(() => {
      const wasExpanded = previousExpandedRef.current;
      previousExpandedRef.current = expanded;
      if (expanded && !wasExpanded && expandAllSession) {
        openTransitionRef.current = expandAllSession;
        mountedContentSessionRef.current = null;
        committedContentSessionRef.current = null;
        onExpandAllMetric({
          sessionId: expandAllSession.id,
          path: filePath,
          phase: "propSync",
          ms: +(performance.now() - expandAllSession.startedAt).toFixed(2),
          contentKind,
        });
      } else if (!expanded) {
        openTransitionRef.current = null;
        mountedContentSessionRef.current = null;
        committedContentSessionRef.current = null;
      }
      setIsOpen(expanded);
    }, [contentKind, expandAllSession, expanded, filePath, onExpandAllMetric]);
    const [selectedLines, setSelectedLines] =
      useState<SelectedLineRange | null>(null);

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
        if (
          annotation.metadata.status === "draft" &&
          !annotation.metadata.text
        ) {
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
            status={annotation.metadata.status}
            summary={annotation.metadata.summary}
            dismissReason={annotation.metadata.dismissReason}
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
    const contentMountRef = useCallback(
      (node: HTMLDivElement | null) => {
        if (!node) return;
        const transition = openTransitionRef.current;
        if (!transition || mountedContentSessionRef.current === transition.id) {
          return;
        }
        mountedContentSessionRef.current = transition.id;
        onExpandAllMetric({
          sessionId: transition.id,
          path: filePath,
          phase: "contentMount",
          ms: +(performance.now() - transition.startedAt).toFixed(2),
          contentKind,
        });
      },
      [contentKind, filePath, onExpandAllMetric],
    );
    const content = useMemo(
      () =>
        contentProps.contentKind === "text" ? (
          <div ref={contentMountRef}>
            <PierreFileDiff<CommentMetadata>
              fileDiff={textFileDiff!}
              className="min-w-0 overflow-hidden"
              style={DIFF_CODE_STYLE}
              options={fileDiffOptions}
              lineAnnotations={annotations}
              selectedLines={selectedLines}
              renderAnnotation={renderAnnotation}
            />
          </div>
        ) : (
          <div ref={contentMountRef} className="px-4 py-6 text-sm text-muted-foreground">
            <p>{binaryMessage}</p>
          </div>
        ),
      [
        annotations,
        binaryMessage,
        contentKind,
        contentMountRef,
        contentProps.contentKind,
        fileDiffOptions,
        renderAnnotation,
        selectedLines,
        textFileDiff,
      ],
    );

    useLayoutEffect(() => {
      const transition = openTransitionRef.current;
      if (
        !isOpen ||
        !transition ||
        committedContentSessionRef.current === transition.id
      ) {
        return;
      }
      committedContentSessionRef.current = transition.id;
      onExpandAllMetric({
        sessionId: transition.id,
        path: filePath,
        phase: "renderCommit",
        ms: +(performance.now() - transition.startedAt).toFixed(2),
        contentKind,
      });
      openTransitionRef.current = null;
    });

    return (
      <div ref={elementRef} className="min-w-0 w-full overflow-clip">
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <CollapsibleTrigger
            render={<button type="button" />}
            className="flex w-full cursor-pointer items-start gap-2.5 border-b border-border/70 bg-muted/30 px-4 py-2.5 text-left"
          >
            <IconChevronDown
              className={cn(
                "mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform",
                !isOpen && "-rotate-90",
              )}
            />
            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  "truncate text-sm font-medium",
                  FILE_STATUS[kind]?.color ?? "text-foreground",
                )}
              >
                {filename}
              </p>
              {dir && (
                <p className="truncate text-xs text-muted-foreground">{dir}</p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1.5 text-xs tabular-nums">
              {additions > 0 && (
                <span className={DIFF_ADDITION_COLOR}>+{additions}</span>
              )}
              {deletions > 0 && (
                <span className={DIFF_DELETION_COLOR}>-{deletions}</span>
              )}
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent>{content}</CollapsibleContent>
        </Collapsible>
      </div>
    );
  }),
);

DiffCard.displayName = "DiffCard";

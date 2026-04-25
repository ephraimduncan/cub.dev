import { useCallback, useEffect, useMemo, useRef } from "react";
import type {
  AnnotationSide,
  DiffLineAnnotation,
  FileDiffMetadata,
} from "@pierre/diffs";
import { parseDiffFromFile } from "@pierre/diffs";
import { useWorkerPool } from "@pierre/diffs/react";
import type { WorkerStats } from "@pierre/diffs/worker";
import { DiffToolbar } from "./diff-toolbar";
import { DiffCard, type DiffCardHandle } from "./diff-card";
import type { ChangeKind, FileEntry } from "@/lib/tauri";
import type { FileDiffContents } from "@/hooks/use-diffs";
import type { ActionType, CommentMetadata } from "@/types/comments";
import {
  createPerfAggregator,
  perfLog,
  perfLogJson,
  summarizePerfEntries,
  type ExpandAllCardMetric,
  type ExpandAllSession,
} from "@/lib/perf";

interface DiffPanelProps {
  files: FileEntry[];
  diffs: Map<string, FileDiffContents>;
  loading: boolean;
  diffStyle: "unified" | "split";
  onDiffStyleChange: (style: "unified" | "split") => void;
  allExpanded: boolean;
  onToggleExpandAll: () => void;
  expandAllSession: ExpandAllSession | null;
  scrollToPath: string | null;
  scrollNonce: number;
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

type WorkerStatsSnapshot = Pick<
  WorkerStats,
  | "managerState"
  | "workersFailed"
  | "totalWorkers"
  | "busyWorkers"
  | "queuedTasks"
  | "pendingTasks"
  | "fileCacheSize"
  | "diffCacheSize"
>;

interface ExpandAllSessionMetrics {
  id: number;
  startedAt: number;
  expectedCount: number;
  textCount: number;
  binaryCount: number;
  propSync: Map<string, number>;
  contentMount: Map<string, number>;
  renderCommit: Map<string, number>;
  workerStart: WorkerStatsSnapshot | null;
  workerPeak: WorkerStatsSnapshot | null;
  frameGaps: number[];
  lastFrameAt: number;
  longTasks: Array<{ startMs: number; durationMs: number }>;
  rafId: number | null;
  timeoutId: number | null;
  observer: PerformanceObserver | null;
  unsubscribeWorker: (() => void) | null;
  finalized: boolean;
}

function getWorkerStatsSnapshot(
  workerPool: ReturnType<typeof useWorkerPool>,
): WorkerStatsSnapshot | null {
  if (!workerPool) return null;
  const stats = workerPool.getStats();
  return {
    managerState: stats.managerState,
    workersFailed: stats.workersFailed,
    totalWorkers: stats.totalWorkers,
    busyWorkers: stats.busyWorkers,
    queuedTasks: stats.queuedTasks,
    pendingTasks: stats.pendingTasks,
    fileCacheSize: stats.fileCacheSize,
    diffCacheSize: stats.diffCacheSize,
  };
}

function mergeWorkerStatsPeak(
  peak: WorkerStatsSnapshot | null,
  next: WorkerStatsSnapshot | null,
): WorkerStatsSnapshot | null {
  if (!next) return peak;
  if (!peak) return next;
  return {
    managerState: next.managerState,
    workersFailed: peak.workersFailed || next.workersFailed,
    totalWorkers: Math.max(peak.totalWorkers, next.totalWorkers),
    busyWorkers: Math.max(peak.busyWorkers, next.busyWorkers),
    queuedTasks: Math.max(peak.queuedTasks, next.queuedTasks),
    pendingTasks: Math.max(peak.pendingTasks, next.pendingTasks),
    fileCacheSize: Math.max(peak.fileCacheSize, next.fileCacheSize),
    diffCacheSize: Math.max(peak.diffCacheSize, next.diffCacheSize),
  };
}

type ParsedFile =
  | {
      contentKind: "text";
      filePath: string;
      fileDiff: FileDiffMetadata;
      additions: number;
      deletions: number;
      kind: ChangeKind;
      totalLines: number;
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
  expandAllSession,
  scrollToPath,
  scrollNonce,
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
  const workerPool = useWorkerPool();
  const cardHandles = useRef<Map<string, DiffCardHandle>>(new Map());
  const refCallbacks = useRef<
    Map<string, (handle: DiffCardHandle | null) => void>
  >(new Map());
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const expandAllMetricsRef = useRef<ExpandAllSessionMetrics | null>(null);

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

  useEffect(() => {
    if (!scrollToPath) return;
    const handle = cardHandles.current.get(scrollToPath);
    if (handle) {
      const el = handle.element;
      if (!handle.isOpen()) {
        handle.expand();
        el?.scrollIntoView({ behavior: "smooth", block: "start" });
      } else {
        const container = scrollContainerRef.current;
        if (el && container) {
          const cRect = container.getBoundingClientRect();
          const eRect = el.getBoundingClientRect();
          const fullyVisible =
            eRect.top >= cRect.top && eRect.bottom <= cRect.bottom;
          if (!fullyVisible) {
            el.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        }
      }
    }
    onScrollComplete();
    // scrollNonce intentionally in deps: re-fires when the same path is
    // selected again (after manual collapse).
  }, [scrollToPath, scrollNonce, onScrollComplete]);

  const finalizeExpandAllSession = useCallback(
    (reason: string) => {
      const metrics = expandAllMetricsRef.current;
      if (!metrics || metrics.finalized) return;
      metrics.finalized = true;
      if (metrics.rafId != null) cancelAnimationFrame(metrics.rafId);
      if (metrics.timeoutId != null) clearTimeout(metrics.timeoutId);
      metrics.observer?.disconnect();
      metrics.unsubscribeWorker?.();
      perfLogJson("ExpandAll", "complete", {
        sessionId: metrics.id,
        reason,
        totalMs: +(performance.now() - metrics.startedAt).toFixed(2),
        expectedCount: metrics.expectedCount,
        textCount: metrics.textCount,
        binaryCount: metrics.binaryCount,
        propSyncCount: metrics.propSync.size,
        contentMountCount: metrics.contentMount.size,
        renderCommitCount: metrics.renderCommit.size,
        workerStart: metrics.workerStart,
        workerPeak: metrics.workerPeak,
        workerEnd: getWorkerStatsSnapshot(workerPool),
        longTaskCount: metrics.longTasks.length,
        longTasks: metrics.longTasks,
        frameGapMax:
          metrics.frameGaps.length === 0
            ? 0
            : +Math.max(...metrics.frameGaps).toFixed(2),
        frameGapTop: [...metrics.frameGaps]
          .sort((left, right) => right - left)
          .slice(0, 10)
          .map((ms) => +ms.toFixed(2)),
      });
      perfLogJson("ExpandAll", "propSync:summary", {
        sessionId: metrics.id,
        ...summarizePerfEntries(metrics.propSync, 15),
      });
      perfLogJson("ExpandAll", "contentMount:summary", {
        sessionId: metrics.id,
        ...summarizePerfEntries(metrics.contentMount, 15),
      });
      perfLogJson("ExpandAll", "renderCommit:summary", {
        sessionId: metrics.id,
        ...summarizePerfEntries(metrics.renderCommit, 15),
      });
      if (expandAllMetricsRef.current?.id === metrics.id) {
        expandAllMetricsRef.current = null;
      }
    },
    [workerPool],
  );

  const handleExpandAllMetric = useCallback(
    (metric: ExpandAllCardMetric) => {
      const metrics = expandAllMetricsRef.current;
      if (!metrics || metrics.finalized || metrics.id !== metric.sessionId) {
        return;
      }
      const phaseMap =
        metric.phase === "propSync"
          ? metrics.propSync
          : metric.phase === "contentMount"
            ? metrics.contentMount
            : metrics.renderCommit;
      const previous = phaseMap.get(metric.path);
      if (previous == null || metric.ms > previous) {
        phaseMap.set(metric.path, metric.ms);
      }
      if (
        metric.phase === "renderCommit" &&
        metrics.expectedCount > 0 &&
        metrics.renderCommit.size >= metrics.expectedCount
      ) {
        finalizeExpandAllSession("all-render-committed");
      }
    },
    [finalizeExpandAllSession],
  );

  const parseCacheRef = useRef<
    WeakMap<FileDiffContents, { fileDiff: FileDiffMetadata; totalLines: number }>
  >(new WeakMap());

  const parsedFiles = useMemo(() => {
    const loopStart = performance.now();
    const result: ParsedFile[] = [];
    const cache = parseCacheRef.current;
    let hits = 0;
    let misses = 0;
    let binary = 0;
    let skipped = 0;
    const parseAgg = createPerfAggregator("DiffPanel", "parseDiffFromFile");
    for (const file of files) {
      const contents = diffs.get(file.path);
      if (!contents) {
        skipped += 1;
        continue;
      }

      if (contents.kind === "binary") {
        binary += 1;
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

      let entry = cache.get(contents);
      if (!entry) {
        const parseStart = performance.now();
        const fileDiff = parseDiffFromFile(contents.oldFile, contents.newFile);
        const totalLines = Math.max(
          fileDiff.additionLines.length,
          fileDiff.deletionLines.length,
        );
        entry = { fileDiff, totalLines };
        cache.set(contents, entry);
        parseAgg.record(file.path, performance.now() - parseStart, totalLines);
        misses += 1;
      } else {
        hits += 1;
      }

      result.push({
        contentKind: "text",
        filePath: file.path,
        fileDiff: entry.fileDiff,
        additions: file.additions,
        deletions: file.deletions,
        kind: file.kind,
        totalLines: entry.totalLines,
      });
    }
    perfLog("DiffPanel", "parseLoop", {
      totalFiles: files.length,
      produced: result.length,
      cacheHits: hits,
      cacheMisses: misses,
      binary,
      skippedMissingContents: skipped,
      ms: +(performance.now() - loopStart).toFixed(2),
    });
    parseAgg.flush(10);
    return result;
  }, [files, diffs]);

  useEffect(() => {
    if (!expandAllSession || !allExpanded) {
      finalizeExpandAllSession("cancelled");
      return;
    }

    const textCount = parsedFiles.filter(
      (parsedFile) => parsedFile.contentKind === "text",
    ).length;
    const binaryCount = parsedFiles.length - textCount;
    const metrics: ExpandAllSessionMetrics = {
      id: expandAllSession.id,
      startedAt: expandAllSession.startedAt,
      expectedCount: parsedFiles.length,
      textCount,
      binaryCount,
      propSync: new Map(),
      contentMount: new Map(),
      renderCommit: new Map(),
      workerStart: getWorkerStatsSnapshot(workerPool),
      workerPeak: getWorkerStatsSnapshot(workerPool),
      frameGaps: [],
      lastFrameAt: performance.now(),
      longTasks: [],
      rafId: null,
      timeoutId: null,
      observer: null,
      unsubscribeWorker: null,
      finalized: false,
    };
    expandAllMetricsRef.current = metrics;

    perfLogJson("ExpandAll", "sessionStart", {
      sessionId: metrics.id,
      requestedFileCount: expandAllSession.requestedFileCount,
      parsedFileCount: parsedFiles.length,
      textCount,
      binaryCount,
      diffStyle,
      workerStart: metrics.workerStart,
    });

    if (workerPool) {
      metrics.unsubscribeWorker = workerPool.subscribeToStatChanges((stats) => {
        metrics.workerPeak = mergeWorkerStatsPeak(metrics.workerPeak, {
          managerState: stats.managerState,
          workersFailed: stats.workersFailed,
          totalWorkers: stats.totalWorkers,
          busyWorkers: stats.busyWorkers,
          queuedTasks: stats.queuedTasks,
          pendingTasks: stats.pendingTasks,
          fileCacheSize: stats.fileCacheSize,
          diffCacheSize: stats.diffCacheSize,
        });
      });
    }

    const hasLongTaskSupport =
      typeof PerformanceObserver !== "undefined" &&
      Array.isArray(PerformanceObserver.supportedEntryTypes) &&
      PerformanceObserver.supportedEntryTypes.includes("longtask");
    if (hasLongTaskSupport) {
      try {
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            metrics.longTasks.push({
              startMs: +(entry.startTime - metrics.startedAt).toFixed(2),
              durationMs: +entry.duration.toFixed(2),
            });
          }
        });
        observer.observe({ entryTypes: ["longtask"] });
        metrics.observer = observer;
      } catch {
        metrics.observer = null;
      }
    }

    const tick = (timestamp: number) => {
      const current = expandAllMetricsRef.current;
      if (!current || current.finalized || current.id !== metrics.id) return;
      current.frameGaps.push(timestamp - current.lastFrameAt);
      current.lastFrameAt = timestamp;
      current.rafId = requestAnimationFrame(tick);
    };
    metrics.rafId = requestAnimationFrame(tick);
    metrics.timeoutId = window.setTimeout(() => {
      finalizeExpandAllSession("timeout");
    }, 15000);

    if (parsedFiles.length === 0) {
      finalizeExpandAllSession("no-files");
    }

    return () => {
      if (expandAllMetricsRef.current?.id === metrics.id) {
        finalizeExpandAllSession("cleanup");
      }
    };
  }, [
    allExpanded,
    diffStyle,
    expandAllSession,
    finalizeExpandAllSession,
    parsedFiles,
    workerPool,
  ]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading diffs...</p>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full min-w-0 flex-col overflow-hidden bg-background">
      {parsedFiles.length > 0 && (
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
      )}
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
              expandAllSession={expandAllSession}
              onExpandAllMetric={handleExpandAllMetric}
              annotations={
                annotationsByFile.get(parsedFile.filePath) ?? EMPTY_ANNOTATIONS
              }
              hasOpenForm={hasOpenForm}
              onAddAnnotation={onAddAnnotation}
              onCancelAnnotation={onCancelAnnotation}
              onSubmitAnnotation={onSubmitAnnotation}
              onDeleteAnnotation={onDeleteAnnotation}
              totalLines={parsedFile.contentKind === "text" ? parsedFile.totalLines : 0}
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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { Toaster } from "@/components/ui/sonner";
import { Sidebar } from "@/components/sidebar/sidebar";
import { DiffPanel } from "@/components/diff-panel/diff-panel";
import { useRepoStatus } from "@/hooks/use-repo-status";
import { useDiffs } from "@/hooks/use-diffs";
import { useComments } from "@/hooks/use-comments";
import { useFileWatcher } from "@/hooks/use-file-watcher";
import { stageFile, unstageFile, stageAll, unstageAll, commit, submitReview, type FileEntry } from "@/lib/tauri";
import { toast } from "sonner";
import { listen } from "@tauri-apps/api/event";
import type { CommentStatus } from "@/types/comments";

interface CommentStatusPayload {
  review_id: string;
  comment_id: string;
  status: CommentStatus;
  summary: string | null;
  dismiss_reason: string | null;
}

function App() {
  const { workdir, status, error, refresh } = useRepoStatus();
  const { diffs, loading } = useDiffs(status?.staged, status?.unstaged);
  const comments = useComments();
  const [diffStyle, setDiffStyle] = useState<"unified" | "split">("split");
  const [allExpanded, setAllExpanded] = useState(true);
  const [scrollToPath, setScrollToPath] = useState<string | null>(null);
  const [submittingReview, setSubmittingReview] = useState(false);

  // Listen for real-time comment status updates from the Tauri event bridge
  const { updateCommentStatus } = comments;
  useEffect(() => {
    const promise = listen<CommentStatusPayload>("review:comment-updated", (event) => {
      updateCommentStatus(
        event.payload.comment_id,
        event.payload.status,
        event.payload.summary,
        event.payload.dismiss_reason,
      );
    });
    return () => {
      promise.then((unlisten) => unlisten());
    };
  }, [updateCommentStatus]);

  useFileWatcher(
    useCallback(() => {
      if (comments.totalCommentCount === 0) {
        refresh();
      }
    }, [comments.totalCommentCount, refresh]),
  );

  const stagedPaths = useMemo(() => {
    if (!status) return new Set<string>();
    return new Set(status.staged.map((f) => f.path));
  }, [status]);

  const allFiles = useMemo((): FileEntry[] => {
    if (!status) return [];
    const seen = new Set<string>();
    const files: FileEntry[] = [];
    for (const f of status.staged) {
      if (!seen.has(f.path)) {
        seen.add(f.path);
        files.push(f);
      }
    }
    for (const f of status.unstaged) {
      if (!seen.has(f.path)) {
        seen.add(f.path);
        files.push(f);
      }
    }
    return files;
  }, [status]);

  const handleSelectFile = useCallback((path: string) => {
    setScrollToPath(path);
  }, []);

  const handleScrollComplete = useCallback(() => {
    setScrollToPath(null);
  }, []);

  const handleToggleStage = useCallback(
    async (path: string) => {
      try {
        if (stagedPaths.has(path)) {
          await unstageFile(path);
        } else {
          await stageFile(path);
        }
        await refresh();
      } catch (e) {
        toast.error(`Stage failed: ${e}`);
      }
    },
    [stagedPaths, refresh],
  );

  const handleStageAll = useCallback(async () => {
    try {
      await stageAll();
      await refresh();
    } catch (e) {
      toast.error(`Stage all failed: ${e}`);
    }
  }, [refresh]);

  const handleUnstageAll = useCallback(async () => {
    try {
      await unstageAll();
      await refresh();
    } catch (e) {
      toast.error(`Unstage all failed: ${e}`);
    }
  }, [refresh]);

  const handleCommit = useCallback(
    async (message: string) => {
      try {
        const oid = await commit(message);
        toast.success(`Committed: ${oid.slice(0, 7)}`);
        await refresh();
      } catch (e) {
        toast.error(`Commit failed: ${e}`);
      }
    },
    [refresh],
  );

  const { collectAllComments, markSubmitted } = comments;
  const submittingRef = useRef(false);

  const handleSubmitReview = useCallback(async () => {
    if (submittingRef.current) return;
    const reviewComments = collectAllComments();
    if (reviewComments.length === 0) return;

    submittingRef.current = true;
    setSubmittingReview(true);
    try {
      const result = await submitReview(reviewComments);
      toast.success(`Submitted ${result.submitted_count} comment(s)`);
      // Map server IDs back to local annotations by key
      const idMap = new Map(result.comment_ids.map((m) => [m.key, m.id]));
      markSubmitted(idMap);
    } catch (e) {
      toast.error(`Review submit failed: ${e}`);
    } finally {
      submittingRef.current = false;
      setSubmittingReview(false);
    }
  }, [collectAllComments, markSubmitted]);

  if (error) {
    return (
      <main className="flex h-dvh items-center justify-center p-4">
        <p className="text-destructive text-sm">{error}</p>
      </main>
    );
  }

  if (!status) {
    return (
      <main className="flex h-dvh items-center justify-center">
        <p className="text-muted-foreground text-sm">Loading...</p>
      </main>
    );
  }

  return (
    <>
      <ResizablePanelGroup
        orientation="horizontal"
        className="h-full isolate bg-background"
      >
        <ResizablePanel defaultSize="22%" minSize="15%" maxSize="35%">
          <Sidebar
            workdir={workdir}
            staged={status.staged}
            unstaged={status.unstaged}
            stagedPaths={stagedPaths}
            selectedFile={scrollToPath}
            onSelectFile={handleSelectFile}
            onToggleStage={handleToggleStage}
            onStageAll={handleStageAll}
            onUnstageAll={handleUnstageAll}
            onCommit={handleCommit}
          />
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel defaultSize="78%">
          <DiffPanel
            files={allFiles}
            diffs={diffs}
            loading={loading}
            stagedPaths={stagedPaths}
            unstaged={status.unstaged}
            diffStyle={diffStyle}
            onDiffStyleChange={setDiffStyle}
            allExpanded={allExpanded}
            onToggleExpandAll={() => setAllExpanded((prev) => !prev)}
            scrollToPath={scrollToPath}
            onScrollComplete={handleScrollComplete}
            annotationsByFile={comments.annotationsByFile}
            hasOpenForm={comments.hasOpenForm}
            totalCommentCount={comments.totalCommentCount}
            pendingCount={comments.pendingCount}
            acknowledgedCount={comments.acknowledgedCount}
            resolvedCount={comments.resolvedCount}
            onAddAnnotation={comments.addFormAnnotation}
            onCancelAnnotation={comments.cancelAnnotation}
            onSubmitAnnotation={comments.submitAnnotation}
            onDeleteAnnotation={comments.deleteAnnotation}
            onToggleStage={handleToggleStage}
            onSubmitReview={handleSubmitReview}
            onClearResolved={comments.clearResolved}
            submittingReview={submittingReview}
          />
        </ResizablePanel>
      </ResizablePanelGroup>
      <Toaster />
    </>
  );
}

export default App;

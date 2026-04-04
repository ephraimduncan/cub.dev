import { useCallback, useMemo, useState } from "react";
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
import { stageFile, unstageFile, commit, type FileEntry } from "@/lib/tauri";
import { toast } from "sonner";

function App() {
  const { workdir, status, error, refresh } = useRepoStatus();
  const { diffs, loading } = useDiffs(status?.staged, status?.unstaged);
  const comments = useComments();
  const [diffStyle, setDiffStyle] = useState<"unified" | "split">("unified");
  const [allExpanded, setAllExpanded] = useState(true);
  const [scrollToPath, setScrollToPath] = useState<string | null>(null);

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
    if (!status) return;
    try {
      for (const f of status.unstaged) {
        await stageFile(f.path);
      }
      await refresh();
    } catch (e) {
      toast.error(`Stage all failed: ${e}`);
    }
  }, [status, refresh]);

  const handleUnstageAll = useCallback(async () => {
    if (!status) return;
    try {
      for (const f of status.staged) {
        await unstageFile(f.path);
      }
      await refresh();
    } catch (e) {
      toast.error(`Unstage all failed: ${e}`);
    }
  }, [status, refresh]);

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

  const handleCommitAndPush = useCallback(
    async (message: string) => {
      try {
        const oid = await commit(message);
        toast.success(`Committed: ${oid.slice(0, 7)}. Push not yet implemented.`);
        await refresh();
      } catch (e) {
        toast.error(`Commit failed: ${e}`);
      }
    },
    [refresh],
  );

  const handleSubmitReview = useCallback(() => {
    const reviewComments = comments.collectAllComments();
    if (reviewComments.length === 0) return;
    // TODO: send to MCP sidecar via Tauri IPC
    console.log("Review submitted:", reviewComments);
    toast.success(`Submitted ${reviewComments.length} comment(s)`);
    comments.clearAll();
  }, [comments]);

  if (error) {
    return (
      <main className="flex h-screen items-center justify-center p-4">
        <p className="text-destructive text-sm">{error}</p>
      </main>
    );
  }

  if (!status) {
    return (
      <main className="flex h-screen items-center justify-center">
        <p className="text-muted-foreground text-sm">Loading...</p>
      </main>
    );
  }

  return (
    <>
      <ResizablePanelGroup orientation="horizontal" className="h-screen">
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
            onCommit={handleCommit}
            onCommitAndPush={handleCommitAndPush}
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
            onAddAnnotation={comments.addFormAnnotation}
            onCancelAnnotation={comments.cancelAnnotation}
            onSubmitAnnotation={comments.submitAnnotation}
            onDeleteAnnotation={comments.deleteAnnotation}
            onToggleStage={handleToggleStage}
            onStageAll={handleStageAll}
            onUnstageAll={handleUnstageAll}
            onSubmitReview={handleSubmitReview}
          />
        </ResizablePanel>
      </ResizablePanelGroup>
      <Toaster />
    </>
  );
}

export default App;

import { useEffect, useMemo, useRef, type CSSProperties } from "react";
import {
  FileTree,
  useFileTree,
  useFileTreeSelection,
} from "@pierre/trees/react";
import type { GitStatus, GitStatusEntry } from "@pierre/trees";
import { Button } from "@/components/ui/button";
import { CommitBar } from "./commit-bar";
import { SidebarContextMenu } from "./sidebar-context-menu";
import type { ChangeKind, FileEntry } from "@/lib/tauri";
import { toast } from "sonner";

interface SidebarProps {
  workdir: string | null;
  staged: FileEntry[];
  unstaged: FileEntry[];
  stagedPaths: Set<string>;
  selectedFile: string | null;
  onSelectFile: (path: string) => void;
  onToggleStage: (path: string) => void;
  onStageAll: () => void;
  onUnstageAll: () => void;
  onCommit: (message: string) => void;
}

const treeStyle: CSSProperties = {
  colorScheme: "dark",
  "--trees-bg-override": "transparent",
  "--trees-fg-override": "var(--foreground)",
  "--trees-fg-muted-override": "var(--muted-foreground)",
  "--trees-bg-muted-override": "var(--muted)",
  "--trees-selected-bg-override": "var(--accent)",
  "--trees-selected-fg-override": "var(--accent-foreground)",
  "--trees-border-color-override": "var(--border)",
  height: "100%",
} as CSSProperties;

function mapKind(kind: ChangeKind): GitStatus {
  switch (kind) {
    case "added":
      return "added";
    case "deleted":
      return "deleted";
    case "renamed":
      return "renamed";
    case "modified":
    case "typechange":
    default:
      return "modified";
  }
}

export function Sidebar({
  workdir,
  staged,
  unstaged,
  stagedPaths,
  onSelectFile,
  onToggleStage,
  onStageAll,
  onUnstageAll,
  onCommit,
}: SidebarProps) {
  const hasChanges = staged.length > 0 || unstaged.length > 0;
  const totalCount = staged.length + unstaged.length;

  return (
    <div className="flex h-full w-full min-w-0 flex-col overflow-hidden border-r border-border/70 bg-sidebar">
      <div className="flex h-10 items-center justify-between border-b border-border px-3">
        <p className="truncate text-sm font-medium text-sidebar-foreground">
          {workdir?.replace(/\/+$/, "").split("/").pop() ?? "No repository"}
        </p>
        <p className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {totalCount} file{totalCount === 1 ? "" : "s"}
        </p>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {!hasChanges && (
          <p className="px-3 py-4 text-xs text-muted-foreground">No changes</p>
        )}

        {staged.length > 0 && (
          <Section
            label="Staged"
            files={staged}
            treeId="cub-staged-tree"
            stagedPaths={stagedPaths}
            actionLabel="Unstage All"
            onAction={onUnstageAll}
            onSelectFile={onSelectFile}
            onToggleStage={onToggleStage}
          />
        )}
        {unstaged.length > 0 && (
          <Section
            label="Unstaged"
            files={unstaged}
            treeId="cub-unstaged-tree"
            stagedPaths={stagedPaths}
            actionLabel="Stage All"
            onAction={onStageAll}
            onSelectFile={onSelectFile}
            onToggleStage={onToggleStage}
          />
        )}
      </div>

      <CommitBar stagedCount={staged.length} onCommit={onCommit} />
    </div>
  );
}

interface SectionProps {
  label: string;
  files: FileEntry[];
  treeId: string;
  stagedPaths: Set<string>;
  actionLabel: string;
  onAction: () => void;
  onSelectFile: (path: string) => void;
  onToggleStage: (path: string) => void;
}

function Section({
  label,
  files,
  treeId,
  stagedPaths,
  actionLabel,
  onAction,
  onSelectFile,
  onToggleStage,
}: SectionProps) {
  const paths = useMemo(() => files.map((f) => f.path), [files]);
  const gitStatus = useMemo<GitStatusEntry[]>(
    () => files.map((f) => ({ path: f.path, status: mapKind(f.kind) })),
    [files],
  );

  const { model } = useFileTree({
    id: treeId,
    paths,
    flattenEmptyDirectories: true,
    initialExpansion: "open",
    gitStatus,
    density: "compact",
    composition: {
      contextMenu: {
        enabled: true,
        triggerMode: "both",
        buttonVisibility: "when-needed",
      },
    },
  });

  useEffect(() => {
    model.resetPaths(paths);
  }, [paths, model]);

  useEffect(() => {
    model.setGitStatus(gitStatus);
  }, [gitStatus, model]);

  const selectedPaths = useFileTreeSelection(model);
  const lastEmittedRef = useRef<string | null>(null);
  useEffect(() => {
    if (selectedPaths.length === 0) {
      lastEmittedRef.current = null;
      return;
    }
    const path = selectedPaths[selectedPaths.length - 1];
    if (path === lastEmittedRef.current) return;
    const item = model.getItem(path);
    if (item == null || item.isDirectory()) return;
    lastEmittedRef.current = path;
    onSelectFile(path);
  }, [selectedPaths, model, onSelectFile]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between px-2 py-1">
        <span className="text-xs font-medium text-muted-foreground">
          {label}{" "}
          <span className="text-[10px]">({files.length})</span>
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-5 px-1.5 text-[10px]"
          onClick={onAction}
        >
          {actionLabel}
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <FileTree
          model={model}
          style={treeStyle}
          renderContextMenu={(item, context) => (
            <SidebarContextMenu
              item={item}
              context={context}
              isStaged={stagedPaths.has(item.path)}
              onStage={(p) => {
                context.close();
                onToggleStage(p);
              }}
              onUnstage={(p) => {
                context.close();
                onToggleStage(p);
              }}
              onDiscard={(p) => {
                context.close();
                toast.info(`Discard ${p} — TODO`);
              }}
              onCopyPath={(p) => {
                context.close();
                navigator.clipboard.writeText(p).catch(() => {});
              }}
              onRevealInFinder={(p) => {
                context.close();
                toast.info(`Reveal ${p} — TODO`);
              }}
            />
          )}
        />
      </div>
    </div>
  );
}

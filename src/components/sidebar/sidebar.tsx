import { ScrollArea } from "@/components/ui/scroll-area";
import { FileList } from "./file-list";
import { CommitBar } from "./commit-bar";
import type { FileEntry } from "@/lib/tauri";

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

export function Sidebar({
  workdir,
  staged,
  unstaged,
  stagedPaths,
  selectedFile,
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
      <ScrollArea className="flex-1">
        <div className="space-y-3 p-1.5">
          {!hasChanges && (
            <p className="px-2 py-6 text-sm text-muted-foreground">
              No changes
            </p>
          )}
          <FileList
            label="Staged"
            files={staged}
            stagedPaths={stagedPaths}
            selectedFile={selectedFile}
            onSelectFile={onSelectFile}
            onToggleStage={onToggleStage}
            onUnstageAll={onUnstageAll}
          />
          <FileList
            label="Unstaged"
            files={unstaged}
            stagedPaths={stagedPaths}
            selectedFile={selectedFile}
            onSelectFile={onSelectFile}
            onToggleStage={onToggleStage}
            onStageAll={onStageAll}
          />
        </div>
      </ScrollArea>
      <CommitBar stagedCount={staged.length} onCommit={onCommit} />
    </div>
  );
}

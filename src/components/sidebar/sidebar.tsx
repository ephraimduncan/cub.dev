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

  return (
    <div className="flex h-full w-full min-w-0 flex-col overflow-hidden">
      <div className="flex h-10 shrink-0 items-center border-b border-border px-3">
        <h2 className="truncate text-xs font-medium text-muted-foreground">
          {workdir ?? "Repository"}
        </h2>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-1.5">
          {!hasChanges && (
            <p className="px-2 py-4 text-xs text-muted-foreground">
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
      <CommitBar
        stagedCount={staged.length}
        onCommit={onCommit}
      />
    </div>
  );
}

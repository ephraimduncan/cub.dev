import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { FileRow } from "./file-row";
import type { FileEntry } from "@/lib/tauri";
import { IconChevronDown } from "@tabler/icons-react";

interface FileListProps {
  label: string;
  files: FileEntry[];
  stagedPaths: Set<string>;
  selectedFile: string | null;
  onSelectFile: (path: string) => void;
  onToggleStage: (path: string) => void;
  onStageAll?: () => void;
  onUnstageAll?: () => void;
}

export function FileList({
  label,
  files,
  stagedPaths,
  selectedFile,
  onSelectFile,
  onToggleStage,
  onStageAll,
  onUnstageAll,
}: FileListProps) {
  if (files.length === 0) return null;

  return (
    <Collapsible defaultOpen>
      <div className="flex items-center justify-between px-2 py-1">
        <CollapsibleTrigger className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
          <IconChevronDown className="size-3 transition-transform -rotate-90 [[data-panel-open]_&]:rotate-0" />
          {label}
          <span className="tabular-nums opacity-50">{files.length}</span>
        </CollapsibleTrigger>
        {(onStageAll || onUnstageAll) && (
          <Button
            variant="ghost"
            size="xs"
            className="text-xs text-muted-foreground"
            onClick={onStageAll ?? onUnstageAll}
          >
            {onStageAll ? "Stage all" : "Unstage all"}
          </Button>
        )}
      </div>
      <CollapsibleContent className="space-y-0.5">
        {files.map((file) => (
          <FileRow
            key={file.path}
            file={file}
            isStaged={stagedPaths.has(file.path)}
            isSelected={selectedFile === file.path}
            onSelect={() => onSelectFile(file.path)}
            onToggleStage={() => onToggleStage(file.path)}
          />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

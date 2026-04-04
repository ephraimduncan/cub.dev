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
}

export function FileList({
  label,
  files,
  stagedPaths,
  selectedFile,
  onSelectFile,
  onToggleStage,
  onStageAll,
}: FileListProps) {
  if (files.length === 0) return null;

  return (
    <Collapsible defaultOpen>
      <div className="flex items-center justify-between px-1.5 py-1">
        <CollapsibleTrigger className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
          <IconChevronDown className="size-3 transition-transform [[data-panel-open]_&]:rotate-0 [[data-panel-closed]_&]:-rotate-90" />
          {label}
          <span className="text-[10px]">({files.length})</span>
        </CollapsibleTrigger>
        {onStageAll && (
          <Button
            variant="ghost"
            size="sm"
            className="h-5 px-1.5 text-[10px]"
            onClick={onStageAll}
          >
            Stage All
          </Button>
        )}
      </div>
      <CollapsibleContent>
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

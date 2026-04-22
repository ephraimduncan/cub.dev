import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { FILE_STATUS, DIFF_ADDITION_COLOR, DIFF_DELETION_COLOR } from "@/lib/status";
import type { FileEntry } from "@/lib/tauri";

interface FileRowProps {
  file: FileEntry;
  isStaged: boolean;
  isSelected: boolean;
  onSelect: () => void;
  onToggleStage: () => void;
}

export function FileRow({
  file,
  isStaged,
  isSelected,
  onSelect,
  onToggleStage,
}: FileRowProps) {
  const status = FILE_STATUS[file.kind] ?? {
    letter: "?",
    color: "text-muted-foreground",
  };
  const parts = file.path.split("/");
  const filename = parts.pop() ?? file.path;
  const dir = parts.length > 0 ? parts.join("/") + "/" : "";

  return (
    <div
      role="button"
      tabIndex={0}
      className={cn(
        "group flex min-w-0 items-start gap-2 rounded-sm px-2 py-1 text-sm cursor-pointer",
        isSelected
          ? "bg-accent text-accent-foreground"
          : "text-foreground hover:bg-muted/70",
      )}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <div
        className={cn(
          "flex h-5 shrink-0 items-center font-mono text-xs font-semibold tabular-nums",
          status.color,
        )}
      >
        {status.letter}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{filename}</p>
        {dir && <p className="truncate text-xs text-muted-foreground">{dir}</p>}
      </div>
      <div className="flex h-5 shrink-0 items-center gap-1.5 text-xs tabular-nums">
        {file.additions > 0 && (
          <span className={DIFF_ADDITION_COLOR}>+{file.additions}</span>
        )}
        {file.deletions > 0 && (
          <span className={DIFF_DELETION_COLOR}>-{file.deletions}</span>
        )}
      </div>
      <div className="flex h-5 shrink-0 items-center">
        <Checkbox
          checked={isStaged}
          onClick={(e) => {
            e.stopPropagation();
            onToggleStage();
          }}
          className="size-4"
        />
      </div>
    </div>
  );
}

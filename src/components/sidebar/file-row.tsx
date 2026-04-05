import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import type { FileEntry } from "@/lib/tauri";

const STATUS_LABELS: Record<string, { letter: string; className: string }> = {
  added: { letter: "A", className: "text-emerald-500" },
  modified: { letter: "M", className: "text-amber-500" },
  deleted: { letter: "D", className: "text-red-500" },
  renamed: { letter: "R", className: "text-blue-500" },
  typechange: { letter: "T", className: "text-purple-500" },
};

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
  const status = STATUS_LABELS[file.kind] ?? {
    letter: "?",
    className: "text-muted-foreground",
  };
  const parts = file.path.split("/");
  const filename = parts.pop() ?? file.path;
  const dir = parts.length > 0 ? parts.join("/") + "/" : "";

  return (
    <div
      className={cn(
        "group flex items-center gap-1.5 rounded px-1.5 py-0.5 text-xs cursor-pointer min-w-0",
        isSelected ? "bg-accent text-accent-foreground" : "hover:bg-muted",
      )}
      onClick={onSelect}
    >
      <span
        className={cn(
          "shrink-0 font-mono text-[10px] font-bold",
          status.className,
        )}
      >
        {status.letter}
      </span>
      <span className="shrink-0 font-medium">{filename}</span>
      {dir && (
        <span className="truncate text-muted-foreground text-[10px]">
          {dir}
        </span>
      )}
      <span className="ml-auto flex shrink-0 gap-1 font-mono text-[10px]">
        {file.additions > 0 && (
          <span className="text-emerald-500">+{file.additions}</span>
        )}
        {file.deletions > 0 && (
          <span className="text-red-500">-{file.deletions}</span>
        )}
      </span>
      <Checkbox
        checked={isStaged}
        onClick={(e) => {
          e.stopPropagation();
          onToggleStage();
        }}
        className="size-3.5"
      />
    </div>
  );
}

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Separator } from "@/components/ui/separator";
import {
  IconLayoutColumns,
  IconLayoutRows,
  IconFold,
  IconArrowsVertical,
} from "@tabler/icons-react";

interface DiffToolbarProps {
  diffStyle: "unified" | "split";
  onDiffStyleChange: (style: "unified" | "split") => void;
  allExpanded: boolean;
  onToggleExpandAll: () => void;
  commentCount: number;
  onSubmitReview: () => void;
}

export function DiffToolbar({
  diffStyle,
  onDiffStyleChange,
  allExpanded,
  onToggleExpandAll,
  commentCount,
  onSubmitReview,
}: DiffToolbarProps) {
  return (
    <div className="sticky top-0 z-10 flex h-10 items-center justify-end border-b bg-background px-3">
      <div className="flex items-center gap-1.5">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-1.5"
          onClick={onToggleExpandAll}
          title={allExpanded ? "Collapse All" : "Expand All"}
        >
          {allExpanded ? (
            <IconFold className="size-3.5" />
          ) : (
            <IconArrowsVertical className="size-3.5" />
          )}
        </Button>
        <Separator orientation="vertical" className="h-4" />
        <ToggleGroup
          value={[diffStyle]}
          onValueChange={(values) => {
            const next = values.find((v) => v !== diffStyle);
            if (next) onDiffStyleChange(next as "unified" | "split");
          }}
          size="sm"
          variant="outline"
        >
          <ToggleGroupItem
            value="unified"
            title="Unified view"
            className="h-7 px-1.5"
          >
            <IconLayoutRows className="size-3.5" />
          </ToggleGroupItem>
          <ToggleGroupItem
            value="split"
            title="Split view"
            className="h-7 px-1.5"
          >
            <IconLayoutColumns className="size-3.5" />
          </ToggleGroupItem>
        </ToggleGroup>
        <Separator orientation="vertical" className="h-4" />
        <Button
          size="sm"
          className="text-xs h-7"
          disabled={commentCount === 0}
          onClick={onSubmitReview}
        >
          Submit Review
          {commentCount > 0 && (
            <Badge variant="secondary" className="ml-1 text-[10px] h-4 px-1.5">
              {commentCount}
            </Badge>
          )}
        </Button>
      </div>
    </div>
  );
}

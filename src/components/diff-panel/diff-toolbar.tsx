import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Separator } from "@/components/ui/separator";
import {
  IconLayoutColumns,
  IconLayoutRows,
  IconFold,
  IconArrowsVertical,
  IconCheck,
} from "@tabler/icons-react";

interface DiffToolbarProps {
  diffStyle: "unified" | "split";
  onDiffStyleChange: (style: "unified" | "split") => void;
  allExpanded: boolean;
  onToggleExpandAll: () => void;
  commentCount: number;
  pendingCount: number;
  acknowledgedCount: number;
  resolvedCount: number;
  onSubmitReview: () => void;
  onClearResolved: () => void;
  submittingReview: boolean;
}

function StatusSummary({
  pending,
  acknowledged,
  resolved,
}: {
  pending: number;
  acknowledged: number;
  resolved: number;
}) {
  const parts: string[] = [];
  if (pending > 0) parts.push(`${pending} pending`);
  if (acknowledged > 0) parts.push(`${acknowledged} reviewing`);
  if (resolved > 0) parts.push(`${resolved} resolved`);
  if (parts.length === 0) return null;
  return (
    <span className="text-[11px] text-muted-foreground">
      {parts.join(" · ")}
    </span>
  );
}

export function DiffToolbar({
  diffStyle,
  onDiffStyleChange,
  allExpanded,
  onToggleExpandAll,
  commentCount,
  pendingCount,
  acknowledgedCount,
  resolvedCount,
  onSubmitReview,
  onClearResolved,
  submittingReview,
}: DiffToolbarProps) {
  return (
    <div className="sticky top-0 z-10 flex h-10 items-center justify-between border-b bg-background px-3">
      <StatusSummary
        pending={pendingCount}
        acknowledged={acknowledgedCount}
        resolved={resolvedCount}
      />
      <div className="flex items-center gap-1.5">
        {resolvedCount > 0 && (
          <>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs text-muted-foreground"
              onClick={onClearResolved}
              title="Clear resolved comments"
            >
              <IconCheck className="size-3" />
              Clear Resolved
            </Button>
            <Separator orientation="vertical" className="h-4" />
          </>
        )}
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
          disabled={commentCount === 0 || submittingReview}
          onClick={onSubmitReview}
        >
          {submittingReview ? "Submitting…" : "Submit Review"}
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

import { Button } from "@/components/ui/button";
import {
  IconFold,
  IconArrowsVertical,
  IconCheck,
  IconLayoutColumns,
  IconLayoutRows,
} from "@tabler/icons-react";

interface DiffToolbarProps {
  diffStyle: "unified" | "split";
  onDiffStyleChange: (style: "unified" | "split") => void;
  allExpanded: boolean;
  onToggleExpandAll: () => void;
  expandAllTitle?: string;
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
    <p className="text-xs text-muted-foreground tabular-nums">
      {parts.join(" · ")}
    </p>
  );
}

export function DiffToolbar({
  diffStyle,
  onDiffStyleChange,
  allExpanded,
  onToggleExpandAll,
  expandAllTitle,
  commentCount,
  pendingCount,
  acknowledgedCount,
  resolvedCount,
  onSubmitReview,
  onClearResolved,
  submittingReview,
}: DiffToolbarProps) {
  return (
    <div className="sticky top-0 z-10 flex h-10 items-center justify-between border-b border-border bg-background px-3">
      <StatusSummary
        pending={pendingCount}
        acknowledged={acknowledgedCount}
        resolved={resolvedCount}
      />
      <div className="ml-auto flex items-center gap-1.5">
        {resolvedCount > 0 && (
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground"
            onClick={onClearResolved}
            title="Clear resolved"
          >
            <IconCheck className="size-3.5" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onToggleExpandAll}
          title={expandAllTitle ?? (allExpanded ? "Collapse All" : "Expand All")}
        >
          {allExpanded ? (
            <IconFold className="size-3.5" />
          ) : (
            <IconArrowsVertical className="size-3.5" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() =>
            onDiffStyleChange(diffStyle === "split" ? "unified" : "split")
          }
          title={diffStyle === "split" ? "Switch to unified" : "Switch to split"}
        >
          {diffStyle === "split" ? (
            <IconLayoutColumns className="size-3.5" />
          ) : (
            <IconLayoutRows className="size-3.5" />
          )}
        </Button>
        <Button
          size="sm"
          disabled={commentCount === 0 || submittingReview}
          onClick={onSubmitReview}
          className="tabular-nums"
        >
          {submittingReview
            ? "Submitting…"
            : commentCount > 0
              ? `Submit (${commentCount})`
              : "Submit Review"}
        </Button>
      </div>
    </div>
  );
}

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { IconX, IconEye, IconCheck, IconBan } from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import type { ActionType, CommentStatus } from "@/types/comments";

const ACTION_LABELS: Record<
  ActionType,
  { label: string; variant: "destructive" | "secondary" | "outline" }
> = {
  "change-request": { label: "Change Request", variant: "destructive" },
  question: { label: "Question", variant: "secondary" },
  nit: { label: "Nit", variant: "outline" },
};

const STATUS_CONFIG: Record<
  Exclude<CommentStatus, "draft">,
  { label: string; icon: typeof IconEye; className: string } | null
> = {
  pending: null, // No extra badge for draft-like submitted state
  acknowledged: {
    label: "Agent reviewing…",
    icon: IconEye,
    className:
      "border-blue-500/15 bg-blue-500/10 text-blue-600 dark:border-blue-400/15 dark:bg-blue-400/10 dark:text-blue-300",
  },
  resolved: {
    label: "Resolved",
    icon: IconCheck,
    className:
      "border-green-500/15 bg-green-500/10 text-green-600 dark:border-green-400/15 dark:bg-green-400/10 dark:text-green-300",
  },
  dismissed: {
    label: "Dismissed",
    icon: IconBan,
    className:
      "border-amber-500/15 bg-amber-500/10 text-amber-600 dark:border-amber-400/15 dark:bg-amber-400/10 dark:text-amber-300",
  },
};

interface CommentBubbleProps {
  text: string;
  actionType: ActionType;
  status: CommentStatus;
  summary?: string;
  dismissReason?: string;
  onDelete: () => void;
}

export function CommentBubble({
  text,
  actionType,
  status,
  summary,
  dismissReason,
  onDelete,
}: CommentBubbleProps) {
  const action = ACTION_LABELS[actionType];
  const statusCfg = status !== "draft" ? STATUS_CONFIG[status] : null;
  const isTerminal = status === "resolved" || status === "dismissed";

  return (
    <div className="p-2">
      <div
        className={cn(
          "rounded-md border border-border bg-card p-2.5",
          isTerminal && "opacity-50",
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant={action.variant}>
                {action.label}
              </Badge>
              {statusCfg && (
                <Badge
                  variant="outline"
                  className={cn("gap-1 pl-1 pr-2", statusCfg.className)}
                >
                  <statusCfg.icon className="size-3 shrink-0" />
                  {statusCfg.label}
                </Badge>
              )}
              {status === "pending" && (
                <Badge variant="outline" className="text-muted-foreground">
                  Submitted
                </Badge>
              )}
            </div>
            <div className="space-y-1">
              <p className="text-sm/5 text-pretty">{text}</p>
              {status === "resolved" && summary && (
                <p className="text-xs/5 text-green-600 dark:text-green-400">
                  {summary}
                </p>
              )}
              {status === "dismissed" && dismissReason && (
                <p className="text-xs/5 text-amber-600 dark:text-amber-400">
                  {dismissReason}
                </p>
              )}
            </div>
          </div>
          {status === "draft" && (
            <Button
              variant="ghost"
              size="xs"
              className="size-5 shrink-0 p-0"
              onClick={onDelete}
            >
              <IconX className="size-3" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

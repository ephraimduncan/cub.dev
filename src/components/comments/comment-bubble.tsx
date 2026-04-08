import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { IconX, IconEye, IconCheck, IconBan } from "@tabler/icons-react";
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
    className: "bg-blue-500/10 text-blue-600 border-blue-200",
  },
  resolved: {
    label: "Resolved",
    icon: IconCheck,
    className: "bg-green-500/10 text-green-600 border-green-200",
  },
  dismissed: {
    label: "Dismissed",
    icon: IconBan,
    className: "bg-amber-500/10 text-amber-600 border-amber-200",
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
    <div style={{ overflow: "hidden", width: "100%" }}>
      <div
        style={{ whiteSpace: "normal", margin: 12 }}
        className="max-w-[90%] sm:max-w-[70%]"
      >
        <div
          className={`rounded-lg border bg-card p-3 shadow-sm ${
            isTerminal ? "opacity-60" : ""
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 flex-wrap">
                <Badge variant={action.variant} className="text-[10px]">
                  {action.label}
                </Badge>
                {statusCfg && (
                  <Badge
                    variant="outline"
                    className={`text-[10px] gap-0.5 ${statusCfg.className}`}
                  >
                    <statusCfg.icon className="size-2.5" />
                    {statusCfg.label}
                  </Badge>
                )}
                {status === "pending" && (
                  <Badge variant="outline" className="text-[10px] text-muted-foreground">
                    Submitted
                  </Badge>
                )}
              </div>
              <p className="text-xs leading-relaxed">{text}</p>
              {status === "resolved" && summary && (
                <p className="text-[11px] leading-relaxed text-green-600 mt-1">
                  {summary}
                </p>
              )}
              {status === "dismissed" && dismissReason && (
                <p className="text-[11px] leading-relaxed text-amber-600 mt-1">
                  {dismissReason}
                </p>
              )}
            </div>
            {/* Only show delete button for draft comments (not yet submitted) */}
            {status === "draft" && (
              <Button
                variant="ghost"
                size="sm"
                className="size-6 shrink-0 p-0"
                onClick={onDelete}
              >
                <IconX className="size-3" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

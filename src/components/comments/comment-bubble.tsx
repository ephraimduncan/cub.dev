import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { IconX } from "@tabler/icons-react";
import type { ActionType } from "@/types/comments";

const ACTION_LABELS: Record<ActionType, { label: string; variant: "destructive" | "secondary" | "outline" }> = {
  "change-request": { label: "Change Request", variant: "destructive" },
  question: { label: "Question", variant: "secondary" },
  nit: { label: "Nit", variant: "outline" },
};

interface CommentBubbleProps {
  text: string;
  actionType: ActionType;
  onDelete: () => void;
}

export function CommentBubble({ text, actionType, onDelete }: CommentBubbleProps) {
  const action = ACTION_LABELS[actionType];

  return (
    <div style={{ overflow: "hidden", width: "100%" }}>
      <div
        style={{ whiteSpace: "normal", margin: 12 }}
        className="max-w-[90%] sm:max-w-[70%]"
      >
        <div className="rounded-lg border bg-card p-3 shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-1.5">
              <Badge variant={action.variant} className="text-[10px]">
                {action.label}
              </Badge>
              <p className="text-xs leading-relaxed">{text}</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="size-6 shrink-0 p-0"
              onClick={onDelete}
            >
              <IconX className="size-3" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

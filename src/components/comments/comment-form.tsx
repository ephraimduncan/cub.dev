import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ActionType } from "@/types/comments";

interface CommentFormProps {
  onSubmit: (text: string, actionType: ActionType) => void;
  onCancel: () => void;
}

export function CommentForm({ onSubmit, onCancel }: CommentFormProps) {
  const [text, setText] = useState("");
  const [actionType, setActionType] = useState<ActionType>("change-request");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setTimeout(() => textareaRef.current?.focus(), 0);
  }, []);

  const handleSubmit = () => {
    if (text.trim() === "") return;
    onSubmit(text.trim(), actionType);
  };

  return (
    <div className="p-2">
      <div className="overflow-hidden rounded-lg border border-border bg-background">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Leave a comment..."
          className="field-sizing-content w-full resize-none bg-transparent px-3 pt-2.5 pb-2 text-sm outline-none placeholder:text-muted-foreground"
          style={{ minHeight: "4rem" }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              handleSubmit();
            }
          }}
        />
        <div className="flex items-center justify-between border-t border-border px-2 py-1.5">
          <Select
            value={actionType}
            onValueChange={(v) => setActionType(v as ActionType)}
          >
            <SelectTrigger size="sm" className="h-7 w-fit border-none bg-transparent px-2 text-xs shadow-none">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="change-request">Change Request</SelectItem>
              <SelectItem value="question">Question</SelectItem>
              <SelectItem value="nit">Nit</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="xs" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              size="xs"
              disabled={text.trim() === ""}
              onClick={handleSubmit}
            >
              Comment
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

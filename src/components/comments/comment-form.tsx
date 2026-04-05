import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
    <div style={{ overflow: "hidden", width: "100%" }}>
      <div
        style={{ whiteSpace: "normal", margin: 12 }}
        className="max-w-[90%] sm:max-w-[70%]"
      >
        <div className="rounded-lg border bg-card p-3 shadow-sm space-y-2">
          <Select
            value={actionType}
            onValueChange={(v) => setActionType(v as ActionType)}
          >
            <SelectTrigger size="sm" className="w-fit text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="change-request">Change Request</SelectItem>
              <SelectItem value="question">Question</SelectItem>
              <SelectItem value="nit">Nit</SelectItem>
            </SelectContent>
          </Select>
          <Textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Leave a comment..."
            className="min-h-[60px] resize-none text-xs"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleSubmit();
              }
            }}
          />
          <div className="flex justify-end gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={onCancel}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="text-xs"
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

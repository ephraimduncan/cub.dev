import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Textarea } from "@/components/ui/textarea";

interface CommitBarProps {
  stagedCount: number;
  onCommit: (message: string) => void;
}

export function CommitBar({ stagedCount, onCommit }: CommitBarProps) {
  const [message, setMessage] = useState("");
  const disabled = message.trim() === "" || stagedCount === 0;

  const handleCommit = () => {
    if (disabled) return;
    onCommit(message.trim());
    setMessage("");
  };

  return (
    <div className="space-y-2 border-t border-border/70 p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">
          Commit
          {stagedCount > 0 && (
            <span className="tabular-nums"> · {stagedCount} staged</span>
          )}
        </p>
        <Kbd>⌘↵</Kbd>
      </div>
      <Textarea
        placeholder="Commit message"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        className="min-h-20 resize-none border-border/50 bg-background text-sm shadow-none"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            handleCommit();
          }
        }}
      />
      <div className="flex justify-end">
        <Button
          variant="secondary"
          size="sm"
          disabled={disabled}
          onClick={handleCommit}
        >
          Commit
        </Button>
      </div>
    </div>
  );
}

import { useState } from "react";
import { Button } from "@/components/ui/button";
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
    <div className="flex flex-col min-h-0 flex-1 max-h-[200px] border-t border-border">
      <div className="relative flex-1 min-h-0">
        <Textarea
          placeholder="Enter commit message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="absolute inset-0 resize-none text-xs p-3 border-0 focus-visible:ring-0 rounded-none bg-transparent"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              handleCommit();
            }
          }}
        />
        <div className="absolute bottom-2 right-2">
          <Button
            size="sm"
            className="text-xs"
            disabled={disabled}
            onClick={handleCommit}
          >
            Commit
          </Button>
        </div>
      </div>
    </div>
  );
}

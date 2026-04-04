import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { IconChevronDown } from "@tabler/icons-react";

interface CommitBarProps {
  stagedCount: number;
  onCommit: (message: string) => void;
  onCommitAndPush: (message: string) => void;
}

export function CommitBar({
  stagedCount,
  onCommit,
  onCommitAndPush,
}: CommitBarProps) {
  const [message, setMessage] = useState("");
  const disabled = message.trim() === "" || stagedCount === 0;

  const handleCommit = () => {
    if (disabled) return;
    onCommit(message.trim());
    setMessage("");
  };

  const handleCommitAndPush = () => {
    if (disabled) return;
    onCommitAndPush(message.trim());
    setMessage("");
  };

  return (
    <div className="shrink-0 border-t border-border p-2 space-y-2">
      <Textarea
        placeholder="Commit message..."
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        className="min-h-[60px] resize-none text-xs"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            handleCommit();
          }
        }}
      />
      <div className="flex items-center gap-0.5">
        <Button
          size="sm"
          className="flex-1 text-xs rounded-r-none"
          disabled={disabled}
          onClick={handleCommit}
        >
          Commit
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                size="sm"
                className="rounded-l-none px-1.5"
                disabled={disabled}
              >
                <IconChevronDown className="size-3.5" />
              </Button>
            }
          />
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={handleCommit}>
              Commit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleCommitAndPush}>
              Commit & Push
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

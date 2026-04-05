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
        <div className="absolute bottom-2 right-2 flex items-center gap-0.5">
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
    </div>
  );
}

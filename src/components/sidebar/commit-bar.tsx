import { useEffect, useRef, useState } from "react";
import { IconChevronDown } from "@tabler/icons-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";

interface CommitBarProps {
  stagedCount: number;
  onCommit: (message: string, options?: { amend?: boolean }) => void;
}

export function CommitBar({ stagedCount, onCommit }: CommitBarProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [message, setMessage] = useState("");
  const [editorOverflows, setEditorOverflows] = useState(false);
  const hasMessage = message.trim() !== "";
  const commitDisabled = !hasMessage || stagedCount === 0;
  const amendDisabled = commitDisabled;
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const updateOverflow = () => {
      setEditorOverflows(textarea.scrollHeight > textarea.clientHeight);
    };

    updateOverflow();
    const resizeObserver = new ResizeObserver(updateOverflow);
    resizeObserver.observe(textarea);
    return () => resizeObserver.disconnect();
  }, [message]);

  const handleCommit = () => {
    if (commitDisabled) return;
    onCommit(message.trim());
    setMessage("");
  };

  const handleAmend = () => {
    if (amendDisabled) return;
    onCommit(message.trim(), { amend: true });
    setMessage("");
  };

  return (
    <div className="border-t border-border">
      <div className="flex h-40 flex-col">
        <Textarea
          ref={textareaRef}
          aria-label="Commit message"
          placeholder="Enter commit message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="field-sizing-fixed min-h-0 w-full max-w-none flex-1 resize-none overflow-y-auto rounded-none border-none bg-transparent text-xs shadow-none ring-0 [-ms-overflow-style:none] [scrollbar-width:none] focus-visible:ring-0 dark:bg-transparent [&::-webkit-scrollbar]:hidden"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              handleCommit();
            }
          }}
        />
        <div
          className={
            editorOverflows
              ? "flex h-9 flex-none items-center justify-end border-t border-border px-1"
              : "flex h-9 flex-none items-center justify-end border-t border-transparent px-1"
          }
        >
          <ButtonGroup aria-label="Commit actions">
            <Button
              type="button"
              size="xs"
              disabled={commitDisabled}
              onClick={handleCommit}
            >
              Commit
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label="Open commit actions"
                disabled={amendDisabled}
                className={buttonVariants({
                  size: "icon-xs",
                  className: "px-2",
                })}
              >
                <IconChevronDown aria-hidden="true" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="top">
                <DropdownMenuItem
                  className="text-xs"
                  disabled={amendDisabled}
                  onClick={handleAmend}
                >
                  Amend
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </ButtonGroup>
        </div>
      </div>
    </div>
  );
}

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
import type { CommitOptions } from "@/lib/tauri";
import { cn } from "@/lib/utils";

interface CommitBarProps {
  stagedCount: number;
  onCommit: (message: string, options?: CommitOptions) => void;
}

export function CommitBar({ stagedCount, onCommit }: CommitBarProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [message, setMessage] = useState("");
  const [editorOverflows, setEditorOverflows] = useState(false);
  const hasMessage = message.trim() !== "";
  const commitDisabled = !hasMessage || stagedCount === 0;

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const resizeObserver = new ResizeObserver(() => {
      setEditorOverflows(textarea.scrollHeight > textarea.clientHeight);
    });
    resizeObserver.observe(textarea);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    setEditorOverflows(textarea.scrollHeight > textarea.clientHeight);
  }, [message]);

  const submit = (amend?: boolean) => {
    if (commitDisabled) return;
    onCommit(message.trim(), amend ? { amend: true } : undefined);
    setMessage("");
  };

  return (
    <div className="flex h-40 flex-col border-t border-border">
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
            submit();
          }
        }}
      />
      <div
        className={cn(
          "flex h-9 flex-none items-center justify-end border-t px-1",
          editorOverflows ? "border-border" : "border-transparent",
        )}
      >
        <ButtonGroup aria-label="Commit actions">
          <Button
            type="button"
            size="xs"
            disabled={commitDisabled}
            onClick={() => submit()}
          >
            Commit
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="Open commit actions"
              disabled={commitDisabled}
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
                disabled={commitDisabled}
                onClick={() => submit(true)}
              >
                Amend
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </ButtonGroup>
      </div>
    </div>
  );
}

import { useCallback, useState, type JSX } from "react";
import { IconCheck, IconCopy } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { CommitAvatar } from "@/components/sidebar/commit-avatar";
import { cn } from "@/lib/utils";
import type { CommitDetails } from "@/lib/tauri";

interface CommitDetailHeaderProps {
  details: CommitDetails | "pending" | undefined;
  oid: string;
}

interface CommitDetailMessageProps {
  details: CommitDetails | "pending" | undefined;
}

const DATE_FMT = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
});

export function CommitDetailHeader(
  props: CommitDetailHeaderProps,
): JSX.Element {
  const { details, oid } = props;
  const shortSha = oid.slice(0, 7);

  const [copied, setCopied] = useState(false);
  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(oid);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }, [oid]);

  const hasDetails = details !== "pending" && details !== undefined;

  if (!hasDetails) {
    return (
      <div className="flex items-start gap-3 px-4 py-3">
        <div className="size-10 shrink-0 rounded-full bg-muted animate-pulse" />
        <div className="min-w-0 flex-1 flex flex-col gap-1.5">
          <div className="h-3.5 w-32 rounded bg-muted animate-pulse" />
          <div className="h-3 w-48 rounded bg-muted animate-pulse" />
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <span className="font-mono text-xs px-2 py-1 rounded-md bg-muted text-muted-foreground">
            {shortSha}
          </span>
        </div>
      </div>
    );
  }

  const dateString = DATE_FMT.format(new Date(details.author_timestamp * 1000));

  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <CommitAvatar
        email={details.author_email}
        name={details.author_name}
        size={40}
      />
      <div className="min-w-0 flex-1 flex flex-col gap-0.5">
        <p className="truncate text-sm font-semibold text-foreground">
          {details.author_name}
        </p>
        <p className="truncate text-xs text-muted-foreground flex items-center gap-1.5">
          <span>{dateString}</span>
          <span className="opacity-50">•</span>
          <span className="truncate">{details.author_email}</span>
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={copy}
          className={cn(
            "font-mono text-xs px-2 py-1 rounded-md bg-muted text-muted-foreground",
            "hover:bg-muted/80 hover:text-foreground transition-colors",
          )}
        >
          {shortSha}
        </button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={copy}
          aria-label="Copy commit SHA"
        >
          {copied ? (
            <IconCheck className="size-3.5" />
          ) : (
            <IconCopy className="size-3.5" />
          )}
        </Button>
      </div>
    </div>
  );
}

export function CommitDetailMessage(
  props: CommitDetailMessageProps,
): JSX.Element | null {
  const { details } = props;
  const hasDetails = details !== "pending" && details !== undefined;
  if (!hasDetails) return null;
  const subject = details.subject;
  if (!subject) return null;

  return (
    <div className="px-4 py-2">
      <p
        className="truncate text-sm font-normal text-foreground"
        title={subject}
      >
        {subject}
      </p>
    </div>
  );
}

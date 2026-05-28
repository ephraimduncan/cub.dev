import { useCallback, useState, type JSX } from "react";
import { IconCheck, IconCopy } from "@tabler/icons-react";
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
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="size-8 shrink-0 rounded-full bg-muted animate-pulse" />
        <div className="min-w-0 flex-1 flex flex-col gap-1.5">
          <div className="h-3.5 w-32 rounded bg-muted animate-pulse" />
          <div className="h-3 w-48 rounded bg-muted animate-pulse" />
        </div>
        <span className="font-mono text-xs px-2 py-1 rounded-md bg-muted text-muted-foreground">
          {shortSha}
        </span>
      </div>
    );
  }

  const dateString = DATE_FMT.format(new Date(details.author_timestamp * 1000));

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <CommitAvatar
        email={details.author_email}
        name={details.author_name}
        size={32}
      />
      <div className="min-w-0 flex-1 flex flex-col gap-0.5">
        <p className="truncate text-sm font-semibold text-foreground leading-tight">
          {details.author_name}
        </p>
        <p className="truncate text-xs text-muted-foreground flex items-center gap-1.5 leading-tight">
          <span className="shrink-0">{dateString}</span>
          <span className="opacity-50">•</span>
          <span className="truncate">{details.author_email}</span>
        </p>
      </div>
      <button
        type="button"
        onClick={copy}
        className={cn(
          "group flex shrink-0 items-center gap-1.5 rounded-md bg-muted px-2 py-1",
          "font-mono text-xs text-muted-foreground",
          "transition-colors hover:bg-muted/80 hover:text-foreground",
        )}
      >
        <span>{shortSha}</span>
        {copied ? (
          <IconCheck className="size-3 text-emerald-500" />
        ) : (
          <IconCopy className="size-3 opacity-50 transition-opacity group-hover:opacity-100" />
        )}
      </button>
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

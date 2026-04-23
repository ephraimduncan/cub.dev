import { useEffect, useRef, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  cancelClone,
  cleanupPath,
  cloneRepo,
  type CloneProgress,
} from "@/lib/tauri";

interface CloneDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCloned: (path: string) => void | Promise<void>;
}

function repoNameFromUrl(url: string): string {
  const trimmed = url.trim().replace(/\.git$/i, "");
  const parts = trimmed.split(/[\\/:]+/).filter(Boolean);
  return parts[parts.length - 1] || "repo";
}

function joinPath(parent: string, name: string): string {
  const sep = parent.includes("\\") && !parent.includes("/") ? "\\" : "/";
  const cleaned = parent.replace(/[\\/]+$/, "");
  return `${cleaned}${sep}${name}`;
}

export function CloneDialog({ open, onOpenChange, onCloned }: CloneDialogProps) {
  const [url, setUrl] = useState("");
  const [destination, setDestination] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<CloneProgress | null>(null);
  const [cancelRequested, setCancelRequested] = useState(false);
  const activeIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open) {
      setUrl("");
      setDestination("");
      setBusy(false);
      setProgress(null);
      setCancelRequested(false);
      activeIdRef.current = null;
    }
  }, [open]);

  const handleBrowse = async () => {
    try {
      const selected = await openDialog({
        directory: true,
        multiple: false,
      });
      if (typeof selected === "string") setDestination(selected);
    } catch (e) {
      toast.error(`Browse failed: ${e}`);
    }
  };

  const handleSubmit = async () => {
    if (!url.trim() || !destination.trim() || busy) return;
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `clone-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const finalDest = joinPath(destination.trim(), repoNameFromUrl(url));

    activeIdRef.current = id;
    setBusy(true);
    setProgress(null);
    setCancelRequested(false);

    let unlisten: UnlistenFn | null = null;
    try {
      unlisten = await listen<CloneProgress>("clone:progress", (event) => {
        if (event.payload.id === id) setProgress(event.payload);
      });
      await cloneRepo({ url: url.trim(), dest: finalDest, id });
      toast.success(`Cloned ${repoNameFromUrl(url)}`);
      onOpenChange(false);
      await onCloned(finalDest);
    } catch (e) {
      const msg = String(e);
      if (cancelRequested || msg.includes("cancelled")) {
        try {
          await cleanupPath(finalDest);
        } catch {
          // ignore
        }
        toast.info("Clone cancelled");
      } else {
        toast.error(`Clone failed: ${msg}`);
      }
    } finally {
      unlisten?.();
      setBusy(false);
      setProgress(null);
      activeIdRef.current = null;
    }
  };

  const handleCancel = async () => {
    if (!busy) {
      onOpenChange(false);
      return;
    }
    const id = activeIdRef.current;
    if (!id) return;
    setCancelRequested(true);
    try {
      await cancelClone(id);
    } catch (e) {
      toast.error(`Cancel failed: ${e}`);
    }
  };

  const pct = (() => {
    if (!progress) return 0;
    if (progress.phase === "fetch") {
      if (progress.total_objects === 0) return 0;
      return Math.round(
        (progress.received_objects / progress.total_objects) * 100,
      );
    }
    if (progress.checkout_total === 0) return 0;
    return Math.round(
      (progress.checkout_current / progress.checkout_total) * 100,
    );
  })();

  const progressLabel = (() => {
    if (!progress) return busy ? "Starting…" : "";
    if (progress.phase === "fetch") {
      return `Fetching ${progress.received_objects}/${progress.total_objects} objects (${pct}%)`;
    }
    return `Checking out ${progress.checkout_current}/${progress.checkout_total} files (${pct}%)`;
  })();

  const canSubmit = !!url.trim() && !!destination.trim() && !busy;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (busy && !o) return;
        onOpenChange(o);
      }}
    >
      <DialogContent showCloseButton={!busy}>
        <DialogHeader>
          <DialogTitle>Clone from Remote</DialogTitle>
          <DialogDescription>
            Clone a git repository into a local folder.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Repository URL
            <Input
              placeholder="https://github.com/owner/repo.git"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={busy}
            />
          </label>

          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Destination folder
            <div className="flex gap-2">
              <Input
                placeholder="/Users/you/projects"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                disabled={busy}
              />
              <Button
                variant="outline"
                onClick={handleBrowse}
                disabled={busy}
              >
                Browse
              </Button>
            </div>
          </label>

          {busy && (
            <div className="flex flex-col gap-1 pt-1">
              <Progress value={pct} />
              <span className="text-xs text-muted-foreground">
                {cancelRequested ? "Cancelling…" : progressLabel}
              </span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            {busy ? "Stop" : "Cancel"}
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {busy ? "Cloning…" : "Clone"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

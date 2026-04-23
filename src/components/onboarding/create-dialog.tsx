import { useEffect, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
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
import { initRepo } from "@/lib/tauri";

interface CreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (path: string) => void | Promise<void>;
}

function joinPath(parent: string, name: string): string {
  const sep = parent.includes("\\") && !parent.includes("/") ? "\\" : "/";
  const cleaned = parent.replace(/[\\/]+$/, "");
  return `${cleaned}${sep}${name}`;
}

export function CreateDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateDialogProps) {
  const [name, setName] = useState("");
  const [parent, setParent] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setName("");
      setParent("");
      setBusy(false);
    }
  }, [open]);

  const handleBrowse = async () => {
    try {
      const selected = await openDialog({
        directory: true,
        multiple: false,
      });
      if (typeof selected === "string") setParent(selected);
    } catch (e) {
      toast.error(`Browse failed: ${e}`);
    }
  };

  const handleSubmit = async () => {
    if (!name.trim() || !parent.trim() || busy) return;
    const fullPath = joinPath(parent.trim(), name.trim());
    setBusy(true);
    try {
      const workdir = await initRepo(fullPath);
      onOpenChange(false);
      await onCreated(workdir);
    } catch (e) {
      toast.error(`Create failed: ${e}`);
    } finally {
      setBusy(false);
    }
  };

  const canSubmit = !!name.trim() && !!parent.trim() && !busy;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Repository</DialogTitle>
          <DialogDescription>
            Initialize a new git repository in a folder.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Repository name
            <Input
              placeholder="my-repo"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={busy}
            />
          </label>

          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Parent folder
            <div className="flex gap-2">
              <Input
                placeholder="/Users/you/projects"
                value={parent}
                onChange={(e) => setParent(e.target.value)}
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
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {busy ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

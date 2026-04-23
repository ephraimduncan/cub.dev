import { useCallback, useRef, useState } from "react";
import {
  openRepo,
  getRepoStatus,
  type FileEntry,
  type RepoStatus,
} from "@/lib/tauri";
import { perfLog, perfTimedAsync } from "@/lib/perf";

interface MergedRepoStatus {
  staged: FileEntry[];
  unstaged: FileEntry[];
}

interface UseRepoStatusReturn {
  workdir: string | null;
  status: MergedRepoStatus | null;
  error: string | null;
  refresh: () => Promise<void>;
  open: (path: string) => Promise<void>;
  close: () => void;
}

function mergeStatus(raw: RepoStatus): MergedRepoStatus {
  const unstaged: FileEntry[] = [
    ...raw.unstaged,
    ...raw.untracked.map(
      (path): FileEntry => ({
        path,
        kind: "added",
        additions: 0,
        deletions: 0,
      }),
    ),
  ];
  return { staged: raw.staged, unstaged };
}

function statusFingerprint(s: MergedRepoStatus): string {
  const entries = (files: FileEntry[]) =>
    files
      .map((f) => `${f.path}:${f.kind}:${f.additions}:${f.deletions}`)
      .join(",");
  return `${entries(s.staged)}|${entries(s.unstaged)}`;
}

export function useRepoStatus(): UseRepoStatusReturn {
  const [workdir, setWorkdir] = useState<string | null>(null);
  const [status, setStatus] = useState<MergedRepoStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fingerprintRef = useRef("");
  const refreshInflightRef = useRef(0);

  const applyStatus = useCallback((merged: MergedRepoStatus) => {
    const fp = statusFingerprint(merged);
    const totalFiles = merged.staged.length + merged.unstaged.length;
    if (fp === fingerprintRef.current) {
      perfLog("useRepoStatus", "applyStatus:skip", {
        reason: "fingerprint-match",
        totalFiles,
      });
      return;
    }
    fingerprintRef.current = fp;
    perfLog("useRepoStatus", "applyStatus:set", {
      staged: merged.staged.length,
      unstaged: merged.unstaged.length,
      totalFiles,
    });
    setStatus(merged);
  }, []);

  const refresh = useCallback(async () => {
    refreshInflightRef.current += 1;
    const inflight = refreshInflightRef.current;
    if (inflight > 1) {
      perfLog("useRepoStatus", "refresh:overlap", { inflight });
    }
    try {
      setError(null);
      const raw = await perfTimedAsync(
        "useRepoStatus",
        "refresh:getRepoStatus",
        () => getRepoStatus(),
      );
      perfLog("useRepoStatus", "refresh:raw", {
        staged: raw.staged.length,
        unstaged: raw.unstaged.length,
        untracked: raw.untracked.length,
      });
      applyStatus(mergeStatus(raw));
    } catch (e) {
      setError(String(e));
    } finally {
      refreshInflightRef.current -= 1;
    }
  }, [applyStatus]);

  const open = useCallback(
    async (path: string) => {
      setError(null);
      const dir = await perfTimedAsync(
        "useRepoStatus",
        "open:openRepo",
        () => openRepo(path),
        { path },
      );
      const raw = await perfTimedAsync(
        "useRepoStatus",
        "open:getRepoStatus",
        () => getRepoStatus(),
      );
      perfLog("useRepoStatus", "open:raw", {
        staged: raw.staged.length,
        unstaged: raw.unstaged.length,
        untracked: raw.untracked.length,
      });
      fingerprintRef.current = "";
      applyStatus(mergeStatus(raw));
      setWorkdir(dir);
    },
    [applyStatus],
  );

  const close = useCallback(() => {
    setWorkdir(null);
    setStatus(null);
    setError(null);
    fingerprintRef.current = "";
  }, []);

  return { workdir, status, error, refresh, open, close };
}

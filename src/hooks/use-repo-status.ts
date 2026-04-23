import { useCallback, useRef, useState } from "react";
import {
  openRepo,
  getRepoStatus,
  type FileEntry,
  type RepoStatus,
} from "@/lib/tauri";

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

  const applyStatus = useCallback((merged: MergedRepoStatus) => {
    const fp = statusFingerprint(merged);
    if (fp === fingerprintRef.current) return;
    fingerprintRef.current = fp;
    setStatus(merged);
  }, []);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const raw = await getRepoStatus();
      applyStatus(mergeStatus(raw));
    } catch (e) {
      setError(String(e));
    }
  }, [applyStatus]);

  const open = useCallback(
    async (path: string) => {
      setError(null);
      const dir = await openRepo(path);
      const raw = await getRepoStatus();
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

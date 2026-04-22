import { useEffect, useMemo, useRef, useState } from "react";
import {
  getFileContents,
  type FileContentsResponse,
  type FileEntry,
} from "@/lib/tauri";

type TextFileDiffContents = {
  kind: "text";
  oldFile: { name: string; contents: string };
  newFile: { name: string; contents: string };
};

type BinaryFileDiffContents = {
  kind: "binary";
  oldBinary: boolean;
  newBinary: boolean;
};

export type FileDiffContents = TextFileDiffContents | BinaryFileDiffContents;

interface UseDiffsReturn {
  diffs: Map<string, FileDiffContents>;
  loading: boolean;
}

export function useDiffs(
  staged: FileEntry[] | undefined,
  unstaged: FileEntry[] | undefined,
): UseDiffsReturn {
  const [diffs, setDiffs] = useState<Map<string, FileDiffContents>>(new Map());
  const [loading, setLoading] = useState(false);
  const diffsRef = useRef(diffs);
  diffsRef.current = diffs;

  const pathsKey = useMemo(() => {
    if (!staged || !unstaged) return null;
    const set = new Set<string>();
    for (const f of staged) set.add(f.path);
    for (const f of unstaged) set.add(f.path);
    return Array.from(set).sort().join("\0");
  }, [staged, unstaged]);

  useEffect(() => {
    if (pathsKey == null) return;

    if (pathsKey === "") {
      if (diffsRef.current.size > 0) setDiffs(new Map());
      setLoading(false);
      return;
    }

    const paths = pathsKey.split("\0");
    const pathSet = new Set(paths);
    const current = diffsRef.current;
    const missing = paths.filter((p) => !current.has(p));

    // Prune entries for paths no longer present.
    let needsPrune = current.size !== paths.length;
    if (!needsPrune) {
      for (const p of current.keys()) {
        if (!pathSet.has(p)) {
          needsPrune = true;
          break;
        }
      }
    }
    if (needsPrune) {
      const pruned = new Map<string, FileDiffContents>();
      for (const [p, v] of current) {
        if (pathSet.has(p)) pruned.set(p, v);
      }
      setDiffs(pruned);
    }

    if (missing.length === 0) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    setLoading(true);

    void Promise.allSettled(
      missing.map(async (path) => {
        const resp = await getFileContents(path);
        return [path, resp] as const;
      }),
    )
      .then((results) => {
        if (cancelled) return;
        setDiffs((prev) => {
          const next = new Map(prev);
          for (const result of results) {
            if (result.status === "fulfilled") {
              const [path, resp] = result.value;
              next.set(path, toFileDiffContents(resp));
            } else {
              console.warn("[cub] failed to fetch diff:", result.reason);
            }
          }
          return next;
        });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [pathsKey]);

  return { diffs, loading };
}

function toFileDiffContents(resp: FileContentsResponse): FileDiffContents {
  if (resp.old_binary || resp.new_binary) {
    return {
      kind: "binary",
      oldBinary: resp.old_binary,
      newBinary: resp.new_binary,
    };
  }

  return {
    kind: "text",
    oldFile: { name: resp.name, contents: resp.old_content ?? "" },
    newFile: { name: resp.name, contents: resp.new_content ?? "" },
  };
}

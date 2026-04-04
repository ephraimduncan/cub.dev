import { useEffect, useRef, useState } from "react";
import { getFileDiff, type FileEntry } from "@/lib/tauri";

interface UseDiffsReturn {
  diffs: Map<string, string>;
  loading: boolean;
}

function getUniquePaths(
  staged: FileEntry[],
  unstaged: FileEntry[],
): string[] {
  const paths = new Set<string>();
  for (const f of staged) paths.add(f.path);
  for (const f of unstaged) paths.add(f.path);
  return Array.from(paths);
}

function pathsKey(staged: FileEntry[], unstaged: FileEntry[]): string {
  const paths = getUniquePaths(staged, unstaged);
  return paths.sort().join("\0");
}

export function useDiffs(
  staged: FileEntry[] | undefined,
  unstaged: FileEntry[] | undefined,
): UseDiffsReturn {
  const [diffs, setDiffs] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(false);
  const prevKeyRef = useRef("");

  useEffect(() => {
    if (!staged || !unstaged) return;

    const key = pathsKey(staged, unstaged);
    if (key === prevKeyRef.current) return;
    prevKeyRef.current = key;

    const paths = getUniquePaths(staged, unstaged);
    if (paths.length === 0) {
      setDiffs(new Map());
      return;
    }

    setLoading(true);

    Promise.allSettled(
      paths.map(async (path) => {
        const patch = await getFileDiff(path);
        return [path, patch] as const;
      }),
    ).then((results) => {
      const map = new Map<string, string>();
      for (const result of results) {
        if (result.status === "fulfilled") {
          map.set(result.value[0], result.value[1]);
        }
      }
      setDiffs(map);
      setLoading(false);
    });
  }, [staged, unstaged]);

  return { diffs, loading };
}

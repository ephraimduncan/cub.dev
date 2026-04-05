import { useEffect, useState } from "react";
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

function getUniquePaths(
  staged: FileEntry[],
  unstaged: FileEntry[],
): string[] {
  const paths = new Set<string>();
  for (const f of staged) paths.add(f.path);
  for (const f of unstaged) paths.add(f.path);
  return Array.from(paths);
}

export function useDiffs(
  staged: FileEntry[] | undefined,
  unstaged: FileEntry[] | undefined,
): UseDiffsReturn {
  const [diffs, setDiffs] = useState<Map<string, FileDiffContents>>(new Map());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!staged || !unstaged) return;

    const paths = getUniquePaths(staged, unstaged);
    if (paths.length === 0) {
      setDiffs(new Map());
      setLoading(false);
      return;
    }

    let cancelled = false;

    setLoading(true);

    void Promise.allSettled(
      paths.map(async (path) => {
        const resp = await getFileContents(path);
        return [path, resp] as const;
      }),
    )
      .then((results) => {
        if (cancelled) return;

        const map = new Map<string, FileDiffContents>();
        for (const result of results) {
          if (result.status === "fulfilled") {
            const [path, resp] = result.value;
            map.set(path, toFileDiffContents(resp));
          }
        }
        setDiffs(map);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [staged, unstaged]);

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
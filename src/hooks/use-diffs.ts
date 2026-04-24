import { useEffect, useMemo, useRef, useState } from "react";
import {
  getFileContentsBatch,
  type FileContentsRequest,
  type FileContentsResponse,
  type FileEntry,
} from "@/lib/tauri";
import { perfLog } from "@/lib/perf";

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
  const diffSidesRef = useRef(new Map<string, boolean>());

  const requestsKey = useMemo(() => {
    if (!staged || !unstaged) return null;
    const requests = new Map<string, boolean>();
    for (const f of staged) requests.set(f.path, true);
    for (const f of unstaged) {
      if (!requests.has(f.path)) requests.set(f.path, false);
    }
    return Array.from(requests.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([path, isStaged]) => `${isStaged ? "1" : "0"}${path}`)
      .join("\0");
  }, [staged, unstaged]);

  useEffect(() => {
    if (requestsKey == null) return;

    if (requestsKey === "") {
      if (diffsRef.current.size > 0) setDiffs(new Map());
      diffSidesRef.current.clear();
      setLoading(false);
      return;
    }

    const requests: FileContentsRequest[] = requestsKey
      .split("\0")
      .map((entry) => ({
        staged: entry[0] === "1",
        path: entry.slice(1),
      }));
    const paths = requests.map((request) => request.path);
    const pathSet = new Set(paths);
    const current = diffsRef.current;
    const currentSides = diffSidesRef.current;
    const missing = requests.filter(
      (request) =>
        !current.has(request.path) ||
        currentSides.get(request.path) !== request.staged,
    );

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
      for (const p of currentSides.keys()) {
        if (!pathSet.has(p)) currentSides.delete(p);
      }
      setDiffs(pruned);
    }

    perfLog("useDiffs", "effect:run", {
      totalPaths: paths.length,
      cached: paths.length - missing.length,
      missing: missing.length,
      pruned: needsPrune,
    });

    if (missing.length === 0) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    setLoading(true);
    const batchStart = performance.now();
    let okCount = 0;
    let errCount = 0;
    const requestedSides = new Map(
      missing.map((request) => [request.path, request.staged]),
    );

    void getFileContentsBatch(missing)
      .then((results) => {
        if (cancelled) return;
        setDiffs((prev) => {
          const next = new Map(prev);
          for (const result of results) {
            if (result.response) {
              okCount += 1;
              next.set(result.path, toFileDiffContents(result.response));
              currentSides.set(
                result.path,
                requestedSides.get(result.path) ?? false,
              );
            } else {
              errCount += 1;
              console.warn(
                "[cub] failed to fetch diff:",
                result.error ?? result.path,
              );
              next.delete(result.path);
              currentSides.delete(result.path);
            }
          }
          return next;
        });
      })
      .catch((err) => {
        if (cancelled) return;
        errCount = missing.length;
        console.warn("[cub] failed to fetch diff batch:", err);
        setDiffs((prev) => {
          const next = new Map(prev);
          for (const request of missing) {
            next.delete(request.path);
            currentSides.delete(request.path);
          }
          return next;
        });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
        const totalMs = +(performance.now() - batchStart).toFixed(2);
        perfLog("useDiffs", "getFileContents:batchDone", {
          requested: missing.length,
          ok: okCount,
          errors: errCount,
          totalMs,
          cancelled,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [requestsKey]);

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

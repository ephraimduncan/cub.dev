import { useEffect, useState } from "react";
import { getRepoBranch } from "@/lib/tauri";

export function useRecentBranches(paths: string[]) {
  const [branchByPath, setBranchByPath] = useState<
    Record<string, string | null | undefined>
  >({});

  useEffect(() => {
    let cancelled = false;
    const missing = paths.filter((p) => !(p in branchByPath));
    if (missing.length === 0) return;

    (async () => {
      const entries = await Promise.all(
        missing.map(async (path) => {
          try {
            const branch = await getRepoBranch(path);
            return [path, branch] as const;
          } catch {
            return [path, null] as const;
          }
        }),
      );
      if (cancelled) return;
      setBranchByPath((prev) => {
        const next = { ...prev };
        for (const [p, b] of entries) next[p] = b;
        return next;
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [paths, branchByPath]);

  return branchByPath;
}

import { useEffect, useRef } from "react";

export function useFileWatcher(onFilesChanged: () => void, intervalMs = 3000) {
  const callbackRef = useRef(onFilesChanged);
  callbackRef.current = onFilesChanged;

  useEffect(() => {
    const id = setInterval(() => {
      callbackRef.current();
    }, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
}

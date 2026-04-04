import { useEffect, useState } from "react";
import { openRepo, getRepoStatus, getFileDiff } from "./lib/tauri";
import type { RepoStatus } from "./lib/tauri";
import "./App.css";

function App() {
  const [workdir, setWorkdir] = useState<string | null>(null);
  const [status, setStatus] = useState<RepoStatus | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [diff, setDiff] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Open the repo that contains the Tauri process working directory
  useEffect(() => {
    openRepo(".")
      .then((dir) => {
        setWorkdir(dir);
        return getRepoStatus();
      })
      .then(setStatus)
      .catch((e) => setError(String(e)));
  }, []);

  // Fetch diff when a file is selected
  useEffect(() => {
    if (!selectedFile) {
      setDiff(null);
      return;
    }
    getFileDiff(selectedFile)
      .then(setDiff)
      .catch((e) => setDiff(`Error: ${e}`));
  }, [selectedFile]);

  if (error) {
    return (
      <main className="p-4">
        <p className="text-destructive">{error}</p>
      </main>
    );
  }

  if (!status) {
    return (
      <main className="flex h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading…</p>
      </main>
    );
  }

  const hasChanges =
    status.staged.length > 0 ||
    status.unstaged.length > 0 ||
    status.untracked.length > 0;

  return (
    <main className="flex h-screen text-sm">
      {/* File tree */}
      <aside className="w-64 shrink-0 overflow-y-auto border-r border-border p-3">
        <h2 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {workdir ?? "Repository"}
        </h2>

        {!hasChanges && (
          <p className="mt-4 text-muted-foreground">No changes</p>
        )}

        <FileGroup
          label="Staged"
          files={status.staged.map((f) => f.path)}
          selected={selectedFile}
          onSelect={setSelectedFile}
        />
        <FileGroup
          label="Changed"
          files={status.unstaged.map((f) => f.path)}
          selected={selectedFile}
          onSelect={setSelectedFile}
        />
        <FileGroup
          label="Untracked"
          files={status.untracked}
          selected={selectedFile}
          onSelect={setSelectedFile}
        />
      </aside>

      {/* Diff panel */}
      <section className="flex-1 overflow-auto p-4">
        {selectedFile ? (
          <>
            <h3 className="mb-2 font-mono text-xs text-muted-foreground">
              {selectedFile}
            </h3>
            <pre className="whitespace-pre-wrap rounded-lg border border-border bg-card p-4 font-mono text-xs leading-relaxed">
              {diff ?? "Loading diff…"}
            </pre>
          </>
        ) : (
          <p className="mt-20 text-center text-muted-foreground">
            Select a file to view its diff
          </p>
        )}
      </section>
    </main>
  );
}

function FileGroup({
  label,
  files,
  selected,
  onSelect,
}: {
  label: string;
  files: string[];
  selected: string | null;
  onSelect: (path: string) => void;
}) {
  if (files.length === 0) return null;

  return (
    <div className="mt-3">
      <p className="mb-1 text-xs font-medium text-muted-foreground">{label}</p>
      <ul>
        {files.map((path) => (
          <li key={path}>
            <button
              type="button"
              onClick={() => onSelect(path)}
              className={`w-full truncate rounded px-2 py-0.5 text-left font-mono text-xs ${
                selected === path
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-muted"
              }`}
            >
              {path}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default App;

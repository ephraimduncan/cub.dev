# Branch Diff — Plan

Add a "View Branch Diff" mode to cub that mirrors Zed's empty-state CTA. When the working tree is clean, surface a button that opens a view of every change the current branch contains relative to the repo's base branch.

## Resolved decisions

| # | Decision | Resolution |
|---|---|---|
| 1 | Diff semantic | `git diff base...HEAD` (three-dot, merge-base). Same as GitHub PR "Files changed". |
| 2 | Base ref detection | `origin/HEAD` symbolic target → fallback `main` → `master` → `trunk` (local, then `origin/<name>`). |
| 3 | CTA placement | Empty-state centered only. No persistent toolbar / status-bar entry. |
| 4 | CTA visibility | Always shown when zero working changes. No guards. Failures surface as toast / empty-pane message. |
| 5 | Click failure modes | Base missing → `toast.error`. Diff empty → right-pane message "Branch is up to date with `<base>`". |
| 6 | Fetch | None in v1. Use whatever local `origin/*` points at. |
| 7 | Sidebar shape | Single section `Branch changes — N files`. Header subtitle `<branch> vs <base>`. `CommitBar` hidden. Context menu: only `Reveal in Finder` + `Copy path` (no Stage / Discard). |
| 8 | Right-pane header | New header bar: `← Back to changes`, label `<branch> vs <base>`, `+adds −dels` totals. Replaces nothing — sits above existing `DiffToolbar`. |
| 9 | Exit | Explicit Back button. No auto-exit. |
| 10 | Working changes appearing mid-session | Stay in branch-diff. Banner in right-pane: `You have N new changes — back to changes`. |
| 11 | Branch switch mid-session | Auto-recompute: new branch vs detected base, header updates, view stays open. |
| 12 | Comments | Full support. Shared model with working-tree review — same `useComments`, same `submit_review`. Agent edits working tree, user commits. |
| 13 | Default expand state | All files expanded (match working-tree default). |
| 14 | File ordering | Tree-sorted via existing `@pierre/trees` FileTree (alphabetic by path). |

## Backend

New types and commands in `src-tauri/src/git.rs`:

```rust
pub struct BranchDiff {
    pub base_ref: String,    // e.g. "origin/main"
    pub base_oid: String,    // merge-base oid (hex)
    pub head_oid: String,    // current HEAD oid
    pub files: Vec<FileEntry>,
}

#[tauri::command]
pub fn get_branch_diff(state) -> Result<Option<BranchDiff>, String>;
// Ok(None) when no base can be resolved.

#[tauri::command]
pub fn get_branch_file_contents_batch(
    base_oid: String,
    head_oid: String,
    requests: Vec<String>,  // paths only — both sides come from tree blobs
    state,
) -> Result<Vec<FileContentsBatchItem>, String>;
```

Detection (`resolve_base_ref(repo) -> Option<(String, Oid)>`):
1. `repo.find_reference("refs/remotes/origin/HEAD")` → if symbolic, resolve target.
2. Else try in order: `origin/main`, `origin/master`, `origin/trunk`, `main`, `master`, `trunk`. First that resolves wins.
3. Returns `(short_name, target_oid)`. `short_name` is what we display in headers.

Diff computation: `repo.merge_base(head_oid, base_oid)` → use as `base_oid` going forward. Then `repo.diff_tree_to_tree(base_tree, head_tree, ...)` for the file list. Stats: extend `CountDiffKind` with `TwoTrees(base_tree_oid, head_tree_oid)`; reuse `count_diff_lines_parallel`.

File contents: mirror `get_file_contents_batch` but both sides come from tree blobs (`read_tree_file`). Drop the workdir / index paths entirely. Reuse `decode_file_side` for binary detection.

`refs/remotes/origin/HEAD` is set by `git clone` but not by manual remote-add. Fallback chain matters.

## Frontend

State (App.tsx):
```ts
const [branchDiffActive, setBranchDiffActive] = useState(false);
const branchDiff = useBranchDiff(branchDiffActive);  // { meta, files, diffs, loading, error }
```

New hook `src/hooks/use-branch-diff.ts` mirrors `useDiffs`:
- When inactive: returns empty state, never hits backend.
- When active: calls `get_branch_diff` for the file list, then `get_branch_file_contents_batch` for contents (same batched + cancellable pattern as `useDiffs`).
- Recomputes on `workdir` change, on `repo:changed` events (catches commits + branch switches), and on activation.

Wiring in `App.tsx`:
- New state: `const [branchDiffActive, setBranchDiffActive] = useState(false)`.
- Existing `<Sidebar>` becomes a discriminated union over `mode`. When `branchDiffActive`, mount with `{ mode: "branch", workdir, branchFiles, baseRef, headBranch, selectedFile, onSelectFile, onCloseRepo }`. Otherwise mount the existing `mode: "working"` variant with today's props. TypeScript enforces the right props per variant — no optional callbacks, no runtime gates.
- `<DiffPanel>` stays mode-agnostic. New prop: `branchDiffHeader?: ReactNode`. Parent renders the header bar (Back · title · stats · optional banner) and passes it in; `DiffPanel` slots it above the existing `DiffToolbar` row.
- The empty-state CTA in `<Sidebar mode="working">` (existing `"No changes"` path) renders a `View Branch Diff` button when both `staged` and `unstaged` are empty. Click → `setBranchDiffActive(true)`.
- Files/diffs feeding `<DiffPanel>` are swapped at the App level: `files` ← `branchDiff.files`, `diffs` ← `branchDiff.diffs`, `loading` ← `branchDiff.loading`.

Right-pane header (new component, `src/components/diff-panel/branch-diff-header.tsx`):
- 40px row above `DiffToolbar`. `DiffToolbar` itself is untouched and works in both modes.
- Left: `← Back to changes` button → `setBranchDiffActive(false)`. Title: `Changes since <baseRef>`.
- Right: `+N −M` totals summed from `branchDiff.files`.
- Banner row (conditional, appended when working changes appear mid-session): `N working change(s) waiting · ← Back to changes`. Adds a second 40px row only while the banner is visible.

Sidebar (branch-mode rendering):
- Header: workdir name + back-to-onboarding arrow (same as working mode). Subtitle row: `Since <baseRef>`.
- One section labeled `Branch changes — N files`. No section action button.
- No `CommitBar`. No per-row stage toggle. Context menu: `Reveal in Finder`, `Copy path` only.

## Docs

Two ADRs warranted (hard to reverse, surprising without context, real trade-off):
- `docs/adr/0001-three-dot-branch-diff.md` — why three-dot over two-dot.
- `docs/adr/0002-base-ref-detection.md` — `origin/HEAD` with local fallback chain.

`docs/CONTEXT.md` glossary entries: `branch diff`, `base ref`, `branch review`.

## Verification

- `bunx tsc --noEmit` + `bunx vite build` (ignore 2 pre-existing TS errors).
- `cargo check` for backend.
- Manual: open repo on a feature branch with no changes → click CTA → confirm files appear, diffs render, Back returns. Switch branches via status bar while open → confirm recompute. Make a working change → confirm banner. Click CTA on `main` → confirm empty-pane message.

## Wording (Set A — "since" framing)

| Where | Text |
|---|---|
| CTA button (empty state) | `View Branch Diff` |
| Right-pane header title | `Changes since origin/main` |
| Right-pane stats | `+544 −5` |
| Empty-pane message | `No changes since origin/main` |
| Banner (working changes mid-session) | `N working change(s) waiting · ← Back to changes` |
| Sidebar section label | `Branch changes — N files` |
| Sidebar subtitle | `Since origin/main` |
| Back button label | `Back to changes` |
| Toast on missing base | `No base branch found (tried origin/HEAD, main, master, trunk)` |

## Unresolved

None. Plan is fully resolved.

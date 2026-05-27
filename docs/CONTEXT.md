# cub — Context & Glossary

Project-specific terminology and conventions. Update when introducing new domain concepts.

## Glossary

### branch diff

The set of changes the current branch contributes relative to its base branch. Computed as a three-dot diff (`base...HEAD`) — that is, the diff between the merge-base of HEAD and base, and HEAD itself. Mirrors GitHub PR "Files changed". See [ADR 0001](./adr/0001-three-dot-branch-diff.md).

### base ref

The branch we compare against when computing a branch diff. Auto-detected via `refs/remotes/origin/HEAD` symbolic, falling back to `origin/main`, `origin/master`, `origin/trunk`, then local `main`, `master`, `trunk`. See [ADR 0002](./adr/0002-base-ref-detection.md).

### branch review

UI mode in cub where the right pane shows the branch diff and the sidebar lists every file changed since the base ref. Entered via the empty-state CTA ("View Branch Diff") and exited via the back button. Comments work the same as in working-tree review — same `useComments`, same `submit_review`.

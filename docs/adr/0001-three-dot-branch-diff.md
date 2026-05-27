# ADR 0001 — Three-dot semantics for branch diff

**Status:** Accepted
**Date:** 2026-05-27

## Context

The new branch-diff view in cub needs to mirror what GitHub PR "Files changed" shows: the changes *this branch* contributes on top of its base, not the changes the user would see if they merged base back into their branch.

Git offers two reasonable semantics:

- **Two-dot (`base..HEAD`):** diff between the tip of `base` and the tip of `HEAD`. Includes every file that differs between the two tips, even if the difference was introduced by upstream commits on `base` that the user has not yet pulled into `HEAD`.
- **Three-dot (`base...HEAD`):** diff between `merge_base(base, HEAD)` and the tip of `HEAD`. Shows only the changes introduced on the `HEAD` side since the branches diverged.

GitHub's "Files changed" tab on a PR uses three-dot semantics. So does GitLab's MR diff, Bitbucket's PR view, and most code-review tooling users have internalized.

## Decision

Use three-dot semantics for the branch diff.

Implementation:

1. Resolve the base ref to an OID (see [ADR 0002](./0002-base-ref-detection.md)).
2. Compute `merge_base(HEAD, base)` via `git2::Repository::merge_base`.
3. Diff the merge-base tree against the HEAD tree using `Repository::diff_tree_to_tree`.
4. Report `base_oid = merge_base_oid` and `head_oid = HEAD oid` to the frontend so per-file content lookups stay deterministic across concurrent commits.

## Consequences

- "Files changed" in cub matches GitHub PR "Files changed" exactly. No surprises for reviewers cross-referencing the two views.
- Upstream commits the user has not incorporated are hidden. The view is about what *this branch* contributes, not "what does my workdir look like vs. their tip".
- Equivalent to `git diff base...HEAD` on the CLI.
- Stats (additions / deletions per file) reuse the existing parallel line counter in `git.rs` via a new variant: `CountDiffKind::TwoTrees(base_tree_oid, head_tree_oid)`. No new code path for counting — same worker pool, same caching shape.

## Trade-off

Three-dot does *not* show what the user's workdir would look like after a hypothetical merge of base into the branch. If that view is wanted later, it would be a separate mode ("merge preview") and a separate command — not a config flag on this one.

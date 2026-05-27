# ADR 0002 — Base ref auto-detection

**Status:** Accepted
**Date:** 2026-05-27

## Context

The branch-diff view needs a base branch to compare against. We want it to "just work" on the common case (cloned GitHub/GitLab/Bitbucket repo, base is `main` or `master`) without asking the user to configure anything.

Repos vary:

- Most modern repos use `main`.
- Older repos use `master`.
- Some use `trunk` (notably some Apache and SVN-derived projects).
- `git clone` sets `refs/remotes/origin/HEAD` as a symbolic ref pointing at the upstream default branch. This is the authoritative answer when it exists.
- A repo created via `git init` + `git remote add` does *not* get `origin/HEAD`. The user may also have only local branches (offline repo, never pushed).

## Decision

Resolve the base ref in this order, first hit wins:

1. **`refs/remotes/origin/HEAD` symbolic target.** Resolve the symref and use whatever it points at (e.g. `refs/remotes/origin/main`). This is what `git clone` sets and what GitHub/GitLab/Bitbucket return.
2. **Remote-tracking fallback:** try `origin/main`, then `origin/master`, then `origin/trunk`. First one that exists wins.
3. **Local fallback:** try local `main`, then `master`, then `trunk`. Covers offline repos and repos without an `origin` remote.
4. **None.** Surface as a toast in the UI:
   `No base branch found (tried origin/HEAD, main, master, trunk)`.
   The backend command returns `Ok(None)` in this case; the frontend renders the toast and leaves the user on the working-tree view.

The resolved short name (e.g. `origin/main`, `master`) is returned to the frontend as `BranchDiff.base_ref` for display in the UI.

## Consequences

- Works for the overwhelmingly common case: cloned repo with a sensible default branch.
- Works for offline repos and repos where the user only has local branches.
- Silent on unusual custom layouts (e.g. base branch is `develop` or `release/next`). The user sees the toast and knows the feature isn't applicable to their repo yet.
- We do **not** fetch in v1. Whatever local `origin/*` points at is what we use. If the user's `origin/main` is stale, the diff is stale — same contract as `git diff origin/main...HEAD` on the CLI.

## Out of scope (v1)

- Per-repo override, either via git config (e.g. `cub.baseRef`) or a UI picker.
- Auto-fetch before computing the diff.
- Detecting non-`origin` remotes (e.g. `upstream/main` in a fork workflow).

These are deferred until we see real usage demanding them.

Build a simple onboarding/welcome screen for **cub**, a Tauri + React 19 + TypeScript desktop git review tool. Use the attached screenshot as structural reference only — adapt it to cub's minimal monochrome design. Do NOT copy the exact visuals, colors, or mascot.

**Stack (already in the project — reuse, don't add new libs)**
- Tauri v2, React 19, Vite, TypeScript
- Tailwind v4 with design tokens defined in `src/App.css` (`--background`, `--foreground`, `--muted-foreground`, `--border`, `--primary`, etc.)
- shadcn/ui components under `src/components/ui/*` (`Button`, `Card`, etc.)
- `@tabler/icons-react` for icons (NOT lucide)
- `sonner` for toasts, `@base-ui/react` for primitives

**Layout**
- Full-window centered content (no left rail — cub has no icon sidebar).
- Header: small wordmark **cub** as a large semibold heading (`font-heading`, tracking-tight). Optional tiny subtitle below in `text-muted-foreground text-sm`: "Open a repository to start reviewing."
- Top-right corner: a subtle `text-xs text-muted-foreground hover:text-foreground` link → `Learn more`.

**Three action cards (flex row, gap-3, equal width, max-w ~720px)**
Each card: `rounded-xl border border-border bg-card p-4 text-left` with an icon top-left (20px), label below in `text-sm font-medium`, and an optional one-line description in `text-xs text-muted-foreground`. Hover: `hover:bg-accent transition-colors`.
1. **Open Local Repository** — primary/highlighted card: `bg-primary text-primary-foreground` (monochrome, matches the app's near-black primary), icon `IconFolderOpen`. Description: "Pick a folder on disk."
2. **Clone from Remote** — default card, icon `IconCloudDownload`. Description: "Clone a git URL."
3. **Create New Repository** — default card, icon `IconFolderPlus`. Description: "Initialize a new repo."

**Recent list (below the cards, same max-width)**
- Heading: `Recent` in `text-xs uppercase tracking-wide text-muted-foreground`.
- Rows: borderless, `flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-accent cursor-pointer`.
- Each row shows: `IconGitBranch` (16px, muted) + repo folder name in `text-sm font-medium` + parent path in `text-xs text-muted-foreground truncate` + right-aligned current branch name in `text-xs font-mono text-muted-foreground`.
- No avatars, no ahead/behind badges, no colors — keep it monochrome like the rest of the app.
- Empty state: small muted text `No recent repositories yet.`

**Behavior**
- Render this screen from `src/App.tsx` whenever `useRepoStatus()` returns no `workdir` (i.e. before a repo is opened). Currently the app shows `Loading...` in that state — replace that branch with `<Onboarding />`.
- `Open Local Repository` → `@tauri-apps/plugin-dialog` `open({ directory: true })`, then invoke whatever Tauri command cub already uses to set the active workdir (check `src/lib/tauri.ts`). Refresh status on success.
- `Clone from Remote` and `Create New Repository` → for now, show a `toast.info("Coming soon")` placeholder (don't wire backend commands unless they already exist — check first).
- Recent list persists via `localStorage` under key `cub:recent-repos` (max 8, dedupe by absolute path, most-recent-first). Click a row → same open flow as local import.

**Styling rules**
- Match the existing cub aesthetic: white/neutral light theme, no accent colors, no gradients, no emojis, no decorative illustrations.
- Use tokens from `App.css` (`bg-background`, `text-foreground`, `border-border`, `bg-card`, `bg-primary`, `text-muted-foreground`) — no hard-coded hex.
- Use `Inter Variable` (already default via `font-sans`).
- Keep spacing generous but compact: content block `max-w-[720px] mx-auto px-6 pt-24`, gap-6 between sections.

**Deliverables (minimal diff)**
- `src/components/onboarding/onboarding.tsx`
- `src/hooks/use-recent-repos.ts` (tiny localStorage-backed hook)
- Edit `src/App.tsx` to render `<Onboarding />` in the no-workdir branch.

Do not add new dependencies. Do not create a router. Do not restyle existing components.

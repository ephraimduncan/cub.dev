import { useEffect, useReducer } from "react";
import { cn } from "@/lib/utils";

type AvatarStatus = "ok" | "missing";

// One URL per author shared across the whole app. Sidebar rows (14px) and the
// commit-detail header (32px) used to request `&s=28` and `&s=64` respectively,
// so clicking a commit triggered a fresh fetch+decode for the detail size even
// when the sidebar row had already loaded the same author. Picking a single
// size that's >= the largest place we render gives us one HTTP cache key per
// author; 64px is exact-match for the 32px detail avatar on retina and looks
// crisp downscaled into the 14px row.
const AVATAR_PIXEL_SIZE = 64;

const avatarCache: Map<string, AvatarStatus> = new Map();

interface CommitAvatarProps {
  email: string;
  name: string;
  size?: number;
  className?: string;
}

function firstInitial(name: string): string {
  for (const ch of name) {
    if (ch.trim().length > 0) return ch.toUpperCase();
  }
  return "?";
}

// Small deterministic hash for the initials-fallback hue. Doesn't need to be
// cryptographic — same email → same color across sessions.
function hashHue(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) - h + input.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % 360;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// Match Zed's approach: skip the special `…[bot]@users.noreply.github.com`
// pseudo-emails — the CDN doesn't have anything for those.
function isBotEmail(email: string): boolean {
  return email.endsWith("[bot]@users.noreply.github.com");
}

function avatarUrl(email: string): string {
  return `https://avatars.githubusercontent.com/u/e?email=${encodeURIComponent(email)}&s=${AVATAR_PIXEL_SIZE}`;
}

export function CommitAvatar({
  email,
  name,
  size = 24,
  className,
}: CommitAvatarProps) {
  const normalized = normalizeEmail(email);
  const skip = normalized.length === 0 || isBotEmail(normalized);
  const hue = hashHue(normalized || name);
  const bg = `hsl(${hue}, 60%, 40%)`;
  const initial = firstInitial(name);

  // Derive status from the cache during render. Reading it here (instead of
  // mirroring it into `useState`) means a parent prop change to a new email
  // resolves to that email's status in the SAME render — we never paint an
  // <img> whose URL the browser hasn't acked yet, and we never show the
  // fallback for an author whose avatar is already cached. The reducer tick
  // exists only to force a re-render when an async preload finishes.
  const [, bump] = useReducer((t: number) => t + 1, 0);
  const cached = skip ? ("missing" as const) : avatarCache.get(normalized);
  const status: AvatarStatus | "loading" = cached ?? "loading";

  useEffect(() => {
    if (skip) return;
    if (avatarCache.has(normalized)) return;
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      avatarCache.set(normalized, "ok");
      if (!cancelled) bump();
    };
    img.onerror = () => {
      avatarCache.set(normalized, "missing");
      if (!cancelled) bump();
    };
    img.src = avatarUrl(normalized);
    return () => {
      cancelled = true;
      img.onload = null;
      img.onerror = null;
    };
  }, [normalized, skip]);

  // Initial text scales with avatar size so the fallback letter stays
  // optically balanced from 14px chips up to 40px header avatars.
  const initialFontSize = Math.max(8, Math.round(size * 0.55));

  if (status === "ok") {
    return (
      <img
        src={avatarUrl(normalized)}
        width={size}
        height={size}
        alt={name}
        title={name}
        // `sync` tells WebKit to decode-from-cache before painting, killing
        // the one-frame ghost where the previous author's pixels lingered
        // while the new src decoded asynchronously. Safe here because we
        // only render the <img> once preload has finished, so the bytes are
        // already in the browser's HTTP cache.
        decoding="sync"
        fetchPriority="high"
        className={cn(
          "shrink-0 rounded-full outline-1 -outline-offset-1 outline-foreground/10",
          className,
        )}
      />
    );
  }

  return (
    <div
      title={name}
      style={{ width: size, height: size, background: bg, fontSize: initialFontSize }}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-medium text-white outline-1 -outline-offset-1 outline-foreground/10",
        className,
      )}
    >
      {initial}
    </div>
  );
}

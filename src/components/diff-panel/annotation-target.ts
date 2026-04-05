import type { AnnotationSide, SelectedLineRange } from "@pierre/diffs";

export interface AnnotationTarget {
  side: AnnotationSide;
  lineStart: number;
  lineEnd: number;
}

// Gutter drags and plain line selections should resolve to the same anchor.
// We always place the draft after the normalized end line on the resolved side.
export function getAnnotationTarget(
  range: SelectedLineRange,
): AnnotationTarget {
  const derivedSide = range.endSide ?? range.side;

  return {
    side: derivedSide === "deletions" ? "deletions" : "additions",
    lineStart: Math.min(range.start, range.end),
    lineEnd: Math.max(range.start, range.end),
  };
}

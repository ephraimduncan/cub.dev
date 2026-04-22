export const FILE_STATUS: Record<
  string,
  { letter: string; color: string }
> = {
  added: { letter: "A", color: "text-emerald-500" },
  modified: { letter: "M", color: "text-amber-500" },
  deleted: { letter: "D", color: "text-red-500" },
  renamed: { letter: "R", color: "text-blue-500" },
  typechange: { letter: "T", color: "text-purple-500" },
};

export const DIFF_ADDITION_COLOR = "text-emerald-600 dark:text-emerald-400";
export const DIFF_DELETION_COLOR = "text-red-600 dark:text-red-400";

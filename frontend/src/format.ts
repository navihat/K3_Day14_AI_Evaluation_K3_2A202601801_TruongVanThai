export type Band = "good" | "warn" | "crit";

/** Score interpretation from the lecture: 0.8+ good, 0.6-0.8 needs work, below 0.6 significant. */
export function band(v: number): Band {
  if (v >= 0.8) return "good";
  if (v >= 0.6) return "warn";
  return "crit";
}

export const bandLabel: Record<Band, string> = {
  good: "Good",
  warn: "Needs work",
  crit: "Significant",
};

export const bandVar = (b: Band) => `var(--${b})`;

export const f3 = (v: number | null | undefined) =>
  v === null || v === undefined ? "—" : v.toFixed(3);

export const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

export const signed = (v: number) =>
  `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(3)}`;

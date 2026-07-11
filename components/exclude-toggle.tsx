"use client";

import { EyeOff } from "lucide-react";

// One-click toggle for excluding an exceptional transaction (e.g. a
// security deposit) from the dashboard's budget math. Report/trend
// views are unaffected — this only changes what the dashboard sums.
export function ExcludeToggle({
  excluded,
  onToggle,
}: {
  excluded: boolean;
  onToggle: (next: boolean) => void;
}) {
  if (excluded) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggle(false);
        }}
        title="Excluded from dashboard — click to include again"
        className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0"
        style={{ backgroundColor: "var(--color-danger-subtle)", color: "var(--color-danger)" }}
      >
        <EyeOff size={11} />
        Excluded
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle(true);
      }}
      title="Exclude from dashboard calculations"
      className="text-[11px] font-medium px-1.5 py-0.5 rounded-full shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
      style={{ color: "var(--color-text-subtle)" }}
    >
      Exclude
    </button>
  );
}

"use client";

import { Sparkles } from "lucide-react";

// One-click toggle for flagging a one-off/exceptional transaction (e.g. a
// security deposit) as a special expense. This excludes it from the
// dashboard's budget math and mirrors it into the Simulation page's special
// expense list — Report/trend views are unaffected either way.
export function SpecialExpenseToggle({
  active,
  onToggle,
}: {
  active: boolean;
  onToggle: (next: boolean) => void;
}) {
  if (active) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggle(false);
        }}
        title="Special expense — excluded from dashboard, tracked in Simulation. Click to undo"
        className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0 transition-all hover:opacity-80 active:scale-95 active:opacity-70 cursor-pointer"
        style={{ backgroundColor: "var(--color-primary-subtle)", color: "var(--color-primary-hover)" }}
      >
        <Sparkles size={11} />
        Special expense
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
      title="Mark as special expense — excludes from dashboard, tracked in Simulation"
      className="text-[11px] font-medium px-1.5 py-0.5 rounded-full shrink-0 opacity-0 transition-all group-hover:opacity-100 hover:bg-muted active:scale-95 cursor-pointer"
      style={{ color: "var(--color-text-subtle)" }}
    >
      Special expense
    </button>
  );
}

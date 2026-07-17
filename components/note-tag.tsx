"use client";

import { useEffect, useState } from "react";

// Inline click-to-edit one-line memo. Empty text on commit clears the note
// (add/edit/delete are all the same input — no separate delete affordance).
export function NoteTag({
  value,
  onSave,
  placeholder = "e.g. half for roommate",
}: {
  value: string | null;
  onSave: (v: string | null) => void;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value ?? "");

  useEffect(() => {
    setText(value ?? "");
  }, [value]);

  const commit = () => {
    setEditing(false);
    const trimmed = text.trim();
    if (trimmed !== (value ?? "")) {
      onSave(trimmed || null);
    }
  };

  if (editing) {
    return (
      <input
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            setText(value ?? "");
            setEditing(false);
          }
        }}
        onClick={(e) => e.stopPropagation()}
        placeholder={placeholder}
        className="text-[11px] font-semibold px-2 py-0.5 rounded-full outline-none w-36 font-sans transition-shadow focus:border-[var(--color-primary)] focus:shadow-[0_0_0_2px_color-mix(in_srgb,var(--color-primary)_20%,transparent)]"
        style={{
          border: "1px solid var(--color-border-default)",
          backgroundColor: "var(--color-surface)",
          color: "var(--color-text-primary)",
        }}
      />
    );
  }

  if (value) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setEditing(true);
        }}
        title={value}
        className="text-[11px] font-semibold px-2 py-0.5 rounded-full truncate max-w-[140px] shrink-0 transition-all hover:opacity-80 active:scale-95 active:opacity-70 cursor-pointer"
        style={{ backgroundColor: "var(--color-warning-subtle)", color: "var(--color-warning)" }}
      >
        {value}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        setEditing(true);
      }}
      className="text-[11px] font-medium px-1.5 py-0.5 rounded-full shrink-0 opacity-0 transition-all group-hover:opacity-100 hover:bg-muted active:scale-95 cursor-pointer"
      style={{ color: "var(--color-text-subtle)" }}
    >
      + Note
    </button>
  );
}

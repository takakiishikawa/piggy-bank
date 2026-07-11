"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { AlertTriangle, ChevronDown, Settings } from "lucide-react";
import { formatJPY } from "@/lib/format";
import type { SimulationMonth } from "@/lib/simulation";
import { NoteTag } from "@/components/note-tag";
import {
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
  Progress,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  Skeleton,
  Tag,
  toast,
} from "@takaki/go-design-system";

interface SimulationData {
  year: number;
  defaultMonthlyIncome: number;
  months: SimulationMonth[];
  annualTarget: number;
  yearEndProjection: number;
}

const YEAR_OPTIONS = [2025, 2026, 2027];
const CARD_SHADOW = "0 1px 2px rgba(120,72,10,.04), 0 8px 24px rgba(120,72,10,.05)";

function digitsOnly(v: string): string {
  return v.replace(/[^0-9-]/g, "");
}

function withCommas(v: string): string {
  const neg = v.startsWith("-");
  const digits = v.replace(/-/g, "");
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return neg ? `-${grouped}` : grouped;
}

function PlannedInput({
  value,
  onSave,
}: {
  value: number;
  onSave: (n: number) => void;
}) {
  const [text, setText] = useState(String(value));
  const savedValueRef = useRef(value);

  useEffect(() => {
    setText(String(value));
    savedValueRef.current = value;
  }, [value]);

  const commit = () => {
    const n = parseInt(digitsOnly(text), 10) || 0;
    if (n !== savedValueRef.current) {
      savedValueRef.current = n;
      onSave(n);
    }
    setText(String(n));
  };

  return (
    <Input
      type="text"
      inputMode="numeric"
      value={withCommas(text)}
      onChange={(e) => setText(digitsOnly(e.target.value))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      onClick={(e) => e.stopPropagation()}
      className="h-9 text-right font-num text-[13.5px] rounded-lg justify-self-end w-[130px]"
      style={{ borderColor: "var(--color-border-default)", backgroundColor: "var(--color-surface-subtle)" }}
    />
  );
}

function MonthRow({
  m,
  onUpdate,
  onSaveNote,
}: {
  m: SimulationMonth;
  onUpdate: (month: string, field: "planned", value: number) => void;
  onSaveNote: (month: string, note: string | null) => void;
}) {
  const negative = m.hasRecord && m.cumulative < 0;
  const actualValue = m.actual ?? m.planned;

  return (
    <div
      className="group grid items-center px-7 py-3.5 border-b last:border-0"
      style={{
        gridTemplateColumns: "1.2fr 1fr 1fr 1fr",
        gap: 8,
        borderColor: "var(--color-border-subtle)",
        backgroundColor: m.isCurrentMonth ? "#EAF6F4" : "transparent",
      }}
    >
      <span
        className="text-[14.5px] font-semibold flex items-center gap-2 min-w-0"
        style={{ color: m.isCurrentMonth ? "var(--color-primary-hover)" : "var(--color-text-primary)" }}
      >
        {m.label} {m.year}
        {m.isCurrentMonth && (
          <Tag
            className="text-[10.5px] font-bold px-2 py-0.5 shrink-0"
            style={{ backgroundColor: "var(--color-primary)", color: "#fff" }}
          >
            NOW
          </Tag>
        )}
        {m.hasRecord && (
          <NoteTag
            value={m.note}
            onSave={(v) => onSaveNote(m.month, v)}
            placeholder="e.g. Japan trip"
          />
        )}
      </span>
      {!m.hasRecord ? (
        <span className="col-span-3 text-right text-sm" style={{ color: "var(--color-text-secondary)" }}>
          No data
        </span>
      ) : (
        <>
          <PlannedInput
            value={m.planned}
            onSave={(n) => onUpdate(m.month, "planned", n)}
          />
          <span className="text-right text-sm font-num" style={{ color: "var(--color-text-secondary)" }}>
            {formatJPY(actualValue)}
          </span>
          <span
            className="text-right font-num text-sm font-bold flex items-center justify-end gap-1.5"
            style={{ color: negative ? "var(--color-danger)" : "var(--color-text-primary)" }}
          >
            {negative && <AlertTriangle size={14} style={{ color: "var(--color-danger)" }} />}
            {formatJPY(m.cumulative)}
          </span>
        </>
      )}
    </div>
  );
}

function IncomeSettingsDialog({
  open,
  onOpenChange,
  defaultMonthlyIncome,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultMonthlyIncome: number;
  onSaved: () => void;
}) {
  const [text, setText] = useState(String(defaultMonthlyIncome));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setText(String(defaultMonthlyIncome));
  }, [open, defaultMonthlyIncome]);

  const handleSave = async () => {
    setSaving(true);
    const val = parseInt(digitsOnly(text), 10) || 0;
    const res = await fetch("/api/simulation", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ defaultMonthlyIncome: val }),
    });
    setSaving(false);
    if (!res.ok) {
      toast.error("Failed to save");
      return;
    }
    toast.success("Default income saved");
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Monthly JP income (default)</DialogTitle>
        </DialogHeader>
        <div className="px-1">
          <div className="flex items-center gap-2">
            <Input
              type="text"
              inputMode="numeric"
              value={withCommas(text)}
              onChange={(e) => setText(digitsOnly(e.target.value))}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
              }}
              className="font-num"
              autoFocus
            />
            <span className="text-xs shrink-0" style={{ color: "var(--color-text-secondary)" }}>JPY / mo</span>
          </div>
          <p className="text-xs mt-2" style={{ color: "var(--color-text-secondary)" }}>
            Used as the starting plan for any month you haven&apos;t set a number for yet.
          </p>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function SimulationPage() {
  const [year, setYear] = useState(2026);
  const [data, setData] = useState<SimulationData | null>(null);
  const [incomeDialogOpen, setIncomeDialogOpen] = useState(false);

  const load = useCallback(async (y: number) => {
    const res = await fetch(`/api/simulation?year=${y}`);
    if (!res.ok) return;
    const json: SimulationData = await res.json();
    setData(json);
  }, []);

  useEffect(() => {
    setData(null);
    load(year);
  }, [year, load]);

  const handleUpdateMonth = async (
    month: string,
    field: "planned",
    value: number,
  ) => {
    const res = await fetch(`/api/simulation/months/${month}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    if (!res.ok) {
      toast.error("Failed to save");
      return;
    }
    load(year);
  };

  const handleSaveNote = async (month: string, note: string | null) => {
    const res = await fetch(`/api/simulation/months/${month}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note }),
    });
    if (!res.ok) {
      toast.error("Failed to save");
      return;
    }
    load(year);
  };

  const progressPct =
    data && data.annualTarget > 0
      ? Math.max(0, Math.min(100, Math.round((data.yearEndProjection / data.annualTarget) * 100)))
      : 0;
  const diff = data ? data.yearEndProjection - data.annualTarget : 0;
  const onPace = diff >= 0;

  return (
    <div>
      <div className="mt-8 mb-6 flex items-center justify-between">
        <Select value={String(year)} onValueChange={(v) => setYear(parseInt(v, 10))}>
          <SelectTrigger
            className="w-fit h-auto rounded-[10px] py-2.5 px-4 text-sm font-semibold gap-2 [&>svg]:hidden"
            style={{ borderColor: "var(--color-border-default)", color: "var(--color-text-primary)" }}
          >
            <SelectValue />
            <ChevronDown size={15} style={{ color: "var(--color-text-subtle)" }} />
          </SelectTrigger>
          <SelectContent>
            {YEAR_OPTIONS.map((y) => (
              <SelectItem key={y} value={String(y)}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="sm"
          className="rounded-[10px] h-auto py-2.5 px-4 font-semibold"
          style={{ borderColor: "var(--color-border-default)", color: "var(--color-text-primary)" }}
          onClick={() => setIncomeDialogOpen(true)}
        >
          <Settings size={15} />
          Default income
        </Button>
      </div>

      <Card
        className="p-7 rounded-2xl mb-6"
        style={{ borderColor: "var(--color-border-default)", boxShadow: CARD_SHADOW }}
      >
        {!data ? (
          <Skeleton className="h-24 w-full rounded-lg" />
        ) : (
          <>
            <p className="text-xs font-semibold uppercase tracking-[0.06em] mb-2.5" style={{ color: "var(--color-text-subtle)" }}>
              {data.year} savings target
            </p>
            <p className="font-display text-[48px] font-bold leading-none" style={{ color: "var(--color-text-primary)" }}>
              {formatJPY(data.annualTarget)}
            </p>
            <div className="mt-[18px]">
              <div className="flex items-baseline justify-between mb-2">
                <span className="text-[13.5px]" style={{ color: "var(--color-text-secondary)" }}>Projected year-end</span>
                <span className="font-num font-bold text-[15px]" style={{ color: "var(--color-text-primary)" }}>
                  {formatJPY(data.yearEndProjection)}
                </span>
              </div>
              <Progress
                value={progressPct}
                className="h-2"
                style={{ backgroundColor: "var(--kg-track)" }}
                indicatorStyle={{ backgroundColor: "var(--color-primary)" }}
              />
              <p className="text-sm font-medium mt-3" style={{ color: "var(--color-primary-hover)" }}>
                {data.annualTarget === 0
                  ? "Set a default monthly income to get a target."
                  : onPace
                    ? `${progressPct}% there — ${formatJPY(diff)} ahead of plan`
                    : `${progressPct}% there — ${formatJPY(Math.abs(diff))} behind plan`}
              </p>
            </div>
          </>
        )}
      </Card>

      <Card
        className="rounded-2xl overflow-hidden p-0"
        style={{ borderColor: "var(--color-border-default)", boxShadow: CARD_SHADOW }}
      >
        <div
          className="grid px-7 py-4 border-b"
          style={{ gridTemplateColumns: "1.2fr 1fr 1fr 1fr", gap: 8, borderColor: "var(--color-border-default)" }}
        >
          <span className="text-xs font-semibold uppercase tracking-[0.05em]" style={{ color: "var(--color-text-subtle)" }}>Month</span>
          <span className="text-xs font-semibold uppercase tracking-[0.05em] text-right" style={{ color: "var(--color-text-subtle)" }}>Planned</span>
          <span className="text-xs font-semibold uppercase tracking-[0.05em] text-right" style={{ color: "var(--color-text-subtle)" }}>Actual</span>
          <span className="text-xs font-semibold uppercase tracking-[0.05em] text-right" style={{ color: "var(--color-text-subtle)" }}>Cumulative</span>
        </div>
        {!data ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-8 rounded-lg" />
            ))}
          </div>
        ) : (
          data.months.map((m) => (
            <MonthRow key={m.month} m={m} onUpdate={handleUpdateMonth} onSaveNote={handleSaveNote} />
          ))
        )}
      </Card>

      <IncomeSettingsDialog
        open={incomeDialogOpen}
        onOpenChange={setIncomeDialogOpen}
        defaultMonthlyIncome={data?.defaultMonthlyIncome ?? 0}
        onSaved={() => load(year)}
      />
    </div>
  );
}

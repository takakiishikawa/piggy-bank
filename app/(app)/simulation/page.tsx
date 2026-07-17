"use client";

import { useEffect, useState, useCallback } from "react";
import { AlertTriangle, ChevronDown, Settings } from "lucide-react";
import { formatJPY, formatVND } from "@/lib/format";
import type { SimulationMonth, SpecialEntry } from "@/lib/simulation";
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
  vndPerJpy: number;
  months: SimulationMonth[];
  annualIncome: number;
  annualExpense: number;
  annualRemaining: number;
  yearEndProjection: number;
}

type DisplayCurrency = "JPY" | "VND";

const YEAR_OPTIONS = [2025, 2026, 2027];
const CARD_SHADOW = "0 1px 2px rgba(120,72,10,.04), 0 8px 24px rgba(120,72,10,.05)";
const GRID_COLS = "1.05fr 0.85fr 0.85fr 0.85fr 0.85fr 0.95fr";

function digitsOnly(v: string): string {
  return v.replace(/[^0-9-]/g, "");
}

function withCommas(v: string): string {
  const neg = v.startsWith("-");
  const digits = v.replace(/-/g, "");
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return neg ? `-${grouped}` : grouped;
}

// Every amount in this page is stored/computed in JPY — this renders it in
// whichever currency the switch is set to, converting with the day's rate.
function makeFormatAmount(displayCurrency: DisplayCurrency, vndPerJpy: number) {
  return (jpyAmount: number) =>
    displayCurrency === "JPY" ? formatJPY(jpyAmount) : formatVND(jpyAmount * vndPerJpy);
}

function CurrencySwitch({
  value,
  onChange,
}: {
  value: DisplayCurrency;
  onChange: (v: DisplayCurrency) => void;
}) {
  return (
    <div className="flex rounded-[10px] overflow-hidden shrink-0" style={{ border: "1px solid var(--color-border-default)" }}>
      {(["JPY", "VND"] as const).map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className="px-3 h-[38px] text-sm font-semibold cursor-pointer transition-colors"
          style={{
            backgroundColor: value === c ? "var(--color-primary)" : "transparent",
            color: value === c ? "#fff" : "var(--color-text-secondary)",
          }}
        >
          {c === "JPY" ? "¥ JPY" : "₫ VND"}
        </button>
      ))}
    </div>
  );
}

function MonthRow({
  m,
  formatAmount,
  onOpenEntries,
  onSaveNote,
}: {
  m: SimulationMonth;
  formatAmount: (jpyAmount: number) => string;
  onOpenEntries: (month: string, kind: "income" | "expense") => void;
  onSaveNote: (month: string, note: string | null) => void;
}) {
  const negative = m.hasRecord && m.cumulative < 0;

  return (
    <div
      className="group grid items-center px-7 py-3.5 border-b last:border-0"
      style={{
        gridTemplateColumns: GRID_COLS,
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
        <span className="col-span-5 text-right text-sm" style={{ color: "var(--color-text-secondary)" }}>
          No data
        </span>
      ) : (
        <>
          <span className="text-right text-sm font-num" style={{ color: "var(--color-text-secondary)" }}>
            {formatAmount(m.regularIncome)}
          </span>
          <button
            type="button"
            onClick={() => onOpenEntries(m.month, "income")}
            className="text-right text-sm font-num transition-opacity hover:opacity-70 cursor-pointer"
            style={{ color: "var(--color-success)" }}
          >
            {formatAmount(m.income - m.regularIncome)}
          </button>
          <button
            type="button"
            onClick={() => onOpenEntries(m.month, "expense")}
            className="text-right text-sm font-num transition-opacity hover:opacity-70 cursor-pointer"
            style={{ color: m.expense > 0 ? "var(--color-danger)" : "var(--color-text-secondary)" }}
          >
            {m.expense > 0 ? formatAmount(m.expense) : "—"}
          </button>
          <span className="text-right text-sm font-num font-semibold" style={{ color: "var(--color-text-primary)" }}>
            {formatAmount(m.remaining)}
          </span>
          <span
            className="text-right font-num text-sm font-bold flex items-center justify-end gap-1.5"
            style={{ color: negative ? "var(--color-danger)" : "var(--color-text-primary)" }}
          >
            {negative && <AlertTriangle size={14} style={{ color: "var(--color-danger)" }} />}
            {formatAmount(m.cumulative)}
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
          <DialogTitle>Regular monthly income</DialogTitle>
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
            Used as the recurring income for the current/future months. Add special income for one-off amounts.
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

function SpecialEntriesDialog({
  open,
  onOpenChange,
  month,
  kind,
  entries,
  formatAmount,
  vndPerJpy,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  month: string;
  kind: "income" | "expense";
  entries: SpecialEntry[];
  formatAmount: (jpyAmount: number) => string;
  vndPerJpy: number;
  onChanged: () => void;
}) {
  const [name, setName] = useState("");
  const [amountText, setAmountText] = useState("");
  const [currency, setCurrency] = useState<"JPY" | "VND">("JPY");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName("");
      setAmountText("");
      setCurrency("JPY");
    }
  }, [open]);

  const handleAdd = async () => {
    const amount = parseInt(digitsOnly(amountText), 10) || 0;
    if (!name.trim() || amount === 0) return;
    setSaving(true);
    const res = await fetch("/api/simulation/special-entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ month, kind, name: name.trim(), amount, currency }),
    });
    setSaving(false);
    if (!res.ok) {
      toast.error("Failed to save");
      return;
    }
    setName("");
    setAmountText("");
    onChanged();
  };

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/simulation/special-entries/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Failed to delete");
      return;
    }
    onChanged();
  };

  const title = kind === "income" ? "Special income" : "Special expense";
  const isExpense = kind === "expense";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{title} — {month}</DialogTitle>
        </DialogHeader>
        <div className="px-1 space-y-3">
          {isExpense && (
            <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
              Set automatically when you mark a transaction as &quot;Special expense&quot; in Transactions. To remove one, unmark it there.
            </p>
          )}
          {entries.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
              No entries yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {entries.map((e) => {
                const entryJpy = e.currency === "VND" ? e.amount / vndPerJpy : e.amount;
                return (
                  <li key={e.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0">
                      <span className="truncate block" style={{ color: "var(--color-text-primary)" }}>{e.name}</span>
                      <span className="text-[11px]" style={{ color: "var(--color-text-subtle)" }}>
                        Entered as {e.currency === "VND" ? formatVND(e.amount) : formatJPY(e.amount)}
                      </span>
                    </span>
                    <span className="flex items-center gap-3 shrink-0">
                      <span className="font-num font-semibold" style={{ color: "var(--color-text-primary)" }}>
                        {formatAmount(entryJpy)}
                      </span>
                      {!isExpense && (
                        <button
                          type="button"
                          onClick={() => handleDelete(e.id)}
                          className="text-xs font-medium cursor-pointer hover:opacity-70"
                          style={{ color: "var(--color-danger)" }}
                        >
                          Remove
                        </button>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {!isExpense && (
            <div
              className="flex items-center gap-2 pt-3"
              style={{ borderTop: "1px solid var(--color-border-subtle)" }}
            >
              <Input
                placeholder="Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="flex-1"
              />
              <Input
                type="text"
                inputMode="numeric"
                placeholder="Amount"
                value={withCommas(amountText)}
                onChange={(e) => setAmountText(digitsOnly(e.target.value))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAdd();
                }}
                className="w-24 font-num"
              />
              <div className="flex rounded-lg overflow-hidden shrink-0" style={{ border: "1px solid var(--color-border-default)" }}>
                {(["JPY", "VND"] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCurrency(c)}
                    className="px-2 h-9 text-xs font-semibold cursor-pointer transition-colors"
                    style={{
                      backgroundColor: currency === c ? "var(--color-primary)" : "transparent",
                      color: currency === c ? "#fff" : "var(--color-text-secondary)",
                    }}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {!isExpense && (
            <Button onClick={handleAdd} disabled={saving || !name.trim()}>
              Add
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function SimulationPage() {
  const [year, setYear] = useState(2026);
  const [data, setData] = useState<SimulationData | null>(null);
  const [displayCurrency, setDisplayCurrency] = useState<DisplayCurrency>("JPY");
  const [incomeDialogOpen, setIncomeDialogOpen] = useState(false);
  const [entriesDialog, setEntriesDialog] = useState<{ month: string; kind: "income" | "expense" } | null>(null);

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

  const vndPerJpy = data?.vndPerJpy ?? 1;
  const formatAmount = makeFormatAmount(displayCurrency, vndPerJpy);

  const savingsRatePct =
    data && data.annualIncome > 0
      ? Math.max(0, Math.min(100, Math.round((data.annualRemaining / data.annualIncome) * 100)))
      : 0;

  const editingMonth = data?.months.find((m) => m.month === entriesDialog?.month);
  const editingEntries = entriesDialog
    ? (entriesDialog.kind === "income" ? editingMonth?.specialIncomes : editingMonth?.specialExpenses) ?? []
    : [];

  return (
    <div>
      <div className="mt-8 mb-6 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Select value={String(year)} onValueChange={(v) => setYear(parseInt(v, 10))}>
            <SelectTrigger
              className="w-fit h-auto rounded-[10px] py-2.5 px-4 text-sm font-semibold gap-2 [&>svg]:hidden transition-colors hover:bg-muted/40 active:bg-muted/60"
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
          <CurrencySwitch value={displayCurrency} onChange={setDisplayCurrency} />
        </div>
        <Button
          variant="outline"
          size="sm"
          className="rounded-[10px] h-auto py-2.5 px-4 font-semibold hover:opacity-80"
          style={{ borderColor: "var(--color-border-default)", color: "var(--color-text-primary)" }}
          onClick={() => setIncomeDialogOpen(true)}
        >
          <Settings size={15} />
          Regular income
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
              {data.year} cumulative balance
            </p>
            <p className="font-display text-[48px] font-bold leading-none" style={{ color: "var(--color-text-primary)" }}>
              {formatAmount(data.yearEndProjection)}
            </p>
            <div className="mt-[18px] grid grid-cols-3 gap-4">
              <div>
                <p className="text-[12.5px] mb-1" style={{ color: "var(--color-text-secondary)" }}>Income</p>
                <p className="font-num font-bold text-[16px]" style={{ color: "var(--color-success)" }}>
                  {formatAmount(data.annualIncome)}
                </p>
              </div>
              <div>
                <p className="text-[12.5px] mb-1" style={{ color: "var(--color-text-secondary)" }}>Expense</p>
                <p className="font-num font-bold text-[16px]" style={{ color: "var(--color-danger)" }}>
                  {formatAmount(data.annualExpense)}
                </p>
              </div>
              <div>
                <p className="text-[12.5px] mb-1" style={{ color: "var(--color-text-secondary)" }}>Remaining</p>
                <p className="font-num font-bold text-[16px]" style={{ color: "var(--color-text-primary)" }}>
                  {formatAmount(data.annualRemaining)}
                </p>
              </div>
            </div>
            {data.annualIncome > 0 && (
              <div className="mt-[18px]">
                <Progress
                  value={savingsRatePct}
                  className="h-2"
                  style={{ backgroundColor: "var(--kg-track)" }}
                  indicatorStyle={{ backgroundColor: "var(--color-primary)" }}
                />
                <p className="text-sm font-medium mt-3" style={{ color: "var(--color-primary-hover)" }}>
                  Saving {savingsRatePct}% of income so far this year
                </p>
              </div>
            )}
          </>
        )}
      </Card>

      <Card
        className="rounded-2xl overflow-hidden p-0"
        style={{ borderColor: "var(--color-border-default)", boxShadow: CARD_SHADOW }}
      >
        <div
          className="grid px-7 py-4 border-b"
          style={{ gridTemplateColumns: GRID_COLS, gap: 8, borderColor: "var(--color-border-default)" }}
        >
          <span className="text-xs font-semibold uppercase tracking-[0.05em]" style={{ color: "var(--color-text-subtle)" }}>Month</span>
          <span className="text-xs font-semibold uppercase tracking-[0.05em] text-right" style={{ color: "var(--color-text-subtle)" }}>Income</span>
          <span className="text-xs font-semibold uppercase tracking-[0.05em] text-right" style={{ color: "var(--color-text-subtle)" }}>Special income</span>
          <span className="text-xs font-semibold uppercase tracking-[0.05em] text-right" style={{ color: "var(--color-text-subtle)" }}>Expense</span>
          <span className="text-xs font-semibold uppercase tracking-[0.05em] text-right" style={{ color: "var(--color-text-subtle)" }}>Remaining</span>
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
            <MonthRow
              key={m.month}
              m={m}
              formatAmount={formatAmount}
              onOpenEntries={(month, kind) => setEntriesDialog({ month, kind })}
              onSaveNote={handleSaveNote}
            />
          ))
        )}
      </Card>

      <IncomeSettingsDialog
        open={incomeDialogOpen}
        onOpenChange={setIncomeDialogOpen}
        defaultMonthlyIncome={data?.defaultMonthlyIncome ?? 0}
        onSaved={() => load(year)}
      />

      {entriesDialog && (
        <SpecialEntriesDialog
          open={entriesDialog !== null}
          onOpenChange={(v) => {
            if (!v) setEntriesDialog(null);
          }}
          month={entriesDialog.month}
          kind={entriesDialog.kind}
          entries={editingEntries}
          formatAmount={formatAmount}
          vndPerJpy={vndPerJpy}
          onChanged={() => load(year)}
        />
      )}
    </div>
  );
}

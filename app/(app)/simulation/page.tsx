"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { AlertTriangle, Settings } from "lucide-react";
import { formatJPY } from "@/lib/format";
import type { SimulationMonth } from "@/lib/simulation";
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
  cn,
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

function digitsOnly(v: string): string {
  return v.replace(/[^0-9-]/g, "");
}

function withCommas(v: string): string {
  const neg = v.startsWith("-");
  const digits = v.replace(/-/g, "");
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return neg ? `-${grouped}` : grouped;
}

function MonthAmountInput({
  value,
  onSave,
  placeholder,
}: {
  value: number;
  onSave: (n: number) => void;
  placeholder?: string;
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
      placeholder={placeholder}
      onChange={(e) => setText(digitsOnly(e.target.value))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      onClick={(e) => e.stopPropagation()}
      className="h-8 text-right font-num text-sm"
    />
  );
}

function MonthRow({
  m,
  onUpdate,
}: {
  m: SimulationMonth;
  onUpdate: (month: string, field: "planned" | "actual", value: number) => void;
}) {
  const negative = m.hasRecord && m.cumulative < 0;
  const actualValue = m.actual ?? m.planned;

  return (
    <div
      className={cn(
        "grid grid-cols-4 gap-2 items-center px-6 py-2.5 border-b last:border-0",
        m.isCurrentMonth && "bg-[var(--color-primary-subtle)]",
      )}
    >
      <span className="text-sm font-medium text-foreground flex items-center gap-2">
        {m.label} {m.year}
        {m.isCurrentMonth && (
          <Tag style={{ backgroundColor: "var(--color-primary)", color: "#fff" }}>
            Now
          </Tag>
        )}
      </span>
      {!m.hasRecord ? (
        <span className="col-span-3 text-right text-sm text-muted-foreground">
          No data
        </span>
      ) : (
        <>
          <MonthAmountInput
            value={m.planned}
            onSave={(n) => onUpdate(m.month, "planned", n)}
          />
          <MonthAmountInput
            value={actualValue}
            onSave={(n) => onUpdate(m.month, "actual", n)}
          />
          <span
            className="text-right font-num text-sm font-semibold flex items-center justify-end gap-1"
            style={{ color: negative ? "var(--color-danger, #ef4444)" : undefined }}
          >
            {negative && <AlertTriangle size={12} />}
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
            <span className="text-xs text-muted-foreground shrink-0">JPY / mo</span>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Used as the starting plan for any month you haven't set a number for yet.
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
    field: "planned" | "actual",
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

  const progressPct =
    data && data.annualTarget > 0
      ? Math.max(0, Math.min(100, Math.round((data.yearEndProjection / data.annualTarget) * 100)))
      : 0;
  const diff = data ? data.yearEndProjection - data.annualTarget : 0;
  const onPace = diff >= 0;

  return (
    <div>
      <div className="mt-6 mb-6 flex items-center justify-between">
        <Select value={String(year)} onValueChange={(v) => setYear(parseInt(v, 10))}>
          <SelectTrigger className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {YEAR_OPTIONS.map((y) => (
              <SelectItem key={y} value={String(y)}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => setIncomeDialogOpen(true)}>
          <Settings size={14} />
          Default income
        </Button>
      </div>

      <Card className="p-6 mb-6">
        {!data ? (
          <Skeleton className="h-24 w-full rounded-lg" />
        ) : (
          <>
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-2">
              {data.year} savings target
            </p>
            <p className="font-num text-4xl font-bold text-foreground leading-none">
              {formatJPY(data.annualTarget)}
            </p>
            <div className="mt-5">
              <div className="flex items-center justify-between text-sm mb-1.5">
                <span className="text-muted-foreground">Projected year-end</span>
                <span className="font-num font-semibold text-foreground">
                  {formatJPY(data.yearEndProjection)}
                </span>
              </div>
              <Progress
                value={progressPct}
                indicatorStyle={{
                  backgroundColor: onPace
                    ? "var(--color-success, #22c55e)"
                    : "var(--color-danger, #ef4444)",
                }}
              />
              <p className="text-xs text-muted-foreground mt-1.5">
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

      <Card className="overflow-hidden">
        <div className="grid grid-cols-4 gap-2 px-6 py-3 border-b text-xs font-medium uppercase tracking-widest text-muted-foreground">
          <span>Month</span>
          <span className="text-right">Planned</span>
          <span className="text-right">Actual</span>
          <span className="text-right">Cumulative</span>
        </div>
        {!data ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-8 rounded-lg" />
            ))}
          </div>
        ) : (
          data.months.map((m) => (
            <MonthRow key={m.month} m={m} onUpdate={handleUpdateMonth} />
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

"use client";

import { useEffect, useState, useCallback } from "react";
import { AlertTriangle } from "lucide-react";
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

function MonthRow({
  m,
  onClick,
}: {
  m: SimulationMonth;
  onClick: () => void;
}) {
  const negative = m.hasRecord && m.cumulative < 0;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full grid grid-cols-4 gap-2 px-6 py-3 border-b last:border-0 text-left transition-colors hover:bg-muted/40 cursor-pointer",
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
          <span className="text-right font-num text-sm text-foreground">
            {formatJPY(m.planned)}
          </span>
          <span className="text-right font-num text-sm text-foreground">
            {m.actual !== null ? formatJPY(m.actual) : "—"}
          </span>
          <span
            className="text-right font-num text-sm font-semibold flex items-center justify-end gap-1"
            style={{ color: negative ? "var(--color-danger, #ef4444)" : undefined }}
          >
            {negative && <AlertTriangle size={12} />}
            {formatJPY(m.cumulative)}
          </span>
        </>
      )}
    </button>
  );
}

function MonthDetailDialog({
  month,
  onClose,
  onSaved,
}: {
  month: SimulationMonth | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [planned, setPlanned] = useState("");
  const [actual, setActual] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!month) return;
    setPlanned(String(month.planned));
    setActual(month.actual !== null ? String(month.actual) : "");
  }, [month]);

  const handleSave = async () => {
    if (!month) return;
    setSaving(true);
    const plannedNum = parseInt(planned.replace(/[^0-9-]/g, ""), 10) || 0;
    const actualNum =
      actual.trim() === ""
        ? null
        : parseInt(actual.replace(/[^0-9-]/g, ""), 10) || 0;
    const res = await fetch(`/api/simulation/months/${month.month}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planned: plannedNum, actual: actualNum }),
    });
    setSaving(false);
    if (!res.ok) {
      toast.error("Failed to save");
      return;
    }
    toast.success(`Saved ${month.label} ${month.year}`);
    onSaved();
  };

  return (
    <Dialog
      open={month !== null}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {month?.label} {month?.year}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 px-1">
          <div>
            <label className="block text-sm font-medium mb-2 text-foreground">
              Planned savings (JPY)
            </label>
            <Input
              type="text"
              inputMode="numeric"
              value={planned.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
              onChange={(e) => setPlanned(e.target.value.replace(/[^0-9]/g, ""))}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2 text-foreground">
              Actual savings (JPY)
            </label>
            <Input
              type="text"
              inputMode="numeric"
              value={actual.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
              onChange={(e) => setActual(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="Not confirmed yet"
            />
            <p className="text-xs text-muted-foreground mt-1.5">
              Leave this blank until the month wraps up and you know the real number.
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={onClose}>
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
  const [incomeInput, setIncomeInput] = useState("");
  const [savingIncome, setSavingIncome] = useState(false);
  const [detailMonth, setDetailMonth] = useState<SimulationMonth | null>(null);

  const load = useCallback(async (y: number) => {
    setData(null);
    const res = await fetch(`/api/simulation?year=${y}`);
    if (!res.ok) return;
    const json: SimulationData = await res.json();
    setData(json);
    setIncomeInput(String(json.defaultMonthlyIncome));
  }, []);

  useEffect(() => {
    load(year);
  }, [year, load]);

  const handleSaveIncome = async () => {
    setSavingIncome(true);
    const val = parseInt(incomeInput.replace(/[^0-9]/g, ""), 10) || 0;
    const res = await fetch("/api/simulation", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ defaultMonthlyIncome: val }),
    });
    setSavingIncome(false);
    if (!res.ok) {
      toast.error("Failed to save");
      return;
    }
    toast.success("Default income saved");
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
                  ? "Set a monthly income below to get a target."
                  : onPace
                    ? `${progressPct}% there — ${formatJPY(diff)} ahead of plan`
                    : `${progressPct}% there — ${formatJPY(Math.abs(diff))} behind plan`}
              </p>
            </div>
          </>
        )}
      </Card>

      <Card className="p-6 mb-6">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-3">
          Monthly JP income (default)
        </p>
        <div className="flex items-center gap-2">
          <Input
            type="text"
            inputMode="numeric"
            value={incomeInput.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
            onChange={(e) => setIncomeInput(e.target.value.replace(/[^0-9]/g, ""))}
            className="max-w-[200px] font-num"
          />
          <span className="text-xs text-muted-foreground">JPY / month</span>
          <Button size="sm" onClick={handleSaveIncome} disabled={savingIncome}>
            {savingIncome ? "Saving..." : "Save"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Used as the starting plan for any month you haven't set a number for yet.
        </p>
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
            <MonthRow key={m.month} m={m} onClick={() => setDetailMonth(m)} />
          ))
        )}
      </Card>

      <MonthDetailDialog
        month={detailMonth}
        onClose={() => setDetailMonth(null)}
        onSaved={() => {
          setDetailMonth(null);
          load(year);
        }}
      />
    </div>
  );
}

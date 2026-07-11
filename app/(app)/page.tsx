"use client";

import { useEffect, useState, useCallback } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { formatVND } from "@/lib/format";
import { getCategoryColors, getCategoryColorTint } from "@/lib/category-colors";
import { getCategoryIcon } from "@/lib/category-icons";
import { NoteTag } from "@/components/note-tag";
import { ExcludeToggle } from "@/components/exclude-toggle";
import {
  Card,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Skeleton,
} from "@takaki/go-design-system";

interface CategoryEntry {
  id: string;
  name: string;
  budget: number;
  is_fixed: boolean;
  actual: number;
}

interface DashboardData {
  variableCategories: CategoryEntry[];
  fixedCategories: CategoryEntry[];
  variableTotalBudget: number;
  variableTotalActual: number;
  fixedTotalBudget: number;
  fixedTotalActual: number;
  dayOfMonth: number;
  daysInMonth: number;
  forecastVnd: number | null;
  savingsImpactVnd: number | null;
  lifeBudgetVnd: number;
}

interface TxItem {
  id: string;
  store: string;
  amount: number;
  category: string;
  date: string;
  note: string | null;
  excluded_from_dashboard: boolean;
}

const CARD_SHADOW = "0 1px 2px rgba(120,72,10,.04), 0 8px 24px rgba(120,72,10,.05)";

function CategoryIcon({ name }: { name: string }) {
  const { text } = getCategoryColors(name);
  const Icon = getCategoryIcon(name);
  return <Icon size={16} style={{ color: text }} className="shrink-0" />;
}

function ProgressBar({
  actual,
  budget,
  todayPct,
  showToday,
  fillColor,
}: {
  actual: number;
  budget: number;
  todayPct: number;
  showToday: boolean;
  fillColor?: string;
}) {
  const pct = budget > 0 ? Math.min(100, Math.round((actual / budget) * 100)) : 0;
  const over = budget > 0 && actual > budget;
  const alert = budget > 0 && pct > todayPct;

  const barColor = budget === 0
    ? "var(--color-text-subtle)"
    : over
      ? "var(--color-danger)"
      : (fillColor ?? "var(--color-primary)");

  return (
    <div
      className="relative h-2 rounded-full overflow-visible"
      style={{ backgroundColor: "var(--kg-track)" }}
    >
      <div
        className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
        style={{ width: `${pct}%`, backgroundColor: barColor }}
      />
      {showToday && budget > 0 && (
        <div
          className="absolute top-[-4px] h-4 w-0.5 rounded-sm z-10"
          style={{ left: `${Math.min(100, todayPct)}%`, backgroundColor: "var(--color-text-primary)" }}
          title={`On-track line (${Math.round(todayPct)}%)`}
        />
      )}
      {alert && !over && (
        <div
          className="absolute inset-y-0 right-0 w-1.5 rounded-r-full"
          style={{ backgroundColor: "var(--color-danger)", opacity: 0.5 }}
        />
      )}
    </div>
  );
}

function VariableCategoryCard({
  cat,
  todayPct,
  onClick,
}: {
  cat: CategoryEntry;
  todayPct: number;
  onClick: () => void;
}) {
  const pctNum = cat.budget > 0 ? Math.round((cat.actual / cat.budget) * 100) : null;
  const over = cat.budget > 0 && cat.actual > cat.budget;
  const near = pctNum !== null && pctNum >= 80 && !over;
  const { text: catColor } = getCategoryColors(cat.name);
  const pctColor = over ? "var(--color-danger)" : near ? "var(--color-warning)" : "var(--color-text-secondary)";
  const barColor = over ? "var(--color-danger)" : catColor;

  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left rounded-[13px] border p-[18px_20px] transition-colors hover:bg-muted/40 cursor-pointer"
      style={{ borderColor: "var(--color-border-default)", backgroundColor: "var(--color-surface-subtle)" }}
    >
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px]"
            style={{ backgroundColor: getCategoryColorTint(cat.name) }}
          >
            <CategoryIcon name={cat.name} />
          </div>
          <span className="text-[14.5px] font-semibold truncate" style={{ color: "var(--color-text-primary)" }}>
            {cat.name}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
            <span className="font-num font-semibold" style={{ color: "var(--color-text-primary)" }}>
              {formatVND(cat.actual)}
            </span>
            {cat.budget > 0 && <span className="font-num"> / {formatVND(cat.budget)}</span>}
          </span>
          {pctNum !== null && (
            <span className="font-num text-[13px] font-bold" style={{ color: pctColor }}>
              {pctNum}%
            </span>
          )}
        </div>
      </div>
      <ProgressBar
        actual={cat.actual}
        budget={cat.budget}
        todayPct={todayPct}
        showToday={false}
        fillColor={barColor}
      />
    </button>
  );
}

function FixedCategoryCard({ cat, onClick }: { cat: CategoryEntry; onClick: () => void }) {
  const over = cat.budget > 0 && cat.actual > cat.budget * 1.05;
  const paid = cat.actual > 0 && !over;

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 text-left rounded-[13px] border py-3.5 px-[18px] transition-colors hover:bg-muted/40 cursor-pointer"
      style={{ borderColor: "var(--color-border-default)", backgroundColor: "var(--color-surface-subtle)" }}
    >
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px]"
        style={{ backgroundColor: "var(--kg-track)" }}
      >
        {(() => {
          const Icon = getCategoryIcon(cat.name);
          return <Icon size={16} style={{ color: "#6B5D45" }} />;
        })()}
      </div>
      <span className="text-[14.5px] font-semibold flex-1 min-w-0 truncate" style={{ color: "var(--color-text-primary)" }}>
        {cat.name}
      </span>
      {cat.budget > 0 && (
        <span
          className="text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0"
          style={
            over
              ? { backgroundColor: "var(--color-danger-subtle)", color: "var(--color-danger)" }
              : paid
                ? { backgroundColor: "var(--color-success-subtle)", color: "var(--color-success)" }
                : { backgroundColor: "var(--kg-track)", color: "var(--color-text-secondary)" }
          }
        >
          {over ? "Over" : paid ? "Paid" : "Unpaid"}
        </span>
      )}
      <span className="font-num text-sm font-bold shrink-0" style={{ color: "var(--color-text-primary)" }}>
        {formatVND(cat.actual)}
      </span>
    </button>
  );
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [uncategorizedCount, setUncategorizedCount] = useState(0);
  const [detail, setDetail] = useState<{
    categoryName: string;
    txs: TxItem[] | null;
  } | null>(null);

  const fetchDashboard = useCallback(async () => {
    const [dashRes, uncatRes] = await Promise.all([
      fetch("/api/dashboard"),
      fetch("/api/transactions/uncategorized-count"),
    ]);
    if (dashRes.ok) setData(await dashRes.json());
    if (uncatRes.ok) {
      const { count } = (await uncatRes.json()) as { count: number };
      setUncategorizedCount(count ?? 0);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  const openCategory = useCallback(async (categoryName: string) => {
    setDetail({ categoryName, txs: null });
    try {
      const params = new URLSearchParams({ period: "month", category: categoryName });
      const r = await fetch(`/api/transactions?${params.toString()}`);
      const txs = r.ok ? ((await r.json()) as TxItem[]) : [];
      setDetail((d) =>
        d?.categoryName === categoryName ? { ...d, txs } : d,
      );
    } catch {
      setDetail((d) =>
        d?.categoryName === categoryName ? { ...d, txs: [] } : d,
      );
    }
  }, []);

  const handleSaveNote = useCallback(
    async (id: string, note: string | null) => {
      setDetail((d) =>
        d && d.txs
          ? { ...d, txs: d.txs.map((t) => (t.id === id ? { ...t, note } : t)) }
          : d,
      );
      await fetch(`/api/transactions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note }),
      });
    },
    [],
  );

  const handleToggleExcluded = useCallback(
    async (id: string, excluded: boolean) => {
      setDetail((d) =>
        d && d.txs
          ? {
              ...d,
              txs: d.txs.map((t) =>
                t.id === id ? { ...t, excluded_from_dashboard: excluded } : t,
              ),
            }
          : d,
      );
      await fetch(`/api/transactions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ excludedFromDashboard: excluded }),
      });
      fetchDashboard();
    },
    [fetchDashboard],
  );

  const todayPct = data
    ? Math.round((data.dayOfMonth / data.daysInMonth) * 100)
    : 0;

  const totalBudget = data
    ? data.variableTotalBudget + data.fixedTotalBudget
    : 0;
  const totalActual = data
    ? data.variableTotalActual + data.fixedTotalActual
    : 0;
  const usagePct =
    data && totalBudget > 0 ? Math.round((totalActual / totalBudget) * 100) : null;
  const usageAlert = usagePct !== null && usagePct > todayPct;

  const hasBudgets = data
    ? data.variableTotalBudget > 0 || data.fixedTotalBudget > 0
    : false;

  const sortedVariable = data
    ? [...data.variableCategories].sort((a, b) => b.budget - a.budget)
    : [];
  const sortedFixed = data
    ? [...data.fixedCategories].sort((a, b) => b.budget - a.budget)
    : [];

  const positive = (data?.savingsImpactVnd ?? 0) >= 0;
  const variablePct =
    data && data.variableTotalBudget > 0
      ? Math.round((data.variableTotalActual / data.variableTotalBudget) * 100)
      : 0;

  return (
    <div>
      <div className="mt-8 flex flex-col gap-6">
        {uncategorizedCount > 0 && (
          <div
            className="flex items-center gap-2 rounded-lg px-4 py-3 text-sm"
            style={{
              backgroundColor: "var(--color-warning-subtle)",
              borderLeft: "3px solid var(--color-warning)",
            }}
          >
            <span style={{ color: "var(--color-warning)" }}>⚠</span>
            <span style={{ color: "var(--color-text-primary)" }}>
              You have {uncategorizedCount} unreviewed transactions.
            </span>
            <a
              href="/transactions"
              className="ml-auto text-xs underline shrink-0"
              style={{ color: "var(--color-warning)" }}
            >
              Review them
            </a>
          </div>
        )}

        <Card
          className="p-7 rounded-2xl animate-fade-up"
          style={{
            animationDelay: "0ms",
            animationFillMode: "both",
            borderColor: "var(--color-border-default)",
            boxShadow: CARD_SHADOW,
          }}
        >
          {!data ? (
            <Skeleton className="h-8 w-64 rounded-lg" />
          ) : !hasBudgets ? (
            <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
              Set a monthly budget for each category on the Budget page to see this month&apos;s forecast.
            </p>
          ) : data.forecastVnd === null ? (
            <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
              No transactions yet this month.
            </p>
          ) : (
            <div>
              <p
                className="text-xs font-semibold uppercase tracking-[0.06em] mb-2.5"
                style={{ color: "var(--color-text-subtle)" }}
              >
                This month&apos;s forecast
              </p>
              <div className="flex items-baseline gap-4 flex-wrap">
                <p
                  className="font-display text-[52px] font-bold leading-none tracking-[-0.01em]"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  {formatVND(data.forecastVnd)}
                </p>
                {usagePct !== null && (
                  <span
                    className="font-num text-[13px] font-bold px-3 py-1.5 rounded-full shrink-0"
                    style={{
                      backgroundColor: usageAlert ? "var(--color-danger-subtle)" : "var(--color-primary-subtle)",
                      color: usageAlert ? "var(--color-danger)" : "var(--color-primary-hover)",
                    }}
                  >
                    {usagePct}% of budget
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-3">
                {positive ? (
                  <TrendingDown size={16} style={{ color: "var(--color-success)" }} />
                ) : (
                  <TrendingUp size={16} style={{ color: "var(--color-danger)" }} />
                )}
                <span
                  className="text-sm font-medium"
                  style={{ color: positive ? "var(--color-success)" : "var(--color-danger)" }}
                >
                  {positive
                    ? `On pace to come in ${formatVND(data.savingsImpactVnd ?? 0)} under budget`
                    : `On pace to go ${formatVND(Math.abs(data.savingsImpactVnd ?? 0))} over budget`}
                </span>
              </div>
            </div>
          )}
        </Card>

        <Card
          className="p-7 rounded-2xl overflow-hidden animate-fade-up"
          style={{
            animationDelay: "80ms",
            animationFillMode: "both",
            borderColor: "var(--color-border-default)",
            boxShadow: CARD_SHADOW,
          }}
        >
          <div className="flex items-baseline justify-between mb-[18px] flex-wrap gap-2">
            <span className="font-display text-[19px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
              Variable Costs
            </span>
            {data && data.variableTotalBudget > 0 && (
              <span className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
                <b className="font-num" style={{ color: "var(--color-text-primary)" }}>
                  {formatVND(data.variableTotalActual)}
                </b>{" "}
                / {formatVND(data.variableTotalBudget)} &middot; {variablePct}%
              </span>
            )}
          </div>

          {data && data.variableTotalBudget > 0 && (
            <div className="mb-5">
              <ProgressBar
                actual={data.variableTotalActual}
                budget={data.variableTotalBudget}
                todayPct={todayPct}
                showToday={true}
              />
              <p className="text-[12.5px] mt-2" style={{ color: "var(--color-text-subtle)" }}>
                On-track line {todayPct}% (day {data.dayOfMonth} of {data.daysInMonth})
              </p>
            </div>
          )}

          {!data ? (
            <div className="grid grid-cols-2 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-20 rounded-lg" />
              ))}
            </div>
          ) : sortedVariable.length === 0 ? (
            <p className="py-6 text-sm text-center" style={{ color: "var(--color-text-secondary)" }}>
              No variable cost categories yet. Add some from the Budget page.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {sortedVariable.map((cat) => (
                <VariableCategoryCard
                  key={cat.id}
                  cat={cat}
                  todayPct={todayPct}
                  onClick={() => openCategory(cat.name)}
                />
              ))}
            </div>
          )}
        </Card>

        <Card
          className="p-7 rounded-2xl overflow-hidden animate-fade-up"
          style={{
            animationDelay: "160ms",
            animationFillMode: "both",
            borderColor: "var(--color-border-default)",
            boxShadow: CARD_SHADOW,
          }}
        >
          <div className="flex items-baseline justify-between mb-[18px]">
            <span className="font-display text-[19px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
              Fixed Costs
            </span>
            {data && data.fixedTotalBudget > 0 && (
              <span className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
                <b className="font-num" style={{ color: "var(--color-text-primary)" }}>
                  {formatVND(data.fixedTotalBudget)}
                </b>{" "}
                / month
              </span>
            )}
          </div>
          {!data ? (
            <div className="grid grid-cols-2 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-16 rounded-lg" />
              ))}
            </div>
          ) : sortedFixed.length === 0 ? (
            <p className="py-6 text-sm text-center" style={{ color: "var(--color-text-secondary)" }}>
              No fixed cost categories yet. Add some from the Budget page.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {sortedFixed.map((cat) => (
                <FixedCategoryCard
                  key={cat.id}
                  cat={cat}
                  onClick={() => openCategory(cat.name)}
                />
              ))}
            </div>
          )}
        </Card>
      </div>

      <Dialog
        open={detail !== null}
        onOpenChange={(o) => {
          if (!o) setDetail(null);
        }}
      >
        <DialogContent className="max-w-lg p-0 overflow-hidden">
          <DialogHeader className="px-7 py-5 border-b" style={{ borderColor: "var(--color-border-default)" }}>
            <DialogTitle className="flex items-center gap-2">
              {detail?.categoryName}
              <span className="text-sm font-normal" style={{ color: "var(--color-text-secondary)" }}>
                This month
              </span>
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto px-7 py-5">
            {detail?.txs === null ? (
              <div className="space-y-2">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-10 w-full rounded" />
                ))}
              </div>
            ) : detail && detail.txs.length === 0 ? (
              <p className="text-center py-10 text-sm" style={{ color: "var(--color-text-secondary)" }}>
                No spending in this category this month.
              </p>
            ) : (
              <>
                <ul className="divide-y" style={{ borderColor: "var(--color-border-subtle)" }}>
                  {detail?.txs?.map((t) => (
                    <li
                      key={t.id}
                      className="group flex items-center justify-between gap-4 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="text-sm truncate" style={{ color: "var(--color-text-primary)" }}>{t.store}</p>
                        <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
                          {new Date(t.date).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })}
                        </p>
                      </div>
                      <NoteTag value={t.note} onSave={(v) => handleSaveNote(t.id, v)} />
                      <ExcludeToggle
                        excluded={t.excluded_from_dashboard}
                        onToggle={(v) => handleToggleExcluded(t.id, v)}
                      />
                      <span className="font-num text-sm shrink-0" style={{ color: "var(--color-text-primary)" }}>
                        {formatVND(t.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
                {detail && detail.txs && detail.txs.length > 0 && (
                  <div className="mt-3 pt-3 border-t flex items-center justify-between" style={{ borderColor: "var(--color-border-default)" }}>
                    <span className="text-sm" style={{ color: "var(--color-text-secondary)" }}>Total</span>
                    <span className="font-num font-semibold" style={{ color: "var(--color-text-primary)" }}>
                      {formatVND(
                        detail.txs
                          .filter((t) => !t.excluded_from_dashboard)
                          .reduce((sum, t) => sum + t.amount, 0),
                      )}
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

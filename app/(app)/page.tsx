"use client";

import { useEffect, useState, useCallback } from "react";
import { formatVND } from "@/lib/format";
import { getCategoryColors } from "@/lib/category-colors";
import { getCategoryIcon } from "@/lib/category-icons";
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
}

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
}: {
  actual: number;
  budget: number;
  todayPct: number;
  showToday: boolean;
}) {
  const pct = budget > 0 ? Math.min(100, Math.round((actual / budget) * 100)) : 0;
  const over = budget > 0 && actual > budget;
  const alert = budget > 0 && pct > todayPct;

  const barColor = budget === 0
    ? "var(--muted-foreground)"
    : alert
      ? "var(--color-danger, #ef4444)"
      : "var(--color-success, #22c55e)";

  return (
    <div className="relative h-2 rounded-full bg-muted overflow-visible">
      <div
        className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
        style={{ width: `${pct}%`, backgroundColor: barColor }}
      />
      {showToday && budget > 0 && (
        <div
          className="absolute top-[-3px] bottom-[-3px] w-0.5 rounded-full bg-foreground/40 z-10"
          style={{ left: `${Math.min(100, todayPct)}%` }}
          title={`On-track line (${Math.round(todayPct)}%)`}
        />
      )}
      {over && (
        <div
          className="absolute inset-y-0 right-0 w-1.5 rounded-r-full"
          style={{ backgroundColor: "var(--color-danger, #ef4444)", opacity: 0.5 }}
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
  const alert = pctNum !== null && pctNum > todayPct;

  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left rounded-lg border p-3 transition-colors hover:bg-muted/40 cursor-pointer"
    >
      <div className="flex items-center gap-2 mb-2">
        <CategoryIcon name={cat.name} />
        <span className="text-sm text-foreground truncate flex-1 min-w-0">
          {cat.name}
        </span>
        {pctNum !== null && (
          <span
            className="font-num text-xs font-semibold shrink-0"
            style={{ color: alert ? "var(--color-danger, #ef4444)" : "var(--muted-foreground)" }}
          >
            {pctNum}%
          </span>
        )}
      </div>
      <ProgressBar
        actual={cat.actual}
        budget={cat.budget}
        todayPct={todayPct}
        showToday={false}
      />
      <div className="mt-1.5">
        <span
          className="font-num text-xs font-medium"
          style={{ color: alert ? "var(--color-danger, #ef4444)" : "var(--color-foreground)" }}
        >
          {formatVND(cat.actual)}
        </span>
        {cat.budget > 0 && (
          <span className="font-num text-xs text-muted-foreground">
            {" "}/ {formatVND(cat.budget)}
          </span>
        )}
      </div>
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
      className="text-left rounded-lg border p-3 transition-colors hover:bg-muted/40 cursor-pointer"
    >
      <div className="flex items-center gap-2 mb-1.5">
        <CategoryIcon name={cat.name} />
        <span className="text-sm text-foreground truncate flex-1 min-w-0">
          {cat.name}
        </span>
        {cat.budget > 0 && (
          <span
            className="text-xs px-1.5 py-0.5 rounded-full border shrink-0"
            style={
              over
                ? {
                    backgroundColor: "var(--color-danger-subtle, #fee2e2)",
                    borderColor: "var(--color-danger, #ef4444)",
                    color: "var(--color-danger, #ef4444)",
                  }
                : paid
                  ? {
                      backgroundColor: "var(--color-success-subtle, #dcfce7)",
                      borderColor: "var(--color-success, #22c55e)",
                      color: "var(--color-success, #22c55e)",
                    }
                  : {
                      backgroundColor: "transparent",
                      borderColor: "var(--border)",
                      color: "var(--muted-foreground)",
                    }
            }
          >
            {over ? "Over" : paid ? "Paid" : "Unpaid"}
          </span>
        )}
      </div>
      <div>
        <span className="font-num text-xs font-medium text-foreground">
          {formatVND(cat.actual)}
        </span>
        {cat.budget > 0 && (
          <span className="font-num text-xs text-muted-foreground">
            {" "}/ {formatVND(cat.budget)}
          </span>
        )}
      </div>
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

  // 予算の多い順にソート
  const sortedVariable = data
    ? [...data.variableCategories].sort((a, b) => b.budget - a.budget)
    : [];
  const sortedFixed = data
    ? [...data.fixedCategories].sort((a, b) => b.budget - a.budget)
    : [];

  const positive = (data?.savingsImpactVnd ?? 0) >= 0;

  return (
    <div>
      <div className="mt-6 space-y-5">
        {/* 未分類アラート */}
        {uncategorizedCount > 0 && (
          <div
            className="flex items-center gap-2 rounded-lg px-4 py-3 text-sm"
            style={{
              backgroundColor: "var(--color-warning-subtle)",
              borderLeft: "3px solid var(--color-warning, #eab308)",
            }}
          >
            <span style={{ color: "var(--color-warning, #eab308)" }}>⚠</span>
            <span className="text-foreground">
              You have {uncategorizedCount} unreviewed transactions.
            </span>
            <a
              href="/transactions"
              className="ml-auto text-xs underline shrink-0"
              style={{ color: "var(--color-warning, #eab308)" }}
            >
              Review them
            </a>
          </div>
        )}

        {/* 着地見込みカード */}
        <Card
          className="p-6 animate-fade-up"
          style={{ animationDelay: "0ms", animationFillMode: "both" }}
        >
          {!data ? (
            <Skeleton className="h-8 w-64 rounded-lg" />
          ) : !hasBudgets ? (
            <p className="text-sm text-muted-foreground">
              Set a monthly budget for each category on the Budget page to see this month's forecast.
            </p>
          ) : data.forecastVnd === null ? (
            <p className="text-sm text-muted-foreground">
              No transactions yet this month.
            </p>
          ) : (
            <div>
              <p className="text-xs text-muted-foreground mb-1">This month's forecast</p>
              <div className="flex items-center gap-3">
                <p className="font-num text-4xl font-bold text-foreground leading-none">
                  {formatVND(data.forecastVnd)}
                </p>
                {usagePct !== null && (
                  <span
                    className="font-num text-sm font-bold px-2.5 py-1 rounded-full shrink-0"
                    style={{
                      backgroundColor: usageAlert
                        ? "var(--color-danger-subtle, #fee2e2)"
                        : "var(--color-success-subtle, #dcfce7)",
                      color: usageAlert
                        ? "var(--color-danger, #ef4444)"
                        : "var(--color-success, #22c55e)",
                    }}
                  >
                    {usagePct}% of budget
                  </span>
                )}
              </div>
              <p
                className="text-sm font-medium mt-2"
                style={{
                  color: positive
                    ? "var(--color-success, #22c55e)"
                    : "var(--color-danger, #ef4444)",
                }}
              >
                {positive
                  ? `On pace to come in ${formatVND(data.savingsImpactVnd ?? 0)} under budget`
                  : `On pace to go ${formatVND(Math.abs(data.savingsImpactVnd ?? 0))} over budget`}
              </p>
            </div>
          )}
        </Card>

        {/* 変動費セクション */}
        <Card
          className="overflow-hidden animate-fade-up"
          style={{ animationDelay: "80ms", animationFillMode: "both" }}
        >
          <div className="flex items-center gap-3 px-6 py-4 border-b">
            <h2 className="text-sm font-semibold text-foreground">Variable Costs</h2>
            {data && data.variableTotalBudget > 0 && (
              <>
                <span className="font-num text-sm text-muted-foreground">
                  {formatVND(data.variableTotalActual)} / {formatVND(data.variableTotalBudget)}
                </span>
                <span className="font-num text-xs text-muted-foreground">
                  {Math.round((data.variableTotalActual / data.variableTotalBudget) * 100)}%
                </span>
              </>
            )}
          </div>

          {/* 合計プログレスバー */}
          {data && data.variableTotalBudget > 0 && (
            <div className="px-6 pt-4 pb-2">
              <ProgressBar
                actual={data.variableTotalActual}
                budget={data.variableTotalBudget}
                todayPct={todayPct}
                showToday={true}
              />
              <p className="text-xs text-muted-foreground mt-1.5">
                On-track line {todayPct}% (day {data.dayOfMonth} of {data.daysInMonth})
              </p>
            </div>
          )}

          <div className="px-6 pb-4 pt-2">
            {!data ? (
              <div className="grid grid-cols-2 gap-3">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-20 rounded-lg" />
                ))}
              </div>
            ) : sortedVariable.length === 0 ? (
              <p className="py-6 text-sm text-center text-muted-foreground">
                No variable cost categories yet. Add some from the Budget page.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-3">
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
          </div>
        </Card>

        {/* 固定費セクション */}
        <Card
          className="overflow-hidden animate-fade-up"
          style={{ animationDelay: "160ms", animationFillMode: "both" }}
        >
          <div className="flex items-center gap-3 px-6 py-4 border-b">
            <h2 className="text-sm font-semibold text-foreground">Fixed Costs</h2>
            {data && data.fixedTotalBudget > 0 && (
              <>
                <span className="font-num text-sm text-muted-foreground">
                  {formatVND(data.fixedTotalActual)} / {formatVND(data.fixedTotalBudget)}
                </span>
                <span className="font-num text-xs text-muted-foreground">
                  {Math.round((data.fixedTotalActual / data.fixedTotalBudget) * 100)}%
                </span>
              </>
            )}
          </div>
          <div className="px-6 pb-4 pt-2">
            {!data ? (
              <div className="grid grid-cols-2 gap-3">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-16 rounded-lg" />
                ))}
              </div>
            ) : sortedFixed.length === 0 ? (
              <p className="py-6 text-sm text-center text-muted-foreground">
                No fixed cost categories yet. Add some from the Budget page.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {sortedFixed.map((cat) => (
                  <FixedCategoryCard
                    key={cat.id}
                    cat={cat}
                    onClick={() => openCategory(cat.name)}
                  />
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* カテゴリ明細 popup */}
      <Dialog
        open={detail !== null}
        onOpenChange={(o) => {
          if (!o) setDetail(null);
        }}
      >
        <DialogContent className="max-w-lg p-0 overflow-hidden">
          <DialogHeader className="px-7 py-5 border-b">
            <DialogTitle className="flex items-center gap-2">
              {detail?.categoryName}
              <span className="text-sm font-normal text-muted-foreground">This month</span>
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
              <p className="text-center py-10 text-sm text-muted-foreground">
                No spending in this category this month.
              </p>
            ) : (
              <>
                <ul className="divide-y">
                  {detail?.txs?.map((t) => (
                    <li
                      key={t.id}
                      className="flex items-center justify-between gap-4 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="text-sm text-foreground truncate">{t.store}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(t.date).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })}
                        </p>
                      </div>
                      <span className="font-num text-sm text-foreground shrink-0">
                        {formatVND(t.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
                {detail && detail.txs && detail.txs.length > 0 && (
                  <div className="mt-3 pt-3 border-t flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Total</span>
                    <span className="font-num font-semibold text-foreground">
                      {formatVND(detail.txs.reduce((sum, t) => sum + t.amount, 0))}
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

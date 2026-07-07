"use client";

import { useEffect, useState, useCallback } from "react";
import { formatVND } from "@/lib/format";
import { getCategoryColors } from "@/lib/category-colors";
import {
  Card,
  PageHeader,
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
  forecastJpy: number | null;
  savingsImpactJpy: number | null;
  savingsTargetJpy: number;
  monthlyIncomeJpy: number;
}

function CategoryDot({ name }: { name: string }) {
  const { bg, border } = getCategoryColors(name);
  return (
    <span
      className="inline-block w-3 h-3 rounded-full shrink-0"
      style={{ backgroundColor: bg, borderColor: border, border: "1px solid" }}
    />
  );
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
        style={{
          width: `${pct}%`,
          backgroundColor: barColor,
        }}
      />
      {showToday && budget > 0 && (
        <div
          className="absolute top-[-3px] bottom-[-3px] w-0.5 rounded-full bg-foreground/40 z-10"
          style={{ left: `${Math.min(100, todayPct)}%` }}
          title={`本日のライン (${Math.round(todayPct)}%)`}
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

function VariableCategoryRow({
  cat,
  todayPct,
}: {
  cat: CategoryEntry;
  todayPct: number;
}) {
  const pctNum = cat.budget > 0 ? Math.round((cat.actual / cat.budget) * 100) : null;
  const alert = pctNum !== null && pctNum > todayPct;

  return (
    <div className="flex items-center gap-3 py-2.5">
      <CategoryDot name={cat.name} />
      <span className="text-sm text-foreground truncate w-24 shrink-0">
        {cat.name}
      </span>
      <div className="flex-1 min-w-0">
        <ProgressBar
          actual={cat.actual}
          budget={cat.budget}
          todayPct={todayPct}
          showToday={false}
        />
      </div>
      <div className="text-right shrink-0 w-40">
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
    </div>
  );
}

function FixedCategoryRow({ cat }: { cat: CategoryEntry }) {
  const over = cat.budget > 0 && cat.actual > cat.budget * 1.05;
  const match = cat.budget > 0 && !over;

  return (
    <div className="flex items-center gap-3 py-2.5 border-b last:border-0">
      <CategoryDot name={cat.name} />
      <span className="text-sm text-foreground truncate flex-1">
        {cat.name}
      </span>
      <span className="font-num text-sm text-foreground shrink-0">
        {formatVND(cat.actual)}
        {cat.budget > 0 && (
          <span className="font-num text-xs text-muted-foreground">
            {" "}/ {formatVND(cat.budget)}
          </span>
        )}
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
              : match
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
          {over ? "予算超過" : match ? "一致" : "—"}
        </span>
      )}
    </div>
  );
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);

  const fetchDashboard = useCallback(async () => {
    const res = await fetch("/api/dashboard");
    if (!res.ok) return;
    const json = await res.json();
    setData(json as DashboardData);
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  const todayPct = data
    ? Math.round((data.dayOfMonth / data.daysInMonth) * 100)
    : 0;

  const hasBudgets = data
    ? data.variableTotalBudget > 0 || data.fixedTotalBudget > 0
    : false;

  return (
    <div>
      <PageHeader title="ダッシュボード" />

      <div className="mt-8 space-y-6">
        {/* 貯金インパクトカード */}
        <Card className="p-6 animate-fade-up" style={{ animationDelay: "0ms", animationFillMode: "both" }}>
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-3">
            貯金インパクト
          </p>
          {!data ? (
            <Skeleton className="h-8 w-64 rounded-lg" />
          ) : !hasBudgets ? (
            <p className="text-sm text-muted-foreground">
              予算・カテゴリページで各カテゴリの月次予算を設定すると、貯金目標への影響が表示されます。
            </p>
          ) : data.forecastJpy === null ? (
            <p className="text-sm text-muted-foreground">
              今月の取引データがまだありません。
            </p>
          ) : (
            <div className="flex flex-col gap-1">
              <p className="text-sm text-muted-foreground">
                今のペースなら今月の生活費は{" "}
                <span className="font-num font-semibold text-foreground">
                  {data.forecastJpy.toLocaleString()}円
                </span>{" "}
                見込み
              </p>
              <p
                className="text-base font-semibold"
                style={{
                  color:
                    (data.savingsImpactJpy ?? 0) >= 0
                      ? "var(--color-success, #22c55e)"
                      : "var(--color-danger, #ef4444)",
                }}
              >
                {(data.savingsImpactJpy ?? 0) >= 0
                  ? `目標${data.savingsTargetJpy.toLocaleString()}円まで ${Math.abs(data.savingsImpactJpy ?? 0).toLocaleString()}円の余裕`
                  : `目標に ${Math.abs(data.savingsImpactJpy ?? 0).toLocaleString()}円届かない見込み`}
              </p>
            </div>
          )}
        </Card>

        {/* 変動費セクション */}
        <Card className="overflow-hidden animate-fade-up" style={{ animationDelay: "80ms", animationFillMode: "both" }}>
          <div className="flex items-center justify-between px-6 py-4 border-b">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-semibold text-foreground">変動費</h2>
              {data && data.variableTotalBudget > 0 && (
                <span className="font-num text-sm text-muted-foreground">
                  {formatVND(data.variableTotalActual)} / {formatVND(data.variableTotalBudget)}
                </span>
              )}
            </div>
            {data && data.variableTotalBudget > 0 && (
              <span className="font-num text-xs text-muted-foreground">
                {Math.round((data.variableTotalActual / data.variableTotalBudget) * 100)}%
              </span>
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
                今日のライン {todayPct}%（{data.dayOfMonth}日 / {data.daysInMonth}日）
              </p>
            </div>
          )}

          <div className="px-6 pb-4 pt-2 divide-y">
            {!data ? (
              <div className="space-y-3 py-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-8 rounded-lg" />
                ))}
              </div>
            ) : data.variableCategories.length === 0 ? (
              <p className="py-6 text-sm text-center text-muted-foreground">
                変動費カテゴリがありません。予算・カテゴリから設定してください。
              </p>
            ) : (
              data.variableCategories.map((cat) => (
                <VariableCategoryRow key={cat.id} cat={cat} todayPct={todayPct} />
              ))
            )}
          </div>
        </Card>

        {/* 固定費セクション */}
        <Card className="overflow-hidden animate-fade-up" style={{ animationDelay: "160ms", animationFillMode: "both" }}>
          <div className="px-6 py-4 border-b">
            <h2 className="text-sm font-semibold text-foreground">固定費</h2>
          </div>
          <div className="px-6 py-2">
            {!data ? (
              <div className="space-y-3 py-2">
                {[1, 2].map((i) => (
                  <Skeleton key={i} className="h-8 rounded-lg" />
                ))}
              </div>
            ) : data.fixedCategories.length === 0 ? (
              <p className="py-6 text-sm text-center text-muted-foreground">
                固定費カテゴリがありません。予算・カテゴリから設定してください。
              </p>
            ) : (
              data.fixedCategories.map((cat) => (
                <FixedCategoryRow key={cat.id} cat={cat} />
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

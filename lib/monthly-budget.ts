import type { createDb } from "@/lib/supabase/db";
import { monthKey } from "@/lib/budget";
import { fetchOverridesUpTo, resolveBudgetsForMonth, type CategoryBudgetOverride } from "@/lib/category-budget";
import { VND_PER_JPY } from "@/lib/currency";
import { applyScenarioCategoryAmounts, isCohabitingYear, resolveCategoryMonthlyYen } from "@/lib/scenario/compute";
import { normalizeScenarioConfig } from "@/lib/scenario/types";
import { addTxToCategoryTotals, countsAsSpending } from "@/lib/cash";
import { fetchAllRows } from "@/lib/supabase/fetch-all";

type Db = ReturnType<typeof createDb>;

interface CategoryRow {
  id: string;
  name: string;
  budget: number;
  is_fixed: boolean;
}

export interface MonthlyBudget {
  variableCategories: (CategoryRow & { actual: number })[];
  fixedCategories: (CategoryRow & { actual: number })[];
  variableTotalBudget: number;
  variableTotalActual: number;
  fixedTotalBudget: number;
  fixedTotalActual: number;
  dayOfMonth: number;
  daysInMonth: number;
  // 今月の着地予測（VND）— null if no budgets are configured at all.
  // 変動費: 線形予測 (actual / elapsed days * days in month)
  // 固定費: 実績 > 0 なら実績、なければ予算額を見込みとする
  forecastVnd: number | null;
  // Sum of every category's monthly budget ("Total Monthly Budget" on the
  // Budget page), regardless of the current month's actual spend.
  lifeBudgetVnd: number;
}

export async function computeMonthlyBudget(db: Db, now: Date = new Date()): Promise<MonthlyBudget> {
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  const dayOfMonth = now.getDate();
  const daysInMonth = monthEnd.getDate();

  // ダッシュボード表示上の「今月」= monthStart の月キー。オーバーライドは
  // この月以前で最新のものを実効予算として使う（effective-dated）。
  const targetMonth = monthKey(now.getFullYear(), now.getMonth());

  const [catsRes, txRes, overrides, scenariosRes] = await Promise.all([
    db.from("categories").select("id, name, budget, is_fixed").order("created_at"),
    db
      .from("transactions")
      .select("amount, category, source, date")
      .gte("date", monthStart.toISOString())
      .lte("date", monthEnd.toISOString())
      .eq("excluded_from_dashboard", false),
    fetchOverridesUpTo(db, targetMonth),
    db.from("scenarios").select("id, is_primary, config").order("created_at", { ascending: true }),
  ]);

  const sharedCategories = (catsRes.data ?? []) as CategoryRow[];

  // ダッシュボードの予算は「実データの現在値」ではなく、シミュレーション設定
  // (プライマリシナリオ)の金額を正とし、スケジュールがあればそれを当月に反映した
  // ものを表示する(要望: シミュレーション設定 → スケジュール反映 → ダッシュボードは
  // その当月の予算、という順番)。同棲開始年より前の年は「同棲前」の別額
  // (config.cohabitation.preAmountByCategory)を、以降は実カテゴリのオーバーライドを
  // シミュレーションの月次テーブルと同じ優先順位(resolveCategoryMonthlyYen)で解決する。
  const scenarios = (scenariosRes.data ?? []) as { id: string; is_primary: boolean; config: unknown }[];
  const primaryScenario = scenarios.find((s) => s.is_primary) ?? scenarios[0];
  const config = primaryScenario ? normalizeScenarioConfig(primaryScenario.config) : null;
  const cohabiting = config ? isCohabitingYear(config, now.getFullYear()) : true;
  const preAmountByCategory = config?.cohabitation.preAmountByCategory ?? {};
  // シナリオ固有のカテゴリ月額(amountByCategory)があればそれを使う。
  const { categories, overrides: effectiveOverrides } = config
    ? applyScenarioCategoryAmounts(config, sharedCategories, overrides, VND_PER_JPY)
    : { categories: sharedCategories, overrides };
  const overridesByCategory = new Map<string, CategoryBudgetOverride[]>();
  for (const o of effectiveOverrides) {
    const arr = overridesByCategory.get(o.category_id);
    if (arr) arr.push(o);
    else overridesByCategory.set(o.category_id, [o]);
  }
  const effectiveBudgets = new Map<string, number>(
    categories.map((c) => [
      c.id,
      Math.round(
        resolveCategoryMonthlyYen(
          c,
          overridesByCategory.get(c.id) ?? [],
          preAmountByCategory,
          cohabiting,
          targetMonth,
          VND_PER_JPY,
        ) * VND_PER_JPY,
      ),
    ]),
  );

  const actualMap: Record<string, number> = {};
  for (const tx of txRes.data ?? []) {
    addTxToCategoryTotals(actualMap, tx);
  }

  const withActual = categories.map((c) => ({
    ...c,
    budget: effectiveBudgets.get(c.id) ?? c.budget,
    actual: actualMap[c.name] ?? 0,
  }));
  const variable = withActual.filter((c) => !c.is_fixed);
  const fixed = withActual.filter((c) => c.is_fixed);

  const variableTotalBudget = variable.reduce((s, c) => s + c.budget, 0);
  const variableTotalActual = variable.reduce((s, c) => s + c.actual, 0);
  const fixedTotalBudget = fixed.reduce((s, c) => s + c.budget, 0);
  const fixedTotalActual = fixed.reduce((s, c) => s + c.actual, 0);

  let forecastVnd: number | null = null;
  const hasBudgets = variableTotalBudget > 0 || fixedTotalBudget > 0;

  if (hasBudgets) {
    let variableForecast = 0;
    if (dayOfMonth > 0 && variableTotalActual > 0) {
      variableForecast = Math.round((variableTotalActual / dayOfMonth) * daysInMonth);
    }

    let fixedForecast = 0;
    for (const c of fixed) {
      fixedForecast += c.actual > 0 ? c.actual : c.budget;
    }

    forecastVnd = variableForecast + fixedForecast;
  }

  const lifeBudgetVnd = variableTotalBudget + fixedTotalBudget;

  return {
    variableCategories: variable,
    fixedCategories: fixed,
    variableTotalBudget,
    variableTotalActual,
    fixedTotalBudget,
    fixedTotalActual,
    dayOfMonth,
    daysInMonth,
    forecastVnd,
    lifeBudgetVnd,
  };
}

// Actual VN spend (VND) for every month in a calendar year, keyed 'YYYY-MM'.
// Used for past months in the Simulation, which show what really happened
// instead of a forecast/budget projection.
export async function computeActualSpendByMonth(
  db: Db,
  year: number,
): Promise<Record<string, number>> {
  const start = new Date(year, 0, 1);
  const end = new Date(year, 11, 31, 23, 59, 59, 999);

  const data = await fetchAllRows<{ amount: number; date: string; category: string; source: string | null }>(
    (from, to) =>
      db
        .from("transactions")
        .select("amount, date, category, source")
        .gte("date", start.toISOString())
        .lte("date", end.toISOString())
        .eq("excluded_from_dashboard", false)
        .order("date", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
  );

  const byMonth: Record<string, number> = {};
  for (const tx of data ?? []) {
    // 財布への引き出しは支出ではない(支出は現金支出の記録・内訳なしの差額の方で数える)。
    if (!countsAsSpending(tx)) continue;
    const d = new Date(tx.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    byMonth[key] = (byMonth[key] ?? 0) + tx.amount;
  }
  return byMonth;
}

export interface ActualSpendThisYear {
  // 年初来累計(VND、カテゴリ名キー)。Simulationの年次表示で「今日までの実績を
  // 年換算した見込み」に使う。
  byCategory: Record<string, number>;
  // カテゴリ名 → "YYYY-MM" → その月の実績(VND)。Simulationの月次表示で、
  // 経過済みの月は実績そのものを使うために使う。
  byCategoryMonth: Record<string, Record<string, number>>;
}

// 当年(1/1〜今日)のカテゴリ別実績(VND)。Simulationが「今年」の暮らしを
// 予算だけでなく実績も踏まえて projection するために使う
// (要望: 「すでにあった今年の固定費・変動費の実際のデータがSimulationに出ていない」
// 「月次表示で過去月にも年換算の平均値しか出ていない」への対応)。
export async function computeActualSpendThisYear(db: Db): Promise<ActualSpendThisYear> {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);

  // 今年の取引は1000件を超えるため全件取り切る(以前は1000件で切り捨てられ、
  // 直近の月の実績が0円・一部欠けて表示されていた)。
  const data = await fetchAllRows<{ amount: number; category: string; date: string; source: string | null }>(
    (from, to) =>
      db
        .from("transactions")
        .select("amount, category, date, source")
        .gte("date", start.toISOString())
        .lte("date", now.toISOString())
        .eq("excluded_from_dashboard", false)
        .order("date", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
  );

  const byCategory: Record<string, number> = {};
  const byCategoryMonth: Record<string, Record<string, number>> = {};
  for (const tx of data ?? []) {
    addTxToCategoryTotals(byCategory, tx);
    const d = new Date(tx.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    // 月別も同じ規則(現金支出はそのカテゴリに加算し、財布からは差し引く)で集計する。
    const monthTotals: Record<string, number> = {};
    addTxToCategoryTotals(monthTotals, tx);
    for (const [cat, amt] of Object.entries(monthTotals)) {
      const forCategory = byCategoryMonth[cat] ?? (byCategoryMonth[cat] = {});
      forCategory[key] = (forCategory[key] ?? 0) + amt;
    }
  }
  return { byCategory, byCategoryMonth };
}

// Effective "Total Monthly Budget" (lifeBudgetVnd, i.e. sum of every
// category's budget) for every month of `year`, honoring category budget
// overrides — same resolution the Dashboard uses, but for all 12 months at
// once so Simulation can show a planned change (e.g. lower rent from
// September, groceries back to normal in October) instead of repeating a
// single flat figure across every future month.
export async function computeLifeBudgetsByMonth(
  db: Db,
  year: number,
): Promise<Record<string, number>> {
  const ceilingMonth = monthKey(year, 11); // December of `year`

  const [catsRes, overrides] = await Promise.all([
    db.from("categories").select("id, budget").order("created_at"),
    fetchOverridesUpTo(db, ceilingMonth),
  ]);
  const categories = (catsRes.data ?? []) as { id: string; budget: number }[];

  const byMonth: Record<string, number> = {};
  for (let m = 0; m < 12; m++) {
    const key = monthKey(year, m);
    const resolved = resolveBudgetsForMonth(categories, overrides, key);
    let total = 0;
    for (const v of resolved.values()) total += v;
    byMonth[key] = total;
  }
  return byMonth;
}

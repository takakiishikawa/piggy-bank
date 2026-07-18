import type { createDb } from "@/lib/supabase/db";

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

  const [catsRes, txRes] = await Promise.all([
    db.from("categories").select("id, name, budget, is_fixed").order("created_at"),
    db
      .from("transactions")
      .select("amount, category")
      .gte("date", monthStart.toISOString())
      .lte("date", monthEnd.toISOString())
      .eq("excluded_from_dashboard", false),
  ]);

  const categories = (catsRes.data ?? []) as CategoryRow[];

  const actualMap: Record<string, number> = {};
  for (const tx of txRes.data ?? []) {
    actualMap[tx.category] = (actualMap[tx.category] ?? 0) + tx.amount;
  }

  const withActual = categories.map((c) => ({ ...c, actual: actualMap[c.name] ?? 0 }));
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

  const { data } = await db
    .from("transactions")
    .select("amount, date")
    .gte("date", start.toISOString())
    .lte("date", end.toISOString())
    .eq("excluded_from_dashboard", false);

  const byMonth: Record<string, number> = {};
  for (const tx of data ?? []) {
    const d = new Date(tx.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    byMonth[key] = (byMonth[key] ?? 0) + tx.amount;
  }
  return byMonth;
}

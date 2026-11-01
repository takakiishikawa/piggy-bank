import type { createDb } from "@/lib/supabase/db";
import { computeMonthlyBudget } from "@/lib/monthly-budget";
import { prevMonthKey, type MonthlyReviewSummary, type ReviewCategory } from "@/lib/monthly-review";

type Db = ReturnType<typeof createDb>;

// その月の最終日(正午)を「今日」として集計すると、computeMonthlyBudget が
// その月まるごとの実績と、その月時点の予算を返す(ダッシュボードと同じ規則)。
function lastDayOf(month: string): Date {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m, 0, 12);
}

export async function computeMonthlyReviewSummary(db: Db, month: string): Promise<MonthlyReviewSummary> {
  const prevMonth = prevMonthKey(month);
  const [cur, prev] = await Promise.all([
    computeMonthlyBudget(db, lastDayOf(month)),
    computeMonthlyBudget(db, lastDayOf(prevMonth)),
  ]);

  const prevActualByName = new Map<string, number>();
  for (const c of [...prev.variableCategories, ...prev.fixedCategories]) {
    prevActualByName.set(c.name, c.actual);
  }

  const categories: ReviewCategory[] = [...cur.variableCategories, ...cur.fixedCategories]
    .map((c) => ({
      name: c.name,
      isFixed: c.is_fixed,
      budget: c.budget,
      actual: c.actual,
      prevActual: prevActualByName.get(c.name) ?? 0,
    }))
    .filter((c) => c.budget > 0 || c.actual > 0 || c.prevActual > 0);

  return {
    month,
    prevMonth,
    totalActual: cur.variableTotalActual + cur.fixedTotalActual,
    totalBudget: cur.lifeBudgetVnd,
    prevTotalActual: prev.variableTotalActual + prev.fixedTotalActual,
    variableActual: cur.variableTotalActual,
    variableBudget: cur.variableTotalBudget,
    fixedActual: cur.fixedTotalActual,
    fixedBudget: cur.fixedTotalBudget,
    categories,
  };
}

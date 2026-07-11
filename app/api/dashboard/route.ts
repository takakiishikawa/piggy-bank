import { NextResponse } from "next/server";
import { getAuthDb } from "@/lib/supabase/auth-db";

export async function GET() {
  const result = await getAuthDb();
  if (result instanceof NextResponse) return result;
  const { db } = result;

  const now = new Date();
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

  if (catsRes.error) {
    return NextResponse.json({ error: catsRes.error.message }, { status: 500 });
  }

  const categories = (catsRes.data ?? []) as {
    id: string;
    name: string;
    budget: number;
    is_fixed: boolean;
  }[];

  // カテゴリ別当月実績を集計
  const actualMap: Record<string, number> = {};
  for (const tx of txRes.data ?? []) {
    actualMap[tx.category] = (actualMap[tx.category] ?? 0) + tx.amount;
  }

  const withActual = categories.map((c) => ({
    ...c,
    actual: actualMap[c.name] ?? 0,
  }));

  const variable = withActual.filter((c) => !c.is_fixed);
  const fixed = withActual.filter((c) => c.is_fixed);

  const variableTotalBudget = variable.reduce((s, c) => s + c.budget, 0);
  const variableTotalActual = variable.reduce((s, c) => s + c.actual, 0);
  const fixedTotalBudget = fixed.reduce((s, c) => s + c.budget, 0);
  const fixedTotalActual = fixed.reduce((s, c) => s + c.actual, 0);

  // 今月の着地予測（VND）
  // 変動費: 線形予測 (actual / elapsed days * days in month)
  // 固定費: 実績 > 0 なら実績、なければ予算額を見込みとする
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
  const savingsImpactVnd = forecastVnd !== null ? lifeBudgetVnd - forecastVnd : null;

  return NextResponse.json({
    variableCategories: variable,
    fixedCategories: fixed,
    variableTotalBudget,
    variableTotalActual,
    fixedTotalBudget,
    fixedTotalActual,
    dayOfMonth,
    daysInMonth,
    forecastVnd,
    savingsImpactVnd,
    lifeBudgetVnd,
  });
}

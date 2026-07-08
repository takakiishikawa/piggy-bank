import { createDb } from "@/lib/supabase/db";

export interface MonthlyBudget {
  month: string; // 'YYYY-MM'
  target_monthly: number;
  fixed_costs: number;
}

type Db = ReturnType<typeof createDb>;

// ICT (UTC+7) 基準の当月キー（'YYYY-MM'）。
// 月別予算は ICT 月切り替えで動かす（ベトナム在住者の体感に合わせる）。
export function getCurrentMonthKey(now: Date = new Date()): string {
  const ictMs = now.getTime() + 7 * 60 * 60 * 1000;
  const ict = new Date(ictMs);
  const y = ict.getUTCFullYear();
  const m = String(ict.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function monthKey(year: number, month0: number): string {
  return `${year}-${String(month0 + 1).padStart(2, "0")}`;
}

export async function fetchAllBudgets(db: Db): Promise<MonthlyBudget[]> {
  const { data, error } = await db
    .from("monthly_budgets")
    .select("month, target_monthly, fixed_costs")
    .order("month", { ascending: true });
  if (error) throw new Error(`monthly_budgets fetch: ${error.message}`);
  return (data ?? []) as MonthlyBudget[];
}

export function buildBudgetMap(
  budgets: MonthlyBudget[],
): Map<string, MonthlyBudget> {
  const map = new Map<string, MonthlyBudget>();
  for (const b of budgets) map.set(b.month, b);
  return map;
}

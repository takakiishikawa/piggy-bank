import { NextResponse } from "next/server";
import { getAuthDb } from "@/lib/supabase/auth-db";
import { type Transaction } from "@/lib/supabase/db";
import { calcDamMonths, DAM_START_LABEL } from "@/lib/dam-calc";
import { DAM_START } from "@/lib/constants";
import {
  buildBudgetMap,
  fetchAllBudgets,
  getCurrentMonthKey,
} from "@/lib/budget";

export interface MonthRecord {
  key: string;
  label: string;
  target: number;
  spent: number;
  projected: number;
  balance: number;
  cumulative: number;
}

export async function GET() {
  const result = await getAuthDb();
  if (result instanceof NextResponse) return result;
  const { db } = result;

  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const thisMonthEnd = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0,
    23,
    59,
    59,
    999,
  );

  const [txRes, thisMonthCatRes, budgets] = await Promise.all([
    db
      .from("transactions")
      .select("amount, date, category")
      .gt("amount", 0)
      .gte("date", DAM_START.toISOString())
      .limit(100000),
    db
      .from("transactions")
      .select("amount, category")
      .gt("amount", 0)
      .gte("date", thisMonthStart.toISOString())
      .lte("date", thisMonthEnd.toISOString())
      .limit(1000),
    fetchAllBudgets(db),
  ]);

  const txs = (txRes.data ?? []) as Pick<
    Transaction,
    "amount" | "date" | "category"
  >[];
  const thisMonthCatTxs = (thisMonthCatRes.data ?? []) as Pick<
    Transaction,
    "amount" | "category"
  >[];

  const budgetMap = buildBudgetMap(budgets);
  const currentBudget = budgetMap.get(getCurrentMonthKey(now));
  const targetMonthly = currentBudget?.target_monthly ?? 0;
  const fixedCosts = currentBudget?.fixed_costs ?? 0;

  const months = calcDamMonths({ txs, budgetMap, now });

  // カテゴリ別集計
  const categoryBreakdown: Record<string, number> = {};
  for (const tx of thisMonthCatTxs) {
    categoryBreakdown[tx.category] =
      (categoryBreakdown[tx.category] ?? 0) + tx.amount;
  }

  const currentMonthRecord = months[months.length - 1];
  const thisMonthTotal = currentMonthRecord?.spent ?? 0;
  const projectedMonthTotal = currentMonthRecord?.projected ?? 0;
  const currentBalance = currentMonthRecord?.balance ?? 0;
  const cumulativeBalance = currentMonthRecord?.cumulative ?? 0;

  const achievementRate =
    targetMonthly > 0
      ? Math.max(
          0,
          Math.min(Math.round((currentBalance / targetMonthly) * 100), 100),
        )
      : 0;

  const totalPossible = months.reduce((s, m) => s + m.target, 0);
  const damLevel =
    totalPossible > 0
      ? Math.max(
          0,
          Math.min(Math.round((cumulativeBalance / totalPossible) * 100), 100),
        )
      : 0;

  const monthRecords: MonthRecord[] = months.map((m) => ({
    key: m.key,
    label: `${m.year}年${m.month + 1}月`,
    target: m.target,
    spent: m.spent,
    projected: m.projected,
    balance: m.balance,
    cumulative: m.cumulative,
  }));

  return NextResponse.json({
    targetMonthly,
    fixedCosts,
    thisMonthTotal,
    projectedMonthTotal,
    currentBalance,
    achievementRate,
    cumulativeBalance,
    damLevel,
    months: monthRecords,
    categoryBreakdown,
    damStartLabel: DAM_START_LABEL,
  });
}

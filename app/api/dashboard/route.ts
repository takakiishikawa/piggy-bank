import { NextResponse } from "next/server";
import { getAuthDb } from "@/lib/supabase/auth-db";
import { type Transaction } from "@/lib/supabase/db";
import { calcDamMonths } from "@/lib/dam-calc";
import { DAM_START, FIXED_CATEGORIES } from "@/lib/constants";
import {
  buildBudgetMap,
  fetchAllBudgets,
  getCurrentMonthKey,
} from "@/lib/budget";
import { projectMonthlyTotal, sumFixedSpent } from "@/lib/projection";

export async function GET() {
  const result = await getAuthDb();
  if (result instanceof NextResponse) return result;
  const { db } = result;

  const now = new Date();

  const last7End = new Date(now);
  last7End.setHours(23, 59, 59, 999);

  const last7Start = new Date(now);
  last7Start.setDate(last7Start.getDate() - 6);
  last7Start.setHours(0, 0, 0, 0);

  const prev7End = new Date(last7Start);
  prev7End.setMilliseconds(prev7End.getMilliseconds() - 1);

  const prev7Start = new Date(prev7End);
  prev7Start.setDate(prev7Start.getDate() - 6);
  prev7Start.setHours(0, 0, 0, 0);

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0,
    23,
    59,
    59,
    999,
  );

  const [last7Res, prev7Res, thisMonthRes, recentRes, budgets, allMonthsRes] =
    await Promise.all([
      db
        .from("transactions")
        .select("amount, category")
        .gte("date", last7Start.toISOString())
        .lte("date", last7End.toISOString()),
      db
        .from("transactions")
        .select("amount, category")
        .gte("date", prev7Start.toISOString())
        .lte("date", prev7End.toISOString()),
      db
        .from("transactions")
        .select("amount, category")
        .gte("date", monthStart.toISOString())
        .lte("date", monthEnd.toISOString()),
      (() => {
        const recentStart = new Date(now);
        recentStart.setDate(recentStart.getDate() - 2);
        recentStart.setHours(0, 0, 0, 0);
        return db
          .from("transactions")
          .select("id, store, amount, category, date")
          .gte("date", recentStart.toISOString())
          .order("date", { ascending: false })
          .limit(200);
      })(),
      fetchAllBudgets(db),
      db
        .from("transactions")
        .select("amount, date, category")
        .gt("amount", 0)
        .gte("date", DAM_START.toISOString()),
    ]);

  const errors = [
    last7Res.error,
    prev7Res.error,
    thisMonthRes.error,
    recentRes.error,
  ].filter(Boolean);
  if (errors.length > 0) {
    return NextResponse.json({ error: errors[0]!.message }, { status: 500 });
  }

  const last7Txs = (last7Res.data ?? []) as Pick<
    Transaction,
    "amount" | "category"
  >[];
  const prev7Txs = (prev7Res.data ?? []) as Pick<
    Transaction,
    "amount" | "category"
  >[];
  const thisMonthTxs = (thisMonthRes.data ?? []) as Pick<
    Transaction,
    "amount" | "category"
  >[];
  const recentTxs = (recentRes.data ?? []) as Pick<
    Transaction,
    "id" | "store" | "amount" | "category" | "date"
  >[];
  const budgetMap = buildBudgetMap(budgets);
  const currentBudget = budgetMap.get(getCurrentMonthKey(now));

  const isVariable = (tx: Pick<Transaction, "category">) =>
    !(FIXED_CATEGORIES as readonly string[]).includes(tx.category);

  const thisMonthTotal = thisMonthTxs.reduce((s, t) => s + t.amount, 0);
  const last7Total = last7Txs
    .filter(isVariable)
    .reduce((s, t) => s + t.amount, 0);
  const prev7Total = prev7Txs
    .filter(isVariable)
    .reduce((s, t) => s + t.amount, 0);

  const weekDiff =
    prev7Total > 0
      ? Math.round(((last7Total - prev7Total) / prev7Total) * 100)
      : 0;

  const targetMonthly = currentBudget?.target_monthly ?? 0;
  const fixedCosts = currentBudget?.fixed_costs ?? 0;

  // 当月の予測も /api/weekly, /api/dam と同じ式（lib/projection.ts）に統一
  const thisMonthByCategory: Record<string, number> = {};
  for (const tx of thisMonthTxs) {
    thisMonthByCategory[tx.category] =
      (thisMonthByCategory[tx.category] ?? 0) + tx.amount;
  }
  const projectedMonthTotal =
    thisMonthTotal > 0
      ? projectMonthlyTotal({
          total: thisMonthTotal,
          fixedSpent: sumFixedSpent(thisMonthByCategory),
          fixedBudget: fixedCosts,
          now,
        })
      : null;

  // 共通ユーティリティで累計ダム残高を計算
  const allMonthTxs = (allMonthsRes.data ?? []) as Pick<
    Transaction,
    "amount" | "date" | "category"
  >[];
  const damMonths = calcDamMonths({
    txs: allMonthTxs,
    budgetMap,
    now,
  });
  const cumulativeBalance = damMonths[damMonths.length - 1]?.cumulative ?? 0;

  const categoryMap: Record<string, number> = {};
  for (const tx of last7Txs) {
    categoryMap[tx.category] = (categoryMap[tx.category] ?? 0) + tx.amount;
  }
  const categoryBreakdown = Object.entries(categoryMap)
    .sort(([, a], [, b]) => b - a)
    .map(([name, value]) => ({ name, value }));

  const prevCategoryMap: Record<string, number> = {};
  for (const tx of prev7Txs) {
    prevCategoryMap[tx.category] =
      (prevCategoryMap[tx.category] ?? 0) + tx.amount;
  }

  return NextResponse.json({
    thisMonthTotal,
    projectedMonthTotal,
    thisWeekTotal: last7Total,
    lastWeekTotal: prev7Total,
    weekDiff,
    cumulativeBalance,
    targetMonthly,
    categoryBreakdown,
    prevCategoryBreakdown: prevCategoryMap,
    recentTransactions: recentTxs,
  });
}

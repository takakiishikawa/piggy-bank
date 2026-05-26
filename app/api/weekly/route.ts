import { NextRequest, NextResponse } from "next/server";
import { getAuthDb } from "@/lib/supabase/auth-db";
import { type Transaction } from "@/lib/supabase/db";
import { fetchAllBudgets, getCurrentMonthKey } from "@/lib/budget";
import { FIXED_CATEGORIES } from "@/lib/constants";
import { projectMonthlyTotal, sumFixedSpent } from "@/lib/projection";

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getWeekEnd(start: Date): Date {
  const d = new Date(start);
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d;
}

type PeriodItem = {
  label: string;
  total: number;
  byCategory: Record<string, number>;
  start: string;
  end: string;
};

type BucketDef = { label: string; start: Date; end: Date };

export async function GET(req: NextRequest) {
  const result = await getAuthDb();
  if (result instanceof NextResponse) return result;
  const { db } = result;

  const period = req.nextUrl.searchParams.get("period") ?? "week";
  const now = new Date();

  const bucketDefs: BucketDef[] = [];

  if (period === "week") {
    const thisWeekStart = getWeekStart(now);
    for (let i = 3; i >= 0; i--) {
      const ws = new Date(thisWeekStart);
      ws.setDate(ws.getDate() - i * 7);
      const we = getWeekEnd(ws);
      const m = ws.getMonth() + 1;
      const weekNum = Math.ceil(ws.getDate() / 7);
      bucketDefs.push({ label: `${m}月${weekNum}週目`, start: ws, end: we });
    }
  } else if (period === "month") {
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const start = new Date(d.getFullYear(), d.getMonth(), 1);
      const end = new Date(
        d.getFullYear(),
        d.getMonth() + 1,
        0,
        23,
        59,
        59,
        999,
      );
      const yr = String(d.getFullYear()).slice(-2);
      const m = d.getMonth() + 1;
      bucketDefs.push({ label: `${yr}年${m}月`, start, end });
    }
  } else {
    const currentYear = now.getFullYear();
    for (let y = currentYear - 2; y <= currentYear; y++) {
      bucketDefs.push({
        label: `${y}年`,
        start: new Date(y, 0, 1),
        end: new Date(y, 11, 31, 23, 59, 59, 999),
      });
    }
  }

  const [budgets, ...results] = await Promise.all([
    fetchAllBudgets(db),
    ...bucketDefs.map(({ start, end }) =>
      db
        .from("transactions")
        .select("category, amount, date")
        .gt("amount", 0)
        .gte("date", start.toISOString())
        .lte("date", end.toISOString())
        .limit(2000),
    ),
  ]);

  const currentBudget = budgets.find((b) => b.month === getCurrentMonthKey(now));
  const targetMonthly = currentBudget?.target_monthly ?? 0;
  const fixedCosts = currentBudget?.fixed_costs ?? 0;

  const periods: PeriodItem[] = bucketDefs.map(({ label, start, end }, i) => {
    const txs = (results[i].data ?? []) as Pick<
      Transaction,
      "category" | "amount" | "date"
    >[];
    const byCategory: Record<string, number> = {};
    let total = 0;
    for (const t of txs) {
      byCategory[t.category] = (byCategory[t.category] ?? 0) + t.amount;
      total += t.amount;
    }
    return {
      label,
      total,
      byCategory,
      start: start.toISOString(),
      end: end.toISOString(),
    };
  });

  const categoryTotals: Record<string, number> = {};
  for (const p of periods) {
    for (const [cat, amt] of Object.entries(p.byCategory)) {
      categoryTotals[cat] = (categoryTotals[cat] ?? 0) + amt;
    }
  }
  const topCategories = Object.entries(categoryTotals)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([cat]) => cat);

  const currentPeriod = periods[periods.length - 1];
  const prevPeriod = periods[periods.length - 2];
  const diff = (currentPeriod?.total ?? 0) - (prevPeriod?.total ?? 0);
  // 固定費（家賃・通信）は変更不可なので「気になる支出」から除外
  const topCategory =
    Object.entries(currentPeriod?.byCategory ?? {})
      .filter(([cat]) => !FIXED_CATEGORIES.includes(cat as never))
      .sort(([, a], [, b]) => b - a)[0]?.[0] ?? "—";

  const currentTotal = currentPeriod?.total ?? 0;
  const prevTotal = prevPeriod?.total ?? 0;
  let projectedTotal: number | null = null;

  // 期間中に発生済みの固定費（家賃・通信）。これは日割り対象から外す
  const fixedSpentThisPeriod = sumFixedSpent(currentPeriod?.byCategory ?? {});
  const variableSpend = Math.max(0, currentTotal - fixedSpentThisPeriod);

  if (period === "month" && currentTotal > 0) {
    // /api/dam の calcDamMonths と同一の式を使う（食い違い防止）
    projectedTotal = projectMonthlyTotal({
      total: currentTotal,
      fixedSpent: fixedSpentThisPeriod,
      fixedBudget: fixedCosts,
      now,
    });
  } else if (period === "week" && currentTotal > 0) {
    const dayOfWeek = now.getDay() === 0 ? 7 : now.getDay();
    projectedTotal = Math.round(
      fixedSpentThisPeriod + (variableSpend / dayOfWeek) * 7,
    );
  } else if (period === "year" && currentTotal > 0) {
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const dayOfYear =
      Math.floor((now.getTime() - startOfYear.getTime()) / 86400000) + 1;
    const daysInYear =
      new Date(now.getFullYear(), 1, 29).getMonth() === 1 ? 366 : 365;
    projectedTotal = Math.round(
      fixedSpentThisPeriod + (variableSpend / dayOfYear) * daysInYear,
    );
  }

  const projectedDiff =
    projectedTotal != null ? projectedTotal - prevTotal : null;

  return NextResponse.json({
    periods,
    topCategories,
    diff,
    topCategory,
    currentTotal,
    prevPeriodTotal: prevTotal,
    projectedTotal,
    projectedDiff,
    targetMonthly,
    fixedCosts,
    showYearTab: true,
  });
}

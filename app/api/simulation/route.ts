import { NextRequest, NextResponse } from "next/server";
import { getAuthDb } from "@/lib/supabase/auth-db";
import { createDb } from "@/lib/supabase/db";
import { getJpyToVndRate } from "@/lib/exchange-rate";
import { computeMonthlyBudget, computeActualSpendByMonth } from "@/lib/monthly-budget";
import {
  buildSimulationYear,
  annualIncome,
  annualExpense,
  annualSpecialExpense,
  annualRemaining,
  yearEndProjection,
  yearEndIncome,
  SIMULATION_EPOCH_YEAR,
  type SavingsMonthRecord,
  type SpecialEntry,
} from "@/lib/simulation";

type Db = ReturnType<typeof createDb>;

async function fetchYearRecords(
  db: Db,
  year: number,
): Promise<SavingsMonthRecord[]> {
  const { data } = await db
    .from("savings_months")
    .select("month, planned_savings, note")
    .gte("month", `${year}-01`)
    .lte("month", `${year}-12`);
  return (data ?? []) as SavingsMonthRecord[];
}

async function fetchYearSpecialEntries(
  db: Db,
  year: number,
): Promise<SpecialEntry[]> {
  const { data } = await db
    .from("special_entries")
    .select("id, month, kind, name, amount, currency")
    .gte("month", `${year}-01`)
    .lte("month", `${year}-12`);
  return (data ?? []) as SpecialEntry[];
}

// Chains each year's ending cumulative and last-known income into the next,
// starting from SIMULATION_EPOCH_YEAR (years before that never carry in).
async function getStartingState(
  db: Db,
  year: number,
  vndPerJpy: number,
  forecastVnd: number | null,
  lifeBudgetVnd: number,
  now: Date,
): Promise<{ cumulative: number; income: number }> {
  let cumulative = 0;
  let income = 0;
  for (let y = SIMULATION_EPOCH_YEAR; y < year; y++) {
    const [records, entries, actualByMonth] = await Promise.all([
      fetchYearRecords(db, y),
      fetchYearSpecialEntries(db, y),
      computeActualSpendByMonth(db, y),
    ]);
    const months = buildSimulationYear(
      y,
      records,
      entries,
      vndPerJpy,
      forecastVnd,
      lifeBudgetVnd,
      actualByMonth,
      now,
      cumulative,
      income,
    );
    cumulative = yearEndProjection(months);
    income = yearEndIncome(months);
  }
  return { cumulative, income };
}

export async function GET(req: NextRequest) {
  const result = await getAuthDb();
  if (result instanceof NextResponse) return result;
  const { db } = result;

  const yearParam = req.nextUrl.searchParams.get("year");
  const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();
  const now = new Date();

  const [records, specialEntries, vndPerJpy, monthlyBudget, actualByMonth] = await Promise.all([
    fetchYearRecords(db, year),
    fetchYearSpecialEntries(db, year),
    getJpyToVndRate(),
    computeMonthlyBudget(db, now),
    computeActualSpendByMonth(db, year),
  ]);

  const { forecastVnd, lifeBudgetVnd } = monthlyBudget;
  const { cumulative: startingCumulative, income: startingIncome } = await getStartingState(
    db,
    year,
    vndPerJpy,
    forecastVnd,
    lifeBudgetVnd,
    now,
  );
  const months = buildSimulationYear(
    year,
    records,
    specialEntries,
    vndPerJpy,
    forecastVnd,
    lifeBudgetVnd,
    actualByMonth,
    now,
    startingCumulative,
    startingIncome,
  );

  return NextResponse.json({
    year,
    vndPerJpy,
    months,
    annualIncome: annualIncome(months),
    annualExpense: annualExpense(months),
    annualSpecialExpense: annualSpecialExpense(months),
    annualRemaining: annualRemaining(months),
    yearEndProjection: yearEndProjection(months),
  });
}

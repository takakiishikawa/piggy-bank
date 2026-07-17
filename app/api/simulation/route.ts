import { NextRequest, NextResponse } from "next/server";
import { getAuthDb } from "@/lib/supabase/auth-db";
import { createDb } from "@/lib/supabase/db";
import { getJpyToVndRate } from "@/lib/exchange-rate";
import {
  buildSimulationYear,
  annualIncome,
  annualExpense,
  annualRemaining,
  yearEndProjection,
  SIMULATION_EPOCH_YEAR,
  type SavingsMonthRecord,
  type SpecialEntry,
} from "@/lib/simulation";

const JP_SOURCE = "jp";

type Db = ReturnType<typeof createDb>;

async function fetchYearRecords(
  db: Db,
  year: number,
): Promise<SavingsMonthRecord[]> {
  const { data } = await db
    .from("savings_months")
    .select("month, note")
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

// Chains each year's ending cumulative into the next, starting from
// SIMULATION_EPOCH_YEAR (years before that never carry a balance in).
async function getStartingCumulative(
  db: Db,
  year: number,
  defaultMonthlyIncome: number,
  vndPerJpy: number,
  now: Date,
): Promise<number> {
  let cumulative = 0;
  for (let y = SIMULATION_EPOCH_YEAR; y < year; y++) {
    const [records, entries] = await Promise.all([
      fetchYearRecords(db, y),
      fetchYearSpecialEntries(db, y),
    ]);
    const months = buildSimulationYear(y, records, defaultMonthlyIncome, entries, vndPerJpy, now, cumulative);
    cumulative = yearEndProjection(months);
  }
  return cumulative;
}

export async function GET(req: NextRequest) {
  const result = await getAuthDb();
  if (result instanceof NextResponse) return result;
  const { db } = result;

  const yearParam = req.nextUrl.searchParams.get("year");
  const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();
  const now = new Date();

  const [{ data: income }, records, specialEntries, vndPerJpy] = await Promise.all([
    db
      .from("income_sources")
      .select("default_monthly_income")
      .eq("source", JP_SOURCE)
      .maybeSingle(),
    fetchYearRecords(db, year),
    fetchYearSpecialEntries(db, year),
    getJpyToVndRate(),
  ]);

  const defaultMonthlyIncome = income?.default_monthly_income ?? 0;
  const startingCumulative = await getStartingCumulative(db, year, defaultMonthlyIncome, vndPerJpy, now);
  const months = buildSimulationYear(
    year,
    records,
    defaultMonthlyIncome,
    specialEntries,
    vndPerJpy,
    now,
    startingCumulative,
  );

  return NextResponse.json({
    year,
    defaultMonthlyIncome,
    vndPerJpy,
    months,
    annualIncome: annualIncome(months),
    annualExpense: annualExpense(months),
    annualRemaining: annualRemaining(months),
    yearEndProjection: yearEndProjection(months),
  });
}

export async function PATCH(req: NextRequest) {
  const result = await getAuthDb();
  if (result instanceof NextResponse) return result;
  const { db } = result;

  const body = await req.json();
  const defaultMonthlyIncome =
    typeof body.defaultMonthlyIncome === "number"
      ? body.defaultMonthlyIncome
      : undefined;

  if (defaultMonthlyIncome === undefined) {
    return NextResponse.json(
      { error: "defaultMonthlyIncome must be a number" },
      { status: 400 },
    );
  }

  const { error } = await db.from("income_sources").upsert({
    source: JP_SOURCE,
    default_monthly_income: defaultMonthlyIncome,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ defaultMonthlyIncome });
}

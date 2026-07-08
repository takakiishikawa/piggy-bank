import { NextRequest, NextResponse } from "next/server";
import { getAuthDb } from "@/lib/supabase/auth-db";
import {
  buildSimulationYear,
  annualTarget,
  yearEndProjection,
  type SavingsMonthRecord,
} from "@/lib/simulation";

const JP_SOURCE = "jp";

export async function GET(req: NextRequest) {
  const result = await getAuthDb();
  if (result instanceof NextResponse) return result;
  const { db } = result;

  const yearParam = req.nextUrl.searchParams.get("year");
  const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();

  const [{ data: income }, { data: records }] = await Promise.all([
    db
      .from("income_sources")
      .select("default_monthly_income")
      .eq("source", JP_SOURCE)
      .maybeSingle(),
    db
      .from("savings_months")
      .select("month, planned_savings, actual_savings")
      .gte("month", `${year}-01`)
      .lte("month", `${year}-12`),
  ]);

  const defaultMonthlyIncome = income?.default_monthly_income ?? 0;
  const months = buildSimulationYear(
    year,
    (records ?? []) as SavingsMonthRecord[],
    defaultMonthlyIncome,
  );

  return NextResponse.json({
    year,
    defaultMonthlyIncome,
    months,
    annualTarget: annualTarget(months),
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

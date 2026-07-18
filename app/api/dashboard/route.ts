import { NextResponse } from "next/server";
import { getAuthDb } from "@/lib/supabase/auth-db";
import { computeMonthlyBudget } from "@/lib/monthly-budget";

export async function GET() {
  const result = await getAuthDb();
  if (result instanceof NextResponse) return result;
  const { db } = result;

  const budget = await computeMonthlyBudget(db);
  const savingsImpactVnd =
    budget.forecastVnd !== null ? budget.lifeBudgetVnd - budget.forecastVnd : null;

  return NextResponse.json({
    ...budget,
    savingsImpactVnd,
  });
}

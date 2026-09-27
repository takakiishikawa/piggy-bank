import { NextResponse } from "next/server";
import { getAuthDb } from "@/lib/supabase/auth-db";
import { computeMonthlyBudget } from "@/lib/monthly-budget";
import { fetchCashWallet, monthKeyOf } from "@/lib/cash";

export async function GET() {
  const result = await getAuthDb();
  if (result instanceof NextResponse) return result;
  const { db } = result;

  const [budget, wallet] = await Promise.all([
    computeMonthlyBudget(db),
    fetchCashWallet(db, monthKeyOf(new Date())),
  ]);
  const savingsImpactVnd =
    budget.forecastVnd !== null ? budget.lifeBudgetVnd - budget.forecastVnd : null;

  return NextResponse.json({
    ...budget,
    savingsImpactVnd,
    // 現金財布(繰越込み): 残高と、今月使えた額(繰越 + 今月の引き出し)
    cashBalanceVnd: wallet.balanceVnd,
    cashAvailableVnd: wallet.carriedOverVnd + wallet.withdrawnVnd,
  });
}

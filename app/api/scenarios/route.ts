import { NextRequest, NextResponse } from "next/server";
import { getAuthDb } from "@/lib/supabase/auth-db";
import { getJpyToVndRate } from "@/lib/exchange-rate";
import { computeActualSpendThisYear } from "@/lib/monthly-budget";
import { scenarioConfigSchema, normalizeScenarioConfig, DEFAULT_SCENARIO_CONFIG } from "@/lib/scenario/types";

// シナリオ一覧 + 為替レート(暮らしのVND予算をJPYへ換算するため)を1回で返す。
// 「暮らし」の実額自体は /api/categories, /api/categories/overrides を別途叩く
// (Budgetページと同じ既存エンドポイントをそのまま流用)。今年ぶんは実績
// (actualByCategoryVnd: 年初来累計、actualByCategoryMonthVnd: 月別)も返し、
// compute.ts側で「今年は予算だけでなく実績も踏まえたprojection」に使う。
// investmentEntriesは、ダッシュボードの「投資を記録」で登録した実際の投資記録
// (経過済みの月の「投資」実額に使う。まだ何も無ければ¥0のまま)。
export async function GET() {
  const result = await getAuthDb();
  if (result instanceof NextResponse) return result;
  const { db } = result;

  const [scenariosRes, vndPerJpy, actualSpend, investmentsRes] = await Promise.all([
    db
      .from("scenarios")
      .select("id, name, is_primary, config, created_at, updated_at")
      .order("created_at", { ascending: true }),
    getJpyToVndRate(),
    computeActualSpendThisYear(db),
    db.from("investment_entries").select("amount_vnd, invested_on, note").order("invested_on", { ascending: true }),
  ]);

  if (scenariosRes.error) {
    return NextResponse.json({ error: scenariosRes.error.message }, { status: 500 });
  }

  // 収入モデル・cohabitation等を後から追加したため、古い形のまま保存されている
  // シナリオがあってもクラッシュしないよう、返す前にデフォルト値で補完する。
  const scenarios = (scenariosRes.data ?? []).map((s) => ({
    ...s,
    config: normalizeScenarioConfig(s.config),
  }));

  const investmentEntries = (investmentsRes.data ?? []).map((e) => ({
    amountVnd: e.amount_vnd as number,
    investedOn: e.invested_on as string,
    name: (e.note as string | null) ?? null,
  }));

  return NextResponse.json({
    scenarios,
    vndPerJpy,
    actualByCategoryVnd: actualSpend.byCategory,
    actualByCategoryMonthVnd: actualSpend.byCategoryMonth,
    investmentEntries,
  });
}

export async function POST(req: NextRequest) {
  const result = await getAuthDb();
  if (result instanceof NextResponse) return result;
  const { db } = result;

  const body = await req.json();
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name || name.length > 50) {
    return NextResponse.json({ error: "name must be 1–50 characters" }, { status: 400 });
  }
  const configParsed = scenarioConfigSchema.safeParse(body.config ?? DEFAULT_SCENARIO_CONFIG);
  if (!configParsed.success) {
    return NextResponse.json({ error: "invalid config" }, { status: 400 });
  }

  const { data, error } = await db
    .from("scenarios")
    .insert({ name, config: configParsed.data, is_primary: false })
    .select("id, name, is_primary, config, created_at, updated_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

import { NextRequest, NextResponse } from "next/server";
import { getAuthDb } from "@/lib/supabase/auth-db";
import { fetchAllRows } from "@/lib/supabase/fetch-all";

export async function GET() {
  const result = await getAuthDb();
  if (result instanceof NextResponse) return result;
  const { db } = result;

  const [catsRes, txRows] = await Promise.all([
    db
      .from("categories")
      .select("id, name, budget, is_fixed, renewal_cycle_years, renewal_fee_months")
      .order("created_at"),
    // .limit(100000) でもサーバー側の上限(1000行)で切られるため全件取り切る。
    fetchAllRows<{ category: string | null; amount: number | null }>((from, to) =>
      db.from("transactions").select("category, amount").order("id", { ascending: true }).range(from, to),
    ),
  ]);

  if (catsRes.error) {
    return NextResponse.json({ error: catsRes.error.message }, { status: 500 });
  }

  const totals: Record<string, number> = {};
  for (const t of txRows) {
    if (t.category)
      totals[t.category] = (totals[t.category] ?? 0) + (t.amount ?? 0);
  }

  const sorted = (catsRes.data ?? []).slice().sort((a, b) => {
    const diff = (totals[b.name] ?? 0) - (totals[a.name] ?? 0);
    if (diff !== 0) return diff;
    return a.name.localeCompare(b.name, "ja");
  });

  // used: 取引で1件でも使われているか(Transactions画面のカテゴリチップを、使用中の
  // カテゴリだけに絞るのに使う)。
  return NextResponse.json(sorted.map((c) => ({ ...c, used: (totals[c.name] ?? 0) > 0 })));
}

export async function POST(req: NextRequest) {
  const result = await getAuthDb();
  if (result instanceof NextResponse) return result;
  const { db } = result;

  const body = await req.json();
  const trimmed = typeof body.name === "string" ? body.name.trim() : "";
  if (!trimmed || trimmed.length > 50) {
    return NextResponse.json(
      { error: "name must be 1–50 characters" },
      { status: 400 },
    );
  }
  const budget = typeof body.budget === "number" ? Math.max(0, Math.round(body.budget)) : 0;
  const is_fixed = body.is_fixed === true;

  const { data, error } = await db
    .from("categories")
    .insert({ name: trimmed, budget, is_fixed })
    .select("id, name, budget, is_fixed")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

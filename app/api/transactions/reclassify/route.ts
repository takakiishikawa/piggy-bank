import { NextRequest, NextResponse } from "next/server";
import { getAuthDb } from "@/lib/supabase/auth-db";
import { saveStoreRules } from "@/lib/store-rules";

export async function POST(req: NextRequest) {
  const result = await getAuthDb();
  if (result instanceof NextResponse) return result;
  const { db } = result;

  const body = await req.json();
  const store = typeof body.store === "string" ? body.store.trim() : null;
  const query = typeof body.query === "string" ? body.query.trim() : null;
  const category =
    typeof body.category === "string" ? body.category.trim() : null;

  if ((!store && !query) || !category) {
    return NextResponse.json(
      { error: "store or query, and category are required" },
      { status: 400 },
    );
  }

  // カテゴリが存在しなければ追加
  const { data: existing } = await db
    .from("categories")
    .select("name")
    .eq("name", category)
    .maybeSingle();

  if (!existing) {
    await db.from("categories").insert({ name: category });
  }

  const updateQuery = db
    .from("transactions")
    .update({ category, reviewed: true })
    .select("id, store");

  const { error, data } = store
    ? await updateQuery.eq("store", store)
    : await updateQuery.ilike("store", `%${query}%`);

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  // 手動修正を正解ルールとして記録 → 次回以降の同期で同じ店舗に自動適用。
  // store 指定はその店舗、query 指定はマッチした全店舗ぶんのルールを作る。
  const touchedStores = store
    ? [store]
    : (data ?? []).map((r) => r.store as string);
  await saveStoreRules(db, touchedStores, category);

  return NextResponse.json({ updated: data?.length ?? 0 });
}

import { NextRequest, NextResponse } from "next/server";
import { getAuthDb } from "@/lib/supabase/auth-db";
import { saveStoreRules } from "@/lib/store-rules";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await getAuthDb();
  if (result instanceof NextResponse) return result;
  const { db } = result;

  const { id } = await params;
  const body = await req.json();
  const category =
    typeof body.category === "string" ? body.category.trim() : null;

  if (!category) {
    return NextResponse.json(
      { error: "category is required" },
      { status: 400 },
    );
  }

  const { data, error } = await db
    .from("transactions")
    .update({ category, reviewed: true })
    .eq("id", id)
    .select("id, store, amount, category, date")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 手動修正を正解ルールとして記録 → 次回以降の同期で同じ店舗に自動適用
  if (data?.store) {
    await saveStoreRules(db, [data.store], category);
  }

  return NextResponse.json(data);
}

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
  const note =
    typeof body.note === "string"
      ? body.note.trim() || null
      : body.note === null
        ? null
        : undefined;

  if (!category && note === undefined) {
    return NextResponse.json(
      { error: "category and/or note is required" },
      { status: 400 },
    );
  }

  const update: { category?: string; reviewed?: boolean; note?: string | null } = {};
  if (category) {
    update.category = category;
    update.reviewed = true;
  }
  if (note !== undefined) update.note = note;

  const { data, error } = await db
    .from("transactions")
    .update(update)
    .eq("id", id)
    .select("id, store, amount, category, date, note")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 手動修正を正解ルールとして記録 → 次回以降の同期で同じ店舗に自動適用
  if (category && data?.store) {
    await saveStoreRules(db, [data.store], category);
  }

  return NextResponse.json(data);
}

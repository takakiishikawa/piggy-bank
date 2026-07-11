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
  const excludedFromDashboard =
    typeof body.excludedFromDashboard === "boolean"
      ? body.excludedFromDashboard
      : undefined;

  if (!category && note === undefined && excludedFromDashboard === undefined) {
    return NextResponse.json(
      { error: "category, note, and/or excludedFromDashboard is required" },
      { status: 400 },
    );
  }

  const update: {
    category?: string;
    reviewed?: boolean;
    note?: string | null;
    excluded_from_dashboard?: boolean;
  } = {};
  if (category) {
    update.category = category;
    update.reviewed = true;
  }
  if (note !== undefined) update.note = note;
  if (excludedFromDashboard !== undefined)
    update.excluded_from_dashboard = excludedFromDashboard;

  const { data, error } = await db
    .from("transactions")
    .update(update)
    .eq("id", id)
    .select("id, store, amount, category, date, note, excluded_from_dashboard")
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

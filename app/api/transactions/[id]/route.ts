import { NextRequest, NextResponse } from "next/server";
import { getAuthDb } from "@/lib/supabase/auth-db";
import { saveStoreRules } from "@/lib/store-rules";

function monthKeyFromDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

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
  const specialExpense =
    typeof body.specialExpense === "boolean" ? body.specialExpense : undefined;

  if (!category && note === undefined && specialExpense === undefined) {
    return NextResponse.json(
      { error: "category, note, and/or specialExpense is required" },
      { status: 400 },
    );
  }

  // Flagging a transaction as a special expense excludes it from the
  // dashboard (like the old "excluded" toggle) and mirrors it into
  // special_entries so it shows up in the Simulation page. Un-flagging
  // removes the mirrored entry and un-excludes it.
  if (specialExpense !== undefined) {
    const { data: tx, error: fetchError } = await db
      .from("transactions")
      .select("store, amount, date, special_entry_id")
      .eq("id", id)
      .single();

    if (fetchError || !tx) {
      return NextResponse.json(
        { error: fetchError?.message ?? "Transaction not found" },
        { status: 404 },
      );
    }

    if (specialExpense && !tx.special_entry_id) {
      const { data: entry, error: insertError } = await db
        .from("special_entries")
        .insert({
          month: monthKeyFromDate(tx.date),
          kind: "expense",
          name: tx.store,
          amount: tx.amount,
          currency: "VND",
        })
        .select("id")
        .single();

      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }

      await db
        .from("transactions")
        .update({ excluded_from_dashboard: true, special_entry_id: entry.id })
        .eq("id", id);
    } else if (!specialExpense && tx.special_entry_id) {
      await db.from("special_entries").delete().eq("id", tx.special_entry_id);
      await db
        .from("transactions")
        .update({ excluded_from_dashboard: false, special_entry_id: null })
        .eq("id", id);
    }
  }

  const update: {
    category?: string;
    reviewed?: boolean;
    note?: string | null;
  } = {};
  if (category) {
    update.category = category;
    update.reviewed = true;
  }
  if (note !== undefined) update.note = note;

  if (Object.keys(update).length > 0) {
    const { error } = await db.from("transactions").update(update).eq("id", id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  const { data, error } = await db
    .from("transactions")
    .select("id, store, amount, category, date, note, excluded_from_dashboard, special_entry_id")
    .eq("id", id)
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

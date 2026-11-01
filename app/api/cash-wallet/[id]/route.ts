import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthDb } from "@/lib/supabase/auth-db";
import { monthKeyOf, spendableCashVnd } from "@/lib/cash";

const patchSchema = z
  .object({
    amountVnd: z.number().int().min(1).optional(),
    category: z.string().trim().min(1).max(50).optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    note: z.string().trim().max(200).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0);

// 記録した現金支出(日付・カテゴリ・メモ・金額)を直す。銀行から取り込んだ取引は対象外。
// 直した結果、財布残高がマイナスになる場合は元に戻して 422 を返す。
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const result = await getAuthDb();
  if (result instanceof NextResponse) return result;
  const { db } = result;

  const { id } = await ctx.params;
  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const { amountVnd, category, date, note } = parsed.data;

  const { data: before } = await db
    .from("transactions")
    .select("id, amount, category, date, note")
    .eq("id", id)
    .eq("source", "cash")
    .maybeSingle();
  if (!before) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  if (category !== undefined && category !== before.category) {
    const { data: cat } = await db.from("categories").select("name").eq("name", category).maybeSingle();
    if (!cat) {
      return NextResponse.json({ error: "category not found" }, { status: 400 });
    }
  }

  const update: { amount?: number; category?: string; date?: string; note?: string | null } = {};
  if (amountVnd !== undefined) update.amount = amountVnd;
  if (category !== undefined) update.category = category;
  if (note !== undefined) update.note = note || null;
  let at = new Date(before.date);
  if (date !== undefined) {
    const [y, m, d] = date.split("-").map(Number);
    // 日付だけの入力なので、タイムゾーンで前後の月にずれないよう正午にしておく。
    at = new Date(y, m - 1, d, 12);
    update.date = at.toISOString();
  }

  const { data, error } = await db
    .from("transactions")
    .update(update)
    .eq("id", id)
    .eq("source", "cash")
    .select("id, amount, category, date, note")
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 金額を増やしたり日付を前に動かしたりで残高がマイナスになったら元に戻す。
  if (amountVnd !== undefined || date !== undefined) {
    const spendable = await spendableCashVnd(db, monthKeyOf(at));
    if (spendable < 0) {
      await db
        .from("transactions")
        .update({ amount: before.amount, category: before.category, date: before.date, note: before.note })
        .eq("id", id)
        .eq("source", "cash");
      return NextResponse.json(
        { error: "exceeds_balance", balanceVnd: spendable + (amountVnd ?? before.amount) },
        { status: 422 },
      );
    }
  }

  return NextResponse.json(data);
}

// 記録した現金支出を取り消す(財布に戻る)。銀行から取り込んだ取引は消さない。
export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const result = await getAuthDb();
  if (result instanceof NextResponse) return result;
  const { db } = result;

  const { id } = await ctx.params;
  const { error, count } = await db
    .from("transactions")
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("source", "cash");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!count) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

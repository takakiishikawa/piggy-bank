import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthDb } from "@/lib/supabase/auth-db";
import { type Transaction } from "@/lib/supabase/db";
import { CASH_CATEGORY, fetchCashWallet, monthKeyOf } from "@/lib/cash";

// 現金財布(lib/cash.ts)。その月のATM引き出し額と、記録済みの現金支出を返す。
export async function GET(req: NextRequest) {
  const result = await getAuthDb();
  if (result instanceof NextResponse) return result;
  const { db } = result;

  const monthParam = req.nextUrl.searchParams.get("month");
  const month = monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : monthKeyOf(new Date());
  return NextResponse.json(await fetchCashWallet(db, month));
}

const postSchema = z.object({
  amountVnd: z.number().int().min(1),
  category: z.string().trim().min(1).max(50),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().trim().max(200).optional(),
});

// 現金支出を記録する。特定の引き出しとは紐づけず、その月の財布から差し引く。
// 財布残高(その月の引き出し額 − 記録済み)を超える記録はできない。
export async function POST(req: NextRequest) {
  const result = await getAuthDb();
  if (result instanceof NextResponse) return result;
  const { db } = result;

  const parsed = postSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const { amountVnd, category, date, note } = parsed.data;
  if (category === CASH_CATEGORY) {
    return NextResponse.json({ error: "invalid category" }, { status: 400 });
  }

  const { data: cat } = await db.from("categories").select("name").eq("name", category).maybeSingle();
  if (!cat) {
    return NextResponse.json({ error: "category not found" }, { status: 400 });
  }

  const [y, m, d] = date.split("-").map(Number);
  // 日付だけの入力なので、タイムゾーンで前後の月にずれないよう正午にしておく。
  const at = new Date(y, m - 1, d, 12);
  const wallet = await fetchCashWallet(db, monthKeyOf(at));
  if (amountVnd > wallet.unallocatedVnd) {
    return NextResponse.json(
      { error: "exceeds_balance", balanceVnd: wallet.unallocatedVnd },
      { status: 422 },
    );
  }

  const { data, error } = await db
    .from("transactions")
    .insert({
      id: crypto.randomUUID(),
      gmail_id: null,
      store: "現金",
      amount: amountVnd,
      date: at.toISOString(),
      category,
      reviewed: true,
      source: "cash",
      external_id: null,
      note: note || null,
    } satisfies Omit<Transaction, "created_at" | "excluded_from_dashboard" | "special_entry_id">)
    .select("id, amount, category, date, note")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

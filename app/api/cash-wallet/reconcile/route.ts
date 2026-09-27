import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthDb } from "@/lib/supabase/auth-db";
import { type Transaction } from "@/lib/supabase/db";
import {
  CASH_CATEGORY,
  CASH_UNITEMIZED_STORE,
  fetchCashWallet,
  monthKeyOf,
} from "@/lib/cash";

const postSchema = z.object({
  onHandVnd: z.number().int().min(0),
});

// 手元の現金に合わせる。財布残高と実際の手元の現金の差額(何に使ったか分からない分)を
// 今日の日付で「現金(内訳なし)」の支出として記録し、残高を手元の額にそろえる。
export async function POST(req: NextRequest) {
  const result = await getAuthDb();
  if (result instanceof NextResponse) return result;
  const { db } = result;

  const parsed = postSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const { onHandVnd } = parsed.data;

  const now = new Date();
  const wallet = await fetchCashWallet(db, monthKeyOf(now));
  const diffVnd = wallet.balanceVnd - onHandVnd;
  if (diffVnd < 0) {
    // 手元の方が多い = 引き出しがまだ取り込まれていない等。支出を増やす操作では
    // 合わせられないので、利用者に確認してもらう。
    return NextResponse.json(
      { error: "on_hand_exceeds_balance", balanceVnd: wallet.balanceVnd },
      { status: 422 },
    );
  }
  if (diffVnd === 0) {
    return NextResponse.json({ recordedVnd: 0 });
  }

  const { error } = await db.from("transactions").insert({
    id: crypto.randomUUID(),
    gmail_id: null,
    store: CASH_UNITEMIZED_STORE,
    amount: diffVnd,
    date: now.toISOString(),
    category: CASH_CATEGORY,
    reviewed: true,
    source: "cash",
    external_id: null,
    note: null,
  } satisfies Omit<Transaction, "created_at" | "excluded_from_dashboard" | "special_entry_id">);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ recordedVnd: diffVnd });
}

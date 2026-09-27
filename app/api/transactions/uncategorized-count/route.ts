import { NextResponse } from "next/server";
import { getAuthDb } from "@/lib/supabase/auth-db";
import { FALLBACK_CATEGORY } from "@/lib/constants";

export async function GET() {
  const result = await getAuthDb();
  if (result instanceof NextResponse) return result;
  const { db } = result;

  // Transactionsページの「未分類」バッジ(needsCategory)と同じ判定基準に揃える:
  // 未レビューかつフォールバックカテゴリの取引「件数」をそのまま返す
  // (以前は店名のユニーク数を返していたため、実際の未分類件数とズレていた)。
  const { count, error } = await db
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("category", FALLBACK_CATEGORY)
    .eq("reviewed", false)
    // 特別支出はカテゴリなし扱いなので未分類に数えない
    .is("special_entry_id", null);

  if (error) return NextResponse.json({ count: 0 });

  return NextResponse.json({ count: count ?? 0 });
}

import { NextResponse } from "next/server";
import { getAuthDb } from "@/lib/supabase/auth-db";
import { getCurrentMonthKey } from "@/lib/budget";
import { reviewMonthKey, type MonthlyReviewStatus } from "@/lib/monthly-review";

// GET: 先月のふりかえりを自動表示するか(全画面共通のポップアップの判定に使う)。
export async function GET() {
  const result = await getAuthDb();
  if (result instanceof NextResponse) return result;
  const { db } = result;

  const month = reviewMonthKey();
  const [mizuhoRes, reviewRes] = await Promise.all([
    db.from("mizuho_monthly_imports").select("month").eq("month", getCurrentMonthKey()).maybeSingle(),
    db.from("monthly_reviews").select("dismissed_at").eq("month", month).maybeSingle(),
  ]);

  // テーブル未作成(migration 未適用)などで読めないときは、閉じた記録を残せず
  // 毎回出てしまうため自動表示しない。
  const status: MonthlyReviewStatus = {
    month,
    mizuhoDone: !!mizuhoRes.data,
    dismissed: !!reviewRes.error || !!reviewRes.data?.dismissed_at,
  };
  return NextResponse.json(status);
}

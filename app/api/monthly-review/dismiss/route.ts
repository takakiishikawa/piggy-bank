import { NextResponse } from "next/server";
import { getAuthDb } from "@/lib/supabase/auth-db";
import { reviewMonthKey } from "@/lib/monthly-review";

// POST: 自動表示のふりかえりを閉じた。その月はもう自動では出さない。
export async function POST() {
  const result = await getAuthDb();
  if (result instanceof NextResponse) return result;
  const { db } = result;

  const month = reviewMonthKey();
  const { error } = await db
    .from("monthly_reviews")
    .upsert({ month, dismissed_at: new Date().toISOString() }, { onConflict: "month" });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ month });
}

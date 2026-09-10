import { NextResponse } from "next/server";
import { getAuthDb } from "@/lib/supabase/auth-db";

// POST: 「日本側の支出なし」。今月はみずほCSVの取込が不要だったと記録し、
// バナーを非表示にする(来月1日にまた表示)。
export async function POST() {
  const result = await getAuthDb();
  if (result instanceof NextResponse) return result;
  const { db } = result;

  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const { error } = await db
    .from("mizuho_monthly_imports")
    .upsert({ month, status: "no_expense", imported_count: 0 }, { onConflict: "month" });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ month, status: "no_expense" });
}

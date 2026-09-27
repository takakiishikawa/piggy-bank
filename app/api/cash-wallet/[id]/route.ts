import { NextResponse } from "next/server";
import { getAuthDb } from "@/lib/supabase/auth-db";

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

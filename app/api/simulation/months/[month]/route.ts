import { NextRequest, NextResponse } from "next/server";
import { getAuthDb } from "@/lib/supabase/auth-db";

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ month: string }> },
) {
  const result = await getAuthDb();
  if (result instanceof NextResponse) return result;
  const { db } = result;

  const { month } = await ctx.params;
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "invalid month" }, { status: 400 });
  }

  const body = await req.json();
  const note =
    typeof body.note === "string"
      ? body.note.trim() || null
      : body.note === null
        ? null
        : undefined;

  if (note === undefined) {
    return NextResponse.json({ error: "note is required" }, { status: 400 });
  }

  const payload = {
    month,
    note,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await db
    .from("savings_months")
    .upsert(payload)
    .select("month, note")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    month: data.month,
    note: data.note,
  });
}

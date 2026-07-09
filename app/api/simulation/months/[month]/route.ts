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
  const planned =
    typeof body.planned === "number" ? body.planned : undefined;
  const actual =
    typeof body.actual === "number"
      ? body.actual
      : body.actual === null
        ? null
        : undefined;
  const note =
    typeof body.note === "string"
      ? body.note.trim() || null
      : body.note === null
        ? null
        : undefined;

  if (planned === undefined && actual === undefined && note === undefined) {
    return NextResponse.json(
      { error: "planned, actual, and/or note is required" },
      { status: 400 },
    );
  }

  const { data: existing } = await db
    .from("savings_months")
    .select("planned_savings, actual_savings, note")
    .eq("month", month)
    .maybeSingle();

  const payload = {
    month,
    planned_savings: planned ?? existing?.planned_savings ?? 0,
    actual_savings: actual !== undefined ? actual : (existing?.actual_savings ?? null),
    note: note !== undefined ? note : (existing?.note ?? null),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await db
    .from("savings_months")
    .upsert(payload)
    .select("month, planned_savings, actual_savings, note")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    month: data.month,
    planned: data.planned_savings,
    actual: data.actual_savings,
    note: data.note,
  });
}

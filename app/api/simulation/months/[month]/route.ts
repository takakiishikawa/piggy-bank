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
  const income =
    typeof body.income === "number" ? body.income : undefined;
  const note =
    typeof body.note === "string"
      ? body.note.trim() || null
      : body.note === null
        ? null
        : undefined;

  if (income === undefined && note === undefined) {
    return NextResponse.json(
      { error: "income and/or note is required" },
      { status: 400 },
    );
  }

  const { data: existing } = await db
    .from("savings_months")
    .select("planned_savings, note")
    .eq("month", month)
    .maybeSingle();

  const payload = {
    month,
    planned_savings: income !== undefined ? income : (existing?.planned_savings ?? 0),
    note: note !== undefined ? note : (existing?.note ?? null),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await db
    .from("savings_months")
    .upsert(payload)
    .select("month, planned_savings, note")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    month: data.month,
    income: data.planned_savings,
    note: data.note,
  });
}

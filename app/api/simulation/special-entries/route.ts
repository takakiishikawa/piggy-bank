import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthDb } from "@/lib/supabase/auth-db";
import type { SpecialEntry } from "@/lib/simulation";

const CreateSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, "month must be YYYY-MM"),
  kind: z.enum(["income", "expense"]),
  name: z.string().trim().min(1, "Name is required").max(120),
  amount: z.number(),
});

export async function POST(req: Request) {
  const result = await getAuthDb();
  if (result instanceof NextResponse) return result;
  const { db } = result;

  let parsed;
  try {
    parsed = CreateSchema.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Invalid request" },
      { status: 400 },
    );
  }

  const { data, error } = await db
    .from("special_entries")
    .insert(parsed)
    .select("id, month, kind, name, amount")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data as SpecialEntry, { status: 201 });
}

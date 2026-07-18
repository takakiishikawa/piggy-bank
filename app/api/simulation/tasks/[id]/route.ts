import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthDb } from "@/lib/supabase/auth-db";

const PatchSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    done: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "No fields to update" });

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const result = await getAuthDb();
  if (result instanceof NextResponse) return result;
  const { db } = result;

  let parsed;
  try {
    parsed = PatchSchema.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Invalid request" },
      { status: 400 },
    );
  }

  const update: { title?: string; start_date?: string | null; done?: boolean; updated_at: string } = {
    updated_at: new Date().toISOString(),
  };
  if (parsed.title !== undefined) update.title = parsed.title;
  if (parsed.startDate !== undefined) update.start_date = parsed.startDate;
  if (parsed.done !== undefined) update.done = parsed.done;

  const { data, error } = await db
    .from("simulation_tasks")
    .update(update)
    .eq("id", id)
    .select("id, thread_id, title, start_date, done, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const result = await getAuthDb();
  if (result instanceof NextResponse) return result;
  const { db } = result;

  const { error } = await db.from("simulation_tasks").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

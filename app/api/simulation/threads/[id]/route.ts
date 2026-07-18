import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthDb } from "@/lib/supabase/auth-db";

const PatchSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(80).optional(),
    closed: z.boolean().optional(),
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

  const update: { title?: string; closed_at?: string | null; updated_at: string } = {
    updated_at: new Date().toISOString(),
  };
  if (parsed.title !== undefined) update.title = parsed.title;
  if (parsed.closed !== undefined) update.closed_at = parsed.closed ? new Date().toISOString() : null;

  const { data, error } = await db
    .from("simulation_threads")
    .update(update)
    .eq("id", id)
    .select("id, title, created_at, closed_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ id: data.id, title: data.title, createdAt: data.created_at, closedAt: data.closed_at });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const result = await getAuthDb();
  if (result instanceof NextResponse) return result;
  const { db } = result;

  const { error } = await db.from("simulation_threads").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

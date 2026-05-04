import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthDb } from "@/lib/supabase/auth-db";
import type { Wish } from "@/lib/supabase/db";

export const maxDuration = 30;

const PriorityEnum = z.enum(["high", "mid", "low"]);
const StatusEnum = z.enum(["want", "got", "gave_up"]);

const PatchSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    price: z.number().int().nonnegative().nullable().optional(),
    url: z.string().trim().url().max(2000).nullable().optional(),
    note: z.string().trim().max(2000).nullable().optional(),
    priority: PriorityEnum.optional(),
    status: StatusEnum.optional(),
    image_url: z.string().trim().url().max(2000).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "更新項目がありません",
  });

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
      { error: e instanceof Error ? e.message : "不正なリクエストです" },
      { status: 400 },
    );
  }

  const { data, error } = await db
    .from("wishes")
    .update({ ...parsed, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data as Wish);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const result = await getAuthDb();
  if (result instanceof NextResponse) return result;
  const { db } = result;

  const { error } = await db.from("wishes").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

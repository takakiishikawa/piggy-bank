import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthDb } from "@/lib/supabase/auth-db";
import type { Wish } from "@/lib/supabase/db";

export const maxDuration = 30;

const PriorityEnum = z.enum(["high", "mid", "low"]);
const StatusEnum = z.enum(["want", "got", "gave_up"]);

const CreateSchema = z.object({
  name: z.string().trim().min(1, "名前は必須です").max(120),
  price: z.number().int().nonnegative().nullable().optional(),
  url: z.string().trim().url().max(2000).nullable().optional(),
  note: z.string().trim().max(2000).nullable().optional(),
  priority: PriorityEnum.optional(),
  status: StatusEnum.optional(),
  image_url: z.string().trim().url().max(2000).nullable().optional(),
});

export async function GET() {
  const result = await getAuthDb();
  if (result instanceof NextResponse) return result;
  const { db } = result;

  const { data, error } = await db
    .from("wishes")
    .select("*")
    .order("status", { ascending: true })
    .order("priority", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json((data ?? []) as Wish[]);
}

export async function POST(req: Request) {
  const result = await getAuthDb();
  if (result instanceof NextResponse) return result;
  const { db } = result;

  let parsed;
  try {
    parsed = CreateSchema.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "不正なリクエストです" },
      { status: 400 },
    );
  }

  const { data, error } = await db
    .from("wishes")
    .insert({
      name: parsed.name,
      price: parsed.price ?? null,
      url: parsed.url ?? null,
      note: parsed.note ?? null,
      priority: parsed.priority ?? "mid",
      status: parsed.status ?? "want",
      image_url: parsed.image_url ?? null,
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data as Wish, { status: 201 });
}

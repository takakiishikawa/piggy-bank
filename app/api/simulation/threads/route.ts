import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthDb } from "@/lib/supabase/auth-db";

const CreateSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(80),
});

export async function GET() {
  const result = await getAuthDb();
  if (result instanceof NextResponse) return result;
  const { db } = result;

  const { data, error } = await db
    .from("simulation_threads")
    .select("id, title, created_at, notes:simulation_notes(count)")
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const threads = (data ?? []).map((t) => ({
    id: t.id,
    title: t.title,
    createdAt: t.created_at,
    noteCount: (t.notes as { count: number }[] | null)?.[0]?.count ?? 0,
  }));

  return NextResponse.json(threads);
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
      { error: e instanceof Error ? e.message : "Invalid request" },
      { status: 400 },
    );
  }

  const { data, error } = await db
    .from("simulation_threads")
    .insert({ title: parsed.title })
    .select("id, title, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    { id: data.id, title: data.title, createdAt: data.created_at, noteCount: 0 },
    { status: 201 },
  );
}

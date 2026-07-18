import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthDb } from "@/lib/supabase/auth-db";

const CreateSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "startDate must be YYYY-MM-DD").nullable().optional(),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const result = await getAuthDb();
  if (result instanceof NextResponse) return result;
  const { db } = result;

  const { data, error } = await db
    .from("simulation_tasks")
    .select("id, thread_id, title, start_date, done, created_at, comments:simulation_task_comments(count)")
    .eq("thread_id", id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const tasks = (data ?? []).map((t) => ({
    id: t.id,
    thread_id: t.thread_id,
    title: t.title,
    start_date: t.start_date,
    done: t.done,
    created_at: t.created_at,
    commentCount: (t.comments as { count: number }[] | null)?.[0]?.count ?? 0,
  }));

  return NextResponse.json(tasks);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
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
    .from("simulation_tasks")
    .insert({
      thread_id: id,
      title: parsed.title,
      start_date: parsed.startDate ?? null,
    })
    .select("id, thread_id, title, start_date, done, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ...data, commentCount: 0 }, { status: 201 });
}

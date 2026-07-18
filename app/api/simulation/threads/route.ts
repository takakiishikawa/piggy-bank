import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthDb } from "@/lib/supabase/auth-db";

const CreateSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(80),
});

export async function GET(req: NextRequest) {
  const result = await getAuthDb();
  if (result instanceof NextResponse) return result;
  const { db } = result;

  const wantClosed = req.nextUrl.searchParams.get("closed") === "true";

  const [{ data: threadRows, error: threadsError }, { data: taskRows, error: tasksError }] =
    await Promise.all([
      (() => {
        let q = db
          .from("simulation_threads")
          .select("id, title, created_at, closed_at, notes:simulation_notes(count)")
          .order("created_at", { ascending: true });
        q = wantClosed ? q.not("closed_at", "is", null) : q.is("closed_at", null);
        return q;
      })(),
      db.from("simulation_tasks").select("thread_id, done"),
    ]);

  if (threadsError) {
    return NextResponse.json({ error: threadsError.message }, { status: 500 });
  }
  if (tasksError) {
    return NextResponse.json({ error: tasksError.message }, { status: 500 });
  }

  const taskCounts = new Map<string, { total: number; open: number }>();
  for (const t of taskRows ?? []) {
    const entry = taskCounts.get(t.thread_id) ?? { total: 0, open: 0 };
    entry.total += 1;
    if (!t.done) entry.open += 1;
    taskCounts.set(t.thread_id, entry);
  }

  const threads = (threadRows ?? []).map((t) => {
    const tc = taskCounts.get(t.id) ?? { total: 0, open: 0 };
    return {
      id: t.id,
      title: t.title,
      createdAt: t.created_at,
      closedAt: t.closed_at,
      noteCount: (t.notes as { count: number }[] | null)?.[0]?.count ?? 0,
      taskCount: tc.total,
      openTaskCount: tc.open,
    };
  });

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
    { id: data.id, title: data.title, createdAt: data.created_at, closedAt: null, noteCount: 0, taskCount: 0, openTaskCount: 0 },
    { status: 201 },
  );
}

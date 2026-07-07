import { NextRequest, NextResponse } from "next/server";
import { getAuthDb } from "@/lib/supabase/auth-db";

export async function GET() {
  const result = await getAuthDb();
  if (result instanceof NextResponse) return result;
  const { db } = result;

  const [catsRes, txRes] = await Promise.all([
    db.from("categories").select("id, name, budget, is_fixed").order("created_at"),
    db.from("transactions").select("category").limit(100000),
  ]);

  if (catsRes.error) {
    return NextResponse.json({ error: catsRes.error.message }, { status: 500 });
  }

  const counts: Record<string, number> = {};
  for (const t of txRes.data ?? []) {
    if (t.category)
      counts[t.category] = (counts[t.category] ?? 0) + 1;
  }

  const sorted = (catsRes.data ?? []).slice().sort((a, b) => {
    const diff = (counts[b.name] ?? 0) - (counts[a.name] ?? 0);
    if (diff !== 0) return diff;
    return a.name.localeCompare(b.name, "ja");
  });

  return NextResponse.json(sorted);
}

export async function POST(req: NextRequest) {
  const result = await getAuthDb();
  if (result instanceof NextResponse) return result;
  const { db } = result;

  const body = await req.json();
  const trimmed = typeof body.name === "string" ? body.name.trim() : "";
  if (!trimmed || trimmed.length > 50) {
    return NextResponse.json(
      { error: "name must be 1–50 characters" },
      { status: 400 },
    );
  }
  const budget = typeof body.budget === "number" ? Math.max(0, Math.round(body.budget)) : 0;
  const is_fixed = body.is_fixed === true;

  const { data, error } = await db
    .from("categories")
    .insert({ name: trimmed, budget, is_fixed })
    .select("id, name, budget, is_fixed")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

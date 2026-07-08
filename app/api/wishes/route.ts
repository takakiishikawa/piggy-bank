import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthDb } from "@/lib/supabase/auth-db";
import { searchUnsplashImage } from "@/lib/unsplash";
import type { Wish } from "@/lib/supabase/db";

export const maxDuration = 30;

const CreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
});

export async function GET() {
  const result = await getAuthDb();
  if (result instanceof NextResponse) return result;
  const { db } = result;

  const { data, error } = await db
    .from("wishes")
    .select("*")
    .order("status", { ascending: true })
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
      { error: e instanceof Error ? e.message : "Invalid request" },
      { status: 400 },
    );
  }

  const imageUrl = await searchUnsplashImage(parsed.name);

  const { data, error } = await db
    .from("wishes")
    .insert({
      name: parsed.name,
      status: "want",
      image_url: imageUrl,
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data as Wish, { status: 201 });
}

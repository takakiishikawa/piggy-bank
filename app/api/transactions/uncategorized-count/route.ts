import { NextResponse } from "next/server";
import { getAuthDb } from "@/lib/supabase/auth-db";
import { FALLBACK_CATEGORY } from "@/lib/constants";

export async function GET() {
  const result = await getAuthDb();
  if (result instanceof NextResponse) return result;
  const { db } = result;

  const { data, error } = await db
    .from("transactions")
    .select("store")
    .eq("category", FALLBACK_CATEGORY)
    .eq("reviewed", false)
    .gt("amount", 0);

  if (error) return NextResponse.json({ count: 0 });

  const stores = new Set(
    (data ?? []).map((r) => r.store?.trim()).filter(Boolean),
  );
  return NextResponse.json({ count: stores.size });
}

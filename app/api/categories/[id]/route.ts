import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthDb } from "@/lib/supabase/auth-db";

export const maxDuration = 30;

const FALLBACK_CATEGORY = "その他";

const patchSchema = z.object({
  name: z.string().min(1).max(50),
});

// カテゴリ名の変更。同名の transactions も一括 rename する。
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const result = await getAuthDb();
  if (result instanceof NextResponse) return result;
  const { db } = result;

  const { id } = await ctx.params;
  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const newName = parsed.data.name.trim();

  const { data: cur, error: fetchError } = await db
    .from("categories")
    .select("name")
    .eq("id", id)
    .single();
  if (fetchError || !cur) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const oldName = (cur as { name: string }).name;
  if (oldName === FALLBACK_CATEGORY) {
    return NextResponse.json(
      { error: "「その他」は変更できません" },
      { status: 400 },
    );
  }
  if (oldName === newName) return NextResponse.json({ ok: true });

  const { error: updError } = await db
    .from("categories")
    .update({ name: newName })
    .eq("id", id);
  if (updError) {
    if (updError.code === "23505") {
      return NextResponse.json(
        { error: "そのカテゴリ名は既に存在します" },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: updError.message }, { status: 500 });
  }

  await db
    .from("transactions")
    .update({ category: newName })
    .eq("category", oldName);

  // 手動修正ルールも追従させる（stale なカテゴリ名を残さない）
  await db
    .from("store_category_rules")
    .update({ category: newName })
    .eq("category", oldName);

  return NextResponse.json({ ok: true });
}

// カテゴリ削除。同名の transactions は「その他」に倒してから categories から削除する。
export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const result = await getAuthDb();
  if (result instanceof NextResponse) return result;
  const { db } = result;

  const { id } = await ctx.params;

  const { data: cur, error: fetchError } = await db
    .from("categories")
    .select("name")
    .eq("id", id)
    .single();
  if (fetchError || !cur) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const name = (cur as { name: string }).name;
  if (name === FALLBACK_CATEGORY) {
    return NextResponse.json(
      { error: "「その他」は削除できません" },
      { status: 400 },
    );
  }

  await db
    .from("transactions")
    .update({ category: FALLBACK_CATEGORY })
    .eq("category", name);

  // 削除されたカテゴリを指すルールは破棄（store は再び AI 分類対象に戻る）
  await db.from("store_category_rules").delete().eq("category", name);

  const { error: delError } = await db
    .from("categories")
    .delete()
    .eq("id", id);
  if (delError) {
    return NextResponse.json({ error: delError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

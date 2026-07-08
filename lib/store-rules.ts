import { createDb } from "@/lib/supabase/db";
import { FALLBACK_CATEGORY } from "@/lib/constants";

type Db = ReturnType<typeof createDb>;

// 手動修正された店舗→カテゴリを正解ルールとして永続化する。
// - 「その他」は「分からないから入れている」値なので学習しない（既存ルールは削除）。
// - 空店舗名はキーにならないためスキップ。
// 同期・AI分類はこのルールを最優先で参照するため、一度直した店舗は次回必ず適用される。
export async function saveStoreRules(
  db: Db,
  stores: string[],
  category: string,
): Promise<void> {
  const cat = category.trim();
  const uniqueStores = [
    ...new Set(stores.map((s) => s?.trim()).filter((s): s is string => !!s)),
  ];
  if (uniqueStores.length === 0) return;

  if (!cat || cat === FALLBACK_CATEGORY) {
    // 「その他」に戻した = 確定を取り消した → ルールを消して自動適用を止める
    await db.from("store_category_rules").delete().in("store", uniqueStores);
    return;
  }

  const now = new Date().toISOString();
  await db.from("store_category_rules").upsert(
    uniqueStores.map((store) => ({ store, category: cat, updated_at: now })),
    { onConflict: "store" },
  );
}

// 全ルールを store→category の Map として取得（同期・AI分類で最優先参照）。
export async function loadStoreRules(db: Db): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const { data } = await db
    .from("store_category_rules")
    .select("store, category");
  for (const row of data ?? []) {
    const store = (row.store as string)?.trim();
    const cat = row.category as string;
    if (store && cat) map.set(store, cat);
  }
  return map;
}

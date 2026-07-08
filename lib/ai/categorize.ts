import Anthropic from "@anthropic-ai/sdk";
import { createDb } from "@/lib/supabase/db";
import { AI_CATEGORIZE_BATCH_SIZE, FALLBACK_CATEGORY } from "@/lib/constants";
import { loadStoreRules } from "@/lib/store-rules";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

type CategorizeResult = {
  updated: number;
  total: number;
  error?: string;
};

// kenyakugo スキーマ固定の Supabase クライアント型。
// authenticated でも service_role でも同じ schema 指定なので同型。
type Db = ReturnType<typeof createDb>;

// 「その他」かつ未レビューの取引を AI で自動カテゴライズする。
// db は authenticated でも service_role でもどちらでも動く。
export async function categorizeUncategorized(
  db: Db,
): Promise<CategorizeResult> {
  const { data: uncategorized, error } = await db
    .from("transactions")
    .select("id, store, amount")
    .eq("category", FALLBACK_CATEGORY)
    .eq("reviewed", false);

  if (error) {
    return { updated: 0, total: 0, error: error.message };
  }

  const txs = uncategorized ?? [];
  if (txs.length === 0) return { updated: 0, total: 0 };

  const { data: categoryRows } = await db
    .from("categories")
    .select("name")
    .order("created_at");
  const existingCategories = (categoryRows ?? []).map((r) => r.name);
  const existingCatSet = new Set(existingCategories);

  const { data: classified } = await db
    .from("transactions")
    .select("store, category")
    .neq("category", FALLBACK_CATEGORY);

  const storeMap: Record<string, string> = {};

  // 手動修正の正解ルールを最優先で適用（履歴・AI推測より常に勝つ）。
  // ルールに載った店舗は AI へ問い合わせず、既存の「その他」行も上書きされる。
  const rules = await loadStoreRules(db);
  for (const [store, cat] of rules) storeMap[store] = cat;

  for (const tx of classified ?? []) {
    if (tx.store && !storeMap[tx.store]) {
      storeMap[tx.store] = tx.category;
    }
  }

  // ルールベース処理（カテゴリが categories に存在する場合のみ適用）
  // - 9.000.000 / 8.000.000 VND の送金は家賃（店舗名は人名等でも判定）
  // - chuyen/transfer/remit 系キーワードは転送
  // - MOCAVN / Moca は Grab 系決済代行（交通・配達・GrabFood 等）→ Moca
  for (const tx of txs) {
    const store = tx.store?.trim() ?? "";
    const amount = tx.amount ?? 0;
    if (!store || storeMap[store]) continue;
    if (
      (amount === 9000000 || amount === 8000000) &&
      existingCatSet.has("Rent")
    ) {
      storeMap[store] = "Rent";
      continue;
    }
    if (
      /chuyen|transfer|remit|remittance/i.test(store) &&
      existingCatSet.has("Transfer")
    ) {
      storeMap[store] = "Transfer";
      continue;
    }
    if (/\bmoca(vn)?\b/i.test(store) && existingCatSet.has("Moca")) {
      storeMap[store] = "Moca";
    }
  }

  const unknownStores = [
    ...new Set(
      txs
        .map((t) => t.store?.trim())
        .filter((s): s is string => !!s && !storeMap[s]),
    ),
  ];

  const batches: string[][] = [];
  for (let i = 0; i < unknownStores.length; i += AI_CATEGORIZE_BATCH_SIZE) {
    batches.push(unknownStores.slice(i, i + AI_CATEGORIZE_BATCH_SIZE));
  }

  const batchResults = await Promise.all(
    batches.map(async (batch) => {
      const map: Record<string, string> = {};
      try {
        const storeList = batch.map((s, i) => `${i + 1}. ${s}`).join("\n");
        const message = await client.messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 3000,
          messages: [
            {
              role: "user",
              content: `This is a list of store names from a credit card statement for a Japanese resident of Ho Chi Minh City, Vietnam.
For each store, pick exactly one best-matching category from the existing categories.
Do not create new categories. If nothing matches, you must return "${FALLBACK_CATEGORY}".

Existing categories: ${existingCategories.join(", ")}
Store list:
${storeList}

Return only the following JSON array (no markdown):
[{"store": "store name", "category": "category name"}]`,
            },
          ],
        });

        const text =
          message.content[0].type === "text" ? message.content[0].text : "[]";
        const match = text.match(/\[[\s\S]*\]/);
        if (match) {
          const suggestions: { store: string; category: string }[] = JSON.parse(
            match[0],
          );
          for (const s of suggestions) {
            if (!s.store || !s.category) continue;
            const cat = s.category.trim();
            map[s.store.trim()] = existingCatSet.has(cat) ? cat : FALLBACK_CATEGORY;
          }
        }
      } catch {
        // バッチ失敗時はスキップ
      }
      return map;
    }),
  );

  for (const batchMap of batchResults) {
    Object.assign(storeMap, batchMap);
  }

  const catToStores: Record<string, string[]> = {};
  for (const [store, cat] of Object.entries(storeMap)) {
    if (cat && cat !== FALLBACK_CATEGORY && existingCatSet.has(cat)) {
      catToStores[cat] = [...(catToStores[cat] ?? []), store];
    }
  }

  let updated = 0;
  for (const [category, stores] of Object.entries(catToStores)) {
    const { error: updateErr } = await db
      .from("transactions")
      .update({ category, reviewed: true })
      .in("store", stores)
      .eq("category", FALLBACK_CATEGORY)
      .eq("reviewed", false);

    if (!updateErr) {
      updated += txs.filter((t) =>
        stores.includes(t.store?.trim() ?? ""),
      ).length;
    }
  }

  return { updated, total: txs.length };
}

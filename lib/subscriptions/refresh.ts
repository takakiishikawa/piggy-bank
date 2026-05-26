import { createDb } from "@/lib/supabase/db";
import {
  classifySubscriptionCandidates,
  type SubscriptionJudgment,
} from "@/lib/ai/classify-subscriptions";

type Db = ReturnType<typeof createDb>;

export interface SubscriptionRow {
  store: string;
  category: string;
  amount: number;
  last_charged_at: string;
  judgment: SubscriptionJudgment;
  reasoning: string | null;
  is_active: boolean;
  user_locked: boolean;
  judged_at: string;
  updated_at: string;
}

const LOOKBACK_DAYS = 30;
const EXCLUDED_CATEGORIES = new Set(["転送", "現金"]);

interface StoreAggregate {
  category: string;
  amounts: number[];
  lastDate: string;
}

export async function refreshSubscriptions(db: Db): Promise<SubscriptionRow[]> {
  const since = new Date();
  since.setDate(since.getDate() - LOOKBACK_DAYS);
  since.setHours(0, 0, 0, 0);

  const { data: txData, error: txError } = await db
    .from("transactions")
    .select("store, category, amount, date")
    .gt("amount", 0)
    .gte("date", since.toISOString())
    .order("date", { ascending: false })
    .limit(5000);

  if (txError) throw new Error(txError.message);

  const txs = (txData ?? []) as {
    store: string;
    category: string;
    amount: number;
    date: string;
  }[];

  const grouped = new Map<string, StoreAggregate>();
  for (const tx of txs) {
    const store = tx.store?.trim();
    if (!store) continue;
    if (EXCLUDED_CATEGORIES.has(tx.category)) continue;
    const cur = grouped.get(store);
    if (!cur) {
      grouped.set(store, {
        category: tx.category,
        amounts: [tx.amount],
        lastDate: tx.date,
      });
    } else {
      cur.amounts.push(tx.amount);
      if (tx.date > cur.lastDate) cur.lastDate = tx.date;
    }
  }

  const stores = [...grouped.keys()];

  const existingMap = new Map<string, SubscriptionRow>();
  if (stores.length > 0) {
    const { data: existing } = await db
      .from("subscriptions")
      .select("*")
      .in("store", stores);
    for (const row of (existing ?? []) as SubscriptionRow[]) {
      existingMap.set(row.store, row);
    }
  }

  const toClassify = stores.filter((s) => !existingMap.get(s)?.user_locked);
  const aiCandidates = toClassify.map((store) => {
    const g = grouped.get(store)!;
    const mean = g.amounts.reduce((a, b) => a + b, 0) / g.amounts.length;
    return { store, category: g.category, amount: Math.round(mean) };
  });
  const classified =
    aiCandidates.length > 0
      ? await classifySubscriptionCandidates(aiCandidates)
      : [];
  const judgmentMap = new Map(classified.map((c) => [c.store, c]));

  const now = new Date().toISOString();
  const rows: SubscriptionRow[] = [];

  for (const [store, g] of grouped) {
    const existing = existingMap.get(store);
    const mean = Math.round(g.amounts.reduce((a, b) => a + b, 0) / g.amounts.length);

    let judgment: SubscriptionJudgment;
    let reasoning: string | null;
    if (existing?.user_locked) {
      judgment = existing.judgment;
      reasoning = existing.reasoning;
    } else {
      const c = judgmentMap.get(store);
      judgment = c?.judgment ?? "unknown";
      reasoning = c?.reason ?? null;
    }

    rows.push({
      store,
      category: g.category,
      amount: mean,
      last_charged_at: g.lastDate.slice(0, 10),
      judgment,
      reasoning,
      // user が手動で実行/終了を管理している場合はその状態を尊重し、cron で上書きしない
      is_active: existing?.user_locked ? existing.is_active : true,
      user_locked: existing?.user_locked ?? false,
      judged_at: existing?.user_locked ? existing.judged_at : now,
      updated_at: now,
    });
  }

  if (rows.length > 0) {
    const { error: upsertError } = await db
      .from("subscriptions")
      .upsert(rows, { onConflict: "store" });
    if (upsertError) throw new Error(upsertError.message);
  }

  // 直近30日に登場しなかった既存サブスクは終了扱いに
  // ただし user が手動管理している (user_locked) サブスクは対象外
  const seenStores = new Set(stores);
  const { data: existingActive } = await db
    .from("subscriptions")
    .select("store")
    .eq("judgment", "sub")
    .eq("is_active", true)
    .eq("user_locked", false);
  const toEnd = ((existingActive ?? []) as { store: string }[])
    .map((r) => r.store)
    .filter((s) => !seenStores.has(s));
  if (toEnd.length > 0) {
    await db
      .from("subscriptions")
      .update({ is_active: false, updated_at: now })
      .in("store", toEnd);
  }

  return loadDisplayRows(db);
}

export async function loadDisplayRows(db: Db): Promise<SubscriptionRow[]> {
  // 表示対象: sub のみ（active/ended）。unknown / not_sub は AI 判断に委ねて非表示
  const { data, error } = await db
    .from("subscriptions")
    .select("*")
    .eq("judgment", "sub")
    .order("amount", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as SubscriptionRow[];
}

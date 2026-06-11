import { NextResponse } from "next/server";
import {
  createDbAdmin,
  type Transaction,
  type Settings,
} from "@/lib/supabase/db";
import { listVietcombankMessageIds, fetchEmailBody } from "@/lib/gmail";
import { parseVietcombankEmail } from "@/lib/parser";
import { convertToVND } from "@/lib/exchange";
import { categorizeUncategorized } from "@/lib/ai/categorize";
import { loadStoreRules } from "@/lib/store-rules";

export const maxDuration = 60;

export async function GET(req: Request) {
  // 必須 env を fail-fast で検証（無人 cron で設定漏れに気付けるように）
  const cronSecret = process.env.CRON_SECRET;
  const googleClientId = process.env.GOOGLE_CLIENT_ID;
  const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!cronSecret || !googleClientId || !googleClientSecret || !serviceRoleKey) {
    return NextResponse.json(
      {
        error: "Missing required env",
        missing: {
          CRON_SECRET: !cronSecret,
          GOOGLE_CLIENT_ID: !googleClientId,
          GOOGLE_CLIENT_SECRET: !googleClientSecret,
          SUPABASE_SERVICE_ROLE_KEY: !serviceRoleKey,
        },
      },
      { status: 500 },
    );
  }

  // GH Actions cron は Authorization: Bearer <CRON_SECRET> を付与する
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 無人バッチなので RLS bypass の service_role で接続
  const db = createDbAdmin();

  // DB に保存されたリフレッシュトークンで Gmail アクセストークンを取得
  const { data: settings, error: settingsError } = await db
    .from("settings")
    .select("google_refresh_token")
    .eq("id", "singleton")
    .maybeSingle();

  if (settingsError) {
    return NextResponse.json(
      {
        error: "Settings fetch failed",
        code: settingsError.code,
        message: settingsError.message,
        details: settingsError.details,
        hint: settingsError.hint,
      },
      { status: 500 },
    );
  }

  const refreshToken = (
    settings as Pick<Settings, "google_refresh_token"> | null
  )?.google_refresh_token;

  if (!refreshToken) {
    return NextResponse.json(
      {
        error: "No refresh token stored",
        settingsExists: settings !== null,
      },
      { status: 400 },
    );
  }

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: googleClientId,
      client_secret: googleClientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!tokenRes.ok) {
    return NextResponse.json(
      { error: "Failed to refresh Google token" },
      { status: 502 },
    );
  }

  const { access_token: accessToken } = await tokenRes.json();

  // Gmail から全メッセージID取得
  let allIds: string[] = [];
  try {
    allIds = await listVietcombankMessageIds(accessToken);
  } catch (e) {
    return NextResponse.json(
      { error: `Gmail API error: ${String(e)}` },
      { status: 502 },
    );
  }

  // DB から既存 gmail_id と「店名→カテゴリ」マップを構築（手動同期と同じ）
  // Supabase は1クエリ1000行上限なのでページネーション
  const existingIds = new Set<string>();
  const storeCategory = new Map<string, string>();
  const PAGE = 1000;
  let page = 0;
  while (true) {
    const { data: pageRows } = await db
      .from("transactions")
      .select("gmail_id, store, category")
      .range(page * PAGE, (page + 1) * PAGE - 1);
    if (!pageRows || pageRows.length === 0) break;
    for (const row of pageRows) {
      if (row.gmail_id) existingIds.add(row.gmail_id as string);
      const store = (row.store as string)?.trim();
      const cat = row.category as string;
      if (store && cat && cat !== "その他") storeCategory.set(store, cat);
    }
    if (pageRows.length < PAGE) break;
    page++;
  }

  // 手動修正の正解ルールを最優先で反映（履歴より優先 = ユーザー確定が勝つ）
  const rules = await loadStoreRules(db);
  for (const [store, cat] of rules) storeCategory.set(store, cat);

  const newIds = allIds.filter((id) => !existingIds.has(id)).slice(0, 100);

  let synced = 0;
  for (const id of newIds) {
    let body: string | null = null;
    try {
      body = await fetchEmailBody(accessToken, id);
    } catch {
      continue;
    }
    if (!body) continue;

    const parsed = parseVietcombankEmail(body);
    if (!parsed.isValid) continue;

    // 外貨は VND 換算して保存（為替 API 失敗時はスキップ＝次回再試行）
    let vndAmount: number;
    try {
      vndAmount = await convertToVND(parsed.amount, parsed.currency);
    } catch (e) {
      console.error(
        `[cron/sync] currency conversion failed for ${id} (${parsed.currency}):`,
        e,
      );
      continue;
    }

    // 過去に同じ店舗をカテゴライズ済みならそのカテゴリを使用、なければ「その他」
    const knownCategory = storeCategory.get(parsed.store.trim());
    const { error: err } = await db.from("transactions").insert({
      id: crypto.randomUUID(),
      gmail_id: id,
      store: parsed.store,
      amount: vndAmount,
      date: parsed.date.toISOString(),
      category: knownCategory ?? "その他",
    } satisfies Omit<Transaction, "created_at">);

    if (err) {
      console.error("[cron/sync] Insert error:", err);
      break;
    }
    synced++;
  }

  // 「その他」のまま残った取引を AI 自動カテゴリ分類（service_role で直接実行）。
  // 過去の取りこぼしも吸収するため synced=0 でも実行する。
  const aiResult = await categorizeUncategorized(db);
  console.log(
    `[cron/sync] synced=${synced} ai_updated=${aiResult.updated}/${aiResult.total}`,
  );

  return NextResponse.json({
    synced,
    aiUpdated: aiResult.updated,
    aiTotal: aiResult.total,
  });
}

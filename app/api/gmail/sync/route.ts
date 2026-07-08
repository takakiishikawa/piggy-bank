import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createDb, type Transaction, type Settings } from "@/lib/supabase/db";
import { GMAIL_SYNC_BATCH_SIZE } from "@/lib/constants";
import { listVietcombankMessageIds, fetchEmailBody } from "@/lib/gmail";
import { parseVietcombankEmail } from "@/lib/parser";
import { convertToVND } from "@/lib/exchange";
import { loadStoreRules } from "@/lib/store-rules";

export const maxDuration = 300; // 5分 (Vercel/Next.js route timeout)

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json(
        { error: "No session — please log in" },
        { status: 401 },
      );
    }
    let accessToken = session.provider_token;

    if (!accessToken) {
      // セッション更新後に provider_token が消えるため、DB のリフレッシュトークンで再取得
      const db = createDb(session.access_token);
      const { data: settings } = await db
        .from("settings")
        .select("google_refresh_token")
        .eq("id", "singleton")
        .maybeSingle();

      const refreshToken = (
        settings as Pick<Settings, "google_refresh_token"> | null
      )?.google_refresh_token;

      if (!refreshToken) {
        return NextResponse.json(
          { error: "No provider_token — please log in again" },
          { status: 401 },
        );
      }

      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: process.env.GOOGLE_CLIENT_ID!,
          client_secret: process.env.GOOGLE_CLIENT_SECRET!,
          refresh_token: refreshToken,
          grant_type: "refresh_token",
        }),
      });

      if (!tokenRes.ok) {
        return NextResponse.json(
          { error: "Failed to refresh Google token — please log in again" },
          { status: 401 },
        );
      }

      const tokenData = await tokenRes.json();
      accessToken = tokenData.access_token;
    }

    // 1. Gmail から全メッセージIDを取得
    let allIds: string[] = [];
    try {
      allIds = await listVietcombankMessageIds(accessToken!);
    } catch (e) {
      console.error("[sync] Gmail fetch error:", e);
      return NextResponse.json(
        {
          error: `Gmail API error: ${e instanceof Error ? e.message : String(e)}`,
        },
        { status: 502 },
      );
    }

    const db = createDb(session.access_token);

    // 2. DB に既存の gmail_id を取得してセットに + 店舗→カテゴリのマップを作成
    // Supabase はサーバー側で1000行上限があるため、ページネーションで全件取得
    const existingIds = new Set<string>();
    const storeCategory = new Map<string, string>(); // 既知店舗のカテゴリ
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

    // 3. 新規IDのみ抽出（タイムアウト回避のため最大GMAIL_SYNC_BATCH_SIZE件）
    const allNewIds = allIds.filter((id) => !existingIds.has(id));
    const newIds = allNewIds.slice(0, GMAIL_SYNC_BATCH_SIZE);
    const remaining = Math.max(0, allNewIds.length - GMAIL_SYNC_BATCH_SIZE);

    let synced = 0;
    let insertError: string | null = null;

    // 4. 新規IDのみ本文を取得してパース・保存
    for (const id of newIds) {
      let body: string | null = null;
      try {
        body = await fetchEmailBody(accessToken!, id);
      } catch (e) {
        console.error("[sync] fetchEmailBody error:", e);
        continue;
      }
      if (!body) continue;

      const parsed = parseVietcombankEmail(body);
      if (!parsed.isValid) {
        // 解析不能メールを DB に記録し、次回ループで再試行しないようにする
        await db.from("transactions").insert({
          id: crypto.randomUUID(),
          gmail_id: id,
          store: "",
          amount: 0,
          date: new Date().toISOString(),
          category: "その他",
          reviewed: false,
        } satisfies Omit<Transaction, "created_at">);
        continue;
      }

      // 外貨は VND 換算（失敗時はスキップ＝次回同期で再試行）
      let vndAmount: number;
      try {
        vndAmount = await convertToVND(parsed.amount, parsed.currency);
      } catch (e) {
        console.error(
          `[sync] currency conversion failed for ${id} (${parsed.currency}):`,
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
        reviewed: !!knownCategory,
      } satisfies Omit<Transaction, "created_at">);

      if (err) {
        // 重複キーエラー（23505）はスキップして続行
        if (err.code === "23505") continue;
        console.error("[sync] Insert error:", err);
        insertError = err.message;
        break;
      }
      synced++;
    }

    if (insertError) {
      return NextResponse.json(
        { error: `DB error: ${insertError}`, synced },
        { status: 500 },
      );
    }

    // 未分類を AI 自動カテゴリ分類（同じ店名は過去の分類を再利用）
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

    if (synced > 0) {
      try {
        await fetch(`${siteUrl}/api/ai/categorize-all`, { method: "POST" });
      } catch {
        // AI 分類失敗時はスキップ
      }
    }

    return NextResponse.json({ synced, remaining });
  } catch (e) {
    console.error("[sync] Unexpected error:", e);
    return NextResponse.json(
      {
        error: `Unexpected error: ${e instanceof Error ? e.message : String(e)}`,
      },
      { status: 500 },
    );
  }
}

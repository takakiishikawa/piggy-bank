import { NextRequest, NextResponse } from "next/server";
import { getAuthDb } from "@/lib/supabase/auth-db";
import { type Transaction } from "@/lib/supabase/db";
import { decodeMizuhoCsv, parseMizuhoCsv } from "@/lib/mizuho-parser";
import { VND_PER_JPY } from "@/lib/currency";
import { FALLBACK_CATEGORY } from "@/lib/constants";
import { loadStoreRules } from "@/lib/store-rules";
import { categorizeUncategorized } from "@/lib/ai/categorize";

export const maxDuration = 60;

function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

// GET: 今月のみずほCSVアップロードが済んでいるか(バナー表示の判定に使う)。
export async function GET() {
  const result = await getAuthDb();
  if (result instanceof NextResponse) return result;
  const { db } = result;

  const month = currentMonthKey();
  const { data } = await db
    .from("mizuho_monthly_imports")
    .select("month, status, imported_count")
    .eq("month", month)
    .maybeSingle();

  return NextResponse.json({
    month,
    done: !!data,
    status: (data?.status as string | undefined) ?? null,
  });
}

// POST: みずほCSV(multipart form-data の file)を取り込む。出金のみ。
export async function POST(req: NextRequest) {
  const result = await getAuthDb();
  if (result instanceof NextResponse) return result;
  const { db } = result;

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  const csv = decodeMizuhoCsv(await file.arrayBuffer());
  const parsed = parseMizuhoCsv(csv);

  if (parsed.withdrawals.length === 0) {
    return NextResponse.json(
      { error: "no_withdrawals", depositCount: parsed.depositCount },
      { status: 422 },
    );
  }

  // 重複取込の防止: 既にある mizuho の external_id を集める。
  const existing = new Set<string>();
  {
    const { data } = await db
      .from("transactions")
      .select("external_id")
      .eq("source", "mizuho")
      .not("external_id", "is", null);
    for (const row of data ?? []) {
      if (row.external_id) existing.add(row.external_id as string);
    }
  }

  // 確定済みの店舗→カテゴリルールがあれば適用(なければ「その他」→ 後段のAIが分類)。
  const rules = await loadStoreRules(db);

  let imported = 0;
  let skipped = 0;
  for (const w of parsed.withdrawals) {
    if (existing.has(w.externalId)) {
      skipped++;
      continue;
    }
    const knownCategory = rules.get(w.description.trim());
    const { error } = await db.from("transactions").insert({
      id: crypto.randomUUID(),
      gmail_id: null,
      store: w.description,
      // みずほは常に円建て。全画面共通の固定レートでVND換算して保存する。
      amount: Math.round(w.amountJpy * VND_PER_JPY),
      date: w.date.toISOString(),
      category: knownCategory ?? FALLBACK_CATEGORY,
      reviewed: false,
      source: "mizuho",
      external_id: w.externalId,
    } satisfies Omit<Transaction, "created_at" | "note" | "excluded_from_dashboard" | "special_entry_id">);

    if (error) {
      // 一意制約による重複は握りつぶして次へ(並行アップロード時の保険)
      if (error.code === "23505") {
        skipped++;
        continue;
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    imported++;
    existing.add(w.externalId);
  }

  // 今月の実施記録を残す(バナーはこの行があるあいだ非表示)。
  const month = currentMonthKey();
  await db.from("mizuho_monthly_imports").upsert(
    { month, status: "imported", imported_count: imported },
    { onConflict: "month" },
  );

  // 新しく入った「その他」を AI で自動分類(失敗しても取込自体は成功扱い)。
  let aiUpdated = 0;
  try {
    const ai = await categorizeUncategorized(db);
    aiUpdated = ai.updated;
  } catch {
    // noop
  }

  return NextResponse.json({
    month,
    imported,
    skipped,
    depositCount: parsed.depositCount,
    aiUpdated,
    periodStart: parsed.periodStart,
    periodEnd: parsed.periodEnd,
  });
}

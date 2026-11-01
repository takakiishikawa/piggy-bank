import { NextRequest, NextResponse } from "next/server";
import { getAuthDb } from "@/lib/supabase/auth-db";
import { getCurrentMonthKey } from "@/lib/budget";
import {
  MonthlyReviewCommentSchema,
  reviewMonthKey,
  type MonthlyReviewComment,
  type MonthlyReviewResponse,
} from "@/lib/monthly-review";
import { computeMonthlyReviewSummary } from "@/lib/monthly-review-summary";
import { generateMonthlyReviewComment } from "@/lib/ai/monthly-review";

export const maxDuration = 60;

// GET ?lang=ja|en: 先月の結果(数字)と、Claude が書いたふりかえり文。
// 数字は開くたびに集計し直す(あとから取り込んだ明細も反映する)。ふりかえり文は
// 月・言語ごとに1回だけ作って保存し、2回目以降は保存したものを返す。
export async function GET(req: NextRequest) {
  const result = await getAuthDb();
  if (result instanceof NextResponse) return result;
  const { db } = result;

  const lang = req.nextUrl.searchParams.get("lang") === "ja" ? "ja" : "en";
  const column = lang === "ja" ? "content_ja" : "content_en";
  const month = reviewMonthKey();

  const [summary, saved, mizuho] = await Promise.all([
    computeMonthlyReviewSummary(db, month),
    db.from("monthly_reviews").select("content_ja, content_en").eq("month", month).maybeSingle(),
    db.from("mizuho_monthly_imports").select("month").eq("month", getCurrentMonthKey()).maybeSingle(),
  ]);

  let comment: MonthlyReviewComment | null = null;
  const cached = MonthlyReviewCommentSchema.safeParse(saved.data?.[column]);
  if (cached.success) {
    comment = cached.data;
  } else {
    comment = await generateMonthlyReviewComment(summary, lang);
    // みずほの明細がそろう前(レポート画面から先に開いた場合)の文は保存せず、
    // そろってから作り直す。
    if (comment && mizuho.data) {
      await db.from("monthly_reviews").upsert({ month, [column]: comment }, { onConflict: "month" });
    }
  }

  const body: MonthlyReviewResponse = { summary, comment };
  return NextResponse.json(body);
}

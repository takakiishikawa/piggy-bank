"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CalendarCheck, ThumbsUp, Eye, Sparkles } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Skeleton,
} from "@takaki/go-design-system";
import { usePreferences } from "@/lib/preferences";
import { makeFormatAmount } from "@/lib/currency";
import { catLabel, t, tf, type Lang } from "@/lib/scenario/dictionary";
import { DC } from "@/lib/scenario/design-colors";
import { MIZUHO_FLOW_DONE_EVENT } from "@/components/mizuho-import-dialog";
import type {
  MonthlyReviewResponse,
  MonthlyReviewStatus,
  ReviewCategory,
} from "@/lib/monthly-review";

const supabaseConfigured =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// 'YYYY-MM' → 「10月」/ "October"
export function reviewMonthLabel(month: string, lang: Lang): string {
  const m = Number(month.slice(5));
  return lang === "ja" ? `${m}月` : new Date(2000, m - 1, 1).toLocaleString("en-US", { month: "long" });
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// ふりかえる月(ICT 基準の今月の前月)。サーバーの reviewMonthKey と同じ規則。
export function currentReviewMonth(): string {
  const ict = new Date(Date.now() + 7 * 60 * 60 * 1000);
  return shiftMonth(`${ict.getUTCFullYear()}-${String(ict.getUTCMonth() + 1).padStart(2, "0")}`, -1);
}

// 先月のふりかえり。mode = "auto" は月初の自動表示(閉じるボタンが「11月もはじめよう」)、
// "manual" はレポート画面から開き直したとき。
export function MonthlyReviewDialog({
  open,
  onOpenChange,
  mode,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "auto" | "manual";
}) {
  const { lang, currency } = usePreferences();
  const formatAmount = makeFormatAmount(currency);
  const [data, setData] = useState<MonthlyReviewResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setData(null);
    setFailed(false);
    fetch(`/api/monthly-review?lang=${lang}`)
      .then((r) => (r.ok ? (r.json() as Promise<MonthlyReviewResponse>) : null))
      .then((j) => {
        if (cancelled) return;
        if (j) setData(j);
        else setFailed(true);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [open, lang]);

  const month = data?.summary.month ?? currentReviewMonth();
  const monthName = reviewMonthLabel(month, lang);
  const prevMonthName = reviewMonthLabel(shiftMonth(month, -1), lang);
  const nextMonthName = reviewMonthLabel(shiftMonth(month, 1), lang);

  const s = data?.summary;
  const budgetDiff = s ? s.totalBudget - s.totalActual : 0; // + = 予算より少なく済んだ
  const within = budgetDiff >= 0;
  const prevDiff = s ? s.totalActual - s.prevTotalActual : 0; // + = 前月より増えた
  const byName = new Map<string, ReviewCategory>((s?.categories ?? []).map((c) => [c.name, c]));

  const prevText = (() => {
    if (!s) return "";
    // 合計の1%未満の差は「同じくらい」とする(端数で増えた・減ったと言わない)。
    if (Math.abs(prevDiff) < Math.max(s.prevTotalActual, 1) * 0.01) return t(lang, "reviewPrevSame");
    return tf(lang, prevDiff < 0 ? "reviewPrevLess" : "reviewPrevMore", { amount: formatAmount(Math.abs(prevDiff)) });
  })();

  const sectionTitle = "text-[12px] font-semibold flex items-center gap-1.5";

  const commentList = (items: { category: string; comment: string }[], emptyText: string) =>
    items.length === 0 ? (
      <p className="text-[13px]" style={{ color: DC.textSecondary }}>
        {emptyText}
      </p>
    ) : (
      <ul className="flex flex-col gap-2">
        {items.map((it) => {
          const c = byName.get(it.category);
          return (
            <li key={it.category} className="flex flex-col gap-0.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[13px] font-semibold" style={{ color: DC.textPrimary }}>
                  {catLabel(lang, it.category)}
                </span>
                {c && (
                  <span className="text-[11.5px] font-num whitespace-nowrap" style={{ color: DC.textSubtle }}>
                    {formatAmount(c.actual)}
                    {c.budget > 0 && <> / {formatAmount(c.budget)}</>}
                  </span>
                )}
              </div>
              <span className="text-[12.5px] leading-relaxed" style={{ color: DC.textSecondary }}>
                {it.comment}
              </span>
            </li>
          );
        })}
      </ul>
    );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 overflow-hidden" style={{ backgroundColor: DC.cardBg }}>
        <DialogHeader className="px-5 py-4 border-b" style={{ borderColor: DC.cardBorder }}>
          <DialogTitle className="flex items-center gap-2">
            <CalendarCheck size={16} style={{ color: DC.primary }} />
            {tf(lang, "reviewTitle", { month: monthName })}
          </DialogTitle>
        </DialogHeader>

        <div className="px-5 py-5 flex flex-col gap-5 max-h-[70vh] overflow-y-auto">
          {failed ? (
            <p className="text-[13px] py-6 text-center" style={{ color: DC.textSecondary }}>
              {tf(lang, "reviewLoadFailed", { month: monthName })}
            </p>
          ) : !s ? (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-8 w-2/3" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : (
            <>
              {/* 結果の見出し: 予算内かどうかをひと目で */}
              <div className="flex flex-col gap-1">
                <span className="font-display text-xl font-bold" style={{ color: within ? DC.success : DC.warning }}>
                  {t(lang, within ? "reviewWithinBudget" : "reviewOverBudget")}
                </span>
                <span className="text-[13px]" style={{ color: DC.textSecondary }}>
                  {tf(lang, within ? "reviewUnderBy" : "reviewOverBy", { amount: formatAmount(Math.abs(budgetDiff)) })}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: t(lang, "reviewTotalSpent"), value: formatAmount(s.totalActual), color: DC.textPrimary },
                  {
                    label: t(lang, "reviewVsBudget"),
                    value: `${within ? "−" : "+"}${formatAmount(Math.abs(budgetDiff))}`,
                    color: within ? DC.success : DC.warning,
                  },
                  {
                    label: tf(lang, "reviewVsPrev", { month: prevMonthName }),
                    value: prevText,
                    color: prevDiff <= 0 ? DC.success : DC.textPrimary,
                  },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="rounded-xl border px-3 py-2 flex flex-col gap-0.5"
                    style={{ borderColor: DC.cardBorder, backgroundColor: DC.headerBg }}
                  >
                    <span className="text-[10.5px] font-semibold" style={{ color: DC.textFaint }}>
                      {stat.label}
                    </span>
                    <span className="text-[13px] font-bold font-num" style={{ color: stat.color }}>
                      {stat.value}
                    </span>
                  </div>
                ))}
              </div>

              <div className="flex gap-4 text-[11.5px] font-num" style={{ color: DC.textSubtle }}>
                <span>
                  {t(lang, "reviewVariable")} {formatAmount(s.variableActual)} / {formatAmount(s.variableBudget)}
                </span>
                <span>
                  {t(lang, "reviewFixed")} {formatAmount(s.fixedActual)} / {formatAmount(s.fixedBudget)}
                </span>
              </div>

              {data.comment ? (
                <>
                  <section className="flex flex-col gap-2">
                    <h3 className={sectionTitle} style={{ color: DC.success }}>
                      <ThumbsUp size={13} />
                      {t(lang, "reviewGood")}
                    </h3>
                    {commentList(data.comment.good, tf(lang, "reviewNoGood", { month: nextMonthName }))}
                  </section>
                  <section className="flex flex-col gap-2">
                    <h3 className={sectionTitle} style={{ color: DC.warning }}>
                      <Eye size={13} />
                      {t(lang, "reviewImprove")}
                    </h3>
                    {commentList(data.comment.improve, t(lang, "reviewNoImprove"))}
                  </section>
                  <section
                    className="flex flex-col gap-1.5 rounded-xl px-4 py-3"
                    style={{ backgroundColor: DC.primaryTint }}
                  >
                    <h3 className={sectionTitle} style={{ color: DC.primaryHover }}>
                      <Sparkles size={13} />
                      {tf(lang, "reviewNext", { month: nextMonthName })}
                    </h3>
                    <p className="text-[13px] leading-relaxed" style={{ color: DC.textPrimary }}>
                      {data.comment.next}
                    </p>
                  </section>
                </>
              ) : (
                <p className="text-[13px]" style={{ color: DC.textSecondary }}>
                  {t(lang, "reviewCommentFailed")}
                </p>
              )}
            </>
          )}
        </div>

        <div
          className="px-5 py-3 border-t flex items-center justify-between gap-3"
          style={{ borderColor: DC.cardBorder }}
        >
          <Link
            href="/simulation"
            onClick={() => onOpenChange(false)}
            className="text-[12.5px] font-semibold hover:underline"
            style={{ color: DC.primary }}
          >
            {t(lang, "reviewSeeReport")}
          </Link>
          <Button type="button" onClick={() => onOpenChange(false)}>
            {mode === "auto" ? tf(lang, "reviewStart", { month: nextMonthName }) : t(lang, "close")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// 全画面共通: 新しい月になって最初に開いたとき、先月のふりかえりを自動で出す。
// 今月のみずほCSV取込(または「支出なし」)が済むまでは待ち、済んだら表示する。
// 閉じたらその月はもう自動では出さない。
export function MonthlyReviewAutoPopup() {
  const [open, setOpen] = useState(false);

  const check = useCallback(() => {
    if (!supabaseConfigured) return;
    fetch("/api/monthly-review/status")
      .then((r) => (r.ok ? (r.json() as Promise<MonthlyReviewStatus>) : null))
      .then((s) => {
        if (s && s.mizuhoDone && !s.dismissed) setOpen(true);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    check();
    window.addEventListener(MIZUHO_FLOW_DONE_EVENT, check);
    return () => window.removeEventListener(MIZUHO_FLOW_DONE_EVENT, check);
  }, [check]);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) fetch("/api/monthly-review/dismiss", { method: "POST" }).catch(() => {});
  };

  return <MonthlyReviewDialog open={open} onOpenChange={handleOpenChange} mode="auto" />;
}

// レポート画面: 自動表示のあとも先月のふりかえりを開き直せる入口。
export function MonthlyReviewButton({ lang }: { lang: Lang }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="h-8 px-3 rounded-lg text-xs font-semibold cursor-pointer transition-all hover:brightness-95 active:scale-95 border flex items-center gap-1.5"
        style={{ backgroundColor: DC.cardBg, color: DC.textSecondary, borderColor: DC.cardBorder }}
      >
        <CalendarCheck size={13} style={{ color: DC.primary }} />
        {tf(lang, "reviewOpen", { month: reviewMonthLabel(currentReviewMonth(), lang) })}
      </button>
      <MonthlyReviewDialog open={open} onOpenChange={setOpen} mode="manual" />
    </>
  );
}

"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertCircle, Search, Sparkles, UploadCloud } from "lucide-react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  toast,
} from "@takaki/go-design-system";
import { formatDateShort } from "@/lib/format";
import { makeFormatAmount } from "@/lib/currency";
import { getCategoryColorTint, getCategoryHex } from "@/lib/category-colors";
import { getCategoryIcon } from "@/lib/category-icons";
import { FALLBACK_CATEGORY } from "@/lib/constants";
import { NoteTag } from "@/components/note-tag";
import { SpecialExpenseToggle } from "@/components/special-expense-toggle";
import { SourceBadge } from "@/components/source-badge";
import { MizuhoImportDialog, MIZUHO_UPDATED_EVENT } from "@/components/mizuho-import-dialog";
import { DC } from "@/lib/scenario/design-colors";
import { t, tf, catLabel } from "@/lib/scenario/dictionary";
import { usePreferences } from "@/lib/preferences";
import type { TransactionSource } from "@/lib/supabase/db";

// claude design の取引ページ(検索バー + カテゴリチップ + フラットなリスト)に
// 合わせて全面刷新。以前あったストア単位の一括レビューパネル・検索一致の
// 一括カテゴリ変更バナー・DataTableは、新デザインに無いため廃止(個別取引ごとの
// インライン選択に統一)。Note・特別支出トグルは新デザインには無いが実データの
// 機能なので、行にhoverした時だけ出る形で維持する。

interface Transaction {
  id: string;
  store: string;
  amount: number;
  category: string;
  date: string;
  reviewed: boolean;
  note: string | null;
  excluded_from_dashboard: boolean;
  special_entry_id: string | null;
  source: TransactionSource;
}

interface Category {
  id: string;
  name: string;
  used: boolean;
}

const PAGE_SIZE = 50;

// 「未分類」= フォールバックカテゴリのままAI/手動でまだレビューされていない取引。
// (既存のCategoryBadge/uncategorized-countと同じ判定基準)
// 特別支出はカテゴリを持たない扱いなので未分類にも数えない。
function needsCategory(tx: Transaction): boolean {
  return tx.category === FALLBACK_CATEGORY && !tx.reviewed && !isSpecial(tx);
}

// 特別支出にした取引は「カテゴリなし」として扱う(カテゴリ欄を空にし、編集もさせない)。
// DBのcategoryは消さずに残すので、特別支出を外せば元のカテゴリに戻る。
function isSpecial(tx: Transaction): boolean {
  return tx.special_entry_id !== null;
}

function CategoryBadgeInline({ category, lang }: { category: string; lang: "ja" | "en" }) {
  const Icon = getCategoryIcon(category);
  const hex = getCategoryHex(category);
  return (
    <span className="flex items-center gap-1.5 text-[11.5px] font-semibold w-full min-w-0" style={{ color: DC.textSecondary }}>
      <span
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md"
        style={{ backgroundColor: getCategoryColorTint(category) }}
      >
        <Icon size={11} style={{ color: hex }} />
      </span>
      <span className="truncate">{catLabel(lang, category)}</span>
    </span>
  );
}

export default function TransactionsPage() {
  return (
    <Suspense fallback={null}>
      <TransactionsPageInner />
    </Suspense>
  );
}

function TransactionsPageInner() {
  const searchParams = useSearchParams();
  const { lang, currency } = usePreferences();
  const formatAmount = makeFormatAmount(currency);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [categories, setCategories] = useState<string[]>([]);
  const [usedCategories, setUsedCategories] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [catFilter, setCatFilter] = useState<string>(
    searchParams.get("filter") === "needs_category" ? "needs_category" : "all",
  );
  const [savingId, setSavingId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [mizuhoOpen, setMizuhoOpen] = useState(false);
  // 絞り込みを素早く切り替えた時に、古いリクエストの結果で上書きしないための通し番号。
  const requestSeq = useRef(0);

  const fetchCategories = useCallback(() => {
    fetch("/api/categories")
      .then((r) => r.json())
      .then((data: Category[]) => {
        setCategories(data.map((c) => c.name));
        // チップに出すカテゴリは、実際に取引で使われているものだけ(空のカテゴリまで
        // 全部並ぶと長くなりすぎるため)。
        setUsedCategories(data.filter((c) => c.used).map((c) => c.name));
      });
  }, []);

  const fetchPendingCount = useCallback(async () => {
    const res = await fetch("/api/transactions/uncategorized-count");
    if (res.ok) setPendingCount(((await res.json()) as { count: number }).count ?? 0);
  }, []);

  // 検索は入力のたびにリクエストしないよう少し待ってから反映する。
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(id);
  }, [search]);

  // 全件を一度に取ると非常に遅いため、新しい順に PAGE_SIZE 件ずつサーバーから取る
  // (絞り込み・検索もサーバー側)。
  const fetchPage = useCallback(
    async (offset: number) => {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
      if (catFilter === "needs_category") params.set("filter", "needs_category");
      else if (catFilter !== "all") params.set("category", catFilter);
      if (debouncedSearch) params.set("q", debouncedSearch);
      const res = await fetch(`/api/transactions?${params.toString()}`);
      if (!res.ok) return null;
      return (await res.json()) as { items: Transaction[]; hasMore: boolean };
    },
    [catFilter, debouncedSearch],
  );

  const reload = useCallback(async () => {
    const seq = ++requestSeq.current;
    const page = await fetchPage(0);
    if (seq !== requestSeq.current) return;
    if (page) {
      setTransactions(page.items);
      setHasMore(page.hasMore);
    }
    setLoaded(true);
  }, [fetchPage]);

  const loadMore = async () => {
    const seq = requestSeq.current;
    setLoadingMore(true);
    const page = await fetchPage(transactions.length);
    setLoadingMore(false);
    if (seq !== requestSeq.current || !page) return;
    setTransactions((prev) => {
      const seen = new Set(prev.map((tx) => tx.id));
      return [...prev, ...page.items.filter((tx) => !seen.has(tx.id))];
    });
    setHasMore(page.hasMore);
  };

  useEffect(() => {
    fetchCategories();
    fetchPendingCount();
  }, [fetchCategories, fetchPendingCount]);

  useEffect(() => {
    reload();
  }, [reload]);

  // みずほCSV取込が完了したら一覧を取り直す(バナー・当ページどちらから
  // 取り込んでも反映されるように)。
  useEffect(() => {
    const onUpdated = () => {
      reload();
      fetchPendingCount();
      fetchCategories();
    };
    window.addEventListener(MIZUHO_UPDATED_EVENT, onUpdated);
    return () => window.removeEventListener(MIZUHO_UPDATED_EVENT, onUpdated);
  }, [reload, fetchPendingCount, fetchCategories]);

  const handleSelectCategory = async (tx: Transaction, category: string) => {
    // フォールバックカテゴリ(Other/その他)は未分類の初期値でもあるため、
    // 「未分類のまま Other を選び直す」場合は category === tx.category に
    // なってしまい、以前はここで何もせず終わっていた(選んでも未分類から
    // 消えないバグ)。まだレビューされていない(needsCategory)場合は、値が
    // 同じでも実際に保存してreviewedにする。
    if (!category || (category === tx.category && !needsCategory(tx))) return;
    setSavingId(tx.id);
    const res = await fetch(`/api/transactions/${tx.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category }),
    });
    setSavingId(null);
    if (!res.ok) {
      toast.error("Failed to update category");
      return;
    }
    toast.success(`Categorized as "${category}"`);
    // 変わるのはこの1件だけなので、全件取り直さず手元で更新する。今の絞り込みに
    // 合わなくなった行(未分類タブで分類した・別カテゴリに移した)は一覧から外す。
    const stillMatches = catFilter === "all" || (catFilter !== "needs_category" && catFilter === category);
    setTransactions((prev) =>
      stillMatches
        ? prev.map((t) => (t.id === tx.id ? { ...t, category, reviewed: true } : t))
        : prev.filter((t) => t.id !== tx.id),
    );
    fetchPendingCount();
    if (!usedCategories.includes(category)) fetchCategories();
  };

  const handleSaveNote = async (id: string, note: string | null) => {
    setTransactions((prev) => prev.map((tx) => (tx.id === id ? { ...tx, note } : tx)));
    const res = await fetch(`/api/transactions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note }),
    });
    if (!res.ok) toast.error("Failed to save note");
  };

  const handleToggleSpecialExpense = async (id: string, next: boolean) => {
    const res = await fetch(`/api/transactions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ specialExpense: next }),
    });
    if (!res.ok) {
      toast.error("Failed to save");
      return;
    }
    const updated = await res.json();
    setTransactions((prev) =>
      prev.map((tx) =>
        tx.id === id
          ? { ...tx, excluded_from_dashboard: updated.excluded_from_dashboard, special_entry_id: updated.special_entry_id }
          : tx,
      ),
    );
    toast.success(next ? "Marked as special expense" : "Unmarked as special expense");
  };

  // 未分類をすべて分類し終えるとUncategorizedタブごと消えるため、その状態のまま
  // 残さず「すべて」タブへ自動でフォーカスを移す。
  useEffect(() => {
    if (loaded && catFilter === "needs_category" && pendingCount === 0) {
      setCatFilter("all");
    }
  }, [loaded, catFilter, pendingCount]);

  return (
    <div className="flex flex-col gap-3.5 max-w-[900px]">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild className="text-xs" style={{ color: DC.textSecondary }}>
              <Link href="/">{t(lang, "dashboard")}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className="text-xs" style={{ color: DC.textPrimary }}>
              {t(lang, "dashTransactionsTitle")}
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex items-center gap-2 flex-wrap">
        <div
          className="flex items-center gap-2 rounded-[10px] border px-3.5 py-2.5 flex-1 max-w-[340px]"
          style={{ borderColor: DC.cardBorder, backgroundColor: DC.cardBg }}
        >
          <Search size={14} style={{ color: DC.textFaint }} className="shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t(lang, "txSearchPlaceholder")}
            className="flex-1 text-[12.5px] bg-transparent outline-none border-none min-w-0"
            style={{ color: DC.textPrimary }}
          />
        </div>
        <button
          type="button"
          onClick={() => setMizuhoOpen(true)}
          className="flex items-center gap-1.5 rounded-[10px] border px-3 py-2.5 text-[12.5px] font-semibold cursor-pointer transition-all hover:brightness-95 active:scale-95 shrink-0"
          style={{ borderColor: DC.cardBorder, backgroundColor: DC.cardBg, color: DC.textSecondary }}
        >
          <UploadCloud size={14} style={{ color: DC.textFaint }} />
          {t(lang, "mizuhoUploadBtn")}
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {pendingCount > 0 && (
          <button
            type="button"
            onClick={() => setCatFilter("needs_category")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold cursor-pointer transition-all border hover:brightness-95 active:scale-95"
            style={
              catFilter === "needs_category"
                ? { backgroundColor: DC.primaryHover, color: "#fff", borderColor: DC.primaryHover }
                : { backgroundColor: DC.cardBg, color: DC.primaryHover, borderColor: "#F0C7D8" }
            }
          >
            <AlertCircle size={11} />
            {tf(lang, "txUncategorized", { count: pendingCount })}
          </button>
        )}
        <button
          type="button"
          onClick={() => setCatFilter("all")}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold cursor-pointer transition-all border hover:brightness-95 active:scale-95"
          style={
            catFilter === "all"
              ? { backgroundColor: DC.textPrimary, color: "#fff", borderColor: DC.textPrimary }
              : { backgroundColor: DC.cardBg, color: DC.textSecondary, borderColor: DC.cardBorder }
          }
        >
          <Sparkles size={12} />
          {t(lang, "txAll")}
        </button>
        {usedCategories.map((cat) => {
          const Icon = getCategoryIcon(cat);
          const active = catFilter === cat;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => setCatFilter(cat)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold cursor-pointer transition-all border hover:brightness-95 active:scale-95"
              style={
                active
                  ? { backgroundColor: DC.textPrimary, color: "#fff", borderColor: DC.textPrimary }
                  : { backgroundColor: DC.cardBg, color: DC.textSecondary, borderColor: DC.cardBorder }
              }
            >
              <Icon size={12} style={{ color: active ? "#fff" : getCategoryHex(cat) }} />
              {catLabel(lang, cat)}
            </button>
          );
        })}
      </div>

      <div className="rounded-[14px] border overflow-hidden" style={{ borderColor: DC.cardBorder, backgroundColor: DC.cardBg }}>
        {!loaded ? null : transactions.length === 0 ? (
          <p className="text-sm text-center py-10" style={{ color: DC.textSecondary }}>
            {search.trim() ? tf(lang, "txNoMatch", { query: search }) : t(lang, "txNoTransactions")}
          </p>
        ) : (
          transactions.map((tx) => {
            const uncategorized = needsCategory(tx);
            return (
              <div
                key={tx.id}
                className="group flex items-center gap-3 px-4.5 py-3 border-b last:border-b-0 flex-wrap"
                style={{ borderColor: DC.trackAlt, backgroundColor: DC.cardBg }}
              >
                <span className="w-[74px] shrink-0 whitespace-nowrap text-[11.5px]" style={{ color: DC.textFaint }}>
                  {formatDateShort(tx.date)}
                </span>
                <SourceBadge source={tx.source} lang={lang} />
                <span className="flex-1 min-w-[120px] text-[13px] font-normal truncate" style={{ color: DC.textPrimary }}>
                  {tx.store}
                </span>
                <span className="w-24 shrink-0 text-right text-[13px] font-normal font-num" style={{ color: DC.textPrimary }}>
                  {formatAmount(tx.amount)}
                </span>
                <div className="w-[150px] shrink-0 flex items-center gap-1.5">
                  {!isSpecial(tx) && (
                    <>
                      {uncategorized && (
                        <AlertCircle size={13} style={{ color: DC.primaryHover }} className="shrink-0" />
                      )}
                      <Select
                        value={uncategorized ? "" : tx.category}
                        onValueChange={(v) => handleSelectCategory(tx, v)}
                        disabled={savingId === tx.id}
                      >
                        <SelectTrigger
                          className="h-auto w-full items-center border-0 bg-transparent p-0 shadow-none cursor-pointer [&>svg]:hidden focus:outline-none focus-visible:ring-1 focus-visible:ring-offset-1"
                        >
                          {/* DSのSelectTriggerは直下のspanに line-clamp-1(display:-webkit-box)を
                              当てるため、バッジを直接置くとflexが崩れてアイコンとラベルが縦に
                              ずれる。ラッパーspanで受けて中身のflexを保つ。
                              未分類はフォールバック値の「その他」を見せず空欄(点線枠)にする。 */}
                          <span className="block w-full min-w-0">
                            {uncategorized ? (
                              <span
                                className="block h-5 w-16 rounded-md border border-dashed"
                                style={{ borderColor: "#F0C7D8" }}
                              />
                            ) : (
                              <CategoryBadgeInline category={tx.category} lang={lang} />
                            )}
                          </span>
                        </SelectTrigger>
                        <SelectContent>
                          {categories.map((cat) => (
                            <SelectItem key={cat} value={cat}>
                              {catLabel(lang, cat)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </>
                  )}
                </div>
                {/* メモ・特別支出は行ごとに表示有無で幅が変わるため、固定幅の右寄せ枠に
                    入れて列(店名・金額・カテゴリ)の位置が行ごとにずれないようにする。 */}
                <div className="w-[236px] shrink-0 flex items-center justify-end gap-1.5">
                  <NoteTag value={tx.note} onSave={(v) => handleSaveNote(tx.id, v)} lang={lang} />
                  <SpecialExpenseToggle
                    active={tx.special_entry_id !== null}
                    onToggle={(v) => handleToggleSpecialExpense(tx.id, v)}
                    lang={lang}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>

      {hasMore && (
        <button
          type="button"
          onClick={loadMore}
          disabled={loadingMore}
          className="self-center rounded-[10px] border px-4 py-2 text-[12.5px] font-semibold cursor-pointer transition-all hover:brightness-95 active:scale-95 disabled:opacity-60 disabled:cursor-default"
          style={{ borderColor: DC.cardBorder, backgroundColor: DC.cardBg, color: DC.textSecondary }}
        >
          {loadingMore ? t(lang, "txLoadingMore") : t(lang, "txLoadMore")}
        </button>
      )}

      <MizuhoImportDialog open={mizuhoOpen} onOpenChange={setMizuhoOpen} lang={lang} />
    </div>
  );
}

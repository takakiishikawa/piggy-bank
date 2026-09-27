"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Inbox, List, PiggyBank, Plus, TrendingDown, TrendingUp } from "lucide-react";
import { getCategoryColors, getCategoryColorTint } from "@/lib/category-colors";
import { getCategoryIcon } from "@/lib/category-icons";
import { makeFormatAmount, toDisplayAmount, toVndAmount, withThousands } from "@/lib/currency";
import { usePreferences } from "@/lib/preferences";
import { catLabel, t, tf, type Lang } from "@/lib/scenario/dictionary";
import { NoteTag } from "@/components/note-tag";
import { CashWalletDialog } from "@/components/cash-wallet-dialog";
import { CASH_CATEGORY } from "@/lib/cash";
import { SpecialExpenseToggle } from "@/components/special-expense-toggle";
import type { DisplayCurrency } from "@/components/currency-switch";
import {
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DatePicker,
  Input,
  Skeleton,
  toast,
} from "@takaki/go-design-system";

interface CategoryEntry {
  id: string;
  name: string;
  budget: number;
  is_fixed: boolean;
  actual: number;
}

interface DashboardData {
  variableCategories: CategoryEntry[];
  fixedCategories: CategoryEntry[];
  variableTotalBudget: number;
  variableTotalActual: number;
  fixedTotalBudget: number;
  fixedTotalActual: number;
  dayOfMonth: number;
  daysInMonth: number;
  forecastVnd: number | null;
  savingsImpactVnd: number | null;
  lifeBudgetVnd: number;
  cashBalanceVnd: number;
  cashAvailableVnd: number;
}

interface TxItem {
  id: string;
  store: string;
  amount: number;
  category: string;
  date: string;
  note: string | null;
  excluded_from_dashboard: boolean;
  special_entry_id: string | null;
}

const CARD_SHADOW = "0 1px 2px rgba(120,72,10,.04), 0 8px 24px rgba(120,72,10,.05)";

function CategoryIcon({ name }: { name: string }) {
  const { text } = getCategoryColors(name);
  const Icon = getCategoryIcon(name);
  return <Icon size={16} style={{ color: text }} className="shrink-0" />;
}

function ProgressBar({
  actual,
  budget,
  todayPct,
  showToday,
  fillColor,
  lang = "en",
}: {
  actual: number;
  budget: number;
  todayPct: number;
  showToday: boolean;
  fillColor?: string;
  lang?: Lang;
}) {
  const pct = budget > 0 ? Math.min(100, Math.round((actual / budget) * 100)) : 0;
  const over = budget > 0 && actual > budget;
  const alert = budget > 0 && pct > todayPct;

  const barColor = budget === 0
    ? "var(--color-text-subtle)"
    : over
      ? "var(--color-danger)"
      : (fillColor ?? "var(--color-primary)");

  return (
    <div
      className="relative h-2 rounded-full overflow-visible"
      style={{ backgroundColor: "var(--kg-track)" }}
    >
      <div
        className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
        style={{ width: `${pct}%`, backgroundColor: barColor }}
      />
      {showToday && budget > 0 && (
        <div
          className="absolute top-[-4px] h-4 w-0.5 rounded-sm z-10"
          style={{ left: `${Math.min(100, todayPct)}%`, backgroundColor: "var(--color-text-primary)" }}
          title={tf(lang, "dashOnTrackLine", { pct: Math.round(todayPct) })}
        />
      )}
      {alert && !over && (
        <div
          className="absolute inset-y-0 right-0 w-1.5 rounded-r-full"
          style={{ backgroundColor: "var(--color-danger)", opacity: 0.5 }}
        />
      )}
    </div>
  );
}

function VariableCategoryCard({
  cat,
  todayPct,
  onClick,
  formatAmount,
  lang,
}: {
  cat: CategoryEntry;
  todayPct: number;
  onClick: () => void;
  formatAmount: (vnd: number) => string;
  lang: Lang;
}) {
  const pctNum = cat.budget > 0 ? Math.round((cat.actual / cat.budget) * 100) : null;
  const over = cat.budget > 0 && cat.actual > cat.budget;
  const near = pctNum !== null && pctNum >= 80 && !over;
  const pctColor = over ? "var(--color-danger)" : near ? "var(--color-warning)" : "var(--color-text-secondary)";
  // プログレスバーはカテゴリごとの色ではなく、進捗状況(通常/80%超/100%超)に
  // 応じた共通の配色にする(以前はカテゴリごとにバーの色が違ってカラフル
  // すぎるという指摘があったため、カード間で統一)。
  const barColor = over ? "var(--color-danger)" : near ? "var(--color-warning)" : "var(--color-primary)";

  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left rounded-[13px] border p-[11px_14px] transition-all bg-[var(--color-surface-subtle)] hover:bg-muted/40 active:scale-[0.98] active:bg-muted/60 cursor-pointer"
      style={{ borderColor: "var(--color-border-default)" }}
    >
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[9px]"
            style={{ backgroundColor: getCategoryColorTint(cat.name) }}
          >
            <CategoryIcon name={cat.name} />
          </div>
          <span className="text-[13.5px] font-semibold truncate" style={{ color: "var(--color-text-primary)" }}>
            {catLabel(lang, cat.name)}
          </span>
        </div>
        {pctNum !== null && (
          <span className="font-num text-[13px] font-bold shrink-0" style={{ color: pctColor }}>
            {pctNum}%
          </span>
        )}
      </div>
      <span className="text-[12.5px]" style={{ color: "var(--color-text-secondary)" }}>
        <span className="font-num font-semibold" style={{ color: "var(--color-text-primary)" }}>
          {formatAmount(cat.actual)}
        </span>
        {cat.budget > 0 && <span className="font-num"> / {formatAmount(cat.budget)}</span>}
      </span>
      <div className="mt-1.5">
        <ProgressBar
          actual={cat.actual}
          budget={cat.budget}
          todayPct={todayPct}
          showToday={false}
          fillColor={barColor}
        />
      </div>
    </button>
  );
}

// 現金財布カード。予算比ではなく「財布残高(繰越込み) / 今月使えた額(繰越 + 今月の
// 引き出し)」を出し、クリックで現金支出の記録ダイアログを開く(lib/cash.ts)。バーは
// 使えた額のうち、まだ財布に残っている割合。
function CashCard({
  balanceVnd,
  availableVnd,
  unitemizedSpentVnd,
  onClick,
  formatAmount,
  lang,
}: {
  balanceVnd: number;
  availableVnd: number;
  // 今月「手元の現金に合わせる」で確定した現金(内訳なし)の支出
  unitemizedSpentVnd: number;
  onClick: () => void;
  formatAmount: (vnd: number) => string;
  lang: Lang;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={t(lang, "cashCardHint")}
      className="text-left rounded-[13px] border p-[11px_14px] transition-all bg-[var(--color-surface-subtle)] hover:bg-muted/40 active:scale-[0.98] active:bg-muted/60 cursor-pointer"
      style={{ borderColor: "var(--color-border-default)" }}
    >
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[9px]"
            style={{ backgroundColor: getCategoryColorTint(CASH_CATEGORY) }}
          >
            <CategoryIcon name={CASH_CATEGORY} />
          </div>
          <span className="text-[13.5px] font-semibold truncate" style={{ color: "var(--color-text-primary)" }}>
            {t(lang, "cashCardTitle")}
          </span>
        </div>
        <span
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md"
          style={{ backgroundColor: "var(--kg-track)", color: "var(--color-text-secondary)" }}
        >
          <Plus size={12} />
        </span>
      </div>
      <span className="text-[12.5px]" style={{ color: "var(--color-text-secondary)" }}>
        <span className="font-num font-semibold" style={{ color: "var(--color-text-primary)" }}>
          {formatAmount(balanceVnd)}
        </span>
        <span className="font-num"> / {formatAmount(availableVnd)}</span>
      </span>
      <div className="mt-1.5">
        <ProgressBar
          actual={balanceVnd}
          budget={availableVnd}
          todayPct={0}
          showToday={false}
          fillColor="var(--color-text-subtle)"
        />
      </div>
      {unitemizedSpentVnd > 0 && (
        <span className="block mt-1.5 text-[11px]" style={{ color: "var(--color-text-secondary)" }}>
          {t(lang, "cashUnitemizedThisMonth")}{" "}
          <span className="font-num font-semibold">{formatAmount(unitemizedSpentVnd)}</span>
        </span>
      )}
    </button>
  );
}

// 変動費カードと同じく、進捗バー・%表示付きに統一(固定費も予算に対する実績が
// ひと目でわかった方がいいという指摘のため)。
function FixedCategoryCard({
  cat,
  todayPct,
  onClick,
  formatAmount,
  lang,
}: {
  cat: CategoryEntry;
  todayPct: number;
  onClick: () => void;
  formatAmount: (vnd: number) => string;
  lang: Lang;
}) {
  const pctNum = cat.budget > 0 ? Math.round((cat.actual / cat.budget) * 100) : null;
  const over = cat.budget > 0 && cat.actual > cat.budget;
  const near = pctNum !== null && pctNum >= 80 && !over;
  const pctColor = over ? "var(--color-danger)" : near ? "var(--color-warning)" : "var(--color-text-secondary)";
  // プログレスバーは変動費カードと同じ、進捗状況に応じた共通配色にする
  // (以前は固定費だけ常に茶色固定で、変動費側と方針が食い違っていた)。
  const barColor = over ? "var(--color-danger)" : near ? "var(--color-warning)" : "var(--color-primary)";

  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left rounded-[13px] border p-[11px_14px] transition-all bg-[var(--color-surface-subtle)] hover:bg-muted/40 active:scale-[0.98] active:bg-muted/60 cursor-pointer"
      style={{ borderColor: "var(--color-border-default)" }}
    >
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[9px]"
            style={{ backgroundColor: getCategoryColorTint(cat.name) }}
          >
            <CategoryIcon name={cat.name} />
          </div>
          <span className="text-[13.5px] font-semibold truncate" style={{ color: "var(--color-text-primary)" }}>
            {catLabel(lang, cat.name)}
          </span>
        </div>
        {pctNum !== null && (
          <span className="font-num text-[13px] font-bold shrink-0" style={{ color: pctColor }}>
            {pctNum}%
          </span>
        )}
      </div>
      <span className="text-[12.5px]" style={{ color: "var(--color-text-secondary)" }}>
        <span className="font-num font-semibold" style={{ color: "var(--color-text-primary)" }}>
          {formatAmount(cat.actual)}
        </span>
        {cat.budget > 0 && <span className="font-num"> / {formatAmount(cat.budget)}</span>}
      </span>
      <div className="mt-1.5">
        <ProgressBar
          actual={cat.actual}
          budget={cat.budget}
          todayPct={todayPct}
          showToday={false}
          fillColor={barColor}
        />
      </div>
    </button>
  );
}

interface InvestmentEntry {
  id: string;
  amount_vnd: number;
  invested_on: string;
  note: string | null;
}

function toDateInputValue(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// 「現金→投資」へお金を動かした記録を残すダイアログ。Simulationの月次表示側で
// 「経過済みの月は実際の投資額をそのまま使う」の元データになる。
function InvestmentDialog({
  open,
  onOpenChange,
  currency,
  lang,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  currency: DisplayCurrency;
  lang: Lang;
  onSaved: () => void;
}) {
  const [amountInput, setAmountInput] = useState("");
  const [name, setName] = useState("");
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const val = parseInt(amountInput.replace(/[^0-9]/g, ""), 10);
    if (isNaN(val) || val <= 0 || !date) return;
    const amountVnd = toVndAmount(val, currency);
    setSaving(true);
    const res = await fetch("/api/investments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amountVnd, investedOn: toDateInputValue(date), note: name.trim() || undefined }),
    });
    setSaving(false);
    if (!res.ok) {
      toast.error(t(lang, "investSaveFailed"));
      return;
    }
    toast.success(t(lang, "investSaved"));
    setAmountInput("");
    setName("");
    setDate(new Date());
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm p-0 overflow-hidden">
        <DialogHeader className="px-5 py-4 border-b">
          <DialogTitle>{t(lang, "investRecordBtn")}</DialogTitle>
        </DialogHeader>
        <div className="px-5 py-4 flex flex-col gap-3.5">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold" style={{ color: "var(--color-text-secondary)" }}>
              {t(lang, "investAmountLabel")}
            </span>
            <Input
              type="text"
              inputMode="numeric"
              autoFocus
              value={withThousands(amountInput, currency)}
              onChange={(e) => setAmountInput(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder={`0 (${currency})`}
              className="h-9 font-num"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold" style={{ color: "var(--color-text-secondary)" }}>
              {t(lang, "investNameLabel")}
            </span>
            <Input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t(lang, "investNamePlaceholder")}
              className="h-9"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold" style={{ color: "var(--color-text-secondary)" }}>
              {t(lang, "investDateLabel")}
            </span>
            <DatePicker value={date} onChange={setDate} toDate={new Date()} />
          </div>
          <Button onClick={handleSave} disabled={saving || !amountInput || !date}>
            {t(lang, "investRecordBtn")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function Dashboard() {
  const { currency, lang } = usePreferences();
  const formatAmount = makeFormatAmount(currency);
  const [data, setData] = useState<DashboardData | null>(null);
  const [uncategorizedCount, setUncategorizedCount] = useState(0);
  const [investments, setInvestments] = useState<InvestmentEntry[]>([]);
  const [investDialogOpen, setInvestDialogOpen] = useState(false);
  const [cashDialogOpen, setCashDialogOpen] = useState(false);
  const [detail, setDetail] = useState<{
    categoryName: string;
    txs: TxItem[] | null;
  } | null>(null);

  const fetchDashboard = useCallback(async () => {
    const [dashRes, uncatRes] = await Promise.all([
      fetch("/api/dashboard"),
      fetch("/api/transactions/uncategorized-count"),
    ]);
    if (dashRes.ok) setData(await dashRes.json());
    if (uncatRes.ok) {
      const { count } = (await uncatRes.json()) as { count: number };
      setUncategorizedCount(count ?? 0);
    }
  }, []);

  const fetchInvestments = useCallback(async () => {
    const res = await fetch("/api/investments");
    if (res.ok) setInvestments(await res.json());
  }, []);

  useEffect(() => {
    fetchDashboard();
    fetchInvestments();
  }, [fetchDashboard, fetchInvestments]);

  const totalInvestedVnd = useMemo(
    () => investments.reduce((s, e) => s + e.amount_vnd, 0),
    [investments],
  );

  const openCategory = useCallback(async (categoryName: string) => {
    setDetail({ categoryName, txs: null });
    try {
      const params = new URLSearchParams({ period: "month", category: categoryName });
      const r = await fetch(`/api/transactions?${params.toString()}`);
      const txs = r.ok ? ((await r.json()) as TxItem[]) : [];
      setDetail((d) =>
        d?.categoryName === categoryName ? { ...d, txs } : d,
      );
    } catch {
      setDetail((d) =>
        d?.categoryName === categoryName ? { ...d, txs: [] } : d,
      );
    }
  }, []);

  const handleSaveNote = useCallback(
    async (id: string, note: string | null) => {
      setDetail((d) =>
        d && d.txs
          ? { ...d, txs: d.txs.map((t) => (t.id === id ? { ...t, note } : t)) }
          : d,
      );
      const res = await fetch(`/api/transactions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note }),
      });
      if (!res.ok) toast.error("Failed to save note");
    },
    [],
  );

  const handleToggleSpecialExpense = useCallback(
    async (id: string, next: boolean) => {
      const res = await fetch(`/api/transactions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ specialExpense: next }),
      });
      if (res.ok) {
        const updated = await res.json();
        setDetail((d) =>
          d && d.txs
            ? {
                ...d,
                txs: d.txs.map((t) =>
                  t.id === id
                    ? {
                        ...t,
                        excluded_from_dashboard: updated.excluded_from_dashboard,
                        special_entry_id: updated.special_entry_id,
                      }
                    : t,
                ),
              }
            : d,
        );
        toast.success(next ? "Marked as special expense" : "Unmarked as special expense");
      } else {
        toast.error("Failed to save");
      }
      fetchDashboard();
    },
    [fetchDashboard],
  );

  const todayPct = data
    ? Math.round((data.dayOfMonth / data.daysInMonth) * 100)
    : 0;

  const hasBudgets = data
    ? data.variableTotalBudget > 0 || data.fixedTotalBudget > 0
    : false;

  // 現金(内訳なし)は専用のCashCardで先頭に出すので、通常のカード一覧からは外す。
  const hasCashCategory = data?.variableCategories.some((c) => c.name === CASH_CATEGORY) ?? false;
  const sortedVariable = data
    ? data.variableCategories.filter((c) => c.name !== CASH_CATEGORY).sort((a, b) => b.budget - a.budget)
    : [];
  const cashTargetCategories = data
    ? [...data.variableCategories, ...data.fixedCategories].map((c) => c.name).filter((n) => n !== CASH_CATEGORY)
    : [];
  const sortedFixed = data
    ? [...data.fixedCategories].sort((a, b) => b.budget - a.budget)
    : [];

  const positive = (data?.savingsImpactVnd ?? 0) >= 0;

  return (
    <div>
      <div className="mt-6 flex flex-col gap-4">
        <Card
          className="p-6 rounded-2xl animate-fade-up"
          style={{
            animationDelay: "0ms",
            animationFillMode: "both",
            borderColor: "var(--color-border-default)",
            boxShadow: CARD_SHADOW,
          }}
        >
          <div className="flex items-center justify-between flex-wrap gap-4">
            {!data ? (
              <Skeleton className="h-8 w-64 rounded-lg" />
            ) : !hasBudgets ? (
              <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
                {t(lang, "dashNoBudgetForecast")}
              </p>
            ) : data.forecastVnd === null ? (
              <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
                {t(lang, "dashNoTransactionsThisMonth")}
              </p>
            ) : (
              <div>
                <p
                  className="text-xs font-semibold uppercase tracking-[0.06em] mb-2"
                  style={{ color: "var(--color-text-subtle)" }}
                >
                  {t(lang, "dashMonthForecast")}
                </p>
                <div className="flex items-baseline gap-3.5 flex-wrap">
                  <p
                    className="font-display text-[38px] font-bold leading-none tracking-[-0.01em]"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    {formatAmount(data.forecastVnd)}
                  </p>
                  <span
                    className="flex items-center gap-1.5 text-sm font-medium"
                    style={{ color: positive ? "var(--color-success)" : "var(--color-danger)" }}
                  >
                    {positive ? <TrendingDown size={14} /> : <TrendingUp size={14} />}
                    {positive
                      ? `${formatAmount(data.savingsImpactVnd ?? 0)} ${t(lang, "dashUnderBudget")}`
                      : `${formatAmount(Math.abs(data.savingsImpactVnd ?? 0))} ${t(lang, "dashOverBudget")}`}
                  </span>
                </div>
              </div>
            )}
            <div className="flex items-center gap-2 shrink-0">
              {uncategorizedCount === 0 && (
                <a
                  href="/transactions"
                  title={t(lang, "dashTransactionsTitle")}
                  className="flex items-center justify-center h-9 w-9 rounded-[10px] transition-all hover:brightness-95 active:scale-[0.98]"
                  style={{ backgroundColor: "var(--kg-track)", color: "var(--color-text-secondary)" }}
                >
                  <List size={15} />
                </a>
              )}
              {uncategorizedCount > 0 && (
                <a
                  href="/transactions?filter=needs_category"
                  className="flex items-center gap-2 h-9 rounded-[10px] px-3.5 text-xs font-semibold transition-all hover:brightness-95 active:scale-[0.98]"
                  style={{ backgroundColor: "#F7E1EA", border: "1px solid #F0C7D8", color: "#8C3A5E" }}
                >
                  <Inbox size={14} className="shrink-0" />
                  {tf(lang, "dashToReview", { count: uncategorizedCount })}
                </a>
              )}
              <button
                type="button"
                onClick={() => setInvestDialogOpen(true)}
                title={t(lang, "investRecordBtn")}
                className="flex items-center gap-2 h-9 rounded-[10px] px-3.5 text-xs font-semibold transition-all hover:brightness-95 active:scale-[0.98]"
                style={{ backgroundColor: "var(--kg-track)", color: "var(--color-text-secondary)" }}
              >
                <PiggyBank size={14} className="shrink-0" />
                {t(lang, "investRecordBtn")}
                {totalInvestedVnd > 0 && (
                  <span className="font-num" style={{ color: "var(--color-text-primary)" }}>
                    · {formatAmount(totalInvestedVnd)}
                  </span>
                )}
              </button>
            </div>
          </div>
        </Card>

        <InvestmentDialog
          open={investDialogOpen}
          onOpenChange={setInvestDialogOpen}
          currency={currency}
          lang={lang}
          onSaved={fetchInvestments}
        />

        <CashWalletDialog
          open={cashDialogOpen}
          onOpenChange={setCashDialogOpen}
          categories={cashTargetCategories}
          currency={currency}
          lang={lang}
          onSaved={fetchDashboard}
        />

        <Card
          className="p-6 rounded-2xl overflow-hidden animate-fade-up"
          style={{
            animationDelay: "80ms",
            animationFillMode: "both",
            borderColor: "var(--color-border-default)",
            boxShadow: CARD_SHADOW,
          }}
        >
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <span className="font-display text-[19px] font-semibold shrink-0" style={{ color: "var(--color-text-primary)" }}>
              {t(lang, "dashVariableCosts")}
            </span>
            {data && data.variableTotalBudget > 0 && (
              <div
                className="flex-1 min-w-24"
                title={tf(lang, "dashOnTrack", { pct: todayPct, day: data.dayOfMonth, days: data.daysInMonth })}
              >
                <ProgressBar
                  actual={data.variableTotalActual}
                  budget={data.variableTotalBudget}
                  todayPct={todayPct}
                  showToday={true}
                  lang={lang}
                />
              </div>
            )}
            {data && data.variableTotalBudget > 0 && (
              <span className="text-sm shrink-0" style={{ color: "var(--color-text-secondary)" }}>
                <b className="font-num" style={{ color: "var(--color-text-primary)" }}>
                  {formatAmount(data.variableTotalActual)}
                </b>{" "}
                / {formatAmount(data.variableTotalBudget)}
              </span>
            )}
          </div>

          {!data ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} className="h-20 rounded-lg" />
              ))}
            </div>
          ) : sortedVariable.length === 0 && !hasCashCategory ? (
            <p className="py-6 text-sm text-center" style={{ color: "var(--color-text-secondary)" }}>
              {t(lang, "dashNoVariableCategories")}
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {hasCashCategory && (
                <CashCard
                  balanceVnd={data.cashBalanceVnd}
                  availableVnd={data.cashAvailableVnd}
                  unitemizedSpentVnd={data.variableCategories.find((c) => c.name === CASH_CATEGORY)?.actual ?? 0}
                  onClick={() => setCashDialogOpen(true)}
                  formatAmount={formatAmount}
                  lang={lang}
                />
              )}
              {sortedVariable.map((cat) => (
                <VariableCategoryCard
                  key={cat.id}
                  cat={cat}
                  todayPct={todayPct}
                  onClick={() => openCategory(cat.name)}
                  formatAmount={formatAmount}
                  lang={lang}
                />
              ))}
            </div>
          )}
        </Card>

        <Card
          className="p-6 rounded-2xl overflow-hidden animate-fade-up"
          style={{
            animationDelay: "160ms",
            animationFillMode: "both",
            borderColor: "var(--color-border-default)",
            boxShadow: CARD_SHADOW,
          }}
        >
          <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
            <span className="font-display text-[19px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
              {t(lang, "dashFixedCosts")}
            </span>
            {data && data.fixedTotalBudget > 0 && (
              <span className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
                <b className="font-num" style={{ color: "var(--color-text-primary)" }}>
                  {formatAmount(data.fixedTotalActual > 0 ? data.fixedTotalActual : data.fixedTotalBudget)}
                </b>
              </span>
            )}
          </div>
          {!data ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 rounded-lg" />
              ))}
            </div>
          ) : sortedFixed.length === 0 ? (
            <p className="py-6 text-sm text-center" style={{ color: "var(--color-text-secondary)" }}>
              {t(lang, "dashNoFixedCategories")}
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {sortedFixed.map((cat) => (
                <FixedCategoryCard
                  key={cat.id}
                  cat={cat}
                  todayPct={todayPct}
                  onClick={() => openCategory(cat.name)}
                  formatAmount={formatAmount}
                  lang={lang}
                />
              ))}
            </div>
          )}
        </Card>
      </div>

      <Dialog
        open={detail !== null}
        onOpenChange={(o) => {
          if (!o) setDetail(null);
        }}
      >
        <DialogContent className="max-w-lg p-0 overflow-hidden">
          <DialogHeader className="px-7 py-5 border-b" style={{ borderColor: "var(--color-border-default)" }}>
            <DialogTitle className="flex items-center gap-2">
              {detail?.categoryName && catLabel(lang, detail.categoryName)}
              <span className="text-sm font-normal" style={{ color: "var(--color-text-secondary)" }}>
                {t(lang, "dashThisMonth")}
              </span>
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto px-7 py-5">
            {detail?.txs === null ? (
              <div className="space-y-2">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-10 w-full rounded" />
                ))}
              </div>
            ) : detail && detail.txs.length === 0 ? (
              <p className="text-center py-10 text-sm" style={{ color: "var(--color-text-secondary)" }}>
                {t(lang, "dashNoSpendingThisMonth")}
              </p>
            ) : (
              <>
                <ul className="divide-y" style={{ borderColor: "var(--color-border-subtle)" }}>
                  {detail?.txs?.map((t) => (
                    <li
                      key={t.id}
                      className="group flex items-center justify-between gap-4 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="text-sm truncate" style={{ color: "var(--color-text-primary)" }}>{t.store}</p>
                        <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
                          {new Date(t.date).toLocaleDateString(lang === "ja" ? "ja-JP" : "en-US", {
                            month: "short",
                            day: "numeric",
                          })}
                        </p>
                      </div>
                      <NoteTag value={t.note} onSave={(v) => handleSaveNote(t.id, v)} lang={lang} />
                      <SpecialExpenseToggle
                        active={t.special_entry_id !== null}
                        onToggle={(v) => handleToggleSpecialExpense(t.id, v)}
                        lang={lang}
                      />
                      <span className="font-num text-sm shrink-0" style={{ color: "var(--color-text-primary)" }}>
                        {formatAmount(t.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
                {detail && detail.txs && detail.txs.length > 0 && (
                  <div className="mt-3 pt-3 border-t flex items-center justify-between" style={{ borderColor: "var(--color-border-default)" }}>
                    <span className="text-sm" style={{ color: "var(--color-text-secondary)" }}>{t(lang, "dashTotal")}</span>
                    <span className="font-num font-semibold" style={{ color: "var(--color-text-primary)" }}>
                      {formatAmount(
                        detail.txs
                          .filter((t) => !t.excluded_from_dashboard)
                          .reduce((sum, t) => sum + t.amount, 0),
                      )}
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

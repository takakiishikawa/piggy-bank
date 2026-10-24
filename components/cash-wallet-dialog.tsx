"use client";

import { useCallback, useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import {
  Button,
  DatePicker,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  toast,
} from "@takaki/go-design-system";
import { makeFormatAmount, toVndAmount, withThousands } from "@/lib/currency";
import { catLabel, t, tf, type Lang } from "@/lib/scenario/dictionary";
import { CASH_WITHDRAWAL_CATEGORY, monthKeyOf, type CashWallet } from "@/lib/cash";
import type { DisplayCurrency } from "@/components/currency-switch";

function toDateInputValue(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// 現金財布: ATMで引き出した現金のうち、覚えている支出だけをカテゴリに振り分ける。
// 特定の引き出しとは紐づけず、日付の月の財布(引き出し額 − 記録済み)から差し引く。
export function CashWalletDialog({
  open,
  onOpenChange,
  categories,
  currency,
  lang,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  // 振り分け先に選べるカテゴリ名(用途不明自体は除く)
  categories: string[];
  currency: DisplayCurrency;
  lang: Lang;
  onSaved: () => void;
}) {
  const formatAmount = makeFormatAmount(currency);
  const [amountInput, setAmountInput] = useState("");
  const [category, setCategory] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [saving, setSaving] = useState(false);
  const [wallet, setWallet] = useState<CashWallet | null>(null);
  const [reconcileOpen, setReconcileOpen] = useState(false);
  const [onHandInput, setOnHandInput] = useState("");
  const [reconciling, setReconciling] = useState(false);

  const month = monthKeyOf(date ?? new Date());
  // 「手元の現金に合わせる」は今の残高に対する操作なので、今月を表示している時だけ出す。
  const isCurrentMonth = month === monthKeyOf(new Date());

  const fetchWallet = useCallback(async (m: string) => {
    const res = await fetch(`/api/cash-wallet?month=${m}`);
    if (res.ok) setWallet(await res.json());
  }, []);

  useEffect(() => {
    if (!open) return;
    setWallet(null);
    fetchWallet(month);
  }, [open, month, fetchWallet]);

  const amountVnd = (() => {
    const val = parseInt(amountInput.replace(/[^0-9]/g, ""), 10);
    return isNaN(val) ? 0 : toVndAmount(val, currency);
  })();
  const balanceVnd = wallet?.balanceVnd ?? 0;
  const exceeds = wallet !== null && amountVnd > balanceVnd;

  const handleSave = async () => {
    if (amountVnd <= 0 || !category || !date || exceeds) return;
    setSaving(true);
    const res = await fetch("/api/cash-wallet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amountVnd, category, date: toDateInputValue(date), note: note.trim() || undefined }),
    });
    setSaving(false);
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string; balanceVnd?: number } | null;
      toast.error(
        body?.error === "exceeds_balance"
          ? tf(lang, "cashExceedsBalance", { balance: formatAmount(body.balanceVnd ?? 0) })
          : t(lang, "cashSaveFailed"),
      );
      return;
    }
    toast.success(t(lang, "cashSaved"));
    setAmountInput("");
    setNote("");
    fetchWallet(month);
    onSaved();
  };

  const onHandVnd = (() => {
    const val = parseInt(onHandInput.replace(/[^0-9]/g, ""), 10);
    return isNaN(val) ? null : toVndAmount(val, currency);
  })();
  const reconcileDiffVnd = onHandVnd === null ? null : balanceVnd - onHandVnd;

  const handleReconcile = async () => {
    if (onHandVnd === null || reconcileDiffVnd === null || reconcileDiffVnd < 0) return;
    setReconciling(true);
    const res = await fetch("/api/cash-wallet/reconcile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ onHandVnd }),
    });
    setReconciling(false);
    if (!res.ok) {
      toast.error(t(lang, "cashSaveFailed"));
      return;
    }
    toast.success(t(lang, "cashReconciled"));
    setOnHandInput("");
    setReconcileOpen(false);
    fetchWallet(month);
    onSaved();
  };

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/cash-wallet/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error(t(lang, "cashDeleteFailed"));
      return;
    }
    fetchWallet(month);
    onSaved();
  };

  const labelStyle = { color: "var(--color-text-secondary)" };

  // この月の出入り(ATM引き出し = 入、現金支出の記録 = 出)を時系列に並べ、各行の後の
  // 財布残高を出す。残高が実際の財布とずれた時に、どこで差が出たか追えるようにするため。
  const ledger = (() => {
    if (!wallet) return [];
    const entries = [
      ...wallet.withdrawals.map((w) => ({
        key: `in-${w.id}`,
        id: w.id,
        kind: "in" as const,
        date: w.date,
        amount: w.amount,
        label: catLabel(lang, CASH_WITHDRAWAL_CATEGORY),
        sub: w.store,
      })),
      ...wallet.records.map((r) => ({
        key: `out-${r.id}`,
        id: r.id,
        kind: "out" as const,
        date: r.date,
        amount: r.amount,
        label: catLabel(lang, r.category),
        sub: r.note,
      })),
    ];
    // 古い順に残高を積み上げる(同じ時刻なら引き出しを先に)。表示は新しい順。
    entries.sort((x, y) => {
      const d = new Date(x.date).getTime() - new Date(y.date).getTime();
      if (d !== 0) return d;
      return x.kind === y.kind ? 0 : x.kind === "in" ? -1 : 1;
    });
    let balance = wallet.carriedOverVnd;
    const withBalance = entries.map((e) => {
      balance += e.kind === "in" ? e.amount : -e.amount;
      return { ...e, balanceAfter: balance };
    });
    return withBalance.reverse();
  })();

  const monthLabel = (() => {
    const [y, m] = month.split("-").map(Number);
    return lang === "ja"
      ? `${y}年${m}月`
      : new Date(y, m - 1, 1).toLocaleDateString("en-US", { year: "numeric", month: "long" });
  })();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* DSのDialogContentは grid なので、中身の最小幅で横にはみ出さないよう子に min-w-0 を付ける。 */}
      <DialogContent className="w-[calc(100vw-32px)] max-w-4xl p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle>
            {t(lang, "cashCardTitle")}
            <span className="ml-2 font-normal" style={labelStyle}>
              {monthLabel}
            </span>
          </DialogTitle>
        </DialogHeader>
        <div className="min-w-0 grid md:grid-cols-[minmax(0,1fr)_340px] max-h-[80vh] overflow-y-auto md:overflow-hidden">
          {/* 左: その月の財布の出入り(残高の内訳と明細) */}
          <section className="min-w-0 flex flex-col gap-3.5 px-6 py-5 md:overflow-y-auto md:max-h-[80vh]">
            {/* 繰越 + 引き出し − 記録した支出 − 用途不明 = 残高 */}
            {wallet === null ? (
              <Skeleton className="h-[72px] w-full rounded-[10px]" />
            ) : (
              <div
                className="grid grid-cols-2 sm:grid-cols-5 gap-x-3 gap-y-2 rounded-[10px] px-4 py-3"
                style={{ backgroundColor: "var(--kg-track)" }}
              >
                {(
                  [
                    { sign: "", label: t(lang, "cashCarriedOver"), value: wallet.carriedOverVnd, strong: false },
                    { sign: "+", label: t(lang, "cashWithdrawn"), value: wallet.withdrawnVnd, strong: false },
                    { sign: "−", label: t(lang, "cashRecordedItemized"), value: wallet.recordedVnd - wallet.unknownVnd, strong: false },
                    { sign: "−", label: t(lang, "cashUnknownUse"), value: wallet.unknownVnd, strong: false },
                    { sign: "=", label: t(lang, "cashBalance"), value: wallet.balanceVnd, strong: true },
                  ] as const
                ).map((s) => (
                  <div key={s.label} className="flex flex-col gap-0.5 min-w-0">
                    <span className="text-[11px] truncate" style={labelStyle}>
                      {s.sign && <span className="font-num mr-1">{s.sign}</span>}
                      {s.label}
                    </span>
                    <span
                      className={`font-num truncate ${s.strong ? "text-[15px] font-bold" : "text-[13.5px] font-semibold"}`}
                      style={{ color: "var(--color-text-primary)" }}
                    >
                      {formatAmount(s.value)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {wallet !== null && wallet.balanceVnd === 0 && wallet.recordedVnd === 0 && wallet.withdrawals.length === 0 ? (
              <p className="text-xs text-center py-1" style={labelStyle}>
                {t(lang, "cashNoWithdrawal")}
              </p>
            ) : null}

            {/* 手元の現金に合わせる: 実際の手元の額を入れると、残高との差額を今日の
                「用途不明」の支出として記録し、残高を手元の額にそろえる。 */}
            {wallet !== null && isCurrentMonth && wallet.balanceVnd > 0 && (
              reconcileOpen ? (
                <div className="flex flex-col gap-1.5 rounded-[10px] border px-3.5 py-3" style={{ borderColor: "var(--color-border-default)" }}>
                  <span className="text-xs font-semibold" style={labelStyle}>
                    {t(lang, "cashOnHandLabel")}
                  </span>
                  <div className="flex items-center gap-2">
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={withThousands(onHandInput, currency)}
                      onChange={(e) => setOnHandInput(e.target.value.replace(/[^0-9]/g, ""))}
                      placeholder={`0 (${currency})`}
                      className="h-9 font-num flex-1 min-w-0"
                    />
                    <Button
                      size="sm"
                      onClick={handleReconcile}
                      disabled={reconciling || reconcileDiffVnd === null || reconcileDiffVnd <= 0}
                    >
                      {t(lang, "cashReconcileApply")}
                    </Button>
                  </div>
                  {reconcileDiffVnd !== null && (
                    <span
                      className="text-[11px]"
                      style={{ color: reconcileDiffVnd < 0 ? "var(--color-danger)" : "var(--color-text-secondary)" }}
                    >
                      {reconcileDiffVnd < 0
                        ? t(lang, "cashOnHandExceeds")
                        : tf(lang, "cashReconcilePreview", { amount: formatAmount(reconcileDiffVnd) })}
                    </span>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setReconcileOpen(true)}
                  className="self-start text-xs font-semibold underline underline-offset-2 cursor-pointer"
                  style={labelStyle}
                >
                  {t(lang, "cashReconcileBtn")}
                </button>
              )
            )}

            {wallet !== null && (
              <div className="flex flex-col min-w-0">
                {ledger.length === 0 ? (
                  <p className="text-xs py-1" style={labelStyle}>
                    {t(lang, "cashNoRecords")}
                  </p>
                ) : (
                  <ul className="flex flex-col max-h-72 md:max-h-none overflow-y-auto">
                    <li
                      className="flex items-center gap-3 py-1.5 border-b text-[11px]"
                      style={{ ...labelStyle, borderColor: "var(--color-border-default)" }}
                    >
                      <span className="w-10 shrink-0">{t(lang, "cashDateLabel")}</span>
                      <span className="flex-1 min-w-0" />
                      <span className="w-24 shrink-0 text-right">{t(lang, "cashAmountLabel")}</span>
                      <span className="w-24 shrink-0 text-right">{t(lang, "cashBalance")}</span>
                      <span className="w-[21px] shrink-0" />
                    </li>
                    {ledger.map((e) => (
                      <li
                        key={e.key}
                        className="flex items-center gap-3 py-2 border-b last:border-b-0 text-[12.5px]"
                        style={{ borderColor: "var(--color-border-default)" }}
                      >
                        <span className="w-10 shrink-0 font-num" style={labelStyle}>
                          {new Date(e.date).toLocaleDateString(lang === "ja" ? "ja-JP" : "en-US", {
                            month: "numeric",
                            day: "numeric",
                          })}
                        </span>
                        <span className="flex-1 min-w-0 truncate" style={{ color: "var(--color-text-primary)" }}>
                          {e.label}
                          {e.sub && (
                            <span className="ml-1.5" style={labelStyle}>
                              {e.sub}
                            </span>
                          )}
                        </span>
                        <span
                          className="w-24 shrink-0 text-right font-num font-semibold"
                          style={{ color: e.kind === "in" ? "var(--color-success)" : "var(--color-text-primary)" }}
                        >
                          {e.kind === "in" ? "+" : "−"}
                          {formatAmount(e.amount)}
                        </span>
                        <span className="w-24 shrink-0 text-right font-num text-[11.5px]" style={labelStyle}>
                          {formatAmount(e.balanceAfter)}
                        </span>
                        {e.kind === "out" ? (
                          <button
                            type="button"
                            onClick={() => handleDelete(e.id)}
                            className="w-[21px] shrink-0 p-1 rounded-md cursor-pointer transition-colors hover:bg-muted/60"
                            style={labelStyle}
                            aria-label="delete"
                          >
                            <Trash2 size={13} />
                          </button>
                        ) : (
                          <span className="w-[21px] shrink-0" />
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </section>

          {/* 右: 現金支出の記録フォーム */}
          <section
            className="min-w-0 flex flex-col gap-3.5 px-6 py-5 border-t md:border-t-0 md:border-l md:overflow-y-auto md:max-h-[80vh]"
            style={{ borderColor: "var(--color-border-default)", backgroundColor: "var(--color-surface-subtle)" }}
          >
            <span className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
              {t(lang, "cashRecordBtn")}
            </span>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold" style={labelStyle}>
                {t(lang, "cashAmountLabel")}
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
              {exceeds && (
                <span className="text-[11px]" style={{ color: "var(--color-danger)" }}>
                  {tf(lang, "cashExceedsBalance", { balance: formatAmount(balanceVnd) })}
                </span>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold" style={labelStyle}>
                {t(lang, "cashCategoryLabel")}
              </span>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c} value={c}>
                      {catLabel(lang, c)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold" style={labelStyle}>
                {t(lang, "cashDateLabel")}
              </span>
              <DatePicker value={date} onChange={setDate} toDate={new Date()} />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold" style={labelStyle}>
                {t(lang, "cashNoteLabel")}
              </span>
              <Input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t(lang, "cashNotePlaceholder")}
                maxLength={200}
                className="h-9"
              />
            </div>
            <Button
              className="mt-1"
              onClick={handleSave}
              disabled={saving || amountVnd <= 0 || !category || !date || exceeds || wallet === null}
            >
              {t(lang, "cashRecordBtn")}
            </Button>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

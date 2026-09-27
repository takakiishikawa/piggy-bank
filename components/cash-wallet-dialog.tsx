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
import { monthKeyOf, type CashWallet } from "@/lib/cash";
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
  // 振り分け先に選べるカテゴリ名(現金(内訳なし)自体は除く)
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm p-0 overflow-hidden">
        <DialogHeader className="px-5 py-4 border-b">
          <DialogTitle>{t(lang, "cashRecordBtn")}</DialogTitle>
        </DialogHeader>
        <div className="px-5 py-4 flex flex-col gap-3.5">
          {/* 財布の状況(日付の月) */}
          {wallet === null ? (
            <Skeleton className="h-[52px] w-full rounded-[10px]" />
          ) : (
            <div
              className="grid grid-cols-4 gap-2 rounded-[10px] px-3 py-2.5"
              style={{ backgroundColor: "var(--kg-track)" }}
            >
              {(
                [
                  { label: t(lang, "cashCarriedOver"), value: wallet.carriedOverVnd, strong: false },
                  { label: t(lang, "cashWithdrawn"), value: wallet.withdrawnVnd, strong: false },
                  { label: t(lang, "cashRecorded"), value: wallet.recordedVnd, strong: false },
                  { label: t(lang, "cashBalance"), value: wallet.balanceVnd, strong: true },
                ] as const
              ).map((s) => (
                <div key={s.label} className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-[11px]" style={labelStyle}>
                    {s.label}
                  </span>
                  <span
                    className={`font-num text-[13px] truncate ${s.strong ? "font-bold" : "font-semibold"}`}
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    {formatAmount(s.value)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {wallet !== null && wallet.balanceVnd === 0 && wallet.recordedVnd === 0 ? (
            <p className="text-xs text-center py-1" style={labelStyle}>
              {t(lang, "cashNoWithdrawal")}
            </p>
          ) : null}

          {/* 手元の現金に合わせる: 実際の手元の額を入れると、残高との差額を今日の
              「現金(内訳なし)」の支出として記録し、残高を手元の額にそろえる。 */}
          {wallet !== null && isCurrentMonth && wallet.balanceVnd > 0 && (
            reconcileOpen ? (
              <div className="flex flex-col gap-1.5 rounded-[10px] border px-3 py-2.5" style={{ borderColor: "var(--color-border-default)" }}>
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
                    className="h-8 font-num flex-1"
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
          <Button onClick={handleSave} disabled={saving || amountVnd <= 0 || !category || !date || exceeds || wallet === null}>
            {t(lang, "cashRecordBtn")}
          </Button>

          {wallet !== null && (
            <div className="flex flex-col gap-1.5 pt-1 border-t" style={{ borderColor: "var(--color-border-default)" }}>
              <span className="text-xs font-semibold pt-2" style={labelStyle}>
                {t(lang, "cashRecordsTitle")}
              </span>
              {wallet.records.length === 0 ? (
                <p className="text-xs py-1" style={labelStyle}>
                  {t(lang, "cashNoRecords")}
                </p>
              ) : (
                <ul className="flex flex-col max-h-40 overflow-y-auto">
                  {wallet.records.map((r) => (
                    <li key={r.id} className="flex items-center gap-2 py-1.5 text-[12.5px]">
                      <span className="w-12 shrink-0 font-num" style={labelStyle}>
                        {new Date(r.date).toLocaleDateString(lang === "ja" ? "ja-JP" : "en-US", {
                          month: "numeric",
                          day: "numeric",
                        })}
                      </span>
                      <span className="flex-1 min-w-0 truncate" style={{ color: "var(--color-text-primary)" }}>
                        {catLabel(lang, r.category)}
                        {r.note && (
                          <span className="ml-1.5" style={labelStyle}>
                            {r.note}
                          </span>
                        )}
                      </span>
                      <span className="font-num shrink-0" style={{ color: "var(--color-text-primary)" }}>
                        {formatAmount(r.amount)}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDelete(r.id)}
                        className="shrink-0 p-1 rounded-md cursor-pointer transition-colors hover:bg-muted/60"
                        style={labelStyle}
                        aria-label="delete"
                      >
                        <Trash2 size={13} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

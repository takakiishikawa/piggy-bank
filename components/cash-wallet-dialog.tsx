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

  const month = monthKeyOf(date ?? new Date());

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
  const balanceVnd = wallet?.unallocatedVnd ?? 0;
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
              className="grid grid-cols-3 gap-2 rounded-[10px] px-3 py-2.5"
              style={{ backgroundColor: "var(--kg-track)" }}
            >
              {(
                [
                  { label: t(lang, "cashWithdrawn"), value: wallet.withdrawnVnd, strong: false },
                  { label: t(lang, "cashRecorded"), value: wallet.recordedVnd, strong: false },
                  { label: t(lang, "cashBalance"), value: wallet.unallocatedVnd, strong: true },
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

          {wallet !== null && wallet.withdrawnVnd === 0 ? (
            <p className="text-xs text-center py-1" style={labelStyle}>
              {t(lang, "cashNoWithdrawal")}
            </p>
          ) : null}

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

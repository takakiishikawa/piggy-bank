import type { createDb } from "@/lib/supabase/db";

type Db = ReturnType<typeof createDb>;

// 現金財布機能。
// - ATMで引き出した現金(摘要が「ＡＴＭ－」「７ＢＫ」で始まる取引)は、このカテゴリ
//   (= 種類「現金引き出し」)に入れ、その月の財布に加算する。
// - 覚えている現金支出は source='cash' の取引として記録し、選んだカテゴリの実績に
//   合算する。同時にその月の財布(=このカテゴリの実績)からは差し引く。
// - 結果として、このカテゴリの実績 = 引き出し額 − 記録した現金支出 = 「現金(内訳なし)」。
//   「その他」に埋もれないよう、変動費の独立したカテゴリとして扱う。
export const CASH_CATEGORY = "Cash (Unitemized)";

// みずほの摘要は全角(例: 「ＡＴＭ－１８５９７７－０７０５５４」「７ＢＫ００Ｍ７Ｏ－４３１５」)。
// 半角で来ても拾えるよう NFKC で正規化してから判定する。
export function isCashWithdrawalStore(store: string): boolean {
  const s = store.normalize("NFKC").trim().toUpperCase();
  return s.startsWith("ATM-") || s.startsWith("7BK");
}

// カテゴリ別実績の集計に取引1件を足し込む。現金支出(source='cash')は、選ばれた
// カテゴリに加算しつつ財布(CASH_CATEGORY)から差し引くので、全カテゴリ合計は
// 引き出し額のまま変わらない(二重計上しない)。
export function addTxToCategoryTotals(
  totals: Record<string, number>,
  tx: { category: string; amount: number; source?: string | null },
): void {
  totals[tx.category] = (totals[tx.category] ?? 0) + tx.amount;
  if (tx.source === "cash") {
    totals[CASH_CATEGORY] = (totals[CASH_CATEGORY] ?? 0) - tx.amount;
  }
}

export interface CashWallet {
  month: string; // 'YYYY-MM'
  withdrawnVnd: number;
  recordedVnd: number;
  // 引き出し額 − 記録済みの現金支出 = 現金(内訳なし)
  unallocatedVnd: number;
  records: { id: string; amount: number; category: string; date: string; note: string | null }[];
}

function monthRange(month: string): { start: Date; end: Date } {
  const [y, m] = month.split("-").map(Number);
  return {
    start: new Date(y, m - 1, 1),
    end: new Date(y, m, 0, 23, 59, 59, 999),
  };
}

export function monthKeyOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// 指定月の財布(引き出し額・記録済み現金支出)。特定の引き出しとは紐づけず、
// 月単位で「引き出した合計 − 記録した合計」を残高とする。
export async function fetchCashWallet(db: Db, month: string): Promise<CashWallet> {
  const { start, end } = monthRange(month);
  const [withdrawRes, recordRes] = await Promise.all([
    db
      .from("transactions")
      .select("amount")
      .eq("category", CASH_CATEGORY)
      .neq("source", "cash")
      // 特別支出にした引き出しは特別支出として計上済みなので財布には入れない
      // (ダッシュボードのcomputeMonthlyBudgetと同じ条件。入れると二重計上になり、
      // カードの引き出し額とダイアログの引き出し額も食い違う)。
      .eq("excluded_from_dashboard", false)
      .gte("date", start.toISOString())
      .lte("date", end.toISOString()),
    db
      .from("transactions")
      .select("id, amount, category, date, note")
      .eq("source", "cash")
      .gte("date", start.toISOString())
      .lte("date", end.toISOString())
      .order("date", { ascending: false }),
  ]);
  const withdrawnVnd = (withdrawRes.data ?? []).reduce((s, r) => s + (r.amount as number), 0);
  const records = (recordRes.data ?? []) as CashWallet["records"];
  const recordedVnd = records.reduce((s, r) => s + r.amount, 0);
  return { month, withdrawnVnd, recordedVnd, unallocatedVnd: withdrawnVnd - recordedVnd, records };
}

import type { createDb } from "@/lib/supabase/db";

type Db = ReturnType<typeof createDb>;

// 現金財布機能。
// - ATMで引き出した現金(摘要が「ＡＴＭ－」「７ＢＫ」で始まる取引)は、このカテゴリ
//   (= 種類「現金引き出し」)に入れ、財布に加算する。引き出し自体は支出ではなく
//   「口座 → 財布」への移動として扱う。
// - 覚えている現金支出は source='cash' の取引として記録し、選んだカテゴリの実績にする。
// - 手元の現金と財布残高の差額(何に使ったか分からない分)は「手元の現金に合わせる」で
//   source='cash' かつこのカテゴリの取引として記録し、その月の「現金(内訳なし)」の
//   支出になる。
// - 財布残高は月をまたいで繰り越す(残高 = 引き出し累計 − 記録累計)。
export const CASH_CATEGORY = "Cash (Unitemized)";

// 繰越型の財布を始めた月。これより前のATM引き出しは、従来どおり引き出した時点で
// 全額「現金(内訳なし)」の支出として扱う(過去月の支出・貯蓄が変わらないように)。
export const CASH_WALLET_START_MONTH = "2026-09";

// 「手元の現金に合わせる」で作る差額取引の店舗名。
export const CASH_UNITEMIZED_STORE = "現金(内訳なし)";

// みずほの摘要は全角(例: 「ＡＴＭ－１８５９７７－０７０５５４」「７ＢＫ００Ｍ７Ｏ－４３１５」)。
// 半角で来ても拾えるよう NFKC で正規化してから判定する。
export function isCashWithdrawalStore(store: string): boolean {
  const s = store.normalize("NFKC").trim().toUpperCase();
  return s.startsWith("ATM-") || s.startsWith("7BK");
}

export function monthKeyOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// 財布に入るだけで支出にはならない引き出しか(繰越型の財布の開始月以降の引き出し)。
function isWalletTransfer(tx: { category: string; source?: string | null; date: string }): boolean {
  return (
    tx.category === CASH_CATEGORY &&
    tx.source !== "cash" &&
    monthKeyOf(new Date(tx.date)) >= CASH_WALLET_START_MONTH
  );
}

// 支出の集計に取引1件を足し込む(カテゴリ別)。財布への引き出しは支出ではないので
// 足さない。現金支出の記録・差額(source='cash')はそのカテゴリの支出として足す。
export function addTxToCategoryTotals(
  totals: Record<string, number>,
  tx: { category: string; amount: number; source?: string | null; date: string },
): void {
  if (isWalletTransfer(tx)) return;
  totals[tx.category] = (totals[tx.category] ?? 0) + tx.amount;
}

// 支出合計に数える取引か(カテゴリを問わない月次合計用)。
export function countsAsSpending(tx: { category: string; source?: string | null; date: string }): boolean {
  return !isWalletTransfer(tx);
}

export interface CashWallet {
  month: string; // 'YYYY-MM'
  // 前月末までの残高(繰越)
  carriedOverVnd: number;
  // この月の引き出し額・記録済みの現金支出(差額の内訳なしも含む)
  withdrawnVnd: number;
  recordedVnd: number;
  // この月末時点(当月なら今)の財布残高 = 繰越 + 引き出し − 記録
  balanceVnd: number;
  records: { id: string; amount: number; category: string; date: string; note: string | null }[];
}

function monthStart(month: string): Date {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1);
}

function monthEnd(month: string): Date {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m, 0, 23, 59, 59, 999);
}

// 指定月の財布。特定の引き出しとは紐づけず、開始月からの累計で残高を出す。
export async function fetchCashWallet(db: Db, month: string): Promise<CashWallet> {
  const walletStart = monthStart(CASH_WALLET_START_MONTH);
  const start = monthStart(month);
  const end = monthEnd(month);
  const [withdrawRes, recordRes] = await Promise.all([
    db
      .from("transactions")
      .select("amount, date")
      .eq("category", CASH_CATEGORY)
      .neq("source", "cash")
      // 特別支出にした引き出しは特別支出として計上済みなので財布には入れない
      // (入れると二重計上になる)。
      .eq("excluded_from_dashboard", false)
      .gte("date", walletStart.toISOString())
      .lte("date", end.toISOString()),
    db
      .from("transactions")
      .select("id, amount, category, date, note")
      .eq("source", "cash")
      .gte("date", walletStart.toISOString())
      .lte("date", end.toISOString())
      .order("date", { ascending: false }),
  ]);

  const inMonth = (date: string) => new Date(date) >= start;
  let carriedOverVnd = 0;
  let withdrawnVnd = 0;
  for (const r of (withdrawRes.data ?? []) as { amount: number; date: string }[]) {
    if (inMonth(r.date)) withdrawnVnd += r.amount;
    else carriedOverVnd += r.amount;
  }
  const allRecords = (recordRes.data ?? []) as CashWallet["records"];
  const records = allRecords.filter((r) => inMonth(r.date));
  let recordedVnd = 0;
  for (const r of allRecords) {
    if (inMonth(r.date)) recordedVnd += r.amount;
    else carriedOverVnd -= r.amount;
  }
  return {
    month,
    carriedOverVnd,
    withdrawnVnd,
    recordedVnd,
    balanceVnd: carriedOverVnd + withdrawnVnd - recordedVnd,
    records,
  };
}

// 記録できる上限。記録した月の月末残高だけでなく、それ以降の月(今)の残高も
// マイナスにならないよう、両方の小さい方にする(過去の日付で記録した場合の保護)。
export async function spendableCashVnd(db: Db, month: string): Promise<number> {
  const current = monthKeyOf(new Date());
  const atMonth = await fetchCashWallet(db, month);
  if (month >= current) return atMonth.balanceVnd;
  const now = await fetchCashWallet(db, current);
  return Math.min(atMonth.balanceVnd, now.balanceVnd);
}

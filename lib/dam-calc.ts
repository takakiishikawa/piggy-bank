import { DAM_START } from "./constants";
import type { MonthlyBudget } from "./budget";
import { monthKey } from "./budget";
import { projectMonthlyTotal, sumFixedSpent } from "./projection";

interface TxForDam {
  amount: number;
  date: string;
  category?: string;
}

interface DamCalcOptions {
  txs: TxForDam[];
  budgetMap: Map<string, MonthlyBudget>;
  defaultBudget?: { target_monthly: number; fixed_costs: number };
  now?: Date;
}

interface MonthBalance {
  key: string; // "YYYY-MM"
  year: number;
  month: number; // 0-indexed
  target: number;
  fixedCosts: number;
  spent: number;
  projected: number;
  balance: number;
  cumulative: number;
}

/**
 * DAM_START から現在月までの月次残高を計算する。
 * 月ごとに budget が異なる場合に対応（monthly_budgets テーブル前提）。
 *
 * 現在月の予測は lib/projection.ts の projectMonthlyTotal を使用し、
 * /api/weekly のレポート画面と同じ式を使う。
 */
export function calcDamMonths(opts: DamCalcOptions): MonthBalance[] {
  const {
    txs,
    budgetMap,
    defaultBudget = { target_monthly: 0, fixed_costs: 0 },
    now = new Date(),
  } = opts;

  // 月ごとの (合計, カテゴリ別) を集計
  const spendMap: Record<string, number> = {};
  const byCategoryMap: Record<string, Record<string, number>> = {};
  for (const tx of txs) {
    const d = new Date(tx.date);
    const key = monthKey(d.getFullYear(), d.getMonth());
    spendMap[key] = (spendMap[key] ?? 0) + tx.amount;
    if (tx.category) {
      const map = (byCategoryMap[key] ??= {});
      map[tx.category] = (map[tx.category] ?? 0) + tx.amount;
    }
  }

  const months: MonthBalance[] = [];
  let cursor = new Date(DAM_START);
  let cumulative = 0;

  while (cursor <= now) {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const key = monthKey(year, month);
    const budget = budgetMap.get(key) ?? {
      target_monthly: defaultBudget.target_monthly,
      fixed_costs: defaultBudget.fixed_costs,
    };
    const target = budget.target_monthly;
    const fixedCosts = budget.fixed_costs;

    const spent = spendMap[key] ?? 0;
    const isCurrent = year === now.getFullYear() && month === now.getMonth();

    let projected: number;
    if (isCurrent && spent > 0) {
      const fixedSpent = sumFixedSpent(byCategoryMap[key] ?? {});
      projected = projectMonthlyTotal({
        total: spent,
        fixedSpent,
        fixedBudget: fixedCosts,
        now,
      });
    } else {
      projected = spent;
    }

    const balance = target - projected;
    cumulative += balance;
    months.push({
      key,
      year,
      month,
      target,
      fixedCosts,
      spent,
      projected,
      balance,
      cumulative,
    });
    cursor = new Date(year, month + 1, 1);
  }

  return months;
}

/** DAM_START ラベル文字列（例: "2026年4月"） */
export const DAM_START_LABEL = `${DAM_START.getFullYear()}年${DAM_START.getMonth() + 1}月`;

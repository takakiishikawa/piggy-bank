// 月の支出予測（projection）の共通ロジック。
// /api/weekly（レポート）と /api/dam（月毎の倹約）で同じ式を使うために集約。
//
// 考え方:
//   expectedFixed = max(当月実際に支払った FIXED カテゴリ合計, 予算側 fixed_costs)
//     - 家賃を既に支払っている月: actual がそのまま使われる
//     - まだ支払っていない月: 予算側で見込む
//   variableSpent = max(0, total - actualFixed)
//   projected     = round(expectedFixed + (variableSpent / dayOfMonth) * daysInMonth)

import { FIXED_CATEGORIES } from "./constants";

export function sumFixedSpent(byCategory: Record<string, number>): number {
  return FIXED_CATEGORIES.reduce(
    (sum, cat) => sum + (byCategory[cat] ?? 0),
    0,
  );
}

interface ProjectionInput {
  total: number;
  fixedSpent: number;
  fixedBudget: number;
  now: Date;
}

export function projectMonthlyTotal({
  total,
  fixedSpent,
  fixedBudget,
  now,
}: ProjectionInput): number {
  if (total <= 0) return 0;
  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0,
  ).getDate();
  const expectedFixed = Math.max(fixedSpent, fixedBudget);
  const variableSpent = Math.max(0, total - fixedSpent);
  return Math.round(
    expectedFixed + (variableSpent / dayOfMonth) * daysInMonth,
  );
}

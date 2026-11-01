import { z } from "zod";
import { getCurrentMonthKey } from "@/lib/budget";

// 'YYYY-MM' の前月キー。
export function prevMonthKey(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

// 'YYYY-MM' の翌月キー。
export function nextMonthKey(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

// ふりかえる月 = ICT 基準の今月の前月(11/1 に開いたら 10月)。
export function reviewMonthKey(now: Date = new Date()): string {
  return prevMonthKey(getCurrentMonthKey(now));
}

export interface ReviewCategory {
  name: string;
  isFixed: boolean;
  budget: number; // VND
  actual: number; // VND
  prevActual: number; // VND(前月の実績)
}

// 先月の結果(数字)。金額はすべて VND。表示通貨への変換はクライアント側。
export interface MonthlyReviewSummary {
  month: string; // 'YYYY-MM'
  prevMonth: string;
  totalActual: number;
  totalBudget: number;
  prevTotalActual: number;
  variableActual: number;
  variableBudget: number;
  fixedActual: number;
  fixedBudget: number;
  categories: ReviewCategory[];
}

// Claude が書くふりかえり文。金額は書かせず(表示通貨を切り替えられるため)、
// 金額はカテゴリ名から画面側で数字を引いて添える。
export const MonthlyReviewCommentSchema = z.object({
  good: z.array(z.object({ category: z.string(), comment: z.string() })),
  improve: z.array(z.object({ category: z.string(), comment: z.string() })),
  next: z.string(),
});

export type MonthlyReviewComment = z.infer<typeof MonthlyReviewCommentSchema>;

// GET /api/monthly-review のレスポンス。
export interface MonthlyReviewResponse {
  summary: MonthlyReviewSummary;
  // null = ふりかえり文を作れなかった(Claude API のエラーなど)。次に開いたときに再試行する。
  comment: MonthlyReviewComment | null;
}

// GET /api/monthly-review/status のレスポンス。
export interface MonthlyReviewStatus {
  month: string;
  // 今月のみずほCSV取込(または「支出なし」)が済んでいるか。先月分の明細が
  // そろうまでふりかえりは出さない。
  mizuhoDone: boolean;
  dismissed: boolean;
}

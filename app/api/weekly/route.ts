import { NextRequest, NextResponse } from "next/server";
import { getAuthDb } from "@/lib/supabase/auth-db";
import { type Transaction } from "@/lib/supabase/db";

type PeriodItem = {
  label: string;
  total: number;
  byCategory: Record<string, number>;
  start: string;
  end: string;
};

type BucketDef = { label: string; start: Date; end: Date };
type CategoryType = "variable" | "fixed" | "all";

export async function GET(req: NextRequest) {
  const result = await getAuthDb();
  if (result instanceof NextResponse) return result;
  const { db } = result;

  const typeParam = req.nextUrl.searchParams.get("type") ?? "variable";
  const categoryType: CategoryType =
    typeParam === "fixed" ? "fixed" : typeParam === "all" ? "all" : "variable";
  // Special expenses (one-off items flagged from Transactions) are excluded
  // from the Report by default, same as the Dashboard — toggle to include them.
  const includeSpecial = req.nextUrl.searchParams.get("includeSpecial") === "true";

  const now = new Date();

  // 過去9ヶ月分の月次バケットを生成
  const bucketDefs: BucketDef[] = [];
  for (let i = 8; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const start = new Date(d.getFullYear(), d.getMonth(), 1);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
    const yr = String(d.getFullYear()).slice(-2);
    const m = d.getMonth() + 1;
    bucketDefs.push({ label: `${yr}年${m}月`, start, end });
  }

  const [categoryRows, ...results] = await Promise.all([
    db.from("categories").select("name, is_fixed").order("created_at"),
    ...bucketDefs.map(({ start, end }) => {
      let q = db
        .from("transactions")
        .select("category, amount, date")
        .gt("amount", 0)
        .gte("date", start.toISOString())
        .lte("date", end.toISOString())
        .limit(2000);
      if (!includeSpecial) q = q.eq("excluded_from_dashboard", false);
      return q;
    }),
  ]);

  const allCategories = (categoryRows.data ?? []) as { name: string; is_fixed: boolean }[];
  const fixedSet = new Set(allCategories.filter((c) => c.is_fixed).map((c) => c.name));

  function matchesType(category: string): boolean {
    if (categoryType === "all") return true;
    if (categoryType === "fixed") return fixedSet.has(category);
    return !fixedSet.has(category);
  }

  const periods: PeriodItem[] = bucketDefs.map(({ label, start, end }, i) => {
    const txs = (results[i].data ?? []) as Pick<
      Transaction,
      "category" | "amount" | "date"
    >[];
    const byCategory: Record<string, number> = {};
    let total = 0;
    for (const t of txs) {
      if (!matchesType(t.category)) continue;
      byCategory[t.category] = (byCategory[t.category] ?? 0) + t.amount;
      total += t.amount;
    }
    return {
      label,
      total,
      byCategory,
      start: start.toISOString(),
      end: end.toISOString(),
    };
  });

  const categoryTotals: Record<string, number> = {};
  for (const p of periods) {
    for (const [cat, amt] of Object.entries(p.byCategory)) {
      categoryTotals[cat] = (categoryTotals[cat] ?? 0) + amt;
    }
  }

  // チップ表示用カテゴリ一覧（支出額の多い順）
  const managedNames = allCategories
    .filter((c) => matchesType(c.name))
    .map((c) => c.name);
  const categoryOrder = new Map<string, number>();
  managedNames.forEach((c, i) => categoryOrder.set(c, i));

  const allCategoryNames = new Set<string>([
    ...managedNames,
    ...Object.keys(categoryTotals),
  ]);
  const topCategories = [...allCategoryNames].sort((a, b) => {
    const sa = categoryTotals[a] ?? 0;
    const sb = categoryTotals[b] ?? 0;
    if (sb !== sa) return sb - sa;
    const oa = categoryOrder.get(a) ?? Number.MAX_SAFE_INTEGER;
    const ob = categoryOrder.get(b) ?? Number.MAX_SAFE_INTEGER;
    return oa - ob;
  });

  return NextResponse.json({
    periods,
    topCategories,
    categoryType,
    includeSpecial,
  });
}

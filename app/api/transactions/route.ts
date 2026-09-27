import { NextRequest, NextResponse } from "next/server";
import { getAuthDb } from "@/lib/supabase/auth-db";
import { type Transaction } from "@/lib/supabase/db";
import { FALLBACK_CATEGORY } from "@/lib/constants";

export const maxDuration = 60;

const DATA_START = new Date(2024, 2, 1);

function getWeekRange(date: Date) {
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(date);
  monday.setDate(diff);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { start: monday, end: sunday };
}

function getMonthRange(date: Date) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(
    date.getFullYear(),
    date.getMonth() + 1,
    0,
    23,
    59,
    59,
    999,
  );
  return { start, end };
}

export async function GET(req: NextRequest) {
  const result = await getAuthDb();
  if (result instanceof NextResponse) return result;
  const { db } = result;

  const { searchParams } = new URL(req.url);
  const period = searchParams.get("period") ?? "all";
  const category = searchParams.get("category");
  const now = new Date();

  type TxRow = Pick<
    Transaction,
    | "id"
    | "store"
    | "amount"
    | "category"
    | "date"
    | "reviewed"
    | "note"
    | "excluded_from_dashboard"
    | "special_entry_id"
    | "source"
  >;

  const buildQuery = (start?: Date, end?: Date) => {
    let q = db
      .from("transactions")
      .select(
        "id, store, amount, category, date, reviewed, note, excluded_from_dashboard, special_entry_id, source",
      )
      .gt("amount", 0)
      .order("date", { ascending: false })
      .limit(1000);
    if (start) q = q.gte("date", start.toISOString());
    if (end) q = q.lte("date", end.toISOString());
    if (category && category !== "all") q = q.eq("category", category);
    return q;
  };

  // ページング取得(Transactions画面)。以前は period=all で2024年3月から週ごとに
  // 100本以上のクエリを並列で投げて全件返しており、画面表示が非常に遅かった。
  // limit を指定した場合は新しい順に offset から limit 件だけ返し、絞り込み
  // (未分類 / カテゴリ / 検索)もDB側で行う。hasMore 判定のため1件多く取る。
  const limitParam = searchParams.get("limit");
  if (limitParam) {
    const limit = Math.min(Math.max(parseInt(limitParam, 10) || 50, 1), 200);
    const offset = Math.max(parseInt(searchParams.get("offset") ?? "0", 10) || 0, 0);
    const filter = searchParams.get("filter");
    // PostgREST の or() 構文を壊す文字は検索語から除く。
    const q = (searchParams.get("q") ?? "").trim().replace(/[,()%*\\]/g, "");

    let query = db
      .from("transactions")
      .select(
        "id, store, amount, category, date, reviewed, note, excluded_from_dashboard, special_entry_id, source",
      )
      .gt("amount", 0)
      .order("date", { ascending: false })
      .order("id", { ascending: true })
      .range(offset, offset + limit);
    // 特別支出はカテゴリなし扱いなので、未分類・カテゴリの絞り込みには含めない。
    if (filter === "needs_category") {
      // 未分類バッジ(uncategorized-count)と同じ判定基準
      query = query.eq("category", FALLBACK_CATEGORY).eq("reviewed", false).is("special_entry_id", null);
    } else if (category && category !== "all") {
      query = query.eq("category", category).is("special_entry_id", null);
    }
    if (q) query = query.or(`store.ilike.%${q}%,category.ilike.%${q}%`);

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const rows = (data ?? []) as TxRow[];
    return NextResponse.json({ items: rows.slice(0, limit), hasMore: rows.length > limit });
  }

  // 任意期間の明細取得（レポートのグラフから特定の週/月をクリックした時など）
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  if (from || to) {
    const { data, error } = await buildQuery(
      from ? new Date(from) : undefined,
      to ? new Date(to) : undefined,
    );
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json((data ?? []) as TxRow[]);
  }

  if (period === "all") {
    const weekBuckets: { start: Date; end: Date }[] = [];
    const cursor = new Date(DATA_START);
    cursor.setHours(0, 0, 0, 0);

    while (cursor <= now) {
      const start = new Date(cursor);
      const end = new Date(cursor);
      end.setDate(end.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      weekBuckets.push({ start, end: end > now ? now : end });
      cursor.setDate(cursor.getDate() + 7);
    }

    const results = await Promise.allSettled(
      weekBuckets.map(({ start, end }) => buildQuery(start, end)),
    );

    const data: TxRow[] = results
      .filter(
        (
          r,
        ): r is PromiseFulfilledResult<
          Awaited<ReturnType<typeof buildQuery>>
        > => r.status === "fulfilled",
      )
      .flatMap((r) => (r.value.data ?? []) as TxRow[])
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return NextResponse.json(data);
  }

  let range: { start: Date; end: Date } | null = null;
  if (period === "week") range = getWeekRange(now);
  else if (period === "month") range = getMonthRange(now);
  else if (period === "last7") {
    const start = new Date(now);
    start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    range = { start, end };
  }

  const { data, error } = await buildQuery(range?.start, range?.end);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json((data ?? []) as TxRow[]);
}

// Supabase(PostgREST)は1リクエストで最大1000行しか返さず、超えた分は黙って
// 切り捨てられる(.limit() を大きくしてもサーバー側の上限が優先される)。今年の
// 取引が1000件を超えて、シミュレーションの直近月の実績が欠けるバグになったため、
// 件数が増えうる集計クエリはこのヘルパーで1000行ずつ全件取り切る。
// page には範囲指定前のクエリに .range(from, to) を付けたものを返させる。
// ページ間で行が重複・欠落しないよう、クエリ側で一意な並び順(例: date + id)を
// 指定しておくこと。
const PAGE_SIZE = 1000;

export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const chunk = data ?? [];
    rows.push(...chunk);
    if (chunk.length < PAGE_SIZE) return rows;
  }
}

// Unsplash 画像検索（サーバー専用）
// UNSPLASH_ACCESS_KEY は秘匿。NEXT_PUBLIC_ プレフィックス禁止。

const UNSPLASH_API = "https://api.unsplash.com/search/photos";

interface UnsplashSearchResponse {
  results: Array<{
    urls: {
      raw: string;
      regular: string;
      small: string;
      thumb: string;
    };
  }>;
}

/**
 * クエリにマッチする最初の写真の URL を返す。失敗・該当無しなら null。
 * 表示用途なので small (約 400px 幅) を採用。
 */
export async function searchUnsplashImage(
  query: string,
): Promise<string | null> {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) return null;
  const trimmed = query.trim();
  if (!trimmed) return null;

  try {
    const url = `${UNSPLASH_API}?query=${encodeURIComponent(trimmed)}&per_page=1&content_filter=high`;
    const r = await fetch(url, {
      headers: {
        Authorization: `Client-ID ${key}`,
        "Accept-Version": "v1",
      },
      // 5秒くらいで打ち切り。ウィッシュ追加 UX を阻害しない。
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return null;
    const data = (await r.json()) as UnsplashSearchResponse;
    return data.results[0]?.urls.small ?? null;
  } catch {
    return null;
  }
}

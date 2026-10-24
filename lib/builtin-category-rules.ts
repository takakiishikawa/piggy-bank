// 店舗名から決まりきったカテゴリを付ける組み込みルール(AIに聞く前に適用する)。
// みずほの摘要・JCBデビット通知の店名は全角/半角や長音の書き方が揺れる
// (例: 「セブン-イレブン」「バツクマ-ケツト」= 長音が「-」、小書きが大書き)ため、
// 正規化してから判定する。

// NFKC → 大文字化 → 空白・ハイフン・長音を除去 → 小書きカナを大書きにそろえる。
function normalizeStore(store: string): string {
  return store
    .normalize("NFKC")
    .toUpperCase()
    .replace(/[\s\-‐‑–—−ー]/g, "")
    .replace(/[ァィゥェォッャュョヮ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 1));
}

// 銀行の振込手数料・ATM手数料など。
export function isFeeStore(store: string): boolean {
  return normalizeStore(store).includes("手数料");
}

// 正規化後の表記で持つ(長音なし・大書き)。
const CONVENIENCE_STORE_PATTERNS = [
  "セブンイレブン",
  "7ELEVEN",
  "SEVENELEVEN",
  "フアミリマト",
  "FAMILYMART",
  "ロソン",
  "LAWSON",
  "ミニストツプ",
  "MINISTOP",
  "デイリヤマザキ",
  "ニユデイズ",
  "NEWDAYS",
  "セイコマト",
];

export function isConvenienceStore(store: string): boolean {
  const s = normalizeStore(store);
  return CONVENIENCE_STORE_PATTERNS.some((p) => s.includes(p));
}

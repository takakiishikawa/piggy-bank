// カテゴリ名 → ブランドカラー(hex) の固定マップ。
// "Warm Ledger" デザイン(design 1a)のマスタ配色に準拠。
// bg/border/text の3値バッジ用パレットは、この hex から自動計算する。
type Palette = { bg: string; border: string; text: string };

const CATEGORY_HEX: Record<string, string> = {
  "Dining Out": "#B8621B",
  "Home Cooking": "#E4633A",
  Cafe: "#8B5E3C",
  Groceries: "#C77B3D",
  Rent: "#6B5D45",
  Phone: "#5B7A9A",
  Media: "#C9A227",
  AI: "#6366F1",
  "AI/SaaS": "#6366F1",
  Massage: "#A66B8E",
  Gym: "#C2554F",
  Pharmacy: "#7D8B99",
  Fashion: "#8B5E83",
  "Online Shopping": "#5C7A99",
  Shopping: "#5C7A99",
  Learning: "#4C6B8A",
  Travel: "#6B8F71",
  Entertainment: "#C77B3D",
  Transport: "#4C6B8A",
  "Daily Goods": "#8A8172",
  Moca: "#7A9E6E",
  Transfer: "#9A9184",
  Cash: "#7D9488",
  "Sauna/Spa": "#5C9E93",
  Sports: "#4C8F6B",
  Beauty: "#C77BA0",
  Drinks: "#B8543D",
  Medical: "#6B8FA3",
  Health: "#6B9E7D",
  Medicine: "#8B7DA3",
  Books: "#6B7A99",
  Games: "#7D6B99",
  Camera: "#5C6B7A",
  Music: "#A35C8B",
  Clothing: "#8B6B8B",
  Car: "#5C6B7A",
  Bicycle: "#6B8F71",
  Overseas: "#4C8FA3",
  Water: "#4C8FA3",
  Work: "#6B7A8F",
  Savings: "#4C9A6A",
  Other: "#6B778C",
};

const FALLBACK_HEX = [
  "#4C6B8A",
  "#B8621B",
  "#6366F1",
  "#C77B3D",
  "#5C9E93",
  "#A66B8E",
  "#C9A227",
  "#6B8F71",
];

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function getCategoryHex(category: string): string {
  return (
    CATEGORY_HEX[category] ?? FALLBACK_HEX[hashStr(category) % FALLBACK_HEX.length]
  );
}

export function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function getCategoryColorTint(category: string, alpha = 0.14): string {
  return hexToRgba(getCategoryHex(category), alpha);
}

export function getCategoryColors(category: string): Palette {
  const hex = getCategoryHex(category);
  return {
    bg: hexToRgba(hex, 0.14),
    border: hexToRgba(hex, 0.32),
    text: hex,
  };
}

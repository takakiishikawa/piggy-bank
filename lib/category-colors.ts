// Tailwind v4 系のカラーパレット（50/100/200/700 を bg/border/text に流用）
// shadcn 風の落ち着いたトーンで、Tag の rounded-full + border 構造に合わせて
// 背景は light、border は middle、text は dark で揃えている。
type Palette = { bg: string; border: string; text: string };

const PALETTES: Record<string, Palette> = {
  emerald: { bg: "#d1fae5", border: "#a7f3d0", text: "#047857" },
  green: { bg: "#dcfce7", border: "#bbf7d0", text: "#15803d" },
  teal: { bg: "#ccfbf1", border: "#99f6e4", text: "#0f766e" },
  cyan: { bg: "#cffafe", border: "#a5f3fc", text: "#0e7490" },
  sky: { bg: "#e0f2fe", border: "#bae6fd", text: "#0369a1" },
  blue: { bg: "#dbeafe", border: "#bfdbfe", text: "#1d4ed8" },
  indigo: { bg: "#e0e7ff", border: "#c7d2fe", text: "#3730a3" },
  violet: { bg: "#ede9fe", border: "#ddd6fe", text: "#6d28d9" },
  purple: { bg: "#f3e8ff", border: "#e9d5ff", text: "#7e22ce" },
  fuchsia: { bg: "#fae8ff", border: "#f5d0fe", text: "#a21caf" },
  pink: { bg: "#fce7f3", border: "#fbcfe8", text: "#be185d" },
  rose: { bg: "#ffe4e6", border: "#fecdd3", text: "#be123c" },
  red: { bg: "#fee2e2", border: "#fecaca", text: "#b91c1c" },
  orange: { bg: "#ffedd5", border: "#fed7aa", text: "#c2410c" },
  amber: { bg: "#fef3c7", border: "#fde68a", text: "#b45309" },
  yellow: { bg: "#fef9c3", border: "#fef08a", text: "#a16207" },
  lime: { bg: "#ecfccb", border: "#d9f99d", text: "#4d7c0f" },
  slate: { bg: "#f1f5f9", border: "#e2e8f0", text: "#334155" },
  stone: { bg: "#f5f5f4", border: "#e7e5e4", text: "#57534e" },
};

const FALLBACK_ORDER: (keyof typeof PALETTES)[] = [
  "emerald",
  "blue",
  "violet",
  "orange",
  "cyan",
  "pink",
  "amber",
  "indigo",
  "teal",
  "rose",
  "lime",
  "fuchsia",
  "sky",
  "purple",
];

// カテゴリ名 → パレット名 の固定マップ。意味的な紐付け（食事系=緑系、固定費=青系など）
const CATEGORY_TO_PALETTE: Record<string, keyof typeof PALETTES> = {
  "Dining Out": "emerald",
  "Home Cooking": "teal",
  Cafe: "amber",
  Rent: "blue",
  Phone: "sky",
  Media: "amber",
  AI: "violet",
  Massage: "purple",
  Gym: "pink",
  Pharmacy: "rose",
  Fashion: "orange",
  "Online Shopping": "orange",
  Learning: "indigo",
  Travel: "cyan",
  Entertainment: "rose",
  Transport: "sky",
  "Daily Goods": "stone",
  Moca: "lime",
  Transfer: "slate",
  Cash: "slate",
  Other: "red",
};

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function getCategoryColors(category: string): Palette {
  const key = CATEGORY_TO_PALETTE[category];
  if (key) return PALETTES[key];
  const fb = FALLBACK_ORDER[hashStr(category) % FALLBACK_ORDER.length];
  return PALETTES[fb];
}

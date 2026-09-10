"use client";

import type { TransactionSource } from "@/lib/supabase/db";
import { t, type Lang } from "@/lib/scenario/dictionary";

// 取引がどのデータ経由で入ったかを示す小さなバッジ。
// Vietcombank(緑)= Gmail自動取込 / みずほ銀行(青)= CSV手動取込。
const CONFIG: Record<TransactionSource, { label: string; bg: string; fg: string }> = {
  vietcombank: { label: "VCB", bg: "#E3F1E8", fg: "#00754A" },
  mizuho: { label: "みずほ", bg: "#E1E9F5", fg: "#12448C" },
};

export function SourceBadge({ source, lang }: { source: TransactionSource; lang: Lang }) {
  const c = CONFIG[source] ?? CONFIG.vietcombank;
  const title = source === "mizuho" ? t(lang, "txSourceMizuho") : t(lang, "txSourceVietcombank");
  return (
    <span
      title={title}
      className="inline-flex items-center justify-center rounded-md w-[46px] h-5 text-[10px] font-bold leading-none tracking-tight shrink-0 select-none"
      style={{ backgroundColor: c.bg, color: c.fg }}
    >
      {c.label}
    </span>
  );
}

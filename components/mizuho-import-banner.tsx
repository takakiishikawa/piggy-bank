"use client";

import { useCallback, useEffect, useState } from "react";
import { UploadCloud } from "lucide-react";
import { toast } from "@takaki/go-design-system";
import { usePreferences } from "@/lib/preferences";
import { t } from "@/lib/scenario/dictionary";
import { DC } from "@/lib/scenario/design-colors";
import { MizuhoImportDialog, MIZUHO_UPDATED_EVENT } from "@/components/mizuho-import-dialog";

const supabaseConfigured =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// 毎月、みずほ銀行(日本側)の出金CSVアップロードを促す全画面共通の通知バナー。
// - その月の取込 or「支出なし」が済むまで常時表示。済んだら非表示。
// - 月が変わると(=新しい暦月の行が無い)また表示される。
export function MizuhoImportBanner() {
  const { lang } = usePreferences();
  const [done, setDone] = useState<boolean | null>(null); // null = 未取得
  const [dialogOpen, setDialogOpen] = useState(false);
  const [skipping, setSkipping] = useState(false);

  const refresh = useCallback(() => {
    if (!supabaseConfigured) return;
    fetch("/api/mizuho-import")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setDone(j ? !!j.done : null))
      .catch(() => setDone(null));
  }, []);

  useEffect(() => {
    refresh();
    const onUpdated = () => refresh();
    const onFocus = () => refresh();
    window.addEventListener(MIZUHO_UPDATED_EVENT, onUpdated);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener(MIZUHO_UPDATED_EVENT, onUpdated);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  async function handleNoExpense() {
    setSkipping(true);
    try {
      const res = await fetch("/api/mizuho-import/skip", { method: "POST" });
      if (!res.ok) {
        toast.error(t(lang, "mizuhoImportFailed"));
        return;
      }
      toast.success(t(lang, "mizuhoNoExpenseDone"));
      setDone(true);
    } finally {
      setSkipping(false);
    }
  }

  if (done !== false) return null;

  return (
    <>
      <div
        className="flex items-center gap-3 px-6 py-2.5 border-b text-[13px] flex-wrap"
        style={{ backgroundColor: "#FBF1E4", borderColor: "#EAD9BF", color: DC.textPrimary }}
      >
        <UploadCloud size={15} style={{ color: DC.warning }} className="shrink-0" />
        <span className="font-semibold">{t(lang, "mizuhoBannerTitle")}</span>
        <div className="flex items-center gap-2 ml-auto shrink-0">
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all hover:brightness-105 active:scale-95"
            style={{ backgroundColor: DC.primary, color: "#fff" }}
          >
            {t(lang, "mizuhoUploadBtn")}
          </button>
          <button
            type="button"
            onClick={handleNoExpense}
            disabled={skipping}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all hover:brightness-95 active:scale-95 border disabled:opacity-50"
            style={{ backgroundColor: DC.cardBg, color: DC.textSecondary, borderColor: DC.cardBorder }}
          >
            {t(lang, "mizuhoNoExpenseBtn")}
          </button>
        </div>
      </div>

      <MizuhoImportDialog open={dialogOpen} onOpenChange={setDialogOpen} lang={lang} />
    </>
  );
}

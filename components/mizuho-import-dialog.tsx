"use client";

import { useRef, useState } from "react";
import { ExternalLink, UploadCloud } from "lucide-react";
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, Spinner, toast } from "@takaki/go-design-system";
import { t, tf, type Lang } from "@/lib/scenario/dictionary";
import { DC } from "@/lib/scenario/design-colors";

// みずほダイレクト(個人)のログイン画面。ここから入出金明細をCSVで
// ダウンロードして、下のフォームでアップロードする。
const MIZUHO_DIRECT_URL = "https://web.ib.mizuhobank.co.jp/servlet/LOGBNK0000000B.do";

// みずほ銀行の入出金明細CSVをアップロードして取り込むポップアップ。
// バナーからも、Transactions画面のボタンからも同じものを開く。
// 取込/「支出なし」が完了したら window イベントを飛ばし、バナー側が再取得する。
export const MIZUHO_UPDATED_EVENT = "piggybank:mizuho-updated";

function fireUpdated() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(MIZUHO_UPDATED_EVENT));
}

export function MizuhoImportDialog({
  open,
  onOpenChange,
  lang,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lang: Lang;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function handleFile(file: File) {
    setBusy(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/mizuho-import", { method: "POST", body });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json?.error === "no_withdrawals" ? t(lang, "mizuhoImportNone") : t(lang, "mizuhoImportFailed"));
        return;
      }
      toast.success(
        tf(lang, "mizuhoImportDone", {
          imported: json.imported ?? 0,
          skipped: json.skipped ?? 0,
          deposits: json.depositCount ?? 0,
          excluded: json.excludedCount ?? 0,
        }),
      );
      fireUpdated();
      onOpenChange(false);
    } catch {
      toast.error(t(lang, "mizuhoImportFailed"));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <Dialog open={open} onOpenChange={busy ? undefined : onOpenChange}>
      <DialogContent className="max-w-md p-0 overflow-hidden" style={{ backgroundColor: DC.cardBg }}>
        <DialogHeader className="px-5 py-4 border-b" style={{ borderColor: DC.cardBorder }}>
          <DialogTitle>{t(lang, "mizuhoDialogTitle")}</DialogTitle>
        </DialogHeader>

        <div className="px-5 py-5 flex flex-col gap-4">
          <p className="text-[13px] leading-relaxed" style={{ color: DC.textSecondary }}>
            {t(lang, "mizuhoDialogBody")}
          </p>

          <a
            href={MIZUHO_DIRECT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold w-fit hover:underline"
            style={{ color: DC.primary }}
          >
            <ExternalLink size={13} />
            {t(lang, "mizuhoOpenBank")}
          </a>

          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv,text/plain"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />

          <Button
            type="button"
            className="gap-2"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {busy ? <Spinner size="sm" /> : <UploadCloud size={15} />}
            {busy ? t(lang, "mizuhoImporting") : t(lang, "mizuhoChooseFile")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

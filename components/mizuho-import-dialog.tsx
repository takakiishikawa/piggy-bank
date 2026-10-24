"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, UploadCloud } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
  toast,
} from "@takaki/go-design-system";
import { t, tf, catLabel, type Lang } from "@/lib/scenario/dictionary";
import { formatJPY } from "@/lib/format";
import { DC } from "@/lib/scenario/design-colors";

// みずほダイレクト(個人)のログイン画面。ここから入出金明細をCSVで
// ダウンロードして、下のフォームでアップロードする。
const MIZUHO_DIRECT_URL = "https://web.ib.mizuhobank.co.jp/servlet/LOGBNK0000000B.do";

// みずほ銀行の入出金明細CSVをアップロードして取り込むポップアップ。
// バナーからも、Transactions画面のボタンからも同じものを開く。
// 取込/「支出なし」が完了したら window イベントを飛ばし、バナー側が再取得する。
export const MIZUHO_UPDATED_EVENT = "piggybank:mizuho-updated";

// 取込APIが返す、新しく取り込んだ明細1行分。
interface ImportedItem {
  date: string;
  store: string;
  amountJpy: number;
  category: string;
}

interface ImportResult {
  summary: string;
  items: ImportedItem[];
}

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
  // 取込後に何が入ったかを確認するための結果ポップアップ(確認のみ、操作なし)。
  const [result, setResult] = useState<ImportResult | null>(null);
  // undefined = 未取得 / null = 一度も取り込んでいない
  const [lastImportedAt, setLastImportedAt] = useState<string | null | undefined>(undefined);

  // 開くたびに最終取込日を取り直す。
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch("/api/mizuho-import")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!cancelled && j) setLastImportedAt((j.lastImportedAt as string | null) ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open]);

  const lastImportedLabel =
    lastImportedAt === undefined
      ? null
      : lastImportedAt === null
        ? t(lang, "mizuhoLastImportedNone")
        : tf(lang, "mizuhoLastImported", {
            date: new Date(lastImportedAt).toLocaleString(lang === "ja" ? "ja-JP" : "en-US", {
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            }),
          });

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
      const summary = tf(lang, "mizuhoImportDone", {
        imported: json.imported ?? 0,
        skipped: json.skipped ?? 0,
        deposits: json.depositCount ?? 0,
        excluded: json.excludedCount ?? 0,
      });
      toast.success(summary);
      setResult({ summary, items: (json.items as ImportedItem[] | undefined) ?? [] });
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
    <>
      <Dialog open={open} onOpenChange={busy ? undefined : onOpenChange}>
        <DialogContent className="max-w-md p-0 overflow-hidden" style={{ backgroundColor: DC.cardBg }}>
          <DialogHeader className="px-5 py-4 border-b" style={{ borderColor: DC.cardBorder }}>
            <DialogTitle>{t(lang, "mizuhoDialogTitle")}</DialogTitle>
          </DialogHeader>

          <div className="px-5 py-5 flex flex-col gap-4">
            <p className="text-[13px] leading-relaxed" style={{ color: DC.textSecondary }}>
              {t(lang, "mizuhoDialogBody")}
            </p>

            {lastImportedLabel && (
              <p className="text-[12.5px] font-semibold" style={{ color: DC.textPrimary }}>
                {lastImportedLabel}
              </p>
            )}

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

      <MizuhoImportResultDialog result={result} onClose={() => setResult(null)} lang={lang} />
    </>
  );
}

function MizuhoImportResultDialog({
  result,
  onClose,
  lang,
}: {
  result: ImportResult | null;
  onClose: () => void;
  lang: Lang;
}) {
  const items = result?.items ?? [];
  const total = items.reduce((sum, it) => sum + it.amountJpy, 0);
  const dateFmt = (iso: string) =>
    new Date(iso).toLocaleDateString(lang === "ja" ? "ja-JP" : "en-US", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });

  return (
    <Dialog open={result !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden" style={{ backgroundColor: DC.cardBg }}>
        <DialogHeader className="px-5 py-4 border-b" style={{ borderColor: DC.cardBorder }}>
          <DialogTitle>{t(lang, "mizuhoResultTitle")}</DialogTitle>
        </DialogHeader>

        <div className="px-5 py-5 flex flex-col gap-4">
          <p className="text-[13px] leading-relaxed" style={{ color: DC.textSecondary }}>
            {result?.summary}
          </p>

          {items.length === 0 ? (
            <p className="text-[13px] py-6 text-center" style={{ color: DC.textSecondary }}>
              {t(lang, "mizuhoResultEmpty")}
            </p>
          ) : (
            <div className="max-h-[50vh] overflow-y-auto border rounded-lg" style={{ borderColor: DC.cardBorder }}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">{t(lang, "mizuhoResultDate")}</TableHead>
                    <TableHead>{t(lang, "mizuhoResultStore")}</TableHead>
                    <TableHead className="text-right whitespace-nowrap">{t(lang, "mizuhoResultAmount")}</TableHead>
                    <TableHead className="whitespace-nowrap">{t(lang, "mizuhoResultCategory")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((it, i) => (
                    <TableRow key={i}>
                      <TableCell className="whitespace-nowrap tabular-nums">{dateFmt(it.date)}</TableCell>
                      <TableCell className="break-all">{it.store}</TableCell>
                      <TableCell className="text-right whitespace-nowrap tabular-nums">{formatJPY(it.amountJpy)}</TableCell>
                      <TableCell className="whitespace-nowrap">{catLabel(lang, it.category)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={2} className="font-semibold">{t(lang, "mizuhoResultTotal")}</TableCell>
                    <TableCell className="text-right whitespace-nowrap tabular-nums font-semibold">{formatJPY(total)}</TableCell>
                    <TableCell />
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          )}

          <Button type="button" variant="outline" className="self-end" onClick={onClose}>
            {t(lang, "mizuhoResultClose")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

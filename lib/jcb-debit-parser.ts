// みずほJCBデビットの「JCBデビットカードご利用のお知らせ」メール(mail@qa.jcb.co.jp)の
// パーサー。本文の以下3項目から取引を組み立てる。
//   【ご利用日時(日本時間)】　2026年10月24日 12:35
//   【ご利用金額】　582円
//   【ご利用先】　メルカリ
// みずほの入出金明細にも同じ取引が「ＪＣＢデビット」として出るため、
// CSV取込側(lib/mizuho-parser.ts)ではデビットの行を除外している。

export interface ParsedJcbDebit {
  store: string;
  amountJpy: number;
  date: Date;
  isValid: boolean;
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'");
}

export function parseJcbDebitEmail(raw: string): ParsedJcbDebit {
  const text = raw.trim().startsWith("<") ? stripHtml(raw) : raw;
  const invalid: ParsedJcbDebit = { store: "", amountJpy: 0, date: new Date(), isValid: false };

  const dateMatch = text.match(
    /【ご利用日時[^】]*】\s*(\d{4})年(\d{1,2})月(\d{1,2})日\s*(\d{1,2}):(\d{2})/,
  );
  const amountMatch = text.match(/【ご利用金額】\s*([\d,，]+)\s*円/);
  if (!dateMatch || !amountMatch) return invalid;

  // メールの日時は日本時間。サーバー(UTC)のタイムゾーンに依存しないよう +09:00 を明示する。
  const [, y, mo, d, h, mi] = dateMatch;
  const pad = (s: string) => s.padStart(2, "0");
  const date = new Date(`${y}-${pad(mo)}-${pad(d)}T${pad(h)}:${mi}:00+09:00`);
  if (Number.isNaN(date.getTime())) return invalid;

  const amountJpy = parseInt(amountMatch[1].replace(/[,，]/g, ""), 10);

  // ご利用先は行末まで。HTML を潰して1行になっていても注意書き「ご利用先は、」の手前で切る。
  const storeMatch = text.match(/【ご利用先】[ \t　]*([^\r\n]*?)[ \t　]*(?:ご利用先は|\r|\n|$)/);
  const store = storeMatch?.[1]?.trim() || "JCBデビット";

  return { store, amountJpy, date, isValid: amountJpy > 0 };
}

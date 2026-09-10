// みずほ銀行「流動性口座照会 / 入出金明細」CSV のパーサー。
// ヘッダー行(明細通番,日付,お引出金額,お預入金額,残高,お取引内容)より上に
// 口座情報のメタ行が並ぶ形式。出金(お引出金額)のみを取り込み、入金
// (お預入金額 = 給与・入金など)は扱わない。

export interface MizuhoWithdrawal {
  externalId: string; // 明細通番(取込の重複防止キー)
  date: Date;
  amountJpy: number;
  description: string; // お取引内容
}

export interface MizuhoParseResult {
  withdrawals: MizuhoWithdrawal[];
  depositCount: number; // 取り込まなかった入金明細の件数(結果表示用)
  periodStart: string | null;
  periodEnd: string | null;
}

// みずほのCSVは Shift_JIS のことが多い。UTF-8 で読んでヘッダー語が出なければ
// Shift_JIS で読み直す。
export function decodeMizuhoCsv(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  if (utf8.includes("お引出金額") || utf8.includes("明細通番")) return utf8;
  try {
    const sjis = new TextDecoder("shift_jis").decode(bytes);
    if (sjis.includes("お引出金額") || sjis.includes("明細通番")) return sjis;
  } catch {
    // shift_jis 未対応環境なら utf8 のまま返す
  }
  return utf8;
}

// ダブルクォート対応の最小CSV行パーサー。
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function parseAmount(raw: string | undefined): number {
  if (!raw) return 0;
  const digits = raw.replace(/[^\d]/g, "");
  return digits ? parseInt(digits, 10) : 0;
}

// "2026.09.06" / "2026/09/06" / "2026-09-06" を Date に。時刻は正午にして
// タイムゾーンによる日付ズレを避ける。
function parseMizuhoDate(raw: string | undefined): Date | null {
  if (!raw) return null;
  const m = raw.trim().match(/^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
  if (!m) return null;
  const [, y, mo, d] = m;
  const date = new Date(Number(y), Number(mo) - 1, Number(d), 12, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

function findValue(rows: string[][], label: string): string | null {
  for (const cols of rows) {
    if ((cols[0] ?? "").trim() === label) return (cols[1] ?? "").trim() || null;
  }
  return null;
}

export function parseMizuhoCsv(csv: string): MizuhoParseResult {
  const lines = csv.split(/\r\n|\r|\n/).filter((l) => l.trim().length > 0);
  const rows = lines.map(splitCsvLine);

  const headerIdx = rows.findIndex(
    (cols) => cols.includes("日付") && cols.some((c) => c.includes("お引出金額")),
  );
  if (headerIdx === -1) {
    return { withdrawals: [], depositCount: 0, periodStart: null, periodEnd: null };
  }

  const header = rows[headerIdx].map((c) => c.trim());
  const col = (name: string) => header.findIndex((h) => h === name || h.includes(name));
  const idxSeq = col("明細通番");
  const idxDate = col("日付");
  const idxOut = col("お引出金額");
  const idxIn = col("お預入金額");
  const idxDesc = col("お取引内容");

  const withdrawals: MizuhoWithdrawal[] = [];
  let depositCount = 0;

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const cols = rows[i];
    const date = parseMizuhoDate(cols[idxDate]);
    if (!date) continue; // 明細行でない(空行や合計行など)

    const outJpy = parseAmount(cols[idxOut]);
    const inJpy = idxIn >= 0 ? parseAmount(cols[idxIn]) : 0;

    if (outJpy <= 0) {
      if (inJpy > 0) depositCount++;
      continue; // 入金(給与など)は取り込まない
    }

    const seq = (idxSeq >= 0 ? cols[idxSeq] : "")?.trim();
    const description = (idxDesc >= 0 ? cols[idxDesc] : "")
      ?.trim()
      .replace(/\s+/g, " ") || "みずほ銀行 出金";

    withdrawals.push({
      // 明細通番が無いCSV形式でも、日付+金額+内容で一意キーを合成する。
      externalId: seq || `${date.toISOString().slice(0, 10)}_${outJpy}_${description}`,
      date,
      amountJpy: outJpy,
      description,
    });
  }

  return {
    withdrawals,
    depositCount,
    periodStart: findValue(rows.slice(0, headerIdx), "照会期間開始日"),
    periodEnd: findValue(rows.slice(0, headerIdx), "照会期間終了日"),
  };
}

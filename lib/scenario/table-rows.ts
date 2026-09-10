import { specialEntryYen, type InvestmentEntryInput, type ScenarioRow } from "./compute";
import { catLabel, t, type Lang } from "./dictionary";
import type { SpecialEntry } from "@/lib/simulation";

export interface TableCell {
  fmt: string;
  negative: boolean;
  color: string;
  // その期間(年/月)ぶんの増減。総貯蓄の行にだけ付けて、プラス/マイナスが
  // ひと目でわかるようにする。
  delta?: { fmt: string; positive: boolean };
}

export interface TableRow {
  key: string;
  depth: number;
  label: string;
  cells: TableCell[];
  bold: boolean;
  expandable: boolean;
  expanded: boolean;
}

function cell(v: number, fmt: (n: number) => string, isNeg = false): TableCell {
  return { fmt: fmt(v), negative: isNeg && v < 0, color: isNeg && v < 0 ? "#C0392B" : "inherit" };
}

// 全期間を通じて0円の内訳行は、そのシナリオに関係が無い(配偶者なし→配偶者給与、
// 子どもなし→公的支援・教育 など)ため、テーブルには出さない。総収入/総支出の
// 合計には元々0円しか寄与しないので、行を省いても内訳の合計は変わらない。
function allZeroCells(values: number[]): boolean {
  return values.every((v) => Math.round(v) === 0);
}

// 総貯蓄の行専用: その期間の増減(netFlowYen、投資益込み)を「+」符号付きで
// 添える。マイナスの時は fmt() 側が既に「-」を付けてくれる。
function cellWithDelta(v: number, deltaV: number, fmt: (n: number) => string, isNeg = false): TableCell {
  const base = cell(v, fmt, isNeg);
  const positive = deltaV >= 0;
  return { ...base, delta: { fmt: `${positive ? "+" : ""}${fmt(deltaV)}`, positive } };
}

// 年次の列(yearLabel="2026")はその年の全月、月次の列(yearLabel="2026/06")は
// その月だけに一致するかどうかを判定する。
function matchesPeriod(entryMonth: string, yearLabel: string): boolean {
  return /^\d{4}\/\d{2}$/.test(yearLabel) ? entryMonth === yearLabel.replace("/", "-") : entryMonth.startsWith(`${yearLabel}-`);
}

// 特別収入・特別支出を、固定費/変動費のカテゴリ内訳と同じ見た目で「項目名」
// 単位のサブ行として展開する。同じ名前(例: 「Repay」)の項目が同じ期間に
// 複数あれば1行にまとめて合算する(名前が違えば別の行)。「展開する」を押しても
// 自動では開かない(NO_AUTO_EXPAND_KEYS側で制御)。
function specialSubRows(
  rows: ScenarioRow[],
  parentKey: string,
  depth: number,
  kind: "income" | "expense",
  specialEntries: SpecialEntry[],
  vndPerJpy: number,
  fmt: (n: number) => string,
): TableRow[] {
  const matching = specialEntries.filter((e) => e.kind === kind);
  // 「Japan trip」「Japan Trip」のような大文字小文字・前後の空白だけの違いは
  // 同じ項目とみなして1行にまとめる(表示名は最初に出てきた表記を使う)。
  const normalize = (name: string) => name.trim().toLowerCase();
  const labelByKey = new Map<string, string>();
  for (const e of matching) {
    const key = normalize(e.name);
    if (!labelByKey.has(key)) labelByKey.set(key, e.name.trim());
  }
  return Array.from(labelByKey.entries()).map(([normalizedName, label]) => ({
    key: `${parentKey}.${normalizedName}`,
    depth,
    label,
    bold: false,
    expandable: false,
    expanded: false,
    cells: rows.map((r) => {
      const total = matching
        .filter((e) => normalize(e.name) === normalizedName && matchesPeriod(e.month, r.yearLabel))
        .reduce((s, e) => s + specialEntryYen(e, vndPerJpy), 0);
      return cell(total, fmt);
    }),
  }));
}

// yearLabelが表す期間の最終日("YYYY-MM-DD")。investedOn(同じ形式)と文字列比較
// するだけで「その期間末までに投資したか」を判定できる。
function periodEndDate(yearLabel: string): string {
  const monthly = /^(\d{4})\/(\d{2})$/.exec(yearLabel);
  if (monthly) {
    const [, y, m] = monthly;
    const lastDay = new Date(Number(y), Number(m), 0).getDate();
    return `${y}-${m}-${String(lastDay).padStart(2, "0")}`;
  }
  return `${yearLabel}-12-31`;
}

// 名前つきで記録した投資を、特別収入と同じ考え方で「項目名」単位のサブ行として
// 投資行の下に展開する(同じ名前は1行に合算)。ただし投資行自体は累計(元本の
// 積み上がり)なので、サブ行もその期間末までの累計にする(特別収入のような
// 期間ごとのフローではない) — こうしないと、サブ行を全部足しても親の投資行の
// 金額と合わなくなる。名前を付けていない記録はどのサブ行にも出ない(合計は
// 親の投資行にはすでに含まれている)。
function investmentSubRows(
  rows: ScenarioRow[],
  parentKey: string,
  depth: number,
  investmentEntries: InvestmentEntryInput[],
  vndPerJpy: number,
  fmt: (n: number) => string,
): TableRow[] {
  const named = investmentEntries.filter((e) => e.name && e.name.trim());
  const normalize = (name: string) => name.trim().toLowerCase();
  const labelByKey = new Map<string, string>();
  for (const e of named) {
    const key = normalize(e.name as string);
    if (!labelByKey.has(key)) labelByKey.set(key, (e.name as string).trim());
  }
  return Array.from(labelByKey.entries()).map(([normalizedName, label]) => ({
    key: `${parentKey}.${normalizedName}`,
    depth,
    label,
    bold: false,
    expandable: false,
    expanded: false,
    cells: rows.map((r) => {
      const endDate = periodEndDate(r.yearLabel);
      const total = named
        .filter((e) => normalize(e.name as string) === normalizedName && e.investedOn <= endDate)
        .reduce((s, e) => s + e.amountVnd / vndPerJpy, 0);
      return cell(total, fmt);
    }),
  }));
}

// 3階層: 総収入/総支出/総貯蓄 → 内訳 → (支出のみ)カテゴリ単位。
export function buildSingleTableRows(
  rows: ScenarioRow[],
  lang: Lang,
  isExpanded: (key: string) => boolean,
  fmt: (n: number) => string,
  specialEntries: SpecialEntry[] = [],
  vndPerJpy: number = 1,
  investmentEntries: InvestmentEntryInput[] = [],
): TableRow[] {
  const first = rows[0];
  const out: TableRow[] = [];
  const push = (r: Omit<TableRow, "expanded" | "bold" | "expandable"> & Partial<Pick<TableRow, "bold" | "expandable">>) =>
    out.push({ bold: false, expandable: false, expanded: isExpanded(r.key), ...r });

  push({
    key: "income",
    depth: 0,
    label: t(lang, "totalIncome"),
    cells: rows.map((r) => cell(r.incomeTotalYen, fmt)),
    expandable: true,
  });
  if (isExpanded("income")) {
    push({ key: "income.husband", depth: 1, label: t(lang, "husband"), cells: rows.map((r) => cell(r.husbandYen, fmt)) });
    if (!allZeroCells(rows.map((r) => r.wifeYen))) {
      push({ key: "income.wife", depth: 1, label: t(lang, "wife"), cells: rows.map((r) => cell(r.wifeYen, fmt)) });
    }
    push({ key: "income.side", depth: 1, label: t(lang, "side"), cells: rows.map((r) => cell(r.sideYen, fmt)) });
    if (!allZeroCells(rows.map((r) => r.allowanceYen))) {
      push({ key: "income.allowance", depth: 1, label: t(lang, "childAllowance"), cells: rows.map((r) => cell(r.allowanceYen, fmt)) });
    }
    // 投資益は収入の内訳には出さない(incomeTotalYenの計算自体に含めていない。
    // 実際に手元に入ってくるお金ではないため。貯蓄→投資の行にその期間の
    // 増分として表示する)。
    // 同棲時の一時収入はテーブル上では特別収入の行に合算する(設定モーダルでは
    // 引き続き別項目のまま)。incomeTotalYenの計算にも含まれているので、行を
    // 消すだけだと「内訳の合計 ≠ 総収入」に戻ってしまう(以前あったバグ)ため、
    // specialIncomeの表示額に足し込むことで内訳の合計を保つ。
    push({
      key: "income.specialIncome",
      depth: 1,
      label: t(lang, "specialIncomeLabel"),
      cells: rows.map((r) => cell(r.specialIncomeYen + r.moveInBonusYen, fmt)),
      expandable: true,
    });
    if (isExpanded("income.specialIncome")) {
      out.push(...specialSubRows(rows, "income.specialIncome", 2, "income", specialEntries, vndPerJpy, fmt));
    }
  }

  push({
    key: "expense",
    depth: 0,
    label: t(lang, "totalExpense"),
    cells: rows.map((r) => cell(r.expenseTotalYen, fmt)),
    expandable: true,
  });
  if (isExpanded("expense")) {
    push({
      key: "expense.fixed",
      depth: 1,
      label: t(lang, "fixed"),
      cells: rows.map((r) => cell(r.fixedTotalYen, fmt)),
      expandable: true,
    });
    if (isExpanded("expense.fixed")) {
      for (const c of first?.fixedByCategory ?? []) {
        push({
          key: `expense.fixed.${c.id}`,
          depth: 2,
          label: catLabel(lang, c.name),
          cells: rows.map((r) => cell(r.fixedByCategory.find((fc) => fc.id === c.id)?.valueYen ?? 0, fmt)),
        });
      }
    }
    push({
      key: "expense.variable",
      depth: 1,
      label: t(lang, "variable"),
      cells: rows.map((r) => cell(r.variableTotalYen, fmt)),
      expandable: true,
    });
    if (isExpanded("expense.variable")) {
      for (const c of first?.variableByCategory ?? []) {
        push({
          key: `expense.variable.${c.id}`,
          depth: 2,
          label: catLabel(lang, c.name),
          cells: rows.map((r) => cell(r.variableByCategory.find((vc) => vc.id === c.id)?.valueYen ?? 0, fmt)),
        });
      }
    }
    if (!allZeroCells(rows.map((r) => r.educationTotalYen))) {
      push({ key: "expense.education", depth: 1, label: t(lang, "education"), cells: rows.map((r) => cell(r.educationTotalYen, fmt)) });
    }
    push({
      key: "expense.events",
      depth: 1,
      label: t(lang, "events"),
      cells: rows.map((r) => cell(r.eventsTotalYen - r.specialExpenseYen, fmt)),
    });
    push({
      key: "expense.specialExpense",
      depth: 1,
      label: t(lang, "specialExpenseLabel"),
      cells: rows.map((r) => cell(r.specialExpenseYen, fmt)),
      expandable: true,
    });
    if (isExpanded("expense.specialExpense")) {
      out.push(...specialSubRows(rows, "expense.specialExpense", 2, "expense", specialEntries, vndPerJpy, fmt));
    }
  }

  push({
    key: "savings",
    depth: 0,
    label: t(lang, "totalSavings"),
    // 貯蓄の増減 = netFlowYen(収支、投資益は含まない) + investProfitYen(投資益は
    // 収入には数えないが、貯蓄額自体は含み益ぶんも増えるため足す)。
    cells: rows.map((r) => cellWithDelta(r.savingsCumTotalYen, r.netFlowYen + r.investProfitYen, fmt, true)),
    bold: true,
    expandable: true,
  });
  if (isExpanded("savings")) {
    // 貯蓄 = 現金 + 投資(元本+含み損益の合計)。「投資」行は合計を出し、
    // その下の階層に内訳(元本/含み損益)を出す。
    push({ key: "savings.cash", depth: 1, label: t(lang, "cash"), cells: rows.map((r) => cell(r.cashCumYen, fmt, true)) });
    push({
      key: "savings.invest",
      depth: 1,
      label: t(lang, "invest"),
      cells: rows.map((r) => cell(r.investBalYen, fmt)),
      expandable: true,
    });
    if (isExpanded("savings.invest")) {
      push({
        key: "savings.invest.principal",
        depth: 2,
        label: t(lang, "investPrincipal"),
        cells: rows.map((r) => cell(r.investBalYen - r.profitCumYen, fmt)),
      });
      // 期間の増減(+¥...)は総貯蓄行に既に出ているので、含み損益行では
      // 累計額だけを見せる(二重表示を避ける)。
      push({
        key: "savings.invest.profit",
        depth: 2,
        label: t(lang, "investProfit"),
        cells: rows.map((r) => cell(r.profitCumYen, fmt, true)),
      });
      out.push(...investmentSubRows(rows, "savings.invest", 2, investmentEntries, vndPerJpy, fmt));
    }
  }

  return out;
}

// 比較モード: シナリオ名+総貯蓄 → 総収入(内訳込み)/総支出(固定費・変動費の
// カテゴリ内訳・教育・イベント込み)/現金・投資 という、単体モードと同じ内容を
// シナリオごとに出す。
export function buildCompareTableRows(
  scenarioRows: { id: string; name: string; rows: ScenarioRow[] }[],
  lang: Lang,
  isExpanded: (key: string) => boolean,
  fmt: (n: number) => string,
  specialEntries: SpecialEntry[] = [],
  vndPerJpy: number = 1,
  investmentEntries: InvestmentEntryInput[] = [],
): TableRow[] {
  const out: TableRow[] = [];
  const push = (r: Omit<TableRow, "expanded" | "bold" | "expandable"> & Partial<Pick<TableRow, "bold" | "expandable">>) =>
    out.push({ bold: false, expandable: false, expanded: isExpanded(r.key), ...r });

  for (const scn of scenarioRows) {
    const key = `scn.${scn.id}`;
    const first = scn.rows[0];
    push({
      key,
      depth: 0,
      label: scn.name,
      cells: scn.rows.map((r) => cellWithDelta(r.savingsCumTotalYen, r.netFlowYen + r.investProfitYen, fmt, true)),
      bold: true,
      expandable: true,
    });
    if (!isExpanded(key)) continue;

    const ik = `${key}.income`;
    push({ key: ik, depth: 1, label: t(lang, "totalIncome"), cells: scn.rows.map((r) => cell(r.incomeTotalYen, fmt)), expandable: true });
    if (isExpanded(ik)) {
      push({ key: `${ik}.husband`, depth: 2, label: t(lang, "husband"), cells: scn.rows.map((r) => cell(r.husbandYen, fmt)) });
      if (!allZeroCells(scn.rows.map((r) => r.wifeYen))) {
        push({ key: `${ik}.wife`, depth: 2, label: t(lang, "wife"), cells: scn.rows.map((r) => cell(r.wifeYen, fmt)) });
      }
      push({ key: `${ik}.side`, depth: 2, label: t(lang, "side"), cells: scn.rows.map((r) => cell(r.sideYen, fmt)) });
      if (!allZeroCells(scn.rows.map((r) => r.allowanceYen))) {
        push({ key: `${ik}.allowance`, depth: 2, label: t(lang, "childAllowance"), cells: scn.rows.map((r) => cell(r.allowanceYen, fmt)) });
      }
      // 投資益は収入の内訳には出さない(incomeTotalYenの計算自体に含めていない)。
      // 同棲時の一時収入はテーブル上では特別収入の行に合算する(設定モーダルでは
      // 引き続き別項目のまま)。
      const ikSpecial = `${ik}.specialIncome`;
      push({
        key: ikSpecial,
        depth: 2,
        label: t(lang, "specialIncomeLabel"),
        cells: scn.rows.map((r) => cell(r.specialIncomeYen + r.moveInBonusYen, fmt)),
        expandable: true,
      });
      if (isExpanded(ikSpecial)) {
        out.push(...specialSubRows(scn.rows, ikSpecial, 3, "income", specialEntries, vndPerJpy, fmt));
      }
    }

    const ek = `${key}.expense`;
    push({ key: ek, depth: 1, label: t(lang, "totalExpense"), cells: scn.rows.map((r) => cell(r.expenseTotalYen, fmt)), expandable: true });
    if (isExpanded(ek)) {
      const fk = `${ek}.fixed`;
      push({ key: fk, depth: 2, label: t(lang, "fixed"), cells: scn.rows.map((r) => cell(r.fixedTotalYen, fmt)), expandable: true });
      if (isExpanded(fk)) {
        for (const c of first?.fixedByCategory ?? []) {
          push({
            key: `${fk}.${c.id}`,
            depth: 3,
            label: catLabel(lang, c.name),
            cells: scn.rows.map((r) => cell(r.fixedByCategory.find((fc) => fc.id === c.id)?.valueYen ?? 0, fmt)),
          });
        }
      }
      const vk = `${ek}.variable`;
      push({ key: vk, depth: 2, label: t(lang, "variable"), cells: scn.rows.map((r) => cell(r.variableTotalYen, fmt)), expandable: true });
      if (isExpanded(vk)) {
        for (const c of first?.variableByCategory ?? []) {
          push({
            key: `${vk}.${c.id}`,
            depth: 3,
            label: catLabel(lang, c.name),
            cells: scn.rows.map((r) => cell(r.variableByCategory.find((vc) => vc.id === c.id)?.valueYen ?? 0, fmt)),
          });
        }
      }
      if (!allZeroCells(scn.rows.map((r) => r.educationTotalYen))) {
        push({ key: `${ek}.education`, depth: 2, label: t(lang, "education"), cells: scn.rows.map((r) => cell(r.educationTotalYen, fmt)) });
      }
      push({
        key: `${ek}.events`,
        depth: 2,
        label: t(lang, "events"),
        cells: scn.rows.map((r) => cell(r.eventsTotalYen - r.specialExpenseYen, fmt)),
      });
      const ekSpecial = `${ek}.specialExpense`;
      push({
        key: ekSpecial,
        depth: 2,
        label: t(lang, "specialExpenseLabel"),
        cells: scn.rows.map((r) => cell(r.specialExpenseYen, fmt)),
        expandable: true,
      });
      if (isExpanded(ekSpecial)) {
        out.push(...specialSubRows(scn.rows, ekSpecial, 3, "expense", specialEntries, vndPerJpy, fmt));
      }
    }

    // 単体モードと同じ階層(貯蓄 → 現金/投資/含み損益)にする(以前は貯蓄の
    // 行が無く、現金/投資/含み損益がシナリオ名の直下に並んでいて単体モードと
    // 構造が食い違っていた)。
    const savingsKey = `${key}.savings`;
    push({
      key: savingsKey,
      depth: 1,
      label: t(lang, "totalSavings"),
      cells: scn.rows.map((r) => cellWithDelta(r.savingsCumTotalYen, r.netFlowYen + r.investProfitYen, fmt, true)),
      bold: true,
      expandable: true,
    });
    if (isExpanded(savingsKey)) {
      push({ key: `${savingsKey}.cash`, depth: 2, label: t(lang, "cash"), cells: scn.rows.map((r) => cell(r.cashCumYen, fmt, true)) });
      const investKey = `${savingsKey}.invest`;
      push({
        key: investKey,
        depth: 2,
        label: t(lang, "invest"),
        cells: scn.rows.map((r) => cell(r.investBalYen, fmt)),
        expandable: true,
      });
      if (isExpanded(investKey)) {
        push({
          key: `${investKey}.principal`,
          depth: 3,
          label: t(lang, "investPrincipal"),
          cells: scn.rows.map((r) => cell(r.investBalYen - r.profitCumYen, fmt)),
        });
        push({
          key: `${investKey}.profit`,
          depth: 3,
          label: t(lang, "investProfit"),
          cells: scn.rows.map((r) => cell(r.profitCumYen, fmt, true)),
        });
        out.push(...investmentSubRows(scn.rows, investKey, 3, investmentEntries, vndPerJpy, fmt));
      }
    }
  }

  return out;
}

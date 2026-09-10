import { findEffectiveOverride, type CategoryBudgetOverride } from "@/lib/category-budget";
import { getCategoryHex } from "@/lib/category-colors";
import { eduCostForAge } from "./education-costs";
import type { ScenarioConfig } from "./types";

type IncomeEntry = ScenarioConfig["income"]["husband"];
type Kid = ScenarioConfig["family"]["kids"][number];

// piggybank.special_entries(Transactionsの特別支出トグル・旧Simulationと共有の
// 実データ)の1件。「特別支出」「特別収入」タブは、シナリオ専用の別データを
// 持たずこの実データと連動する。
export interface SpecialEntryInput {
  month: string; // "YYYY-MM"
  kind: "income" | "expense";
  amount: number;
  currency: "JPY" | "VND";
}

export function specialEntryYen(e: SpecialEntryInput, vndPerJpy: number): number {
  return e.currency === "JPY" ? e.amount : vndPerJpy > 0 ? e.amount / vndPerJpy : 0;
}

// 現金の安全ライン: これを下回る見込みの期間は投資に回さず全額現金に残す
// (年次・月次どちらの積立判定でも共通のルールとして使う)。
const MIN_CASH_TO_INVEST_YEN = 100_000;

// 現金の上限額(config.savings.cashCapYen、0は「上限なし」)。investRatioPercentの
// 配分とは別に、これを超える見込みの現金は超過ぶん全額を投資に回す
// (「300万円を超えたら全部投資に回す」という要望への対応)。年次・月次
// どちらの積立判定でも共通で使う。
function applyCashCap(
  cashBeforeYen: number,
  cashDeltaYen: number,
  investDeltaYen: number,
  cashCapYen: number,
): { cashDeltaYen: number; investDeltaYen: number } {
  if (cashCapYen <= 0) return { cashDeltaYen, investDeltaYen };
  const excessYen = cashBeforeYen + cashDeltaYen - cashCapYen;
  if (excessYen <= 0) return { cashDeltaYen, investDeltaYen };
  return { cashDeltaYen: cashDeltaYen - excessYen, investDeltaYen: investDeltaYen + excessYen };
}

// 産休・育休(基本): 出生年(age===0)は対象親の収入を65%として計算する(法定の
// 産休67%・育休67〜80%/50%の細かい再現はせず、ざっくり中間の65%で近似)。
// 延長育休: 年数を指定すると、対象期間の翌年からその年数ぶん(age 1〜
// leaveExtensionYears)、対象親の収入を0%として計算する。
// 複数の子どもで重なる場合は、優先度が高い方(基本65% > 延長0%)を採用する。
function leaveMultiplierForYear(parentKey: "husband" | "wife", kids: Kid[], year: number): number {
  let best: number | null = null;
  for (const kid of kids) {
    if (kid.leaveParent !== parentKey) continue;
    const age = year - kid.birthYear;
    let candidate: number | null = null;
    if (age === 0) candidate = 65;
    else if (age >= 1 && age <= kid.leaveExtensionYears) candidate = 0;
    if (candidate !== null) best = best === null ? candidate : Math.max(best, candidate);
  }
  return (best ?? 100) / 100;
}

function netAnnualForYear(
  entry: IncomeEntry,
  year: number,
  yearsFromStart: number,
  parentKey: "husband" | "wife",
  kids: Kid[],
): number {
  const monthlyNet = entry.netMonthlyYen * Math.pow(1 + entry.raisePercent / 100, yearsFromStart);
  const bonusTotalYen = entry.netBonuses.reduce((s, b) => s + b.amountYen, 0);
  const bonusNet = bonusTotalYen * Math.pow(1 + entry.raisePercent / 100, yearsFromStart);
  const multiplier = leaveMultiplierForYear(parentKey, kids, year);
  return monthlyNet * 12 * multiplier + bonusNet;
}

// 月次表示専用: その月の手取り(月給ぶん+その月が対象のボーナス)。ボーナスは
// 年換算で均等按分せず、指定した月にそのまま計上する(要望: 「ボーナスを6月・
// 12月だけに設定したのに月次テーブルに反映されていない」への対応)。
function netMonthYen(
  entry: IncomeEntry,
  year: number,
  month: number,
  yearsFromStart: number,
  parentKey: "husband" | "wife",
  kids: Kid[],
): number {
  const raiseFactor = Math.pow(1 + entry.raisePercent / 100, yearsFromStart);
  const monthlyNet = entry.netMonthlyYen * raiseFactor * leaveMultiplierForYear(parentKey, kids, year);
  const bonusThisMonth = entry.netBonuses.filter((b) => b.month === month).reduce((s, b) => s + b.amountYen, 0) * raiseFactor;
  return monthlyNet + bonusThisMonth;
}

export const SIMULATION_YEARS_AHEAD = 15;

export interface CategoryForScenario {
  id: string;
  name: string;
  budget: number; // VND, monthly
  is_fixed: boolean;
  renewal_cycle_years: number | null;
  renewal_fee_months: number | null;
}

export interface ScenarioCategoryValue {
  id: string;
  name: string;
  valueYen: number;
  color: string;
}

export interface ScenarioYearRow {
  year: number;
  husbandYen: number;
  wifeYen: number;
  sideYen: number;
  allowanceYen: number;
  // 同棲開始年に一度だけ計上される一時収入(config.cohabitation.moveInBonusYen)。
  // 以前はincomeTotalYenの計算には含めているのにテーブルの収入内訳に行が無く、
  // 「収入の内訳を全部足しても総収入と合わない」年ができてしまうバグがあった。
  moveInBonusYen: number;
  investProfitYen: number;
  specialIncomeYen: number;
  incomeTotalYen: number;
  fixedByCategory: ScenarioCategoryValue[];
  fixedTotalYen: number;
  variableByCategory: ScenarioCategoryValue[];
  variableTotalYen: number;
  // 今年ぶんの月次表示専用。カテゴリid -> 12ヶ月ぶんの円配列(経過月は実績、
  // 未経過月は予算ベース)。今年以外の年、および同棲前の簡易項目には無い
  // (undefinedならexpandMonthly側で従来通り年額を均等按分する)。
  fixedByCategoryMonthly?: Record<string, number[]>;
  variableByCategoryMonthly?: Record<string, number[]>;
  educationTotalYen: number;
  eventsTotalYen: number;
  specialExpenseYen: number;
  expenseTotalYen: number;
  netFlowYen: number;
  cashCumYen: number;
  investBalYen: number;
  // この年の1月時点(=前年末)の運用残高。simulateYearMonths(年次・月次共通の
  // 月次複利エンジン)がこの年の1月分から複利計算を始めるための起点として使う
  // (年次の行にのみ持たせる)。
  investBalStartYen?: number;
  // この年の1月時点(=前年末)の投資元本累計。simulateYearMonthsが含み損益
  // (profitCumYen)を月ごとに正しく積み上げるための起点として使う(年次の行に
  // のみ持たせる)。
  investPrincipalCumStartYen?: number;
  // この年の1月時点(=前年末)の現金残高。simulateYearMonthsがこの年の1月分の
  // 貯蓄累計を正しい値から積み上げるための起点として使う(年次の行にのみ持たせる)。
  cashCumStartYen?: number;
  profitCumYen: number;
  savingsCumTotalYen: number;
}

export interface ScenarioRow extends Omit<ScenarioYearRow, "year"> {
  yearLabel: string; // "2026" for yearly rows, "2026/01" for monthly rows
}

// 「持続的(effective-dated)」オーバーライドだけを対象年へのスケジュールとして
// 使う。期間限定オーバーライドは近い将来の一時的な実額調整であって長期計画の
// 前提ではないため、15年先までの投影には使わない。
function projectCategoryMonthlyYen(
  category: { id: string; budget: number },
  overridesForCategory: CategoryBudgetOverride[],
  year: number,
  inflationRatePercent: number,
  vndPerJpy: number,
  nowYear: number,
): number {
  const persistent = overridesForCategory
    .filter((o) => o.end_month === null)
    .slice()
    .sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0));

  let baseVnd = category.budget;
  let baseYear = nowYear;
  for (const o of persistent) {
    const oYear = parseInt(o.month.slice(0, 4), 10);
    if (oYear <= year) {
      baseVnd = o.budget;
      baseYear = oYear;
    }
  }
  const yearsBeyond = Math.max(0, year - baseYear);
  const inflated = baseVnd * Math.pow(1 + inflationRatePercent / 100, yearsBeyond);
  return inflated / vndPerJpy;
}

function renewalFeeYenForYear(
  category: CategoryForScenario,
  overridesForCategory: CategoryBudgetOverride[],
  year: number,
  inflationRatePercent: number,
  vndPerJpy: number,
  nowYear: number,
): number {
  if (!category.renewal_cycle_years || !category.renewal_fee_months) return 0;
  const persistent = overridesForCategory.filter((o) => o.end_month === null);
  const anchorYear =
    persistent.length > 0
      ? Math.min(...persistent.map((o) => parseInt(o.month.slice(0, 4), 10)))
      : nowYear;
  if (year <= anchorYear) return 0;
  if ((year - anchorYear) % category.renewal_cycle_years !== 0) return 0;
  const monthlyYen = projectCategoryMonthlyYen(
    category,
    overridesForCategory,
    year,
    inflationRatePercent,
    vndPerJpy,
    nowYear,
  );
  return monthlyYen * category.renewal_fee_months;
}

// 同棲前のカテゴリごとの月額。実カテゴリ(projectCategoryMonthlyYen)と同じ考え方:
// 持続的オーバーライド(endMonth===null)があればそれを起点にし、それより先の
// 年数ぶんだけインフレ率を複利適用する。
function preLifeMonthlyYen(
  item: { monthlyYen: number; overrides: { month: string; endMonth: string | null; amountYen: number }[] },
  year: number,
  inflationRatePercent: number,
  nowYear: number,
): number {
  const persistent = item.overrides
    .filter((o) => o.endMonth === null)
    .slice()
    .sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0));

  let base = item.monthlyYen;
  let baseYear = nowYear;
  for (const o of persistent) {
    const oYear = parseInt(o.month.slice(0, 4), 10);
    if (oYear <= year) {
      base = o.amountYen;
      baseYear = oYear;
    }
  }
  const yearsBeyond = Math.max(0, year - baseYear);
  return base * Math.pow(1 + inflationRatePercent / 100, yearsBeyond);
}

// 同棲前・同棲後を通じて同じカテゴリ(id)を使う。同棲前だけの月額
// (preAmountByCategory)が設定されていればそれを、無ければ同棲後の実額を
// そのまま同棲前の値としても使う(「同棲前後で同じ内容」がデフォルト)。
function preCategoryMonthlyYen(
  category: { id: string; budget: number },
  preAmountByCategory: Record<string, { monthlyYen: number; overrides: { month: string; endMonth: string | null; amountYen: number }[] }>,
  overridesForCategory: CategoryBudgetOverride[],
  year: number,
  inflationRatePercent: number,
  vndPerJpy: number,
  nowYear: number,
): number {
  const preAmt = preAmountByCategory[category.id];
  if (!preAmt) {
    return projectCategoryMonthlyYen(category, overridesForCategory, year, inflationRatePercent, vndPerJpy, nowYear);
  }
  return preLifeMonthlyYen(preAmt, year, inflationRatePercent, nowYear);
}

// 指定した月に「今、有効な予算」を1つのロジックで解決する。同棲後は実カテゴリの
// オーバーライド(category_budget_overrides、期間限定 > 恒久変更 > 素の予算という
// 優先順位はfindEffectiveOverrideと同じ)、同棲前はシナリオ内のpreAmountByCategoryを
// 同じ優先順位で見る(月単位で判定するので、期間限定・恒久変更どちらも「その月から」
// が正しく反映される — 年単位でしか見ていなかった旧ロジックだと、恒久変更の開始月が
// 今年の途中でも年始から適用されたことにしてしまい、期間限定は影も形もテーブルに
// 出ないバグになっていた)。ダッシュボード(当月の予算表示)とシミュレーションの
// 月次テーブル(今年の未経過月)の両方から呼び、両者が同じ数字になることを保証する。
export function resolveCategoryMonthlyYen(
  category: { id: string; budget: number },
  overridesForCategory: CategoryBudgetOverride[],
  preAmountByCategory: Record<string, { monthlyYen: number; overrides: { month: string; endMonth: string | null; amountYen: number }[] }>,
  cohabiting: boolean,
  monthKeyStr: string,
  vndPerJpy: number,
): number {
  const preAmt = cohabiting ? undefined : preAmountByCategory[category.id];
  if (!preAmt) {
    const winner = findEffectiveOverride(overridesForCategory, monthKeyStr);
    return (winner ? winner.budget : category.budget) / vndPerJpy;
  }
  const periodMatches = preAmt.overrides.filter(
    (o) => o.endMonth !== null && o.month <= monthKeyStr && monthKeyStr <= o.endMonth,
  );
  if (periodMatches.length > 0) {
    return periodMatches.reduce((a, b) => (b.month > a.month ? b : a)).amountYen;
  }
  const persistentMatches = preAmt.overrides.filter((o) => o.endMonth === null && o.month <= monthKeyStr);
  if (persistentMatches.length > 0) {
    return persistentMatches.reduce((a, b) => (b.month > a.month ? b : a)).amountYen;
  }
  return preAmt.monthlyYen;
}

// 今年の月次表示専用: 先月までの経過済みの月はその月の実績、当月と未経過の月は
// 予算ベース(同棲前後どちらのフェーズかに応じた月額)の月額をそのまま使う
// 12ヶ月ぶんの配列を返す(要望: 「今年の月次表示で過去月にも実績ではなく
// 年換算の平均値が出ていた」への対応)。
// 当月を実績ではなく予測(予算)にするのは、月の途中では実績が過少に見えて
// 当月の支出が小さく=貯蓄が過大に表示されてしまうため(要望: 「当月の実績の
// 金額は月の予測値が入るようにしてほしい」)。
function categoryMonthlyActualOrBudgetYen(
  category: { id: string; budget: number },
  overridesForCategory: CategoryBudgetOverride[],
  preAmountByCategory: Record<string, { monthlyYen: number; overrides: { month: string; endMonth: string | null; amountYen: number }[] }>,
  cohabiting: boolean,
  monthlyActualVnd: Record<string, number> | undefined,
  currentMonth: number,
  inflationRatePercent: number,
  vndPerJpy: number,
  nowYear: number,
): number[] {
  return Array.from({ length: 12 }, (_, idx) => {
    const m = idx + 1;
    const key = `${nowYear}-${String(m).padStart(2, "0")}`;
    if (m < currentMonth) {
      // 先月までの経過月は必ず実績を使う(その月の取引が1件も無いカテゴリは
      // キー自体が存在しないため undefined になるが、それは「実績0円」であって
      // 「不明だから予算で埋める」ではない。ここをbudgetMonthlyYenにfallbackして
      // いたのが、年次合計(annualCategoryYen)と月次内訳の合計が食い違う
      // =貯蓄サマリーカードとテーブルの数字が食い違うバグの原因だった)。
      const actualVnd = monthlyActualVnd?.[key] ?? 0;
      return actualVnd / vndPerJpy;
    }
    // 当月(m === currentMonth)以降は、実績ではなくその月の予算を「月の予測値」
    // として使う。当月を実績にすると、月の途中では実績が過少で貯蓄が過大に
    // 見えてしまうため。
    // 未経過月は、その月における「今、有効な予算」をresolveCategoryMonthlyYenで
    // 月単位に解決する(期間限定・恒久変更どちらもその開始月から正しく反映される)。
    return resolveCategoryMonthlyYen(category, overridesForCategory, preAmountByCategory, cohabiting, key, vndPerJpy);
  });
}

// 今年ぶんは、予算projectionだけでなく「経過月までの実績」も併せて使う。
// 以前はここだけ「年初来実績を経過日数で年換算(トレンド外挿)」していたが、
// 月次内訳(categoryMonthlyActualOrBudgetYen)とは別の計算式だったため、
// 月次テーブルを12ヶ月ぶん合計した値とこの年次の値がズレる
// (=貯蓄サマリーカードとテーブルの数字が食い違う)バグになっていた。
// 月次内訳の合計と必ず一致するよう「先月までの実績 + 当月以降の月数×月額予算」
// という同じ区切りに統一する(当月は実績ではなく予算=月の予測値を使う)。
// 実績が無いカテゴリ(まだ一度も使っていない等)は従来通り予算ベース。
function annualCategoryYen(
  category: { name: string },
  monthlyYen: number,
  year: number,
  nowYear: number,
  nowMonth: number,
  vndPerJpy: number,
  actualByCategoryVnd: Record<string, number>,
  // カテゴリの月別実績(VND、"YYYY-MM"キー)。当月を予算に切り替えるため、
  // 年初来累計ではなく「先月まで」の実績だけを足せるように月別で受け取る。
  actualByMonthForCategory: Record<string, number> | undefined,
): number {
  if (year !== nowYear) return monthlyYen * 12;
  const actualVnd = actualByCategoryVnd[category.name];
  if (!actualVnd || actualVnd <= 0) return monthlyYen * 12;
  let actualBeforeThisMonthYen = 0;
  for (let m = 1; m < nowMonth; m++) {
    const key = `${nowYear}-${String(m).padStart(2, "0")}`;
    actualBeforeThisMonthYen += (actualByMonthForCategory?.[key] ?? 0) / vndPerJpy;
  }
  const monthsFromCurrent = 12 - nowMonth + 1; // 当月〜12月
  return actualBeforeThisMonthYen + monthlyYen * monthsFromCurrent;
}

// 児童手当: 0〜2歳 1.5万円/月、3歳〜高校生(18歳)まで 1万円/月。要件5-2。
function childAllowanceYenForYear(birthYear: number, year: number): number {
  const age = year - birthYear;
  if (age < 0) return 0;
  if (age <= 2) return 180_000;
  if (age <= 18) return 120_000;
  return 0;
}

export function computeScenarioYears(
  config: ScenarioConfig,
  categories: CategoryForScenario[],
  overrides: CategoryBudgetOverride[],
  vndPerJpy: number,
  startYear: number = new Date().getFullYear(),
  // 今年ぶんのカテゴリ別実績(VND、カテゴリ名キー)。今年は予算projectionだけでなく
  // 「今日までの実績を年換算した見込み」も併せて使う(要望: 既にある今年の実績が
  // Simulationに反映されていない、への対応)。
  actualByCategoryVnd: Record<string, number> = {},
  // 今年ぶんのカテゴリ別・月別実績(VND、カテゴリ名→"YYYY-MM"→VND)。今年の月次
  // 表示で、経過済みの月は実績そのものを、未経過の月は予算ベースを使うために使う
  // (要望: 月次表示で過去月にも年換算の平均値しか出ていなかった、への対応)。
  actualByCategoryMonthVnd: Record<string, Record<string, number>> = {},
  // piggybank.special_entries(特別支出・特別収入の実データ)。
  specialEntries: SpecialEntryInput[] = [],
  // ダッシュボードの「投資を記録」で登録した、実際の投資記録(InvestmentEntryInput)。
  // 今年ぶんの投資残高をsimulateYearMonths経由で月次表示(expandMonthly)と
  // 全く同じロジックで計算するために必要(経過済み月は実績、未経過月は複利)。
  investmentEntries: InvestmentEntryInput[] = [],
): ScenarioYearRow[] {
  const nowYear = new Date().getFullYear();
  const nowMonth = new Date().getMonth() + 1;
  const years = Array.from({ length: SIMULATION_YEARS_AHEAD + 1 }, (_, i) => startYear + i);

  const overridesByCategory = new Map<string, CategoryBudgetOverride[]>();
  for (const o of overrides) {
    const arr = overridesByCategory.get(o.category_id);
    if (arr) arr.push(o);
    else overridesByCategory.set(o.category_id, [o]);
  }

  const fixedCats = categories.filter((c) => c.is_fixed);
  const variableCats = categories.filter((c) => !c.is_fixed);

  // シナリオ開始年の1月時点の現金・投資残高を初期値として積み上げる。
  let cashCum = config.savings.initialCashYen;
  let investBal = config.savings.initialInvestYen;
  let investPrincipalCum = config.savings.initialInvestYen;

  return years.map((year, i) => {
    // 同棲開始年から: 配偶者の収入・カテゴリの実額(同棲後の値)が反映される。
    // それより前: 配偶者収入は0、カテゴリは同棲前専用の値(無ければ同棲後と同じ)。
    const cohabiting = year >= config.cohabitation.startYear;
    const moveInBonusYen = year === config.cohabitation.startYear ? config.cohabitation.moveInBonusYen : 0;

    // 入力は手取り(月+ボーナス)。額面年収は設定モーダル側でview-only表示用に
    // 逆算するだけで、ここでの収支計算には使わない。産休・育休期間があれば、
    // その月ぶんの月収だけ incomePercent% に減らす。
    const husbandYen = netAnnualForYear(config.income.husband, year, i, "husband", config.family.kids);
    const wifeYen = config.family.spouse && cohabiting ? netAnnualForYear(config.income.wife, year, i, "wife", config.family.kids) : 0;
    const sideActiveThisYear =
      (config.income.side.startYear === null || year >= config.income.side.startYear) &&
      (config.income.side.endYear === null || year <= config.income.side.endYear);
    const sideYen = sideActiveThisYear ? config.income.side.amountYen * 12 : 0;
    const allowanceYen = config.family.kids.reduce(
      (sum, kid) => sum + childAllowanceYenForYear(kid.birthYear, year),
      0,
    );
    const specialIncomeYen = specialEntries
      .filter((e) => e.kind === "income" && e.month.startsWith(`${year}-`))
      .reduce((s, e) => s + specialEntryYen(e, vndPerJpy), 0);
    // 投資益は収入に含めない(実際に手元に入ってくるお金ではなく含み益のため)。
    // 貯蓄の増減には引き続き反映する(下のinvestBalの計算)。
    const incomeTotalYen = husbandYen + wifeYen + sideYen + allowanceYen + moveInBonusYen + specialIncomeYen;

    // 固定費・変動費は、同棲前後どちらの年でも同じカテゴリ(piggybank.categories)を
    // 使う。月額の出どころだけ、同棲後は実カテゴリの予算、同棲前は
    // preAmountByCategory(無ければ同棲後の実額をそのまま流用)で分岐する
    // (要望: 「同棲前・同棲後いずれにしても共通のカテゴリを利用」への対応。
    // 以前はidが同棲前後で食い違い、テーブルのカテゴリ内訳行が同棲後の年で
    // ¥0になるバグの原因になっていた)。
    const fixedByCategory: ScenarioCategoryValue[] = fixedCats.map((c) => {
      const overridesForCat = overridesByCategory.get(c.id) ?? [];
      const monthlyYen = cohabiting
        ? projectCategoryMonthlyYen(c, overridesForCat, year, config.inflationRatePercent, vndPerJpy, nowYear)
        : preCategoryMonthlyYen(
            c,
            config.cohabitation.preAmountByCategory,
            overridesForCat,
            year,
            config.inflationRatePercent,
            vndPerJpy,
            nowYear,
          );
      const renewalYen = renewalFeeYenForYear(c, overridesForCat, year, config.inflationRatePercent, vndPerJpy, nowYear);
      const valueYen =
        annualCategoryYen(c, monthlyYen, year, nowYear, nowMonth, vndPerJpy, actualByCategoryVnd, actualByCategoryMonthVnd[c.name]) +
        renewalYen;
      return { id: c.id, name: c.name, valueYen, color: getCategoryHex(c.name) };
    });
    const fixedTotalYen = fixedByCategory.reduce((s, c) => s + c.valueYen, 0);

    // 今年の月次表示専用の内訳(経過月=実績、未経過月=予算)。他の年では作らない
    // (expandMonthly側で従来通り年額を均等按分にfallbackする)。
    const fixedByCategoryMonthly: Record<string, number[]> | undefined =
      year === nowYear
        ? Object.fromEntries(
            fixedCats.map((c) => [
              c.id,
              categoryMonthlyActualOrBudgetYen(
                c,
                overridesByCategory.get(c.id) ?? [],
                config.cohabitation.preAmountByCategory,
                cohabiting,
                actualByCategoryMonthVnd[c.name],
                nowMonth,
                config.inflationRatePercent,
                vndPerJpy,
                nowYear,
              ),
            ]),
          )
        : undefined;

    const variableByCategory: ScenarioCategoryValue[] = variableCats.map((c) => {
      const overridesForCat = overridesByCategory.get(c.id) ?? [];
      const monthlyYen = cohabiting
        ? projectCategoryMonthlyYen(c, overridesForCat, year, config.inflationRatePercent, vndPerJpy, nowYear)
        : preCategoryMonthlyYen(
            c,
            config.cohabitation.preAmountByCategory,
            overridesForCat,
            year,
            config.inflationRatePercent,
            vndPerJpy,
            nowYear,
          );
      const valueYen = annualCategoryYen(
        c,
        monthlyYen,
        year,
        nowYear,
        nowMonth,
        vndPerJpy,
        actualByCategoryVnd,
        actualByCategoryMonthVnd[c.name],
      );
      return { id: c.id, name: c.name, valueYen, color: getCategoryHex(c.name) };
    });
    const variableTotalYen = variableByCategory.reduce((s, c) => s + c.valueYen, 0);

    const variableByCategoryMonthly: Record<string, number[]> | undefined =
      year === nowYear
        ? Object.fromEntries(
            variableCats.map((c) => [
              c.id,
              categoryMonthlyActualOrBudgetYen(
                c,
                overridesByCategory.get(c.id) ?? [],
                config.cohabitation.preAmountByCategory,
                cohabiting,
                actualByCategoryMonthVnd[c.name],
                nowMonth,
                config.inflationRatePercent,
                vndPerJpy,
                nowYear,
              ),
            ]),
          )
        : undefined;

    const educationTotalYen = config.family.kids.reduce((sum, kid, kidIdx) => {
      const age = year - kid.birthYear;
      if (age < 0) return sum;
      return sum + eduCostForAge(age, config.education[String(kidIdx)]);
    }, 0);

    // 結婚式(単発)・旅行(毎年繰り返す、暮らしと同じインフレ率で複利)は常設フォーム
    // のイベントとして、汎用のevents配列とは別に計算する。UIにON/OFFチェックボックスは
    // 置かない(1ステップ余分になるため)ので、金額0円=未計上として扱う。
    const weddingYen = config.wedding.amountYen > 0 && config.wedding.year === year ? config.wedding.amountYen : 0;
    // 旅行の金額は「1回あたり」。年間の総額はそれ×年間の回数。
    const travelYen =
      config.travel.amountYen > 0 && year >= config.travel.startYear
        ? config.travel.amountYen *
          config.travel.timesPerYear *
          Math.pow(1 + config.inflationRatePercent / 100, year - config.travel.startYear)
        : 0;
    // 特別支出はspecial_entries(実データ)と連動する。
    const specialExpenseYen = specialEntries
      .filter((e) => e.kind === "expense" && e.month.startsWith(`${year}-`))
      .reduce((s, e) => s + specialEntryYen(e, vndPerJpy), 0);
    const eventsTotalYen = weddingYen + travelYen + specialExpenseYen;

    const expenseTotalYen = fixedTotalYen + variableTotalYen + educationTotalYen + eventsTotalYen;
    // netFlowYen(収支、表示用)は投資益を含まない総収入から計算する(投資益は
    // 手元に入ってくるお金ではないため)。
    const netFlowYen = incomeTotalYen - expenseTotalYen;

    // 投資・現金の積み上げは、月次表示(expandMonthly)と全く同じ複利ロジックを
    // simulateYearMonthsで共有する(以前は年次だけ「前年末残高に年率を一括適用、
    // 今年の新規積立分は今年ぶん無利息」という粗い計算をしており、月次表示の
    // 12月の値と食い違っていた)。12ヶ月ぶん回して、12月末の状態をこの年の
    // 確定値として採用する。
    const investBalStartYen = investBal;
    const investPrincipalCumStartYen = investPrincipalCum;
    const cashCumStartYen = cashCum;
    const monthRows = simulateYearMonths(
      {
        incomeTotalYen,
        husbandYen,
        wifeYen,
        sideYen,
        allowanceYen,
        moveInBonusYen,
        specialIncomeYen,
        fixedByCategory,
        fixedByCategoryMonthly,
        variableByCategory,
        variableByCategoryMonthly,
        educationTotalYen,
      },
      config,
      year,
      vndPerJpy,
      investmentEntries,
      specialEntries,
      investBalStartYen,
      investPrincipalCumStartYen,
      cashCumStartYen,
    );
    const decRow = monthRows[11];
    const investProfitYen = monthRows.reduce((s, r) => s + r.investProfitYen, 0);
    investBal = decRow.investBalYen;
    cashCum = decRow.cashCumYen;
    investPrincipalCum = investBal - decRow.profitCumYen;
    const profitCumYen = decRow.profitCumYen;
    const savingsCumTotalYen = decRow.savingsCumTotalYen;

    return {
      year,
      husbandYen,
      wifeYen,
      sideYen,
      allowanceYen,
      moveInBonusYen,
      investProfitYen,
      specialIncomeYen,
      incomeTotalYen,
      fixedByCategory,
      fixedTotalYen,
      fixedByCategoryMonthly,
      variableByCategory,
      variableTotalYen,
      variableByCategoryMonthly,
      educationTotalYen,
      eventsTotalYen,
      specialExpenseYen,
      expenseTotalYen,
      netFlowYen,
      cashCumYen: cashCum,
      investBalYen: investBal,
      investBalStartYen,
      investPrincipalCumStartYen,
      cashCumStartYen,
      profitCumYen,
      savingsCumTotalYen,
    };
  });
}

// ダッシュボードの「投資を記録」で登録した、実際の投資記録の1件。
export interface InvestmentEntryInput {
  amountVnd: number;
  investedOn: string; // "YYYY-MM-DD"
  name: string | null;
}

// simulateYearMonthsが読む、年次行のうち投資・現金以外のフィールド(収入内訳・
// 固定費/変動費内訳・教育費)。computeScenarioYearsから呼ぶ時点ではその年の
// investBalYen等(投資残高)はまだ計算前なので、それらを含まない形にしてある。
type YearRowForMonthlySim = Pick<
  ScenarioYearRow,
  | "incomeTotalYen"
  | "husbandYen"
  | "wifeYen"
  | "sideYen"
  | "allowanceYen"
  | "moveInBonusYen"
  | "specialIncomeYen"
  | "fixedByCategory"
  | "fixedByCategoryMonthly"
  | "variableByCategory"
  | "variableByCategoryMonthly"
  | "educationTotalYen"
>;

// 1年ぶん(1月〜12月)の月次シミュレーション。computeScenarioYears(年次の
// 投資残高をこのロジックで正しく積み上げるため)とexpandMonthly(特定の年を
// UIに月次展開するため)の両方から呼ばれる共有エンジン。呼び出し元がどちらでも
// 同じ数式を通るため、年次テーブルの12月と月次表示の12月が食い違うことがない。
function simulateYearMonths(
  row: YearRowForMonthlySim,
  config: ScenarioConfig,
  focusYear: number,
  vndPerJpy: number,
  investmentEntries: InvestmentEntryInput[],
  specialEntries: SpecialEntryInput[],
  // この年の1月1日時点(=前年12月末)の投資残高・投資元本累計・現金残高。
  startInvestBalYen: number,
  startInvestPrincipalCumYen: number,
  startCashCumYen: number,
): ScenarioRow[] {
  const divide = (v: number) => v / 12;
  // 旅行の年間の回数ぶんを、年内に均等な間隔で割り振る月(1〜12)。1回なら7月
  // (夏)、2回なら4月・10月...という具合に、回数に応じて等間隔になる位置を選ぶ
  // (要望: 年2回・3回等のとき、1つの月にまとめたり12ヶ月に均等按分したりせず、
  // システムが自動でその年の対象月に振り分けて計上する)。
  const travelMonths = new Set(
    Array.from({ length: Math.max(1, Math.round(config.travel.timesPerYear)) }, (_, i) =>
      Math.min(12, Math.max(1, Math.floor(((i + 0.5) * 12) / Math.max(1, Math.round(config.travel.timesPerYear))) + 1)),
    ),
  );
  const nowYearForInvest = new Date().getFullYear();
  const nowMonthForInvest = new Date().getMonth() + 1;
  const isCurrentYearView = focusYear === nowYearForInvest;
  // 「今」時点(今月末まで)の実際の投資額累計。今年の未経過月を、ここから年末の
  // projectionまで線形に増やしていくための起点にする。
  const realInvestAtNowYen = isCurrentYearView
    ? (() => {
        const cutoff = `${nowYearForInvest}-${String(nowMonthForInvest).padStart(2, "0")}-31`;
        const totalVnd = investmentEntries.filter((e) => e.investedOn <= cutoff).reduce((s, e) => s + e.amountVnd, 0);
        return vndPerJpy > 0 ? totalVnd / vndPerJpy : 0;
      })()
    : 0;
  // netAnnualForYear/computeScenarioYearsと同じ前提(シナリオは常に「今年」を
  // startYearとして計算している)で、その年の昇給・産休育休の複利年数を求める。
  const yearsFromStart = focusYear - new Date().getFullYear();
  const cohabitingThisYear = focusYear >= config.cohabitation.startYear;
  // 収入合計のうち、本人/配偶者/副業/子育て支援/同棲時の一時収入/投資益/
  // 特別収入の按分では説明が付かない残り(想定外の差分)は、保険として
  // 年額を均等按分して埋め合わせる(通常はほぼ¥0になるはず)。
  const otherIncomeAnnualYen =
    row.incomeTotalYen -
    row.husbandYen -
    row.wifeYen -
    row.sideYen -
    row.allowanceYen -
    row.moveInBonusYen -
    row.specialIncomeYen;
  // 貯蓄の累計は「年末の累計から、残り月数ぶんを年間平均netFlowで引く」という
  // 線形補間だったが、ボーナス月やイベント月のように月ごとのnetFlowが大きく
  // 違う場合、隣り合う月の差がその月のdelta表示(実際のnetFlowYen)と一致しない
  // バグになっていた(例: ある月の貯蓄額が前月+その月のdeltaにならない)。
  // 前年(=1月1日時点)の現金+投資残高を起点に、各月の実際のnetFlowYenを
  // そのまま積み上げる。
  let cumYen = startCashCumYen + startInvestBalYen;
  // 投資残高は「均等按分」ではなく、月を追うごとに増えていくように出す。
  // - 経過済み月(今年のみ): その月までの実際の投資額の累計をそのまま使う。
  // - それ以外の月: 前月末の投資残高に想定利率(月割り)で含み益を積み、かつ
  //   年次と同じ「現金がMIN_CASH_TO_INVEST_YENを下回る見込みなら投資しない」
  //   ルールをその月の実際の収支で判定しながら1ヶ月ずつ進める(以前は年初/
  //   年末の2点だけを直線補間していたため、月の途中で現金がマイナスになって
  //   いても投資額が機械的に増え続けるバグになっていた)。
  let simInvestBalYen = 0;
  let simCashCumYen = 0;
  // 投資元本(含み損益を含まない、これまで投資に回した額の累計)。含み損益
  // (profitCumYen)を月ごとに「投資残高 − 投資元本」として正しく出すために使う。
  let simInvestPrincipalCumYen = 0;
  let simStarted = !isCurrentYearView;
  if (!isCurrentYearView) {
    simInvestBalYen = startInvestBalYen;
    simInvestPrincipalCumYen = startInvestPrincipalCumYen;
    simCashCumYen = startCashCumYen;
  }
  return Array.from({ length: 12 }, (_, idx) => {
    const m = idx + 1;
    const husbandYenThisMonth = netMonthYen(config.income.husband, focusYear, m, yearsFromStart, "husband", config.family.kids);
    const wifeYenThisMonth =
      config.family.spouse && cohabitingThisYear
        ? netMonthYen(config.income.wife, focusYear, m, yearsFromStart, "wife", config.family.kids)
        : 0;
    // 結婚式はその月にまとめて計上。旅行は1回あたりの金額を、年間の回数ぶん
    // travelMonthsで割り振った月にそのまま計上する(12ヶ月への均等按分はしない)。
    const weddingThisMonth =
      config.wedding.amountYen > 0 && config.wedding.year === focusYear && config.wedding.month === m ? config.wedding.amountYen : 0;
    const travelPerTripYen =
      config.travel.amountYen > 0 && focusYear >= config.travel.startYear
        ? config.travel.amountYen * Math.pow(1 + config.inflationRatePercent / 100, focusYear - config.travel.startYear)
        : 0;
    const travelThisMonth = travelPerTripYen > 0 && travelMonths.has(m) ? travelPerTripYen : 0;
    const monthKey = `${focusYear}-${String(m).padStart(2, "0")}`;
    const specialExpenseThisMonth = specialEntries
      .filter((e) => e.kind === "expense" && e.month === monthKey)
      .reduce((s, e) => s + specialEntryYen(e, vndPerJpy), 0);
    const specialIncomeThisMonth = specialEntries
      .filter((e) => e.kind === "income" && e.month === monthKey)
      .reduce((s, e) => s + specialEntryYen(e, vndPerJpy), 0);
    const eventsThisMonth = weddingThisMonth + travelThisMonth + specialExpenseThisMonth;

    // 今年ぶんは、経過月=実績・未経過月=予算の月次内訳(fixedByCategoryMonthly等)が
    // あればそれを使う。無ければ(他の年、または同棲前フェーズ)従来通り年額を
    // 均等按分する。
    const fixedByCategory = row.fixedByCategory.map((c) => ({
      ...c,
      valueYen: row.fixedByCategoryMonthly?.[c.id]?.[m - 1] ?? divide(c.valueYen),
    }));
    const fixedTotalYen = fixedByCategory.reduce((s, c) => s + c.valueYen, 0);
    const variableByCategory = row.variableByCategory.map((c) => ({
      ...c,
      valueYen: row.variableByCategoryMonthly?.[c.id]?.[m - 1] ?? divide(c.valueYen),
    }));
    const variableTotalYen = variableByCategory.reduce((s, c) => s + c.valueYen, 0);

    const nonEventExpense = fixedTotalYen + variableTotalYen + divide(row.educationTotalYen);
    const expenseTotalYen = nonEventExpense + eventsThisMonth;

    const isElapsedReal = isCurrentYearView && m <= nowMonthForInvest;
    // 未来月で、まだシミュレーションを開始していなければ、ここで実績から
    // 引き継ぐ(「今」時点の実際の投資額・現金を起点にする)。cumYenはこの
    // 時点ではまだ先月末時点の値(今月ぶんはこの後で加算する)。
    if (!isElapsedReal && !simStarted) {
      simInvestBalYen = realInvestAtNowYen;
      // 実績には含み損益の概念が無い(記録した金額=元本)ため、引き継ぎ時点の
      // 元本累計は実際の投資額そのものとする。
      simInvestPrincipalCumYen = realInvestAtNowYen;
      simCashCumYen = cumYen - realInvestAtNowYen;
      simStarted = true;
    }
    // 経過済み月(今年のみ)は実績データそのものを使うため、含み益という概念を
    // 持たない(記録された投資額=元本そのまま)。未経過月は前月末残高に想定
    // 利率を月割りで適用し、含み益を積み上げていく。
    const investProfitYenThisMonth = isElapsedReal ? 0 : simInvestBalYen * (config.savings.returnRatePercent / 100 / 12);

    // 投資益は収入に含めない(実際に手元に入ってくるお金ではないため)。
    const incomeTotalYen =
      husbandYenThisMonth +
      wifeYenThisMonth +
      divide(row.sideYen) +
      divide(row.allowanceYen) +
      divide(row.moveInBonusYen) +
      specialIncomeThisMonth +
      divide(otherIncomeAnnualYen);
    const netFlowYen = incomeTotalYen - expenseTotalYen;
    cumYen += netFlowYen;
    // netFlowYen(≒cumYenの増分)は投資益を含まないため、含み益が乗る月は
    // cumYenだけでは総貯蓄を過小評価してしまう。savingsCumTotalYenは最終的に
    // 必ず「現金+投資残高」と一致させる(下でinvestBalYen/cashCumYenが
    // 確定した後に確定させる)。
    let savingsCumTotalYen = cumYen;

    let investBalYen: number;
    let cashCumYen: number;
    let profitCumYen: number;
    if (isElapsedReal) {
      const cutoff = `${focusYear}-${String(m).padStart(2, "0")}-31`;
      const realInvestVnd = investmentEntries
        .filter((e) => e.investedOn <= cutoff)
        .reduce((s, e) => s + e.amountVnd, 0);
      investBalYen = vndPerJpy > 0 ? realInvestVnd / vndPerJpy : 0;
      cashCumYen = savingsCumTotalYen - investBalYen;
      // 経過済み月は実績(=元本)そのものなので含み損益は0とする。
      profitCumYen = 0;
    } else {
      const earnedNetFlowYen = netFlowYen;
      const cashIfNoInvestYen = simCashCumYen + earnedNetFlowYen;
      let investDelta =
        earnedNetFlowYen >= 0 && cashIfNoInvestYen >= MIN_CASH_TO_INVEST_YEN
          ? (earnedNetFlowYen * config.savings.investRatioPercent) / 100
          : 0;
      let cashDelta = earnedNetFlowYen - investDelta;
      ({ cashDeltaYen: cashDelta, investDeltaYen: investDelta } = applyCashCap(
        simCashCumYen,
        cashDelta,
        investDelta,
        config.savings.cashCapYen,
      ));
      simCashCumYen = simCashCumYen + cashDelta;
      simInvestBalYen = simInvestBalYen + investDelta + investProfitYenThisMonth;
      simInvestPrincipalCumYen = simInvestPrincipalCumYen + investDelta;
      investBalYen = simInvestBalYen;
      cashCumYen = simCashCumYen;
      profitCumYen = simInvestBalYen - simInvestPrincipalCumYen;
      // cumYenは投資益(investProfitYenThisMonth)を含まずに積み上げているため、
      // 含み益が乗った月はここで「現金+投資残高」に上書きして一致させる
      // (以前はcumYenのまま返しており、総貯蓄行と現金/投資の内訳の合計が
      // 食い違うバグになっていた)。
      savingsCumTotalYen = cashCumYen + investBalYen;
    }

    return {
      yearLabel: `${focusYear}/${String(m).padStart(2, "0")}`,
      husbandYen: husbandYenThisMonth,
      wifeYen: wifeYenThisMonth,
      sideYen: divide(row.sideYen),
      allowanceYen: divide(row.allowanceYen),
      moveInBonusYen: divide(row.moveInBonusYen),
      investProfitYen: investProfitYenThisMonth,
      specialIncomeYen: specialIncomeThisMonth,
      incomeTotalYen,
      fixedByCategory,
      fixedTotalYen,
      variableByCategory,
      variableTotalYen,
      educationTotalYen: divide(row.educationTotalYen),
      eventsTotalYen: eventsThisMonth,
      specialExpenseYen: specialExpenseThisMonth,
      expenseTotalYen,
      netFlowYen,
      cashCumYen,
      investBalYen,
      profitCumYen,
      savingsCumTotalYen,
    };
  });
}

// 年次の1行を、指定年の12ヶ月ぶんに展開する薄いラッパー。実体はsimulateYearMonths
// (computeScenarioYearsと共有)で、この年の1月1日時点(=前年12月末)の
// 投資残高/投資元本累計/現金残高を年次行から取り出して渡すだけ。
export function expandMonthly(
  yearRows: ScenarioYearRow[],
  config: ScenarioConfig,
  focusYear: number,
  vndPerJpy: number = 1,
  // 今年ぶんの月次表示専用: 経過済みの月は、想定利率でのprojectionではなく
  // 実際に記録した投資額(累計)をそのまま「投資」に使う(未記録ならまだ¥0の
  // まま)。差額は「現金」側で吸収する(現金→投資へお金が動く、という
  // 実際のお金の動きに合わせるため)。
  investmentEntries: InvestmentEntryInput[] = [],
  // 特別支出・特別収入(special_entries)。年次と違い、月次表示ではその月
  // (YYYY-MM)に一致するものだけをそのまま計上する(年内の均等按分はしない)。
  specialEntries: SpecialEntryInput[] = [],
): ScenarioRow[] {
  const row = yearRows.find((y) => y.year === focusYear) ?? yearRows[0];
  if (!row) return [];
  return simulateYearMonths(
    row,
    config,
    focusYear,
    vndPerJpy,
    investmentEntries,
    specialEntries,
    row.investBalStartYen ?? config.savings.initialInvestYen,
    row.investPrincipalCumStartYen ?? config.savings.initialInvestYen,
    row.cashCumStartYen ?? config.savings.initialCashYen,
  );
}

export function toRows(yearRows: ScenarioYearRow[]): ScenarioRow[] {
  return yearRows.map((y) => ({ ...y, yearLabel: String(y.year) }));
}

import { z } from "zod";

// 教育費テーブルのステージキー(lib/scenario/education-costs.ts と対応)。
export const EDU_STAGE_KEYS = [
  "infant1",
  "infant2",
  "elementary",
  "junior",
  "high",
  "university",
] as const;
export type EduStageKey = (typeof EDU_STAGE_KEYS)[number];

// 産休・育休(基本): 子どもごとのON/OFF。ONなら出生年(age===0)は対象親の収入を
// 65%として計算する(法定の産休67%・育休67〜80%/50%の細かい再現はせず、
// ざっくり中間の65%で近似)。
// 延長育休: 年数を指定すると、基本の対象期間の直後からその年数ぶん(age 1〜
// leaveExtensionYears)、対象親の収入を0%として計算する。
// 複数の子どもで重なった場合は、優先度が高い(数値が大きい)方を採用する
// (=基本65%が延長0%より優先される)。
const kidSchema = z.object({
  birthYear: z.number().int(),
  leaveParent: z.enum(["none", "husband", "wife"]),
  leaveExtensionYears: z.number().min(0),
});

// ボーナスは年1回とは限らない(夏・冬など複数回)ので、金額+月の組を複数持てる
// ようにする。
const incomeBonusSchema = z.object({
  id: z.string(),
  amountYen: z.number().min(0),
  month: z.number().int().min(1).max(12),
});

// 手取り(税・社会保険料控除後)で入力してもらう。額面年収は
// (netMonthlyYen*12 + ボーナス合計) / 0.8 として設定モーダル側で参照用に逆算表示する
// (view-onlyであり、この構成には保存しない)。
const incomeEntrySchema = z.object({
  netMonthlyYen: z.number().min(0),
  netBonuses: z.array(incomeBonusSchema),
  raisePercent: z.number(),
});

const eventSchema = z.object({
  id: z.string(),
  label: z.string(),
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
  amountYen: z.number(),
});

// カテゴリ(piggybank.categories)の期間別オーバーライドと同じ考え方
// (endMonth===nullなら持続的、それ以外は期間限定)の、同棲前専用オーバーライド。
// こちらはJSONB内で完結し金額は最初から円建て(VND換算不要)。
const lifeItemOverrideSchema = z.object({
  id: z.string(),
  month: z.string(), // "YYYY-MM"
  endMonth: z.string().nullable(),
  amountYen: z.number().min(0),
});

// 同棲前のカテゴリごとの月額。カテゴリ自体(アイコン・色・名前)は同棲後と完全に
// 共有し(piggybank.categories)、ここでは「同棲前だけの月額」だけを別に持つ。
const preCategoryAmountSchema = z.object({
  monthlyYen: z.number().min(0),
  overrides: z.array(lifeItemOverrideSchema),
});

// startYear年から「同棲後」の暮らし(categoryの実額)・配偶者の収入が反映される。
// それより前の年は、カテゴリid -> preAmountByCategory の値を使う(無いカテゴリは
// 同棲後の実額をそのまま同棲前の値として使う = 「同棲前後で同じ内容」がデフォルト)。
// moveInBonusYen: 同棲開始年に一度だけ加算される一時収入(例: 相手が共通口座に
// 入れる資金)。
const cohabitationSchema = z.object({
  startYear: z.number().int(),
  moveInBonusYen: z.number(),
  preAmountByCategory: z.record(z.string(), preCategoryAmountSchema),
});

// 結婚式: 単発。旅行: 毎年繰り返す前提の定番イベントなので、汎用のevents配列とは
// 別に常設のフォームとして持つ(「タブを開いてクリックしたら追加」ではなく、
// 最初から用意されているようにという要望への対応)。指輪・結婚式本体・新婚旅行を
// まとめた「結婚式関連費用」として1フォームに入力する(内訳はツールチップで案内)。
const weddingEventSchema = z.object({
  enabled: z.boolean(),
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
  amountYen: z.number().min(0),
});
const travelEventSchema = z.object({
  enabled: z.boolean(),
  // 1回あたりの金額。年間の総額は amountYen × timesPerYear。
  amountYen: z.number().min(0),
  startYear: z.number().int(),
  // 年間の回数。2回以上のときは、システムが自動で年内に均等な間隔の月へ
  // 振り分けて計上する(全部を1ヶ月にまとめたり、12ヶ月に均等按分したりはしない)。
  timesPerYear: z.number().int().min(1),
});

// シナリオが持つ、カテゴリ(piggybank.categories)では表現できない前提のみ。
// 「暮らし」(固定費/変動費)の実額は categories / category_budget_overrides を
// 共有で参照するため、ここには含まない(同棲前の月額を除く。上記参照)。
export const scenarioConfigSchema = z.object({
  family: z.object({
    spouse: z.boolean(),
    kids: z.array(kidSchema),
  }),
  income: z.object({
    husband: incomeEntrySchema,
    wife: incomeEntrySchema,
    // startYear/endYearがnullなら期間指定なし(常に加算)。
    side: z.object({ amountYen: z.number().min(0), startYear: z.number().int().nullable(), endYear: z.number().int().nullable() }),
  }),
  cohabitation: cohabitationSchema,
  // キー: kids配列のindex(文字列)。値: ステージキー -> そのステージの年額(円、
  // 塾・習い事込みの合算)。公立/私立ボタンは金額欄への「入力補助(クイック入力)」
  // であり、選んだ後も金額は自由に編集できる。
  education: z.record(z.string(), z.record(z.string(), z.number())),
  wedding: weddingEventSchema,
  travel: travelEventSchema,
  // 特別支出・特別収入は piggybank.special_entries(Transactionsの特別支出トグル・
  // 旧Simulationと共有の実データ)と連動するため、ここでは持たない。
  events: z.array(eventSchema),
  savings: z.object({
    returnRatePercent: z.number(),
    investRatioPercent: z.number().min(0).max(100),
    // シナリオの開始年(1月時点)の現金・投資の残高。以降の年はここからの増減で計算する。
    initialCashYen: z.number().min(0),
    initialInvestYen: z.number().min(0),
    // 生活防衛資金(常に手元に残す現金)。0は無効。これを超える見込みの現金は
    // investRatioPercentの配分とは別に超過ぶん全額を投資に回し、これを下回る
    // あいだは投資せず現金を積み増して先に回復させる(投資判定の現金下限)。
    // フィールド名は互換のため cashCapYen のまま(過去シナリオのJSONと揃える)。
    cashCapYen: z.number().min(0),
  }),
  inflationRatePercent: z.number(),
});

export type ScenarioConfig = z.infer<typeof scenarioConfigSchema>;

export interface Scenario {
  id: string;
  name: string;
  is_primary: boolean;
  config: ScenarioConfig;
  created_at: string;
  updated_at: string;
}

// 収入モデル(額面→手取り月/ボーナス)・cohabitation等を後から追加した
// ため、それより前に保存されたシナリオはこれらのキーを欠いた古い形のJSONBのまま
// DBに残っている。normalizeScenarioConfig はそれを読み込む際にデフォルト値で
// 補完し、compute.ts が undefined 参照でクラッシュしないようにする
// (「/simulation This page couldn't load」の原因だった)。
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function normalizeIncomeEntry(raw: unknown, fallback: ScenarioConfig["income"]["husband"]): ScenarioConfig["income"]["husband"] {
  const r = isRecord(raw) ? raw : {};
  // 旧形式: { amountYen, raisePercent } (額面の月額のみ) → 手取り月額として引き継ぐ。
  if (typeof r.amountYen === "number" && typeof r.netMonthlyYen !== "number") {
    return {
      netMonthlyYen: r.amountYen,
      netBonuses: [],
      raisePercent: typeof r.raisePercent === "number" ? r.raisePercent : fallback.raisePercent,
    };
  }
  // 旧形式: netBonusYen(単一の年間ボーナス額)→ 6月ぶんの1件として引き継ぐ。
  let netBonuses: ScenarioConfig["income"]["husband"]["netBonuses"];
  if (Array.isArray(r.netBonuses)) {
    netBonuses = r.netBonuses.map((b, i) => {
      const br = isRecord(b) ? b : {};
      return {
        id: typeof br.id === "string" ? br.id : `bn${i}${Math.random().toString(36).slice(2, 6)}`,
        amountYen: typeof br.amountYen === "number" ? br.amountYen : 0,
        month: typeof br.month === "number" && br.month >= 1 && br.month <= 12 ? br.month : 6,
      };
    });
  } else if (typeof r.netBonusYen === "number" && r.netBonusYen > 0) {
    netBonuses = [{ id: "bn-migrated", amountYen: r.netBonusYen, month: 6 }];
  } else {
    netBonuses = fallback.netBonuses;
  }
  return {
    netMonthlyYen: typeof r.netMonthlyYen === "number" ? r.netMonthlyYen : fallback.netMonthlyYen,
    netBonuses,
    raisePercent: typeof r.raisePercent === "number" ? r.raisePercent : fallback.raisePercent,
  };
}

function normalizeLifeItemOverride(raw: unknown): { id: string; month: string; endMonth: string | null; amountYen: number } {
  const r = isRecord(raw) ? raw : {};
  return {
    id: typeof r.id === "string" ? r.id : `ov${Math.random().toString(36).slice(2)}`,
    month: typeof r.month === "string" ? r.month : "",
    endMonth: typeof r.endMonth === "string" ? r.endMonth : null,
    amountYen: typeof r.amountYen === "number" ? r.amountYen : 0,
  };
}

function normalizePreCategoryAmount(raw: unknown): ScenarioConfig["cohabitation"]["preAmountByCategory"][string] {
  const r = isRecord(raw) ? raw : {};
  return {
    monthlyYen: typeof r.monthlyYen === "number" ? r.monthlyYen : 0,
    overrides: Array.isArray(r.overrides) ? r.overrides.map(normalizeLifeItemOverride) : [],
  };
}

function normalizeKid(raw: unknown): ScenarioConfig["family"]["kids"][number] {
  const r = isRecord(raw) ? raw : {};
  return {
    birthYear: typeof r.birthYear === "number" ? r.birthYear : new Date().getFullYear(),
    leaveParent: r.leaveParent === "husband" || r.leaveParent === "wife" ? r.leaveParent : "none",
    leaveExtensionYears: typeof r.leaveExtensionYears === "number" ? r.leaveExtensionYears : 0,
  };
}

export function normalizeScenarioConfig(raw: unknown): ScenarioConfig {
  const r = isRecord(raw) ? raw : {};
  const d = DEFAULT_SCENARIO_CONFIG;
  const family = isRecord(r.family) ? r.family : {};
  const income = isRecord(r.income) ? r.income : {};
  const side = isRecord(income.side) ? income.side : {};
  const cohabitation = isRecord(r.cohabitation) ? r.cohabitation : {};
  const savings = isRecord(r.savings) ? r.savings : {};

  // 旧形式: preFixed/preVariable(フリーフォームの項目一覧)。カテゴリ名と一致する
  // ラベルのものだけ、そのカテゴリの同棲前の値として引き継ぐ(ベストエフォート)。
  // それ以外は捨てる(同棲前は「同棲後と同じ内容」がデフォルトになるので実害は無い)。
  const preAmountByCategory: ScenarioConfig["cohabitation"]["preAmountByCategory"] = {};
  if (isRecord(cohabitation.preAmountByCategory)) {
    for (const [k, v] of Object.entries(cohabitation.preAmountByCategory)) {
      preAmountByCategory[k] = normalizePreCategoryAmount(v);
    }
  }

  return {
    family: {
      spouse: typeof family.spouse === "boolean" ? family.spouse : d.family.spouse,
      kids: Array.isArray(family.kids) ? family.kids.map(normalizeKid) : d.family.kids,
    },
    income: {
      husband: normalizeIncomeEntry(income.husband, d.income.husband),
      wife: normalizeIncomeEntry(income.wife, d.income.wife),
      side: {
        amountYen: typeof side.amountYen === "number" ? side.amountYen : d.income.side.amountYen,
        startYear: typeof side.startYear === "number" ? side.startYear : d.income.side.startYear,
        endYear: typeof side.endYear === "number" ? side.endYear : d.income.side.endYear,
      },
    },
    cohabitation: {
      startYear: typeof cohabitation.startYear === "number" ? cohabitation.startYear : d.cohabitation.startYear,
      moveInBonusYen: typeof cohabitation.moveInBonusYen === "number" ? cohabitation.moveInBonusYen : d.cohabitation.moveInBonusYen,
      preAmountByCategory,
    },
    education: isRecord(r.education) ? (r.education as ScenarioConfig["education"]) : d.education,
    wedding: (() => {
      const w = isRecord(r.wedding) ? r.wedding : {};
      return {
        enabled: typeof w.enabled === "boolean" ? w.enabled : d.wedding.enabled,
        year: typeof w.year === "number" ? w.year : d.wedding.year,
        month: typeof w.month === "number" ? w.month : d.wedding.month,
        amountYen: typeof w.amountYen === "number" ? w.amountYen : d.wedding.amountYen,
      };
    })(),
    travel: (() => {
      const tr = isRecord(r.travel) ? r.travel : {};
      return {
        enabled: typeof tr.enabled === "boolean" ? tr.enabled : d.travel.enabled,
        amountYen: typeof tr.amountYen === "number" ? tr.amountYen : d.travel.amountYen,
        startYear: typeof tr.startYear === "number" ? tr.startYear : d.travel.startYear,
        timesPerYear: typeof tr.timesPerYear === "number" && tr.timesPerYear >= 1 ? tr.timesPerYear : d.travel.timesPerYear,
      };
    })(),
    events: Array.isArray(r.events) ? (r.events as ScenarioConfig["events"]) : d.events,
    savings: {
      returnRatePercent: typeof savings.returnRatePercent === "number" ? savings.returnRatePercent : d.savings.returnRatePercent,
      investRatioPercent: typeof savings.investRatioPercent === "number" ? savings.investRatioPercent : d.savings.investRatioPercent,
      initialCashYen: typeof savings.initialCashYen === "number" ? savings.initialCashYen : d.savings.initialCashYen,
      initialInvestYen: typeof savings.initialInvestYen === "number" ? savings.initialInvestYen : d.savings.initialInvestYen,
      cashCapYen: typeof savings.cashCapYen === "number" ? savings.cashCapYen : d.savings.cashCapYen,
    },
    inflationRatePercent: typeof r.inflationRatePercent === "number" ? r.inflationRatePercent : d.inflationRatePercent,
  };
}

export const DEFAULT_SCENARIO_CONFIG: ScenarioConfig = {
  family: { spouse: true, kids: [] },
  income: {
    husband: { netMonthlyYen: 300000, netBonuses: [{ id: "bn-default", amountYen: 600000, month: 6 }], raisePercent: 2 },
    wife: { netMonthlyYen: 180000, netBonuses: [{ id: "bn-default", amountYen: 300000, month: 6 }], raisePercent: 1.5 },
    side: { amountYen: 0, startYear: null, endYear: null },
  },
  cohabitation: { startYear: new Date().getFullYear(), moveInBonusYen: 0, preAmountByCategory: {} },
  education: {},
  wedding: { enabled: false, year: new Date().getFullYear() + 1, month: 10, amountYen: 2_500_000 },
  travel: { enabled: false, amountYen: 400_000, startYear: new Date().getFullYear() + 1, timesPerYear: 1 },
  events: [],
  savings: { returnRatePercent: 5, investRatioPercent: 60, initialCashYen: 0, initialInvestYen: 0, cashCapYen: 0 },
  inflationRatePercent: 1,
};

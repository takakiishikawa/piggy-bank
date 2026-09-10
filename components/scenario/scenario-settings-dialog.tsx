"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@takaki/go-design-system";
import type { DisplayCurrency } from "@/components/currency-switch";
import { formatJPY, formatVND } from "@/lib/format";
import { toVndAmount, withThousands as withThousandsVnd, VND_PER_JPY } from "@/lib/currency";
import type { CategoryBudgetOverride } from "@/lib/category-budget";
import { CategoryBudgetCard, type CategoryForCard } from "@/components/category-budget-card";
import { LifeItemCard } from "@/components/scenario/life-item-card";
import { EDU_STAGES } from "@/lib/scenario/education-costs";
import { t, tf, type Lang } from "@/lib/scenario/dictionary";
import { DC } from "@/lib/scenario/design-colors";
import type { Scenario, ScenarioConfig } from "@/lib/scenario/types";
import type { SpecialEntry } from "@/lib/simulation";
import { HelpTip } from "./help-tip";

const CUR_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 16 }, (_, i) => CUR_YEAR + i);
const MONTH_LABELS_JA = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];
const MONTH_LABELS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type ConfigTab = "family" | "income" | "spending" | "savingsTab";
type IncomeSub = "salary" | "side" | "allowance" | "special";
type SpendingSub = "life" | "education" | "events" | "specialExpense";
type LifeSub = "fixed" | "variable";

function cloneConfig(config: ScenarioConfig): ScenarioConfig {
  return JSON.parse(JSON.stringify(config));
}

// 生まれ年が未来(まだ生まれていない予定の子ども)だと age が負になり
// 「今年-3歳」のような表示になってしまうので、その場合は生まれ年予定として表示する。
// includeYear=false は、生まれ年をすぐ隣の入力欄で既に表示している場合用
// (「2029」の入力欄の隣に「2029年生まれ予定」と出て年が重複するのを避ける)。
function ageLabel(lang: Lang, birthYear: number, includeYear = true): string {
  const age = CUR_YEAR - birthYear;
  if (age < 0) {
    if (!includeYear) return lang === "ja" ? "生まれ予定" : "not yet born";
    return lang === "ja" ? `${birthYear}年生まれ予定` : `due ${birthYear}`;
  }
  return tf(lang, "ageThisYear", { age });
}

// シナリオの金額は内部的に常に円建てで持つが、表示・入力は選択中の通貨
// (currency)に合わせて円⇔VNDを変換する(以前は通貨をVNDにしていても
// フォームの値が円のまま表示されていたバグがあった)。千区切りの記号も
// 通貨に合わせる(円=カンマ、VND=ピリオド、他の場所のwithThousands()と同じ規約)。
function YenInput({
  value,
  onChange,
  onCommit,
  className,
  currency,
  vndPerJpy,
}: {
  value: number;
  onChange: (n: number) => void;
  onCommit?: () => void;
  className?: string;
  currency: DisplayCurrency;
  vndPerJpy: number;
}) {
  const toDisplay = (yen: number) => (currency === "JPY" ? yen : Math.round(yen * vndPerJpy));
  const toYen = (display: number) => (currency === "JPY" ? display : Math.round(display / vndPerJpy));
  const sep = currency === "VND" ? "." : ",";
  const digitsOnly = (s: string) => s.replace(/[^0-9]/g, "");
  const withSep = (s: string) => s.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
  const [text, setText] = useState(digitsOnly(String(toDisplay(value))));

  useEffect(() => {
    setText(digitsOnly(String(toDisplay(value))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, currency, vndPerJpy]);

  return (
    <Input
      type="text"
      inputMode="numeric"
      value={withSep(text)}
      onChange={(e) => {
        const digits = digitsOnly(e.target.value);
        setText(digits);
        onChange(digits === "" ? 0 : toYen(Number(digits)));
      }}
      onBlur={onCommit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      className={className}
    />
  );
}

// 特別支出・特別収入(piggybank.special_entries、Transactionsの特別支出トグル・
// 旧Simulationと共有の実データ)の一覧+追加フォーム。シナリオ専用の別データは
// 持たず、このコンポーネントは常に実データを直接読み書きする。
// special_entriesは各行が円・VNDどちらかの通貨で保存されているため、そのまま
// 出すと一覧内で通貨がバラバラに見えてしまう(以前のバグ)。表示は常に選択中の
// 通貨(displayCurrency)に揃えて換算する。
function formatSpecialAmount(amount: number, entryCurrency: "JPY" | "VND", displayCurrency: DisplayCurrency): string {
  const yen = entryCurrency === "JPY" ? amount : amount / VND_PER_JPY;
  return displayCurrency === "JPY" ? formatJPY(yen) : formatVND(yen * VND_PER_JPY);
}

// 特別収入・特別支出の名前ラベル。クリックで編集モードに入り、Enter/blurで保存する
// (シナリオ管理ポップアップのシナリオ名・カテゴリ名の編集と同じ操作感に揃えてある)。
function SpecialEntryNameLabel({
  name,
  onRename,
  lang,
}: {
  name: string;
  onRename: (name: string) => void;
  lang: Lang;
}) {
  const [editing, setEditing] = useState(false);
  const [nameInput, setNameInput] = useState(name);

  const commit = () => {
    const trimmed = nameInput.trim();
    if (trimmed && trimmed !== name) onRename(trimmed);
    else setNameInput(name);
    setEditing(false);
  };

  if (editing) {
    return (
      <Input
        value={nameInput}
        onChange={(e) => setNameInput(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setNameInput(name);
            setEditing(false);
          }
        }}
        className="h-7 text-sm flex-1 min-w-24"
        autoFocus
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      title={t(lang, "rename")}
      className="flex-1 min-w-24 text-sm truncate text-left cursor-pointer rounded transition-all hover:bg-muted"
      style={{ color: DC.textPrimary }}
    >
      {name}
    </button>
  );
}

function SpecialEntrySection({
  kind,
  title,
  entries,
  onAdd,
  onDelete,
  onRename,
  lang,
  currency,
  monthLabels,
}: {
  kind: "income" | "expense";
  title: string;
  entries: SpecialEntry[];
  onAdd: (kind: "income" | "expense", month: string, name: string, amount: number, currency: "JPY" | "VND") => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onRename: (id: string, name: string) => Promise<void>;
  lang: Lang;
  currency: DisplayCurrency;
  monthLabels: string[];
}) {
  const [name, setName] = useState("");
  const [amountText, setAmountText] = useState("");
  const [year, setYear] = useState(CUR_YEAR);
  const [month, setMonth] = useState(1);
  const [saving, setSaving] = useState(false);

  const filtered = entries.filter((e) => e.kind === kind).sort((a, b) => a.month.localeCompare(b.month));
  const sep = currency === "VND" ? "." : ",";

  const handleAdd = async () => {
    const digits = amountText.replace(/[^0-9]/g, "");
    const val = digits === "" ? 0 : Number(digits);
    if (!name.trim() || val <= 0) return;
    setSaving(true);
    await onAdd(kind, `${year}-${String(month).padStart(2, "0")}`, name.trim(), val, currency);
    setSaving(false);
    setName("");
    setAmountText("");
  };

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-semibold" style={{ color: DC.textPrimary }}>
        {title}
      </span>
      {filtered.map((e) => (
        <div key={e.id} className="flex items-center gap-1.5 flex-wrap rounded-lg border p-2" style={{ borderColor: DC.trackAlt }}>
          <SpecialEntryNameLabel name={e.name} onRename={(name) => onRename(e.id, name)} lang={lang} />
          <span className="text-sm font-num" style={{ color: DC.textSecondary }}>
            {formatSpecialAmount(e.amount, e.currency, currency)}
          </span>
          <span className="text-xs" style={{ color: DC.textSecondary }}>
            {e.month}
          </span>
          <button
            type="button"
            onClick={() => onDelete(e.id)}
            className="p-1 rounded transition-all hover:bg-muted"
            style={{ color: DC.textFaint }}
          >
            <X size={13} />
          </button>
        </div>
      ))}
      <div className="flex items-center gap-1.5 flex-wrap rounded-lg border border-dashed p-2" style={{ borderColor: DC.cardBorder }}>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t(lang, "newEventLabel")}
          className="h-8 text-sm w-40"
        />
        <Input
          type="text"
          inputMode="numeric"
          value={amountText.replace(/\B(?=(\d{3})+(?!\d))/g, sep)}
          onChange={(e) => setAmountText(e.target.value.replace(/[^0-9]/g, ""))}
          placeholder="0"
          className="h-8 w-28 text-sm text-right font-num"
        />
        <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
          <SelectTrigger className="h-8 text-sm w-24">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {YEAR_OPTIONS.map((y) => (
              <SelectItem key={y} value={String(y)}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
          <SelectTrigger className="h-8 text-sm w-20">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Array.from({ length: 12 }, (_, m) => m + 1).map((m) => (
              <SelectItem key={m} value={String(m)}>
                {monthLabels[m - 1]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" onClick={handleAdd} disabled={saving || !name.trim() || !amountText}>
          <Plus size={13} />
        </Button>
      </div>
    </div>
  );
}

export function ScenarioSettingsDialog({
  open,
  onOpenChange,
  scenario,
  isCompare,
  scenarios,
  editTargetId,
  onEditTargetChange,
  categories,
  overrides,
  onConfigChange,
  onSaveAsNew,
  onCategoryUpdate,
  onCategoryAdd,
  onCategoryDelete,
  onScheduleOverride,
  onDeleteOverride,
  specialEntries,
  onAddSpecialEntry,
  onDeleteSpecialEntry,
  onRenameSpecialEntry,
  lang,
  currency,
  vndPerJpy,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scenario: Scenario;
  isCompare: boolean;
  scenarios: Scenario[];
  editTargetId: string;
  onEditTargetChange: (id: string) => void;
  categories: CategoryForCard[];
  overrides: CategoryBudgetOverride[];
  onConfigChange: (scenarioId: string, config: ScenarioConfig) => Promise<void>;
  onSaveAsNew: (name: string, config: ScenarioConfig) => Promise<void>;
  onCategoryUpdate: (
    id: string,
    patch: Partial<Pick<CategoryForCard, "name" | "budget" | "is_fixed" | "renewal_cycle_years" | "renewal_fee_months">>,
  ) => Promise<void>;
  onCategoryAdd: (name: string, budget: number, isFixed: boolean) => Promise<void>;
  onCategoryDelete: (id: string) => Promise<void>;
  onScheduleOverride: (categoryId: string, month: string, endMonth: string | null, budget: number) => Promise<void>;
  onDeleteOverride: (categoryId: string, overrideId: string) => Promise<void>;
  specialEntries: SpecialEntry[];
  onAddSpecialEntry: (kind: "income" | "expense", month: string, name: string, amount: number, currency: "JPY" | "VND") => Promise<void>;
  onDeleteSpecialEntry: (id: string) => Promise<void>;
  onRenameSpecialEntry: (id: string, name: string) => Promise<void>;
  lang: Lang;
  currency: DisplayCurrency;
  vndPerJpy: number;
}) {
  const [configTab, setConfigTab] = useState<ConfigTab>("family");
  const [incomeSub, setIncomeSub] = useState<IncomeSub>("salary");
  const [spendingSub, setSpendingSub] = useState<SpendingSub>("life");
  const [lifeSub, setLifeSub] = useState<LifeSub>("fixed");
  // 同棲前(pre)がデフォルト(ユーザー指定)。実際のスケジュール設定
  // (category_budget_overrides)は同棲後のカテゴリカードにしか無く、同棲前は
  // 別枠の予約リストを持つため、両者で内容が食い違って見えることがあるが、
  // それはタブの切り替えで正しいデータに移動しているだけで、実データの
  // 消失ではない。
  const [lifePhase, setLifePhase] = useState<"pre" | "post">("pre");
  const [draft, setDraft] = useState<ScenarioConfig>(() => cloneConfig(scenario.config));
  const [savePromptOpen, setSavePromptOpen] = useState(false);
  const [newScenarioName, setNewScenarioName] = useState("");
  const [addCatName, setAddCatName] = useState("");
  const [addCatBudget, setAddCatBudget] = useState("");
  // 副業収入の「なし・あり」トグル。金額(amountYen>0)だけでは「あり」を選んで
  // まだ金額を入力していない一瞬だけ表示が消えてしまうため、配偶者と同じ
  // トグル操作感にするために表示状態だけを別で持つ。
  const [sideOpen, setSideOpen] = useState(scenario.config.income.side.amountYen > 0);

  useEffect(() => {
    setDraft(cloneConfig(scenario.config));
    setSideOpen(scenario.config.income.side.amountYen > 0);
  }, [scenario.id, scenario.config]);

  const fixedCats = useMemo(() => categories.filter((c) => c.is_fixed), [categories]);
  const variableCats = useMemo(() => categories.filter((c) => !c.is_fixed), [categories]);
  const overridesByCategory = useMemo(() => {
    const m = new Map<string, CategoryBudgetOverride[]>();
    for (const o of overrides) {
      const arr = m.get(o.category_id);
      if (arr) arr.push(o);
      else m.set(o.category_id, [o]);
    }
    return m;
  }, [overrides]);

  const commit = (next: ScenarioConfig) => {
    setDraft(next);
    onConfigChange(scenario.id, next);
  };

  // 額面年収 = (月額手取り×12 + ボーナス手取り合計) ÷ 0.8 (参考表示のみ、入力不可)。
  // 本人・配偶者それぞれと、世帯合計の3つを出す。
  const formatYenPreview = (yen: number) => (currency === "JPY" ? formatJPY(yen) : formatVND(yen * vndPerJpy));
  const husbandGrossAnnualYen =
    (draft.income.husband.netMonthlyYen * 12 + draft.income.husband.netBonuses.reduce((s, b) => s + b.amountYen, 0)) / 0.8;
  const wifeGrossAnnualYen = draft.family.spouse
    ? (draft.income.wife.netMonthlyYen * 12 + draft.income.wife.netBonuses.reduce((s, b) => s + b.amountYen, 0)) / 0.8
    : 0;
  const householdGrossAnnualYen = husbandGrossAnnualYen + wifeGrossAnnualYen;

  const monthLabels = lang === "ja" ? MONTH_LABELS_JA : MONTH_LABELS_EN;

  const tabs: { key: ConfigTab; label: string }[] = [
    { key: "family", label: t(lang, "family") },
    { key: "income", label: t(lang, "income") },
    { key: "spending", label: t(lang, "spending") },
    { key: "savingsTab", label: t(lang, "savingsTab") },
  ];

  // 教育費は「支出→教育」タブだけで扱う(家族タブには進路選択を置かない)。
  // 公立/私立ボタンは金額欄へのクイック入力であり、選んだ後も自由に金額を編集できる。
  const kidEducationMatrix = (
    <div className="flex flex-col gap-2.5">
      {draft.family.kids.length === 0 ? (
        <p className="text-xs" style={{ color: DC.textSecondary }}>
          {t(lang, "children")}: 0
        </p>
      ) : (
        draft.family.kids.map((kid, kidIdx) => (
          <div key={kidIdx} className="rounded-lg border p-3 flex flex-col gap-2" style={{ borderColor: DC.trackAlt }}>
            <div className="text-xs font-semibold" style={{ color: DC.textPrimary }}>
              {t(lang, "children")} {kidIdx + 1}{" "}
              <span className="font-normal" style={{ color: DC.textSecondary }}>
                ({ageLabel(lang, kid.birthYear)})
              </span>
            </div>
            <div className="flex flex-col gap-1.5">
              {EDU_STAGES.map((stage) => {
                const kidEdu = draft.education[String(kidIdx)] ?? {};
                const amount = kidEdu[stage.key] ?? stage.options[0].amountYen;
                return (
                  <div key={stage.key} className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm w-24 shrink-0 flex items-center gap-1" style={{ color: DC.textSecondary }}>
                      {lang === "ja" ? stage.labelJa : stage.labelEn}
                      <HelpTip text={lang === "ja" ? stage.tipJa : stage.tipEn} />
                    </span>
                    <div className="flex gap-1 flex-wrap shrink-0">
                      {stage.options.map((opt) => (
                        <button
                          key={opt.key}
                          type="button"
                          onClick={() => {
                            const education = { ...draft.education };
                            education[String(kidIdx)] = { ...(education[String(kidIdx)] ?? {}), [stage.key]: opt.amountYen };
                            commit({ ...draft, education });
                          }}
                          className="px-2.5 py-1 rounded-full text-xs font-semibold cursor-pointer transition-all border hover:brightness-95 active:scale-95"
                          style={{
                            backgroundColor: amount === opt.amountYen ? DC.primary : DC.cardBg,
                            color: amount === opt.amountYen ? "#fff" : DC.textSecondary,
                            borderColor: amount === opt.amountYen ? DC.primary : DC.cardBorder,
                          }}
                        >
                          {lang === "ja" ? opt.labelJa : opt.labelEn}
                        </button>
                      ))}
                    </div>
                    <YenInput
                      value={amount}
                      onChange={(n) => {
                        const education = { ...draft.education };
                        education[String(kidIdx)] = { ...(education[String(kidIdx)] ?? {}), [stage.key]: n };
                        setDraft({ ...draft, education });
                      }}
                      onCommit={() => commit(draft)}
                      className="h-7 w-24 text-xs text-right font-num"
                      currency={currency}
                      vndPerJpy={vndPerJpy}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl p-0 overflow-hidden" style={{ backgroundColor: DC.cardBg }}>
        <DialogHeader className="px-5 py-4 border-b flex-row items-center justify-between" style={{ borderColor: DC.cardBorder }}>
          <DialogTitle>
            {t(lang, "settingsBtn")} — {scenario.name}
          </DialogTitle>
        </DialogHeader>

        <div className="px-5 py-4 max-h-[80vh] overflow-y-auto flex flex-col gap-3.5">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex gap-1 p-1 rounded-lg w-fit" style={{ backgroundColor: DC.track }}>
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setConfigTab(tab.key)}
                  className="px-3.5 py-1.5 rounded-md text-xs font-semibold cursor-pointer transition-all hover:brightness-95 active:scale-95"
                  style={{
                    backgroundColor: configTab === tab.key ? DC.cardBg : "transparent",
                    color: DC.textPrimary,
                    boxShadow: configTab === tab.key ? "0 1px 2px rgba(43,38,32,.08)" : undefined,
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            {scenarios.length > 1 && (
              <Select value={editTargetId} onValueChange={onEditTargetChange}>
                <SelectTrigger className="h-8 text-xs w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {scenarios.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {configTab === "family" && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2.5">
                <span className="text-sm w-24" style={{ color: DC.textSecondary }}>
                  {t(lang, "spouse")}
                </span>
                <div className="flex gap-0.5 p-0.5 rounded-lg" style={{ backgroundColor: DC.track }}>
                  {[
                    { v: true, l: t(lang, "spouseYes") },
                    { v: false, l: t(lang, "spouseNo") },
                  ].map((o) => (
                    <button
                      key={String(o.v)}
                      type="button"
                      onClick={() => commit({ ...draft, family: { ...draft.family, spouse: o.v } })}
                      className="px-3 py-1 rounded-md text-xs font-semibold cursor-pointer transition-all hover:brightness-95 active:scale-95"
                      style={{
                        backgroundColor: draft.family.spouse === o.v ? DC.cardBg : "transparent",
                        color: DC.textPrimary,
                        boxShadow: draft.family.spouse === o.v ? "0 1px 2px rgba(43,38,32,.08)" : undefined,
                      }}
                    >
                      {o.l}
                    </button>
                  ))}
                </div>
              </div>

              {draft.family.spouse && (
                <div className="flex flex-col gap-2 rounded-lg border p-2.5" style={{ borderColor: DC.trackAlt }}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm w-32 shrink-0 flex items-center gap-1" style={{ color: DC.textSecondary }}>
                      {t(lang, "cohabitationStartYear")}
                      <HelpTip text={t(lang, "cohabitationHelp")} />
                    </span>
                    <Select
                      value={String(draft.cohabitation.startYear)}
                      onValueChange={(v) => commit({ ...draft, cohabitation: { ...draft.cohabitation, startYear: Number(v) } })}
                    >
                      <SelectTrigger className="h-8 text-xs w-24">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {YEAR_OPTIONS.map((y) => (
                          <SelectItem key={y} value={String(y)}>
                            {y}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm w-32 shrink-0 flex items-center gap-1" style={{ color: DC.textSecondary }}>
                      {t(lang, "moveInBonus")}
                      <HelpTip text={t(lang, "moveInBonusHelp")} />
                    </span>
                    <YenInput
                      value={draft.cohabitation.moveInBonusYen}
                      onChange={(n) => setDraft({ ...draft, cohabitation: { ...draft.cohabitation, moveInBonusYen: n } })}
                      onCommit={() => commit(draft)}
                      className="h-8 w-28 text-xs text-right font-num"
                      currency={currency}
                      vndPerJpy={vndPerJpy}
                    />
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold" style={{ color: DC.textSecondary }}>
                  {t(lang, "children")}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    commit({
                      ...draft,
                      family: {
                        ...draft.family,
                        kids: [...draft.family.kids, { birthYear: CUR_YEAR, leaveParent: "none", leaveExtensionYears: 0 }],
                      },
                    })
                  }
                  className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold cursor-pointer transition-all hover:brightness-95 active:scale-95"
                  style={{ backgroundColor: DC.track, color: DC.textSecondary }}
                >
                  <Plus size={12} /> {t(lang, "addChild")}
                </button>
              </div>

              {draft.family.kids.map((kid, kidIdx) => (
                <div key={kidIdx} className="rounded-lg border p-3 flex flex-col gap-2.5" style={{ borderColor: DC.trackAlt }}>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      value={kid.birthYear}
                      onChange={(e) => {
                        const kids = [...draft.family.kids];
                        kids[kidIdx] = { ...kids[kidIdx], birthYear: Number(e.target.value) };
                        commit({ ...draft, family: { ...draft.family, kids } });
                      }}
                      className="h-7 w-20 text-sm font-num"
                    />
                    <span className="text-xs" style={{ color: DC.textSecondary }}>
                      {ageLabel(lang, kid.birthYear, false)}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        commit({
                          ...draft,
                          family: { ...draft.family, kids: draft.family.kids.filter((_, i) => i !== kidIdx) },
                        })
                      }
                      className="ml-auto p-1 rounded transition-all hover:bg-muted"
                      style={{ color: DC.textSecondary }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>

                  {draft.family.spouse && (
                  <div className="flex flex-col gap-1.5 pt-2 border-t" style={{ borderColor: DC.trackAlt }}>
                    <span className="text-sm font-semibold flex items-center gap-1" style={{ color: DC.textPrimary }}>
                      {t(lang, "leaveParentLabel")}
                      <HelpTip text={t(lang, "leaveHelp")} />
                    </span>
                    <div className="flex gap-0.5 p-0.5 rounded-lg w-fit" style={{ backgroundColor: DC.track }}>
                      {(
                        [
                          { v: "none" as const, l: t(lang, "leaveParentNone") },
                          { v: "wife" as const, l: t(lang, "leaveParentWife") },
                        ]
                      ).map((o) => (
                        <button
                          key={o.v}
                          type="button"
                          onClick={() => {
                            const kids = [...draft.family.kids];
                            kids[kidIdx] = { ...kids[kidIdx], leaveParent: o.v };
                            commit({ ...draft, family: { ...draft.family, kids } });
                          }}
                          className="px-2.5 py-1 rounded-md text-xs font-semibold cursor-pointer transition-all hover:brightness-95 active:scale-95"
                          style={{
                            backgroundColor: kid.leaveParent === o.v ? DC.cardBg : "transparent",
                            color: DC.textPrimary,
                            boxShadow: kid.leaveParent === o.v ? "0 1px 2px rgba(43,38,32,.08)" : undefined,
                          }}
                        >
                          {o.l}
                        </button>
                      ))}
                    </div>
                    {kid.leaveParent !== "none" && (
                      <div className="flex items-center gap-2 pl-0.5">
                        <span className="text-sm shrink-0" style={{ color: DC.textSecondary }}>
                          {t(lang, "leaveExtensionYears")}
                        </span>
                        <Input
                          type="number"
                          min={0}
                          value={kid.leaveExtensionYears}
                          onChange={(e) => {
                            const kids = [...draft.family.kids];
                            kids[kidIdx] = { ...kids[kidIdx], leaveExtensionYears: Math.max(0, Number(e.target.value)) };
                            setDraft({ ...draft, family: { ...draft.family, kids } });
                          }}
                          onBlur={() => commit(draft)}
                          className="h-7 w-16 text-sm text-right font-num"
                        />
                        <span className="text-xs" style={{ color: DC.textSecondary }}>
                          {t(lang, "leaveExtensionYearsUnit")}
                        </span>
                      </div>
                    )}
                  </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {configTab === "income" && (
            <div className="flex flex-col gap-3">
              <div className="flex gap-0.5 p-0.5 rounded-lg w-fit" style={{ backgroundColor: DC.track }}>
                {(
                  [
                    { k: "salary" as const, l: t(lang, "incomeSalaryTab") },
                    { k: "side" as const, l: t(lang, "incomeSideTab") },
                    { k: "allowance" as const, l: t(lang, "publicAllowance") },
                    { k: "special" as const, l: t(lang, "specialIncomeLabel") },
                  ]
                ).map((s) => (
                  <button
                    key={s.k}
                    type="button"
                    onClick={() => setIncomeSub(s.k)}
                    className="px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer transition-all hover:brightness-95 active:scale-95"
                    style={{
                      backgroundColor: incomeSub === s.k ? DC.cardBg : "transparent",
                      color: DC.textPrimary,
                      boxShadow: incomeSub === s.k ? "0 1px 2px rgba(43,38,32,.08)" : undefined,
                    }}
                  >
                    {s.l}
                  </button>
                ))}
              </div>

              {incomeSub === "salary" && (
                <div
                  className="flex flex-col gap-1 text-sm rounded-lg border px-2.5 py-2"
                  style={{ backgroundColor: DC.headerBg, borderColor: DC.cardBorder, color: DC.textSecondary }}
                >
                  <span>{tf(lang, "grossAnnualHusband", { amount: formatYenPreview(husbandGrossAnnualYen) })}</span>
                  {draft.family.spouse && (
                    <span>{tf(lang, "grossAnnualWife", { amount: formatYenPreview(wifeGrossAnnualYen) })}</span>
                  )}
                  <span className="font-semibold" style={{ color: DC.textPrimary }}>
                    {tf(lang, "grossAnnualHousehold", { amount: formatYenPreview(householdGrossAnnualYen) })}
                  </span>
                </div>
              )}
              {incomeSub === "salary" &&
              (
                [
                  { key: "husband" as const, label: t(lang, "husbandIncome") },
                  // 配偶者なしの場合、配偶者・手取りの入力欄は非表示にする(要望対応)。
                  // compute.ts側でも配偶者なしなら配偶者の収入は計上しない。
                  ...(draft.family.spouse
                    ? [{ key: "wife" as const, label: t(lang, "wifeIncome") }]
                    : []),
                ]
              ).map((row) => (
                <div key={row.key} className="flex flex-col gap-1.5">
                  <span className="text-sm font-semibold flex items-center gap-1" style={{ color: DC.textPrimary }}>
                    {row.label}
                    <HelpTip text={t(lang, "netIncomeHelp")} />
                  </span>
                  <div className="flex items-center gap-2 flex-wrap pl-1">
                    <span className="text-sm w-14 shrink-0" style={{ color: DC.textSecondary }}>
                      {t(lang, "netMonthly")}
                    </span>
                    <YenInput
                      value={draft.income[row.key].netMonthlyYen}
                      onChange={(n) =>
                        setDraft({ ...draft, income: { ...draft.income, [row.key]: { ...draft.income[row.key], netMonthlyYen: n } } })
                      }
                      onCommit={() => commit(draft)}
                      className="h-8 w-28 text-sm text-right font-num"
                      currency={currency}
                      vndPerJpy={vndPerJpy}
                    />
                    <Input
                      type="number"
                      value={draft.income[row.key].raisePercent}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          income: { ...draft.income, [row.key]: { ...draft.income[row.key], raisePercent: Number(e.target.value) } },
                        })
                      }
                      onBlur={() => commit(draft)}
                      className="h-8 w-16 text-sm text-right font-num"
                    />
                    <span className="text-xs" style={{ color: DC.textSecondary }}>
                      {t(lang, "raisePerYear")}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1.5 pl-1">
                    <span className="text-sm w-14 shrink-0" style={{ color: DC.textSecondary }}>
                      {t(lang, "netBonus")}
                    </span>
                    {draft.income[row.key].netBonuses.map((bonus, bIdx) => (
                      <div key={bonus.id} className="flex items-center gap-1.5 flex-wrap">
                        {/* 月額の値と横位置を揃えるため、「月額」ラベルと同じ幅の空スペーサーを置く */}
                        <span className="w-14 shrink-0" aria-hidden />
                        <YenInput
                          value={bonus.amountYen}
                          onChange={(n) => {
                            const netBonuses = [...draft.income[row.key].netBonuses];
                            netBonuses[bIdx] = { ...netBonuses[bIdx], amountYen: n };
                            setDraft({ ...draft, income: { ...draft.income, [row.key]: { ...draft.income[row.key], netBonuses } } });
                          }}
                          onCommit={() => commit(draft)}
                          className="h-8 w-28 text-sm text-right font-num"
                          currency={currency}
                          vndPerJpy={vndPerJpy}
                        />
                        <Select
                          value={String(bonus.month)}
                          onValueChange={(v) => {
                            const netBonuses = [...draft.income[row.key].netBonuses];
                            netBonuses[bIdx] = { ...netBonuses[bIdx], month: Number(v) };
                            commit({ ...draft, income: { ...draft.income, [row.key]: { ...draft.income[row.key], netBonuses } } });
                          }}
                        >
                          <SelectTrigger className="h-8 text-sm w-20">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Array.from({ length: 12 }, (_, m) => m + 1).map((m) => (
                              <SelectItem key={m} value={String(m)}>
                                {monthLabels[m - 1]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <button
                          type="button"
                          onClick={() =>
                            commit({
                              ...draft,
                              income: {
                                ...draft.income,
                                [row.key]: {
                                  ...draft.income[row.key],
                                  netBonuses: draft.income[row.key].netBonuses.filter((_, ix) => ix !== bIdx),
                                },
                              },
                            })
                          }
                          className="p-1 rounded transition-all hover:bg-muted active:scale-90 active:bg-muted/70"
                          style={{ color: DC.textFaint }}
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() =>
                        commit({
                          ...draft,
                          income: {
                            ...draft.income,
                            [row.key]: {
                              ...draft.income[row.key],
                              netBonuses: [...draft.income[row.key].netBonuses, { id: `bn${Date.now()}`, amountYen: 0, month: 6 }],
                            },
                          },
                        })
                      }
                      title={t(lang, "addBonus")}
                      className="flex items-center justify-center p-1 rounded-md cursor-pointer transition-all hover:brightness-95 active:scale-95 w-fit"
                      style={{ backgroundColor: DC.track, color: DC.textSecondary }}
                    >
                      <Plus size={12} />
                    </button>
                  </div>
                </div>
              ))}
              {/* 産休・育休は子どもに紐づく前提なので、家族タブの子ども行で設定する
                  (収入タブには置かない)。 */}
              {incomeSub === "side" && (
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2.5">
                    <span className="text-sm font-semibold" style={{ color: DC.textPrimary }}>
                      {t(lang, "sideIncome")}
                    </span>
                    <div className="flex gap-0.5 p-0.5 rounded-lg" style={{ backgroundColor: DC.track }}>
                      {[
                        { v: false, l: t(lang, "spouseNo") },
                        { v: true, l: t(lang, "spouseYes") },
                      ].map((o) => (
                        <button
                          key={String(o.v)}
                          type="button"
                          onClick={() => {
                            setSideOpen(o.v);
                            if (!o.v) {
                              commit({
                                ...draft,
                                income: { ...draft.income, side: { amountYen: 0, startYear: null, endYear: null } },
                              });
                            }
                          }}
                          className="px-3 py-1 rounded-md text-xs font-semibold cursor-pointer transition-all hover:brightness-95 active:scale-95"
                          style={{
                            backgroundColor: sideOpen === o.v ? DC.cardBg : "transparent",
                            color: DC.textPrimary,
                            boxShadow: sideOpen === o.v ? "0 1px 2px rgba(43,38,32,.08)" : undefined,
                          }}
                        >
                          {o.l}
                        </button>
                      ))}
                    </div>
                  </div>
                  {sideOpen && (
                  <>
                  <div className="flex items-center gap-2 flex-wrap pl-1">
                    <YenInput
                      value={draft.income.side.amountYen}
                      onChange={(n) => setDraft({ ...draft, income: { ...draft.income, side: { ...draft.income.side, amountYen: n } } })}
                      onCommit={() => commit(draft)}
                      className="h-8 w-28 text-sm text-right font-num"
                      currency={currency}
                      vndPerJpy={vndPerJpy}
                    />
                  </div>
                  <div className="flex items-center gap-2 flex-wrap pl-1">
                    <span className="text-sm shrink-0" style={{ color: DC.textSecondary }}>
                      {t(lang, "sideIncomePeriod")}
                    </span>
                    <Select
                      value={draft.income.side.startYear === null ? "unset" : String(draft.income.side.startYear)}
                      onValueChange={(v) =>
                        commit({
                          ...draft,
                          income: { ...draft.income, side: { ...draft.income.side, startYear: v === "unset" ? null : Number(v) } },
                        })
                      }
                    >
                      <SelectTrigger className="h-8 text-sm w-28">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unset">{t(lang, "unspecified")}</SelectItem>
                        {YEAR_OPTIONS.map((y) => (
                          <SelectItem key={y} value={String(y)}>
                            {y}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <span className="text-xs" style={{ color: DC.textSecondary }}>
                      {t(lang, "to")}
                    </span>
                    <Select
                      value={draft.income.side.endYear === null ? "unset" : String(draft.income.side.endYear)}
                      onValueChange={(v) =>
                        commit({
                          ...draft,
                          income: { ...draft.income, side: { ...draft.income.side, endYear: v === "unset" ? null : Number(v) } },
                        })
                      }
                    >
                      <SelectTrigger className="h-8 text-sm w-28">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unset">{t(lang, "unspecified")}</SelectItem>
                        {YEAR_OPTIONS.map((y) => (
                          <SelectItem key={y} value={String(y)}>
                            {y}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  </>
                  )}
                </div>
              )}
              {incomeSub === "allowance" && (
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-semibold" style={{ color: DC.textPrimary }}>
                    {t(lang, "publicAllowance")}
                  </span>
                  <span className="text-xs pl-1" style={{ color: DC.textSecondary }}>
                    {t(lang, "publicAllowanceDetail")}
                  </span>
                </div>
              )}
              {incomeSub === "special" && (
                <SpecialEntrySection
                  kind="income"
                  title={t(lang, "specialIncomeLabel")}
                  entries={specialEntries}
                  onAdd={onAddSpecialEntry}
                  onDelete={onDeleteSpecialEntry}
                  onRename={onRenameSpecialEntry}
                  lang={lang}
                  currency={currency}
                  monthLabels={monthLabels}
                />
              )}
            </div>
          )}

          {configTab === "spending" && (
            <div className="flex flex-col gap-2.5">
              <div className="flex gap-0.5 p-0.5 rounded-lg w-fit" style={{ backgroundColor: DC.track }}>
                {(
                  [
                    { k: "life" as const, l: t(lang, "life") },
                    { k: "education" as const, l: t(lang, "education") },
                    { k: "events" as const, l: t(lang, "events") },
                    { k: "specialExpense" as const, l: t(lang, "specialExpenseTab") },
                  ]
                ).map((s) => (
                  <button
                    key={s.k}
                    type="button"
                    onClick={() => setSpendingSub(s.k)}
                    className="px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer transition-all hover:brightness-95 active:scale-95"
                    style={{
                      backgroundColor: spendingSub === s.k ? DC.cardBg : "transparent",
                      color: DC.textPrimary,
                      boxShadow: spendingSub === s.k ? "0 1px 2px rgba(43,38,32,.08)" : undefined,
                    }}
                  >
                    {s.l}
                  </button>
                ))}
              </div>

              {spendingSub === "life" && (
                <div className="flex flex-col gap-2.5">
                  <div className="flex gap-0.5 p-0.5 rounded-lg w-fit" style={{ backgroundColor: DC.track }}>
                    {(
                      [
                        { k: "fixed" as const, l: t(lang, "fixed") },
                        { k: "variable" as const, l: t(lang, "variable") },
                      ]
                    ).map((s) => (
                      <button
                        key={s.k}
                        type="button"
                        onClick={() => setLifeSub(s.k)}
                        className="px-3 py-1 rounded-md text-xs font-semibold cursor-pointer transition-all hover:brightness-95 active:scale-95"
                        style={{
                          backgroundColor: lifeSub === s.k ? DC.cardBg : "transparent",
                          color: DC.textPrimary,
                          boxShadow: lifeSub === s.k ? "0 1px 2px rgba(43,38,32,.08)" : undefined,
                        }}
                      >
                        {s.l}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-sm w-24 flex items-center gap-1" style={{ color: DC.textSecondary }}>
                      {t(lang, "inflationRate")}
                      <HelpTip text={t(lang, "inflationHelp")} />
                    </span>
                    <Input
                      type="number"
                      value={draft.inflationRatePercent}
                      onChange={(e) => setDraft({ ...draft, inflationRatePercent: Number(e.target.value) })}
                      onBlur={() => commit(draft)}
                      className="h-8 w-16 text-xs text-right font-num"
                    />
                    <span className="text-xs" style={{ color: DC.textSecondary }}>
                      {t(lang, "inflationUnit")}
                    </span>
                  </div>

                  {draft.family.spouse && (
                    <div className="flex gap-0.5 p-0.5 rounded-lg w-fit" style={{ backgroundColor: DC.track }}>
                      {(
                        [
                          { k: "pre" as const, l: t(lang, "preCohabitation") },
                          { k: "post" as const, l: t(lang, "postCohabitation") },
                        ]
                      ).map((s) => (
                        <button
                          key={s.k}
                          type="button"
                          onClick={() => setLifePhase(s.k)}
                          className="px-3 py-1 rounded-md text-xs font-semibold cursor-pointer transition-all hover:brightness-95 active:scale-95"
                          style={{
                            backgroundColor: lifePhase === s.k ? DC.cardBg : "transparent",
                            color: DC.textPrimary,
                            boxShadow: lifePhase === s.k ? "0 1px 2px rgba(43,38,32,.08)" : undefined,
                          }}
                        >
                          {s.l}
                        </button>
                      ))}
                    </div>
                  )}

                  {draft.family.spouse && lifePhase === "pre" ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {(lifeSub === "fixed" ? fixedCats : variableCats).map((cat) => {
                        const preAmount = draft.cohabitation.preAmountByCategory[cat.id] ?? {
                          monthlyYen: Math.round(cat.budget / vndPerJpy),
                          overrides: [],
                        };
                        return (
                          <LifeItemCard
                            key={cat.id}
                            category={cat}
                            preAmount={preAmount}
                            lang={lang}
                            currency={currency}
                            vndPerJpy={vndPerJpy}
                            onAmountChange={(monthlyYen) =>
                              commit({
                                ...draft,
                                cohabitation: {
                                  ...draft.cohabitation,
                                  preAmountByCategory: {
                                    ...draft.cohabitation.preAmountByCategory,
                                    [cat.id]: { ...preAmount, monthlyYen },
                                  },
                                },
                              })
                            }
                            onSchedule={(month, endMonth, amountYen) =>
                              commit({
                                ...draft,
                                cohabitation: {
                                  ...draft.cohabitation,
                                  preAmountByCategory: {
                                    ...draft.cohabitation.preAmountByCategory,
                                    [cat.id]: {
                                      ...preAmount,
                                      overrides: [...preAmount.overrides, { id: `ov${Date.now()}`, month, endMonth, amountYen }],
                                    },
                                  },
                                },
                              })
                            }
                            onDeleteOverride={(overrideId) =>
                              commit({
                                ...draft,
                                cohabitation: {
                                  ...draft.cohabitation,
                                  preAmountByCategory: {
                                    ...draft.cohabitation.preAmountByCategory,
                                    [cat.id]: { ...preAmount, overrides: preAmount.overrides.filter((o) => o.id !== overrideId) },
                                  },
                                },
                              })
                            }
                          />
                        );
                      })}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {(lifeSub === "fixed" ? fixedCats : variableCats).map((cat) => (
                        <CategoryBudgetCard
                          key={cat.id}
                          cat={cat}
                          displayCurrency={currency}
                          overrides={overridesByCategory.get(cat.id) ?? []}
                          onUpdate={onCategoryUpdate}
                          onScheduleOverride={onScheduleOverride}
                          onDeleteOverride={onDeleteOverride}
                          readOnlyName
                          lang={lang}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {spendingSub === "education" && (
                <div className="flex flex-col gap-2.5">
                  {kidEducationMatrix}
                </div>
              )}

              {spendingSub === "events" && (
                <div className="flex flex-col gap-2">
                  {/* 結婚式・旅行は「よくあるイベント」として、クリックして追加するのではなく
                      最初から常設のフォームとして用意する。チェックボックスは1ステップ
                      余分になるので置かず、金額0円=未計上として扱う(compute.ts側もそう判定)。 */}
                  {/* 配偶者なしの場合、結婚式関連費用のフォームは非表示にする(要望対応)。
                      compute.ts側でも配偶者なしなら金額を計上しない。 */}
                  {draft.family.spouse && (
                  <div className="flex flex-col gap-1.5 rounded-lg border p-2.5" style={{ borderColor: DC.trackAlt }}>
                    <span className="text-sm font-semibold flex items-center gap-1" style={{ color: DC.textPrimary }}>
                      {t(lang, "eventPresetWedding")}
                      <HelpTip text={t(lang, "eventPresetWeddingHelp")} />
                    </span>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Select
                        value={String(draft.wedding.year)}
                        onValueChange={(v) => commit({ ...draft, wedding: { ...draft.wedding, year: Number(v) } })}
                      >
                        <SelectTrigger className="h-8 text-sm w-20">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {YEAR_OPTIONS.map((y) => (
                            <SelectItem key={y} value={String(y)}>
                              {y}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select
                        value={String(draft.wedding.month)}
                        onValueChange={(v) => commit({ ...draft, wedding: { ...draft.wedding, month: Number(v) } })}
                      >
                        <SelectTrigger className="h-8 text-sm w-16">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 12 }, (_, m) => m + 1).map((m) => (
                            <SelectItem key={m} value={String(m)}>
                              {monthLabels[m - 1]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <YenInput
                        value={draft.wedding.amountYen}
                        onChange={(n) => setDraft({ ...draft, wedding: { ...draft.wedding, amountYen: n } })}
                        onCommit={() => commit(draft)}
                        className="h-8 w-28 text-sm text-right font-num"
                        currency={currency}
                        vndPerJpy={vndPerJpy}
                      />
                    </div>
                  </div>
                  )}

                  <div className="flex flex-col gap-1.5 rounded-lg border p-2.5" style={{ borderColor: DC.trackAlt }}>
                    <span className="text-sm font-semibold" style={{ color: DC.textPrimary }}>
                      {t(lang, "eventPresetTravel")}
                    </span>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs" style={{ color: DC.textSecondary }}>
                        {t(lang, "travelStartYear")}
                      </span>
                      <Select
                        value={String(draft.travel.startYear)}
                        onValueChange={(v) => commit({ ...draft, travel: { ...draft.travel, startYear: Number(v) } })}
                      >
                        <SelectTrigger className="h-8 text-sm w-20">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {YEAR_OPTIONS.map((y) => (
                            <SelectItem key={y} value={String(y)}>
                              {y}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs" style={{ color: DC.textSecondary }}>
                        {t(lang, "travelPerTripAmount")}
                      </span>
                      <YenInput
                        value={draft.travel.amountYen}
                        onChange={(n) => setDraft({ ...draft, travel: { ...draft.travel, amountYen: n } })}
                        onCommit={() => commit(draft)}
                        className="h-8 w-28 text-sm text-right font-num"
                        currency={currency}
                        vndPerJpy={vndPerJpy}
                      />
                      <span className="text-xs" style={{ color: DC.textSecondary }}>
                        {t(lang, "travelTimesPerYear")}
                      </span>
                      <Input
                        type="number"
                        min={1}
                        value={draft.travel.timesPerYear}
                        onChange={(e) =>
                          setDraft({ ...draft, travel: { ...draft.travel, timesPerYear: Math.max(1, Number(e.target.value)) } })
                        }
                        onBlur={() => commit(draft)}
                        className="h-8 w-14 text-sm text-right font-num"
                      />
                      <span className="text-xs" style={{ color: DC.textSecondary }}>
                        {t(lang, "travelTimesUnit")}
                      </span>
                    </div>
                  </div>

                </div>
              )}

              {spendingSub === "specialExpense" && (
                <div className="flex flex-col gap-4">
                  {/* 特別収入は収入タブ(公的手当の下)に移動したので、ここは特別支出のみ。 */}
                  <SpecialEntrySection
                    kind="expense"
                    title={t(lang, "specialExpenseTab")}
                    entries={specialEntries}
                    onAdd={onAddSpecialEntry}
                    onDelete={onDeleteSpecialEntry}
                    onRename={onRenameSpecialEntry}
                    lang={lang}
                    currency={currency}
                    monthLabels={monthLabels}
                  />
                </div>
              )}
            </div>
          )}

          {configTab === "savingsTab" && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <span className="text-sm w-28 flex items-center gap-1" style={{ color: DC.textSecondary }}>
                  {t(lang, "returnRate")}
                  <HelpTip text={t(lang, "returnRateHelp")} />
                </span>
                <Input
                  type="number"
                  value={draft.savings.returnRatePercent}
                  onChange={(e) => setDraft({ ...draft, savings: { ...draft.savings, returnRatePercent: Number(e.target.value) } })}
                  onBlur={() => commit(draft)}
                  className="h-8 w-20 text-xs text-right font-num"
                />
                <span className="text-xs" style={{ color: DC.textSecondary }}>
                  {t(lang, "returnRateUnit")}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm w-28" style={{ color: DC.textSecondary }}>
                  {t(lang, "investRatio")}
                </span>
                <Input
                  type="number"
                  value={draft.savings.investRatioPercent}
                  onChange={(e) => setDraft({ ...draft, savings: { ...draft.savings, investRatioPercent: Number(e.target.value) } })}
                  onBlur={() => commit(draft)}
                  className="h-8 w-20 text-xs text-right font-num"
                />
                <span className="text-xs" style={{ color: DC.textSecondary }}>
                  {t(lang, "investRatioUnit")}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm w-28 flex items-center gap-1" style={{ color: DC.textSecondary }}>
                  {t(lang, "emergencyFund")}
                  <HelpTip text={t(lang, "emergencyFundHelp")} />
                </span>
                <YenInput
                  value={draft.savings.cashCapYen}
                  onChange={(n) => setDraft({ ...draft, savings: { ...draft.savings, cashCapYen: n } })}
                  onCommit={() => commit(draft)}
                  className="h-8 w-32 text-sm text-right font-num"
                  currency={currency}
                  vndPerJpy={vndPerJpy}
                />
              </div>

              <div className="flex flex-col gap-1.5 pt-1 border-t" style={{ borderColor: DC.trackAlt }}>
                <span className="text-sm font-semibold pt-2" style={{ color: DC.textPrimary }}>
                  {tf(lang, "initialBalanceLabel", { year: CUR_YEAR })}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-sm w-28" style={{ color: DC.textSecondary }}>
                    {t(lang, "initialCash")}
                  </span>
                  <YenInput
                    value={draft.savings.initialCashYen}
                    onChange={(n) => setDraft({ ...draft, savings: { ...draft.savings, initialCashYen: n } })}
                    onCommit={() => commit(draft)}
                    className="h-8 w-32 text-sm text-right font-num"
                    currency={currency}
                    vndPerJpy={vndPerJpy}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm w-28" style={{ color: DC.textSecondary }}>
                    {t(lang, "initialInvest")}
                  </span>
                  <YenInput
                    value={draft.savings.initialInvestYen}
                    onChange={(n) => setDraft({ ...draft, savings: { ...draft.savings, initialInvestYen: n } })}
                    onCommit={() => commit(draft)}
                    className="h-8 w-32 text-sm text-right font-num"
                    currency={currency}
                    vndPerJpy={vndPerJpy}
                  />
                </div>
              </div>
            </div>
          )}

          <div className="mt-1 pt-3 border-t" style={{ borderColor: DC.trackAlt }}>
            {savePromptOpen ? (
              <div className="flex items-center gap-2">
                <Input
                  value={newScenarioName}
                  onChange={(e) => setNewScenarioName(e.target.value)}
                  placeholder={t(lang, "newScenarioPlaceholder")}
                  className="flex-1 h-8 text-xs"
                  autoFocus
                />
                <Button
                  size="sm"
                  onClick={async () => {
                    if (!newScenarioName.trim()) return;
                    await onSaveAsNew(newScenarioName.trim(), draft);
                    setNewScenarioName("");
                    setSavePromptOpen(false);
                  }}
                >
                  {t(lang, "save")}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setSavePromptOpen(false)}>
                  {t(lang, "cancel")}
                </Button>
              </div>
            ) : (
              <div className="flex items-center justify-end gap-2 flex-wrap">
                <Button size="sm" variant="outline" onClick={() => onOpenChange(false)}>
                  {t(lang, "close")}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setSavePromptOpen(true)}>
                  {t(lang, "addScenario")}
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    commit(draft);
                    onOpenChange(false);
                  }}
                >
                  {t(lang, "apply")}
                </Button>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

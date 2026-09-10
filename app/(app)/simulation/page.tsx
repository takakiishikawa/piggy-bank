"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ListTree, Settings2 } from "lucide-react";
import { Card, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Skeleton, toast } from "@takaki/go-design-system";
import { formatJPY, formatVND } from "@/lib/format";
import { VND_PER_JPY } from "@/lib/currency";
import { usePreferences } from "@/lib/preferences";
import type { CategoryBudgetOverride } from "@/lib/category-budget";
import type { CategoryForCard } from "@/components/category-budget-card";
import { ScenarioTable, ExpandToggleButton } from "@/components/scenario/scenario-table";
import { ScenarioChart } from "@/components/scenario/scenario-chart";
import { ScenarioSettingsDialog } from "@/components/scenario/scenario-settings-dialog";
import { ScenarioListDialog } from "@/components/scenario/scenario-list-dialog";
import {
  computeScenarioYears,
  expandMonthly,
  toRows,
  SIMULATION_YEARS_AHEAD,
  type ScenarioRow,
  type InvestmentEntryInput,
} from "@/lib/scenario/compute";
import { buildChartSeries, buildCompareChartSeries, chartKindLabel, CHART_KINDS, type ChartKind } from "@/lib/scenario/chart";
import { buildSingleTableRows, buildCompareTableRows } from "@/lib/scenario/table-rows";
import { t, tf } from "@/lib/scenario/dictionary";
import { DC } from "@/lib/scenario/design-colors";
import type { Scenario, ScenarioConfig } from "@/lib/scenario/types";
import type { DisplayCurrency } from "@/components/currency-switch";
import type { SpecialEntry } from "@/lib/simulation";

const CUR_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: SIMULATION_YEARS_AHEAD + 1 }, (_, i) => CUR_YEAR + i);

function formatYen(yen: number, currency: DisplayCurrency, vndPerJpy: number): string {
  return currency === "JPY" ? formatJPY(yen) : formatVND(yen * vndPerJpy);
}

export default function SimulationPage() {
  const { lang, currency } = usePreferences();

  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [vndPerJpy, setVndPerJpy] = useState(VND_PER_JPY);
  const [actualByCategoryVnd, setActualByCategoryVnd] = useState<Record<string, number>>({});
  const [actualByCategoryMonthVnd, setActualByCategoryMonthVnd] = useState<Record<string, Record<string, number>>>({});
  const [investmentEntries, setInvestmentEntries] = useState<InvestmentEntryInput[]>([]);
  const [currentMonthForecastYen, setCurrentMonthForecastYen] = useState<number | null>(null);
  const [specialEntries, setSpecialEntries] = useState<SpecialEntry[]>([]);
  const [categories, setCategories] = useState<CategoryForCard[]>([]);
  const [overrides, setOverrides] = useState<CategoryBudgetOverride[]>([]);
  const [loading, setLoading] = useState(true);

  const [compareMode, setCompareMode] = useState<"single" | "compare">("single");
  const [timeMode, setTimeMode] = useState<"yearly" | "monthly">("monthly");
  const [viewMode, setViewMode] = useState<"table" | "graph">("table");
  const [focusYear, setFocusYear] = useState(CUR_YEAR);
  const [chartKind, setChartKind] = useState<ChartKind>("overview");
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [expandAllFlag, setExpandAllFlag] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [scenarioListOpen, setScenarioListOpen] = useState(false);
  const [editTargetId, setEditTargetId] = useState<string | null>(null);

  const fetchScenarios = useCallback(async () => {
    const r = await fetch("/api/scenarios");
    if (!r.ok) return;
    const {
      scenarios: list,
      vndPerJpy: rate,
      actualByCategoryVnd: actual,
      actualByCategoryMonthVnd: actualByMonth,
      investmentEntries: investments,
      currentMonthForecastYen: forecastYen,
    } = (await r.json()) as {
      scenarios: Scenario[];
      vndPerJpy: number;
      actualByCategoryVnd: Record<string, number>;
      actualByCategoryMonthVnd: Record<string, Record<string, number>>;
      investmentEntries: InvestmentEntryInput[];
      currentMonthForecastYen: number | null;
    };
    setScenarios(list);
    setVndPerJpy(rate);
    setActualByCategoryVnd(actual ?? {});
    setActualByCategoryMonthVnd(actualByMonth ?? {});
    setInvestmentEntries(investments ?? []);
    setCurrentMonthForecastYen(forecastYen ?? null);
  }, []);

  const fetchCategories = useCallback(async () => {
    const [catsRes, overridesRes] = await Promise.all([
      fetch("/api/categories"),
      fetch("/api/categories/overrides"),
    ]);
    if (catsRes.ok) setCategories(await catsRes.json());
    if (overridesRes.ok) setOverrides(await overridesRes.json());
  }, []);

  const fetchSpecialEntries = useCallback(async () => {
    const r = await fetch("/api/simulation/special-entries");
    if (r.ok) setSpecialEntries(await r.json());
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([fetchScenarios(), fetchCategories(), fetchSpecialEntries()]);
      setLoading(false);
    })();
  }, [fetchScenarios, fetchCategories, fetchSpecialEntries]);

  const primary = useMemo(
    () => scenarios.find((s) => s.is_primary) ?? scenarios[0],
    [scenarios],
  );
  const editTarget = useMemo(
    () => scenarios.find((s) => s.id === (editTargetId ?? primary?.id)) ?? primary,
    [scenarios, editTargetId, primary],
  );

  // 「展開する」は 総収入/総支出/総貯蓄 とその直下(固定費/変動費など)までを開く。
  // 固定費/変動費・特別収入/特別支出のさらに下(項目単位の内訳)は自動では
  // 開かず、クリックしたときだけ開く(一気に全項目が開いて長くなりすぎるのを
  // 防ぐため)。比較モードはキーに `scn.<id>.` が前置されるため、末尾一致で判定する。
  const NO_AUTO_EXPAND_SUFFIXES = useMemo(
    () => ["expense.fixed", "expense.variable", "income.specialIncome", "expense.specialExpense", "savings.invest"],
    [],
  );
  const isExpanded = useCallback(
    (key: string) => {
      if (expandedRows[key] !== undefined) return expandedRows[key];
      if (NO_AUTO_EXPAND_SUFFIXES.some((suffix) => key === suffix || key.endsWith(`.${suffix}`))) return false;
      return expandAllFlag;
    },
    [expandedRows, expandAllFlag, NO_AUTO_EXPAND_SUFFIXES],
  );
  const toggleRow = useCallback(
    (key: string) => setExpandedRows((prev) => ({ ...prev, [key]: !isExpanded(key) })),
    [isExpanded],
  );
  const toggleExpandAll = useCallback(() => {
    setExpandAllFlag((f) => !f);
    setExpandedRows({});
  }, []);

  const primaryYearRows = useMemo(
    () =>
      primary
        ? computeScenarioYears(
            primary.config,
            categories,
            overrides,
            vndPerJpy,
            CUR_YEAR,
            actualByCategoryVnd,
            actualByCategoryMonthVnd,
            specialEntries,
            investmentEntries,
            currentMonthForecastYen,
          )
        : [],
    [
      primary,
      categories,
      overrides,
      vndPerJpy,
      actualByCategoryVnd,
      actualByCategoryMonthVnd,
      specialEntries,
      investmentEntries,
      currentMonthForecastYen,
    ],
  );
  const rowsForView: ScenarioRow[] = useMemo(() => {
    if (!primary) return [];
    return timeMode === "yearly"
      ? toRows(primaryYearRows)
      : expandMonthly(primaryYearRows, primary.config, focusYear, vndPerJpy, investmentEntries, specialEntries);
  }, [primary, primaryYearRows, timeMode, focusYear, vndPerJpy, investmentEntries, specialEntries]);

  const compareRows = useMemo(() => {
    return scenarios.map((s) => {
      const yearRows = computeScenarioYears(
        s.config,
        categories,
        overrides,
        vndPerJpy,
        CUR_YEAR,
        actualByCategoryVnd,
        actualByCategoryMonthVnd,
        specialEntries,
        investmentEntries,
        currentMonthForecastYen,
      );
      const rows =
        timeMode === "yearly"
          ? toRows(yearRows)
          : expandMonthly(yearRows, s.config, focusYear, vndPerJpy, investmentEntries, specialEntries);
      return { id: s.id, name: s.name, rows };
    });
  }, [
    scenarios,
    categories,
    overrides,
    vndPerJpy,
    actualByCategoryVnd,
    actualByCategoryMonthVnd,
    timeMode,
    focusYear,
    investmentEntries,
    specialEntries,
    currentMonthForecastYen,
  ]);

  const formatAmount = useCallback((yen: number) => formatYen(yen, currency, vndPerJpy), [currency, vndPerJpy]);

  const singleTableRows = useMemo(
    () => buildSingleTableRows(rowsForView, lang, isExpanded, formatAmount, specialEntries, vndPerJpy, investmentEntries),
    [rowsForView, lang, isExpanded, formatAmount, specialEntries, vndPerJpy, investmentEntries],
  );
  const compareTableRows = useMemo(
    () => buildCompareTableRows(compareRows, lang, isExpanded, formatAmount, specialEntries, vndPerJpy, investmentEntries),
    [compareRows, lang, isExpanded, formatAmount, specialEntries, vndPerJpy, investmentEntries],
  );

  const chartBundle = useMemo(() => {
    if (compareMode === "compare") return buildCompareChartSeries(compareRows);
    return buildChartSeries(rowsForView, chartKind, lang, specialEntries, vndPerJpy);
  }, [compareMode, compareRows, rowsForView, chartKind, lang, specialEntries, vndPerJpy]);

  const milestoneYears = [1, 3, 5, 10];

  // --- シナリオCRUD ---
  const setPrimaryScenario = async (id: string) => {
    setScenarios((prev) => prev.map((s) => ({ ...s, is_primary: s.id === id })));
    const res = await fetch(`/api/scenarios/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isPrimary: true }),
    });
    if (!res.ok) toast.error("Could not switch scenario");
  };

  const deleteScenario = async (id: string) => {
    if (scenarios.length <= 1) return;
    const res = await fetch(`/api/scenarios/${id}`, { method: "DELETE" });
    if (res.ok) {
      await fetchScenarios();
      if (editTargetId === id) setEditTargetId(null);
      toast.success("Scenario deleted");
    } else {
      toast.error("Could not delete scenario");
    }
  };

  const renameScenario = async (id: string, name: string) => {
    setScenarios((prev) => prev.map((s) => (s.id === id ? { ...s, name } : s)));
    const res = await fetch(`/api/scenarios/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) toast.error("Could not rename scenario");
  };

  const saveConfig = useCallback(async (scenarioId: string, config: ScenarioConfig) => {
    setScenarios((prev) => prev.map((s) => (s.id === scenarioId ? { ...s, config } : s)));
    const res = await fetch(`/api/scenarios/${scenarioId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config }),
    });
    if (!res.ok) toast.error("Could not save changes");
  }, []);

  const saveAsNew = useCallback(async (name: string, config: ScenarioConfig) => {
    const res = await fetch("/api/scenarios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, config }),
    });
    if (res.ok) {
      const created = (await res.json()) as Scenario;
      setScenarios((prev) => [...prev, created]);
      toast.success(`Saved "${name}"`);
    }
  }, []);

  // --- カテゴリ(暮らし)CRUD ---
  const onCategoryUpdate = useCallback(
    async (
      id: string,
      patch: Partial<Pick<CategoryForCard, "name" | "budget" | "is_fixed" | "renewal_cycle_years" | "renewal_fee_months">>,
    ) => {
      setCategories((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
      const res = await fetch(`/api/categories/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) toast.error("Could not save category");
    },
    [],
  );

  const onCategoryAdd = useCallback(
    async (name: string, budget: number, isFixed: boolean) => {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, budget, is_fixed: isFixed }),
      });
      if (res.ok) {
        await fetchCategories();
        toast.success(`Added "${name}"`);
      } else {
        toast.error("Could not add category");
      }
    },
    [fetchCategories],
  );

  const onCategoryDelete = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/categories/${id}`, { method: "DELETE" });
      await fetchCategories();
      if (res.ok) toast.success("Category deleted");
      else toast.error("Could not delete category");
    },
    [fetchCategories],
  );

  const onScheduleOverride = useCallback(
    async (categoryId: string, month: string, endMonth: string | null, budget: number) => {
      const res = await fetch(`/api/categories/${categoryId}/overrides`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month, end_month: endMonth, budget }),
      });
      await fetchCategories();
      if (res.ok) toast.success("Schedule saved");
      else toast.error("Could not save schedule");
    },
    [fetchCategories],
  );

  const onDeleteOverride = useCallback(
    async (categoryId: string, overrideId: string) => {
      const res = await fetch(`/api/categories/${categoryId}/overrides/${overrideId}`, { method: "DELETE" });
      await fetchCategories();
      if (!res.ok) toast.error("Could not delete schedule");
    },
    [fetchCategories],
  );

  // --- 特別支出・特別収入(special_entries、Transactions/旧Simulationと共有) ---
  const onAddSpecialEntry = useCallback(
    async (kind: "income" | "expense", month: string, name: string, amount: number, currency: "JPY" | "VND") => {
      const res = await fetch("/api/simulation/special-entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month, kind, name, amount, currency }),
      });
      if (res.ok) {
        await fetchSpecialEntries();
        toast.success(`Added "${name}"`);
      } else {
        toast.error("Could not add");
      }
    },
    [fetchSpecialEntries],
  );

  const onDeleteSpecialEntry = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/simulation/special-entries/${id}`, { method: "DELETE" });
      await fetchSpecialEntries();
      if (!res.ok) toast.error("Could not delete");
    },
    [fetchSpecialEntries],
  );

  const onRenameSpecialEntry = useCallback(
    async (id: string, name: string) => {
      const res = await fetch(`/api/simulation/special-entries/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (res.ok) await fetchSpecialEntries();
      else toast.error("Could not rename");
    },
    [fetchSpecialEntries],
  );

  if (loading || !primary || !editTarget) {
    return (
      <div className="flex flex-col gap-3.5">
        <div className="flex items-center justify-between flex-wrap gap-2.5">
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-32 rounded-lg" />
            <Skeleton className="h-8 w-28 rounded-lg" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-24 rounded-lg" />
            <Skeleton className="h-8 w-8 rounded-lg" />
            <Skeleton className="h-8 w-8 rounded-lg" />
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-[72px] w-full rounded-2xl" />
          ))}
        </div>
        <div className="rounded-2xl border overflow-hidden" style={{ borderColor: DC.cardBorder }}>
          <Skeleton className="h-11 w-full rounded-none" />
          {Array.from({ length: 7 }, (_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3 border-t" style={{ borderColor: DC.trackAlt }}>
              <Skeleton className="h-3.5 w-28 rounded" />
              <Skeleton className="h-3.5 flex-1 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const isSingle = compareMode === "single";
  const isTableView = viewMode === "table";

  return (
    <div className="mt-6 flex flex-col gap-3.5">
      <div className="flex items-center justify-between flex-wrap gap-2.5">
        <div className="flex items-center gap-2 flex-wrap">
          <SegmentedControl
            value={compareMode}
            onChange={(v) => setCompareMode(v as "single" | "compare")}
            options={[
              { value: "single", label: t(lang, "single") },
              { value: "compare", label: t(lang, "compare") },
            ]}
          />
          <SegmentedControl
            value={timeMode}
            onChange={(v) => setTimeMode(v as "yearly" | "monthly")}
            options={[
              { value: "yearly", label: t(lang, "yearly") },
              { value: "monthly", label: t(lang, "monthly") },
            ]}
          />
          {timeMode === "monthly" && (
            <Select value={String(focusYear)} onValueChange={(v) => setFocusYear(Number(v))}>
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
          )}
        </div>
        <div className="flex items-center gap-2">
          <SegmentedControl
            value={viewMode}
            onChange={(v) => setViewMode(v as "table" | "graph")}
            options={[
              { value: "table", label: t(lang, "table") },
              { value: "graph", label: t(lang, "graph") },
            ]}
          />
          <IconButton title={t(lang, "manageDialogTitle")} onClick={() => setScenarioListOpen(true)}>
            <ListTree size={14} />
          </IconButton>
          <IconButton title={t(lang, "settingsBtn")} onClick={() => setEditorOpen(true)} accent>
            <Settings2 size={14} />
          </IconButton>
        </div>
      </div>

      {isSingle && timeMode === "yearly" && (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex flex-wrap gap-3">
            {milestoneYears.map((yrsAhead) => {
              const targetYear = CUR_YEAR + yrsAhead;
              const row = primaryYearRows.find((y) => y.year === targetYear);
              return (
                <Card
                  key={yrsAhead}
                  className="rounded-2xl px-4 py-2.5 flex items-baseline gap-2 w-fit"
                  style={{ borderColor: DC.cardBorder, backgroundColor: DC.cardBg }}
                >
                  <span className="text-[10.5px] font-semibold uppercase tracking-[0.05em] shrink-0" style={{ color: DC.textFaint }}>
                    {tf(lang, "yearsAheadLabel", { n: yrsAhead })} ({targetYear})
                  </span>
                  <span className="font-display text-xl font-bold whitespace-nowrap" style={{ color: DC.textPrimary }}>
                    {row ? formatAmount(row.savingsCumTotalYen) : "—"}
                  </span>
                </Card>
              );
            })}
          </div>
          {isTableView && <ExpandToggleButton expandAll={expandAllFlag} onToggle={toggleExpandAll} lang={lang} />}
        </div>
      )}
      {/* 比較モードにはサマリーカードが無いため、その場合(と、単体×月次で
          データ読み込み中でカードがまだ無い場合)だけボタンを独立した行に出す
          (通常は年次・月次どちらもカードの行に埋め込むので、この行は表示しない)。 */}
      {(!isSingle || (timeMode === "monthly" && rowsForView.length === 0)) && isTableView && (
        <div className="flex items-center justify-end">
          <ExpandToggleButton expandAll={expandAllFlag} onToggle={toggleExpandAll} lang={lang} />
        </div>
      )}

      {isSingle &&
        timeMode === "monthly" &&
        rowsForView.length > 0 &&
        (() => {
          // このサマリーカードは必ずテーブル(月次展開のrowsForView)と同じ数字から
          // 作る。以前は年次のcomputeScenarioYearsが別途出す年間値を使っていたが、
          // 年次と月次で計算式が微妙に食い違うたびに(期間限定スケジュール・実績の
          // 端数月など)カードとテーブルの数字が食い違うバグを繰り返していたため、
          // テーブルの最終月(12月、または表示中の最後の月)をそのまま累計貯蓄額の
          // 出どころにする。年収支は12ヶ月ぶんを合計した値(=累計貯蓄額の増減と
          // 一致するとは限らない。累計は「その時点の残高」、年収支は「その年だけの
          // フロー」で、別の数字)。
          const lastRow = rowsForView[rowsForView.length - 1];
          const incomeTotalYen = rowsForView.reduce((s, r) => s + r.incomeTotalYen, 0);
          const expenseTotalYen = rowsForView.reduce((s, r) => s + r.expenseTotalYen, 0);
          const netFlowYen = incomeTotalYen - expenseTotalYen;
          return (
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <Card
                className="rounded-2xl px-5 py-3 flex items-baseline gap-3 flex-wrap w-fit"
                style={{ borderColor: DC.cardBorder, backgroundColor: DC.cardBg }}
              >
                <span className="text-[10.5px] font-semibold uppercase tracking-[0.05em] shrink-0" style={{ color: DC.textFaint }}>
                  {tf(lang, "savingsAsOfYearEnd", { year: focusYear })}
                </span>
                <span className="font-display text-xl font-bold shrink-0" style={{ color: DC.textPrimary }}>
                  {formatAmount(lastRow.savingsCumTotalYen)}
                </span>
                <span className="text-sm font-semibold" style={{ color: netFlowYen >= 0 ? DC.success : DC.danger }}>
                  {netFlowYen >= 0 ? "+" : ""}
                  {formatAmount(netFlowYen)}
                </span>
              </Card>
              {isTableView && <ExpandToggleButton expandAll={expandAllFlag} onToggle={toggleExpandAll} lang={lang} />}
            </div>
          );
        })()}

      {isTableView ? (
        <ScenarioTable
          rows={isSingle ? singleTableRows : compareTableRows}
          columnLabels={rowsForView.map((r) => r.yearLabel)}
          firstColumnLabel={isSingle ? primary.name : ""}
          onToggleRow={toggleRow}
          lang={lang}
          // 月次表示で今年を見ている時だけ、当月の列がひと目でわかるようハイライトする。
          currentColumnLabel={
            timeMode === "monthly" && focusYear === CUR_YEAR
              ? `${CUR_YEAR}/${String(new Date().getMonth() + 1).padStart(2, "0")}`
              : null
          }
        />
      ) : (
        <div className="flex flex-col gap-2.5">
          {isSingle && (
            <div className="flex flex-wrap gap-1.5">
              {CHART_KINDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setChartKind(k)}
                  className="px-3 py-1.5 rounded-full text-xs font-semibold cursor-pointer border transition-all hover:brightness-95 active:scale-95"
                  style={{
                    backgroundColor: chartKind === k ? DC.textPrimary : DC.cardBg,
                    color: chartKind === k ? "#fff" : DC.textSecondary,
                    borderColor: DC.cardBorder,
                  }}
                >
                  {chartKindLabel(lang, k)}
                </button>
              ))}
            </div>
          )}
          <Card className="rounded-2xl p-5" style={{ borderColor: DC.cardBorder, backgroundColor: DC.cardBg }}>
            <ScenarioChart bundle={chartBundle} formatAmount={formatAmount} />
          </Card>
        </div>
      )}

      <ScenarioSettingsDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        scenario={editTarget}
        isCompare={!isSingle}
        scenarios={scenarios}
        editTargetId={editTarget.id}
        onEditTargetChange={setEditTargetId}
        categories={categories}
        overrides={overrides}
        onConfigChange={saveConfig}
        onSaveAsNew={saveAsNew}
        onCategoryUpdate={onCategoryUpdate}
        onCategoryAdd={onCategoryAdd}
        onCategoryDelete={onCategoryDelete}
        onScheduleOverride={onScheduleOverride}
        onDeleteOverride={onDeleteOverride}
        specialEntries={specialEntries}
        onAddSpecialEntry={onAddSpecialEntry}
        onDeleteSpecialEntry={onDeleteSpecialEntry}
        onRenameSpecialEntry={onRenameSpecialEntry}
        lang={lang}
        currency={currency}
        vndPerJpy={vndPerJpy}
      />

      <ScenarioListDialog
        open={scenarioListOpen}
        onOpenChange={setScenarioListOpen}
        scenarios={scenarios}
        onSelect={setPrimaryScenario}
        onDelete={deleteScenario}
        onRename={renameScenario}
        categories={categories}
        onCategoryUpdate={onCategoryUpdate}
        onCategoryAdd={onCategoryAdd}
        onCategoryDelete={onCategoryDelete}
        lang={lang}
      />
    </div>
  );
}

function SegmentedControl({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex gap-0.5 p-0.5 rounded-lg" style={{ backgroundColor: DC.track }}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className="px-3.5 py-1.5 rounded-md text-xs font-semibold cursor-pointer transition-all hover:brightness-95 active:scale-95"
          style={{
            backgroundColor: value === o.value ? DC.cardBg : "transparent",
            color: DC.textPrimary,
            boxShadow: value === o.value ? "0 1px 2px rgba(43,38,32,.08)" : undefined,
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function IconButton({
  title,
  onClick,
  accent,
  children,
}: {
  title: string;
  onClick: () => void;
  accent?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="flex items-center justify-center h-8 w-8 rounded-lg cursor-pointer transition-all hover:brightness-95 active:scale-95"
      style={{
        backgroundColor: accent ? DC.primary : DC.track,
        color: accent ? "#fff" : DC.textSecondary,
      }}
    >
      {children}
    </button>
  );
}

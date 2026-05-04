"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid } from "recharts";
import { TrendingDown, TrendingUp, History, Heart } from "lucide-react";
import { formatVND } from "@/lib/format";
import { getCategoryColors } from "@/lib/category-colors";
import {
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  PageHeader,
  Skeleton,
  Tabs,
  TabsList,
  TabsTrigger,
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from "@takaki/go-design-system";
import type { MonthRecord } from "@/app/api/dam/route";
import { WishlistDialog } from "@/components/wishlist-dialog";

interface PeriodItem {
  label: string;
  total: number;
  byCategory: Record<string, number>;
}
interface ReportData {
  periods: PeriodItem[];
  topCategories: string[];
  diff: number;
  topCategory: string;
  currentTotal: number;
  prevPeriodTotal: number;
  projectedTotal: number | null;
  projectedDiff: number | null;
  targetMonthly: number;
  fixedCosts: number;
  showYearTab: boolean;
}
type Period = "week" | "month" | "year";

const LABELS: Record<
  Period,
  { current: string; prev: string; compare: string; projection: string }
> = {
  week: { current: "今週", prev: "先週", compare: "先週比", projection: "週予測" },
  month: { current: "今月", prev: "先月", compare: "先月比", projection: "月予測" },
  year: { current: "今年", prev: "昨年", compare: "昨年比", projection: "年予測" },
};

interface ChartRow {
  label: string;
  total: number;
  value: number;
  byCategory: Record<string, number>;
}

function ChartTooltipContent({
  active,
  payload,
  filter,
}: {
  active?: boolean;
  payload?: { payload: ChartRow }[];
  filter: string;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;

  if (filter === "all") {
    const top10 = Object.entries(row.byCategory)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10);
    return (
      <div className="rounded-lg border bg-background px-3 py-2 text-xs shadow-sm min-w-44">
        <p className="font-medium text-foreground mb-1.5">{row.label}</p>
        <div className="space-y-1">
          {top10.length === 0 ? (
            <p className="text-muted-foreground">データなし</p>
          ) : (
            top10.map(([cat, amt]) => (
              <div
                key={cat}
                className="flex items-center justify-between gap-3"
              >
                <span className="text-muted-foreground truncate">{cat}</span>
                <span className="font-num font-medium text-foreground shrink-0">
                  {formatVND(amt)}
                </span>
              </div>
            ))
          )}
        </div>
        <div className="mt-2 pt-2 border-t flex items-center justify-between gap-3">
          <span className="text-muted-foreground">合計</span>
          <span className="font-num font-semibold text-foreground">
            {formatVND(row.total)}
          </span>
        </div>
      </div>
    );
  }

  const amount = row.byCategory[filter] ?? 0;
  const pct = row.total > 0 ? Math.round((amount / row.total) * 100) : 0;
  return (
    <div className="rounded-lg border bg-background px-3 py-2 text-xs shadow-sm min-w-44">
      <p className="font-medium text-foreground mb-1.5">{row.label}</p>
      <div className="flex items-center justify-between gap-3">
        <span className="text-muted-foreground truncate">{filter}</span>
        <span className="font-num font-medium text-foreground shrink-0">
          {formatVND(amount)}
        </span>
      </div>
      <div className="mt-2 pt-2 border-t flex items-center justify-between gap-3">
        <span className="text-muted-foreground">合計に占める割合</span>
        <span className="font-num font-semibold text-foreground">{pct}%</span>
      </div>
    </div>
  );
}

interface SavingsRow {
  label: string;
  target: number;
  spent: number;
  balance: number;
  cumulative: number;
  isCurrent: boolean;
}

function SavingsTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: SavingsRow }[];
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  const balanceColor =
    row.balance >= 0 ? "var(--color-success)" : "var(--color-danger)";
  return (
    <div className="rounded-lg border bg-background px-3 py-2 text-xs shadow-sm min-w-44">
      <p className="font-medium text-foreground mb-1.5">
        {row.label}
        {row.isCurrent && (
          <span className="ml-1.5 text-muted-foreground">（予測）</span>
        )}
      </p>
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">予算</span>
          <span className="font-num text-foreground">
            {formatVND(row.target)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">支出</span>
          <span className="font-num text-foreground">
            {formatVND(row.spent)}
          </span>
        </div>
      </div>
      <div className="mt-2 pt-2 border-t flex items-center justify-between gap-3">
        <span className="text-muted-foreground">倹約額</span>
        <span className="font-num font-semibold" style={{ color: balanceColor }}>
          {row.balance > 0 ? "+" : ""}
          {formatVND(row.balance)}
        </span>
      </div>
    </div>
  );
}

function SavingsHistoryChart({ months }: { months: MonthRecord[] }) {
  const chartData: SavingsRow[] = months.map((m, i) => ({
    label: m.label,
    target: m.target,
    spent: m.projected,
    balance: m.balance,
    cumulative: m.cumulative,
    isCurrent: i === months.length - 1,
  }));
  const cumulative = months[months.length - 1]?.cumulative ?? 0;
  const cumulativeColor =
    cumulative >= 0 ? "var(--color-success)" : "var(--color-danger)";

  const config: ChartConfig = {
    balance: { label: "倹約額", color: "var(--color-primary)" },
  };

  return (
    <div className="px-7 pt-6 pb-7">
      <div className="flex items-end justify-between mb-5">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          累計倹約額
        </p>
        <p
          className="font-num text-2xl font-semibold leading-none"
          style={{ color: cumulativeColor }}
        >
          {cumulative > 0 ? "+" : ""}
          {formatVND(cumulative)}
        </p>
      </div>

      {chartData.length === 0 ? (
        <p className="text-center py-16 text-sm text-muted-foreground">
          履歴データがありません
        </p>
      ) : (
        <ChartContainer
          config={config}
          className="aspect-auto h-[320px] w-full"
        >
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="savingsFill" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor="var(--color-primary)"
                  stopOpacity={0.4}
                />
                <stop
                  offset="95%"
                  stopColor="var(--color-primary)"
                  stopOpacity={0.05}
                />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
            />
            <YAxis
              tickFormatter={(v) => `${(Number(v) / 1_000_000).toFixed(0)}M`}
              tickLine={false}
              axisLine={false}
              tickMargin={8}
            />
            <ChartTooltip cursor={false} content={<SavingsTooltip />} />
            <Area
              dataKey="balance"
              type="natural"
              fill="url(#savingsFill)"
              stroke="var(--color-primary)"
              strokeWidth={2}
            />
          </AreaChart>
        </ChartContainer>
      )}
    </div>
  );
}

export default function ReportPage() {
  const [period, setPeriod] = useState<Period>("week");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [data, setData] = useState<ReportData | null>(null);
  const [history, setHistory] = useState<MonthRecord[] | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [wishlistOpen, setWishlistOpen] = useState(false);

  const fetchData = useCallback(async (p: Period) => {
    setData(null);
    const res = await fetch(`/api/weekly?period=${p}`);
    if (!res.ok) return;
    const json: ReportData = await res.json();
    setData(json);
  }, []);

  useEffect(() => {
    fetchData(period);
  }, [period, fetchData]);

  // 期間切替などで topCategories から外れたら "all" に戻す
  useEffect(() => {
    if (
      categoryFilter !== "all" &&
      data &&
      !data.topCategories.includes(categoryFilter)
    ) {
      setCategoryFilter("all");
    }
  }, [data, categoryFilter]);

  // 履歴は初回 Dialog を開いた時にだけ取得
  useEffect(() => {
    if (!historyOpen || history !== null) return;
    fetch("/api/dam")
      .then((r) => (r.ok ? r.json() : null))
      .then((json: { months: MonthRecord[] } | null) => {
        if (json) setHistory(json.months);
      });
  }, [historyOpen, history]);

  const chartData: ChartRow[] =
    data?.periods.map((p) => ({
      label: p.label,
      total: p.total,
      value:
        categoryFilter === "all"
          ? p.total
          : (p.byCategory?.[categoryFilter] ?? 0),
      byCategory: p.byCategory ?? {},
    })) ?? [];

  const chartColor =
    categoryFilter === "all"
      ? "var(--color-primary)"
      : getCategoryColors(categoryFilter).text;

  const chartConfig = useMemo<ChartConfig>(
    () => ({
      value: {
        label: categoryFilter === "all" ? "合計" : categoryFilter,
        color: chartColor,
      },
    }),
    [categoryFilter, chartColor],
  );

  const labels = LABELS[period];

  const projected = data?.projectedTotal ?? null;
  const projectedDiff = data?.projectedDiff ?? null;
  const target = data?.targetMonthly ?? 0;
  const prevPeriodTotal = data?.prevPeriodTotal ?? 0;

  const card2Diff = projectedDiff ?? data?.diff ?? 0;
  const card2Pct =
    prevPeriodTotal > 0
      ? Math.round((card2Diff / prevPeriodTotal) * 100)
      : null;
  const card2Improved = card2Diff <= 0;

  return (
    <div>
      <PageHeader
        title="レポート"
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setWishlistOpen(true)}
            >
              <Heart size={14} />
              ウィッシュリスト
            </Button>
            <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <History size={14} />
                  月毎の倹約
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-3xl p-0 overflow-hidden">
                <DialogHeader className="px-7 py-5 border-b">
                  <DialogTitle>月毎の倹約</DialogTitle>
                </DialogHeader>
                {history === null ? (
                  <div className="p-7">
                    <Skeleton className="h-72 w-full rounded" />
                  </div>
                ) : (
                  <SavingsHistoryChart months={history} />
                )}
              </DialogContent>
            </Dialog>
          </div>
        }
      />

      <WishlistDialog open={wishlistOpen} onOpenChange={setWishlistOpen} />

      <div className="mt-6 mb-8">
        <Tabs value={period} onValueChange={(v) => setPeriod(v as Period)}>
          <TabsList>
            <TabsTrigger value="week">今週</TabsTrigger>
            <TabsTrigger value="month">今月</TabsTrigger>
            <TabsTrigger value="year">年</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="grid grid-cols-3 gap-5 mb-8">
        <Card
          className="p-7 animate-fade-up"
          style={{ animationDelay: "0ms", animationFillMode: "both" }}
        >
          <p className="text-xs font-medium uppercase tracking-widest mb-3 text-muted-foreground">
            {labels.current}の出費
          </p>
          <p
            className="font-num text-3xl font-semibold leading-none"
            style={{ color: "var(--kg-text)" }}
          >
            {data ? formatVND(data.currentTotal) : "—"}
          </p>
          {projected != null && (
            <p className="mt-3 text-sm text-muted-foreground">
              {labels.projection}{" "}
              <span className="font-num">{formatVND(projected)}</span>
              {period === "month" && target > 0 && (
                <span> / {formatVND(target)}</span>
              )}
            </p>
          )}
        </Card>

        <Card
          className="p-7 animate-fade-up"
          style={{ animationDelay: "80ms", animationFillMode: "both" }}
        >
          <p className="text-xs font-medium uppercase tracking-widest mb-3 text-muted-foreground">
            {labels.prev}との差額
          </p>
          <p
            className="font-num text-3xl font-semibold leading-none"
            style={{
              color:
                data == null
                  ? "var(--kg-text)"
                  : card2Improved
                    ? "var(--kg-success)"
                    : "var(--kg-danger)",
            }}
          >
            {data ? `${card2Diff > 0 ? "+" : ""}${formatVND(card2Diff)}` : "—"}
          </p>
          {data && card2Pct !== null && (
            <p
              className="mt-3 text-sm font-medium flex items-center gap-1"
              style={{
                color: card2Improved ? "var(--kg-success)" : "var(--kg-danger)",
              }}
            >
              {card2Improved ? (
                <TrendingDown size={14} />
              ) : (
                <TrendingUp size={14} />
              )}
              {labels.compare} {card2Pct > 0 ? "+" : ""}
              {card2Pct}%
            </p>
          )}
        </Card>

        <Card
          className="p-7 animate-fade-up"
          style={{ animationDelay: "160ms", animationFillMode: "both" }}
        >
          <p className="text-xs font-medium uppercase tracking-widest mb-3 text-muted-foreground">
            気になる支出
          </p>
          {!data ? (
            <Skeleton className="h-8 w-3/4 rounded-lg" />
          ) : (
            <p className="text-3xl font-semibold leading-none text-foreground">
              {data.topCategory ?? "—"}
            </p>
          )}
        </Card>
      </div>

      <Card className="p-7 mb-5">
        <div className="flex items-center justify-between gap-4 mb-6">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            支出推移
          </p>
          {data && data.topCategories.length > 0 && (
            <Tabs
              value={categoryFilter}
              onValueChange={setCategoryFilter}
            >
              <TabsList>
                <TabsTrigger value="all">すべて</TabsTrigger>
                {data.topCategories.map((cat) => (
                  <TabsTrigger key={cat} value={cat}>
                    {cat}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          )}
        </div>
        {chartData.length > 0 ? (
          <ChartContainer
            config={chartConfig}
            className="aspect-auto h-[320px] w-full"
          >
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="reportTotalFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={chartColor} stopOpacity={0.4} />
                  <stop offset="95%" stopColor={chartColor} stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
              />
              <YAxis
                tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                tickLine={false}
                axisLine={false}
                tickMargin={8}
              />
              <ChartTooltip
                cursor={false}
                content={<ChartTooltipContent filter={categoryFilter} />}
              />
              <Area
                dataKey="value"
                type="natural"
                fill="url(#reportTotalFill)"
                stroke={chartColor}
                strokeWidth={2}
              />
            </AreaChart>
          </ChartContainer>
        ) : (
          <div className="flex items-center justify-center h-64">
            <p className="text-sm text-muted-foreground">データがありません</p>
          </div>
        )}
      </Card>

    </div>
  );
}

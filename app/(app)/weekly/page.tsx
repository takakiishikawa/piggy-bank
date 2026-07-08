"use client";

import {
  useEffect,
  useState,
  useCallback,
  useMemo,
  type CSSProperties,
} from "react";
import { useRouter } from "next/navigation";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  type MouseHandlerDataParam,
} from "recharts";
import { Heart, List } from "lucide-react";
import { formatVND } from "@/lib/format";
import { getCategoryColors } from "@/lib/category-colors";
import { getCategoryIcon } from "@/lib/category-icons";
import {
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Skeleton,
  Tabs,
  TabsList,
  TabsTrigger,
  ChartContainer,
  ChartTooltip,
  cn,
  type ChartConfig,
} from "@takaki/go-design-system";

import { WishlistDialog } from "@/components/wishlist-dialog";

interface PeriodItem {
  label: string;
  total: number;
  byCategory: Record<string, number>;
  start: string;
  end: string;
}
interface TxItem {
  id: string;
  store: string;
  amount: number;
  category: string;
  date: string;
}
interface ReportData {
  periods: PeriodItem[];
  topCategories: string[];
  categoryType: string;
}
type CategoryType = "variable" | "fixed" | "all";

interface ChartRow {
  label: string;
  total: number;
  value: number;
  byCategory: Record<string, number>;
  start: string;
  end: string;
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
    const allCategories = Object.entries(row.byCategory).sort(
      ([, a], [, b]) => b - a,
    );
    const twoCol = allCategories.length > 8;
    return (
      <div
        className={cn(
          "rounded-lg border bg-background px-3 py-2 text-xs shadow-sm",
          twoCol ? "min-w-[24rem]" : "min-w-44",
        )}
      >
        <p className="font-medium text-foreground mb-1.5">{row.label}</p>
        {allCategories.length === 0 ? (
          <p className="text-muted-foreground">No data</p>
        ) : (
          <div
            className={cn(
              "gap-x-5 gap-y-1",
              twoCol ? "grid grid-cols-2" : "space-y-1",
            )}
          >
            {allCategories.map(([cat, amt]) => (
              <div key={cat} className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground truncate">{cat}</span>
                <span className="font-num font-medium text-foreground shrink-0">
                  {formatVND(amt)}
                </span>
              </div>
            ))}
          </div>
        )}
        <div className="mt-2 pt-2 border-t flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Total</span>
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
        <span className="text-muted-foreground">% of total</span>
        <span className="font-num font-semibold text-foreground">{pct}%</span>
      </div>
    </div>
  );
}

function CategoryChip({
  label,
  value,
  active,
  onSelect,
}: {
  label: string;
  value: string;
  active: boolean;
  onSelect: (value: string) => void;
}) {
  const colors = value === "all" ? null : getCategoryColors(value);
  const Icon = value !== "all" ? getCategoryIcon(value) : null;
  const activeStyle: CSSProperties =
    value === "all"
      ? {
          backgroundColor: "var(--color-primary)",
          borderColor: "var(--color-primary)",
          color: "#fff",
        }
      : {
          backgroundColor: colors!.bg,
          borderColor: colors!.border,
          color: colors!.text,
        };
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      aria-pressed={active}
      className="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-colors cursor-pointer hover:bg-muted/60"
      style={
        active
          ? activeStyle
          : {
              backgroundColor: "transparent",
              borderColor: "var(--border)",
              color: "var(--muted-foreground)",
            }
      }
    >
      {Icon && <Icon size={11} />}
      {label}
    </button>
  );
}

export default function ReportPage() {
  const router = useRouter();
  const [categoryType, setCategoryType] = useState<CategoryType>("variable");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [data, setData] = useState<ReportData | null>(null);
  const [wishlistOpen, setWishlistOpen] = useState(false);
  const [detail, setDetail] = useState<{
    label: string;
    category: string;
    txs: TxItem[] | null;
  } | null>(null);

  const fetchData = useCallback(async (type: CategoryType) => {
    setData(null);
    const res = await fetch(`/api/weekly?type=${type}`);
    if (!res.ok) return;
    const json: ReportData = await res.json();
    setData(json);
  }, []);

  useEffect(() => {
    fetchData(categoryType);
  }, [categoryType, fetchData]);

  useEffect(() => {
    if (
      categoryFilter !== "all" &&
      data &&
      !data.topCategories.includes(categoryFilter)
    ) {
      setCategoryFilter("all");
    }
  }, [data, categoryFilter]);

  const chartData: ChartRow[] =
    data?.periods.map((p) => ({
      label: p.label,
      total: p.total,
      value:
        categoryFilter === "all"
          ? p.total
          : (p.byCategory?.[categoryFilter] ?? 0),
      byCategory: p.byCategory ?? {},
      start: p.start,
      end: p.end,
    })) ?? [];

  const openDetail = useCallback(
    async (row: ChartRow) => {
      const category = categoryFilter;
      setDetail({ label: row.label, category, txs: null });
      try {
        const params = new URLSearchParams({ from: row.start, to: row.end });
        if (category !== "all") params.set("category", category);
        const r = await fetch(`/api/transactions?${params.toString()}`);
        if (!r.ok) throw new Error();
        const txs = (await r.json()) as TxItem[];
        setDetail((d) =>
          d && d.label === row.label && d.category === category
            ? { ...d, txs }
            : d,
        );
      } catch {
        setDetail((d) =>
          d && d.label === row.label && d.category === category
            ? { ...d, txs: [] }
            : d,
        );
      }
    },
    [categoryFilter],
  );

  const handleChartClick = useCallback(
    (state: MouseHandlerDataParam) => {
      const row = chartData.find((r) => r.label === state.activeLabel);
      if (row) openDetail(row);
    },
    [chartData, openDetail],
  );

  const chartColor =
    categoryFilter === "all"
      ? "var(--color-primary)"
      : getCategoryColors(categoryFilter).text;

  const chartConfig = useMemo<ChartConfig>(
    () => ({
      value: {
        label: categoryFilter === "all" ? "Total" : categoryFilter,
        color: chartColor,
      },
    }),
    [categoryFilter, chartColor],
  );

  return (
    <div>
      <WishlistDialog open={wishlistOpen} onOpenChange={setWishlistOpen} />

      <div className="mt-6 mb-8 flex items-center justify-between gap-4">
        <Tabs
          value={categoryType}
          onValueChange={(v) => {
            setCategoryType(v as CategoryType);
            setCategoryFilter("all");
          }}
        >
          <TabsList>
            <TabsTrigger value="variable">Variable</TabsTrigger>
            <TabsTrigger value="fixed">Fixed</TabsTrigger>
            <TabsTrigger value="all">All</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push("/transactions")}
          >
            <List size={14} />
            Transactions
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setWishlistOpen(true)}
          >
            <Heart size={14} />
            Wishlist
          </Button>
        </div>
      </div>

      <Card className="p-7 mb-5">
        <div className="flex items-center justify-between gap-4 mb-6">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Spending Trend (Last 6 Months)
          </p>
          {data && data.topCategories.length > 0 && (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <CategoryChip
                label="All"
                value="all"
                active={categoryFilter === "all"}
                onSelect={setCategoryFilter}
              />
              {data.topCategories.map((cat) => (
                <CategoryChip
                  key={cat}
                  label={cat}
                  value={cat}
                  active={categoryFilter === cat}
                  onSelect={setCategoryFilter}
                />
              ))}
            </div>
          )}
        </div>
        {chartData.length > 0 ? (
          <ChartContainer
            config={chartConfig}
            className="aspect-auto h-[420px] w-full"
          >
            <AreaChart
              data={chartData}
              onClick={handleChartClick}
              style={{ cursor: "pointer" }}
            >
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
                allowEscapeViewBox={{ x: false, y: true }}
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
            {data === null ? (
              <Skeleton className="h-48 w-full rounded" />
            ) : (
              <p className="text-sm text-muted-foreground">No data</p>
            )}
          </div>
        )}
      </Card>

      {/* 明細 popup */}
      <Dialog
        open={detail !== null}
        onOpenChange={(o) => {
          if (!o) setDetail(null);
        }}
      >
        <DialogContent className="max-w-lg p-0 overflow-hidden">
          <DialogHeader className="px-7 py-5 border-b">
            <DialogTitle className="flex items-center gap-2">
              {detail?.label}
              {detail && detail.category !== "all" && (
                <span className="text-sm font-normal text-muted-foreground">
                  {detail.category}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto px-7 py-5">
            {detail?.txs === null ? (
              <div className="space-y-2">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-10 w-full rounded" />
                ))}
              </div>
            ) : detail && detail.txs.length === 0 ? (
              <p className="text-center py-10 text-sm text-muted-foreground">
                No spending in this period.
              </p>
            ) : (
              <>
                <ul className="divide-y">
                  {detail?.txs?.map((t) => (
                    <li
                      key={t.id}
                      className="flex items-center justify-between gap-4 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="text-sm text-foreground truncate">
                          {t.store}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(t.date).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })}{" "}
                          · {t.category}
                        </p>
                      </div>
                      <span className="font-num text-sm text-foreground shrink-0">
                        {formatVND(t.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
                {detail && detail.txs.length > 0 && (
                  <div className="mt-3 pt-3 border-t flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Total</span>
                    <span className="font-num font-semibold text-foreground">
                      {formatVND(
                        detail.txs.reduce((sum, t) => sum + t.amount, 0),
                      )}
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}


"use client";

import {
  useEffect,
  useState,
  useCallback,
  useMemo,
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
import { Heart, List, Sparkles } from "lucide-react";
import { formatVND } from "@/lib/format";
import { getCategoryColors } from "@/lib/category-colors";
import { getCategoryIcon } from "@/lib/category-icons";
import { NoteTag } from "@/components/note-tag";
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
  note: string | null;
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
        style={{ borderColor: "var(--color-border-default)" }}
      >
        <p className="font-medium mb-1.5" style={{ color: "var(--color-text-primary)" }}>{row.label}</p>
        {allCategories.length === 0 ? (
          <p style={{ color: "var(--color-text-secondary)" }}>No data</p>
        ) : (
          <div
            className={cn(
              "gap-x-5 gap-y-1",
              twoCol ? "grid grid-cols-2" : "space-y-1",
            )}
          >
            {allCategories.map(([cat, amt]) => (
              <div key={cat} className="flex items-center justify-between gap-3">
                <span className="truncate" style={{ color: "var(--color-text-secondary)" }}>{cat}</span>
                <span className="font-num font-medium shrink-0" style={{ color: "var(--color-text-primary)" }}>
                  {formatVND(amt)}
                </span>
              </div>
            ))}
          </div>
        )}
        <div className="mt-2 pt-2 border-t flex items-center justify-between gap-3" style={{ borderColor: "var(--color-border-default)" }}>
          <span style={{ color: "var(--color-text-secondary)" }}>Total</span>
          <span className="font-num font-semibold" style={{ color: "var(--color-text-primary)" }}>
            {formatVND(row.total)}
          </span>
        </div>
      </div>
    );
  }

  const amount = row.byCategory[filter] ?? 0;
  const pct = row.total > 0 ? Math.round((amount / row.total) * 100) : 0;
  return (
    <div
      className="rounded-lg border bg-background px-3 py-2 text-xs shadow-sm min-w-44"
      style={{ borderColor: "var(--color-border-default)" }}
    >
      <p className="font-medium mb-1.5" style={{ color: "var(--color-text-primary)" }}>{row.label}</p>
      <div className="flex items-center justify-between gap-3">
        <span className="truncate" style={{ color: "var(--color-text-secondary)" }}>{filter}</span>
        <span className="font-num font-medium shrink-0" style={{ color: "var(--color-text-primary)" }}>
          {formatVND(amount)}
        </span>
      </div>
      <div className="mt-2 pt-2 border-t flex items-center justify-between gap-3" style={{ borderColor: "var(--color-border-default)" }}>
        <span style={{ color: "var(--color-text-secondary)" }}>% of total</span>
        <span className="font-num font-semibold" style={{ color: "var(--color-text-primary)" }}>{pct}%</span>
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
  const Icon = value !== "all" ? getCategoryIcon(value) : Sparkles;
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      aria-pressed={active}
      className="inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-[13px] font-semibold transition-colors cursor-pointer"
      style={
        active
          ? { backgroundColor: "var(--color-text-primary)", borderColor: "var(--color-text-primary)", color: "#FFFFFF" }
          : { backgroundColor: "var(--color-surface)", borderColor: "var(--color-border-default)", color: "#5B5346" }
      }
    >
      <Icon size={13} />
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

  const handleSaveNote = useCallback(
    async (id: string, note: string | null) => {
      setDetail((d) =>
        d && d.txs
          ? { ...d, txs: d.txs.map((t) => (t.id === id ? { ...t, note } : t)) }
          : d,
      );
      await fetch(`/api/transactions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note }),
      });
    },
    [],
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
      ? "#0D9488"
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

      <div className="mt-8 mb-6 flex items-center justify-between gap-4">
        <Tabs
          value={categoryType}
          onValueChange={(v) => {
            setCategoryType(v as CategoryType);
            setCategoryFilter("all");
          }}
        >
          <TabsList
            className="p-1 rounded-[11px] h-auto gap-1"
            style={{ backgroundColor: "var(--kg-track)" }}
          >
            {(["variable", "fixed", "all"] as const).map((v) => (
              <TabsTrigger
                key={v}
                value={v}
                className="rounded-lg px-[18px] py-2 text-sm font-semibold capitalize data-[state=active]:shadow-none"
                style={
                  categoryType === v
                    ? { backgroundColor: "var(--color-primary-subtle)", color: "var(--color-primary-hover)" }
                    : { backgroundColor: "transparent", color: "var(--color-text-secondary)" }
                }
              >
                {v}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            className="rounded-[10px] h-auto py-2.5 px-4 font-semibold"
            style={{ borderColor: "var(--color-border-default)", color: "var(--color-text-primary)" }}
            onClick={() => router.push("/transactions")}
          >
            <List size={16} />
            Transactions
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="rounded-[10px] h-auto py-2.5 px-4 font-semibold"
            style={{ borderColor: "var(--color-border-default)", color: "var(--color-text-primary)" }}
            onClick={() => setWishlistOpen(true)}
          >
            <Heart size={16} />
            Wishlist
          </Button>
        </div>
      </div>

      <Card
        className="p-7 rounded-2xl"
        style={{
          borderColor: "var(--color-border-default)",
          boxShadow: "0 1px 2px rgba(120,72,10,.04), 0 8px 24px rgba(120,72,10,.05)",
        }}
      >
        <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
          <p className="text-xs font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--color-text-subtle)" }}>
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
                  <stop offset="5%" stopColor={chartColor} stopOpacity={0.35} />
                  <stop offset="95%" stopColor={chartColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--color-border-default)" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tickMargin={10}
                tick={{ fill: "var(--color-text-subtle)", fontSize: 12.5 }}
              />
              <YAxis
                tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tick={{ fill: "var(--color-text-subtle)", fontSize: 12.5 }}
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
                strokeWidth={3}
              />
            </AreaChart>
          </ChartContainer>
        ) : (
          <div className="flex items-center justify-center h-64">
            {data === null ? (
              <Skeleton className="h-48 w-full rounded" />
            ) : (
              <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>No data</p>
            )}
          </div>
        )}
      </Card>

      <Dialog
        open={detail !== null}
        onOpenChange={(o) => {
          if (!o) setDetail(null);
        }}
      >
        <DialogContent className="max-w-lg p-0 overflow-hidden">
          <DialogHeader className="px-7 py-5 border-b" style={{ borderColor: "var(--color-border-default)" }}>
            <DialogTitle className="flex items-center gap-2">
              {detail?.label}
              {detail && detail.category !== "all" && (
                <span className="text-sm font-normal" style={{ color: "var(--color-text-secondary)" }}>
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
              <p className="text-center py-10 text-sm" style={{ color: "var(--color-text-secondary)" }}>
                No spending in this period.
              </p>
            ) : (
              <>
                <ul className="divide-y" style={{ borderColor: "var(--color-border-subtle)" }}>
                  {detail?.txs?.map((t) => (
                    <li
                      key={t.id}
                      className="group flex items-center justify-between gap-4 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="text-sm truncate" style={{ color: "var(--color-text-primary)" }}>
                          {t.store}
                        </p>
                        <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
                          {new Date(t.date).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })}{" "}
                          · {t.category}
                        </p>
                      </div>
                      <NoteTag value={t.note} onSave={(v) => handleSaveNote(t.id, v)} />
                      <span className="font-num text-sm shrink-0" style={{ color: "var(--color-text-primary)" }}>
                        {formatVND(t.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
                {detail && detail.txs.length > 0 && (
                  <div className="mt-3 pt-3 border-t flex items-center justify-between" style={{ borderColor: "var(--color-border-default)" }}>
                    <span className="text-sm" style={{ color: "var(--color-text-secondary)" }}>Total</span>
                    <span className="font-num font-semibold" style={{ color: "var(--color-text-primary)" }}>
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

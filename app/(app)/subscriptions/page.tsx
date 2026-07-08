"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { TrendingUp } from "lucide-react";
import { formatVND } from "@/lib/format";
import { getCategoryColors } from "@/lib/category-colors";
import {
  Button,
  ChartArea,
  DataTable,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,

  Skeleton,
  Tabs,
  TabsList,
  TabsTrigger,
  Tag,
  toast,
  type ChartConfig,
} from "@takaki/go-design-system";
import type { SubscriptionItem } from "@/app/api/subscriptions/route";
import type { SubscriptionHistoryPoint } from "@/app/api/subscriptions/history/route";

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function CategoryBadge({ category }: { category: string }) {
  const { bg, border, text } = getCategoryColors(category);
  return (
    <Tag style={{ backgroundColor: bg, borderColor: border, color: text }}>
      {category}
    </Tag>
  );
}

type TabValue = "active" | "ended";

export default function SubscriptionsPage() {
  const [subscriptions, setSubscriptions] = useState<SubscriptionItem[] | null>(
    null,
  );
  const [tab, setTab] = useState<TabValue>("active");
  const [pendingEnd, setPendingEnd] = useState<SubscriptionItem | null>(null);
  const [busyStore, setBusyStore] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<SubscriptionHistoryPoint[] | null>(
    null,
  );

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/subscriptions");
      if (!r.ok) throw new Error();
      const data = (await r.json()) as SubscriptionItem[];
      setSubscriptions(data);
    } catch {
      toast.error("Failed to load subscriptions");
      setSubscriptions([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const updateActive = useCallback(
    async (store: string, isActive: boolean) => {
      setBusyStore(store);
      try {
        const r = await fetch("/api/subscriptions", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ store, isActive }),
        });
        if (!r.ok) throw new Error();
        setSubscriptions((prev) =>
          prev
            ? prev.map((s) =>
                s.store === store ? { ...s, isActive, userLocked: true } : s,
              )
            : prev,
        );
        toast.success(
          isActive ? "Marked as active again" : "Subscription ended",
        );
      } catch {
        toast.error("Failed to update");
      } finally {
        setBusyStore(null);
      }
    },
    [],
  );

  // 推移は Dialog を開いた時に遅延取得
  useEffect(() => {
    if (!historyOpen || history !== null) return;
    fetch("/api/subscriptions/history")
      .then((r) => (r.ok ? r.json() : null))
      .then((json: SubscriptionHistoryPoint[] | null) => {
        if (json) setHistory(json);
      });
  }, [historyOpen, history]);

  const { active, ended } = useMemo(() => {
    const list = subscriptions ?? [];
    // タグ（カテゴリ）昇順 → 同じタグ内は金額降順
    const sortByCategoryThenAmount = (a: SubscriptionItem, b: SubscriptionItem) => {
      const c = a.category.localeCompare(b.category, "en");
      if (c !== 0) return c;
      return b.amount - a.amount;
    };
    return {
      active: list.filter((s) => s.isActive).sort(sortByCategoryThenAmount),
      ended: list.filter((s) => !s.isActive).sort(sortByCategoryThenAmount),
    };
  }, [subscriptions]);

  const monthlyTotal = active.reduce((sum, s) => sum + s.amount, 0);
  const tableData = tab === "active" ? active : ended;

  const columns = useMemo<ColumnDef<SubscriptionItem>[]>(
    () => [
      {
        id: "store",
        accessorKey: "store",
        header: "Name",
        cell: ({ row }) => (
          <div className="min-w-[280px] max-w-[420px]">
            <span className="text-sm text-foreground truncate block">
              {row.original.store}
            </span>
          </div>
        ),
      },
      {
        id: "category",
        accessorKey: "category",
        header: "Category",
        cell: ({ row }) => <CategoryBadge category={row.original.category} />,
      },
      {
        id: "lastChargedAt",
        accessorKey: "lastChargedAt",
        header: "Last Charged",
        cell: ({ row }) => (
          <span className="text-sm text-foreground whitespace-nowrap">
            {formatDate(row.original.lastChargedAt)}
          </span>
        ),
      },
      {
        id: "amount",
        accessorKey: "amount",
        header: () => <div className="text-right pr-4">Amount</div>,
        cell: ({ row }) => (
          <div className="text-right font-num text-sm text-foreground pr-4 min-w-[180px]">
            {formatVND(row.original.amount)}
            <span className="text-xs ml-1 text-muted-foreground">/mo</span>
          </div>
        ),
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => {
          const s = row.original;
          return (
            <div className="text-right whitespace-nowrap">
              {s.isActive ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  disabled={busyStore === s.store}
                  onClick={() => setPendingEnd(s)}
                >
                  End
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busyStore === s.store}
                  onClick={() => updateActive(s.store, true)}
                >
                  Resume
                </Button>
              )}
            </div>
          );
        },
      },
    ],
    [busyStore, updateActive],
  );

  const chartConfig = useMemo<ChartConfig>(
    () => ({ total: { label: "Monthly Total", color: "var(--color-primary)" } }),
    [],
  );

  const TabBadge = ({ count }: { count: number }) => (
    <span
      className="ml-2 text-[10px] font-num px-1.5 py-0.5 rounded-full"
      style={{
        backgroundColor: "var(--kg-surface-2)",
        color: "var(--muted-foreground)",
        minWidth: 18,
        textAlign: "center",
      }}
    >
      {count}
    </span>
  );

  return (
    <div>
      {subscriptions === null ? (
        <div className="mt-8 space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
      ) : (
        <>
          <div className="mt-6 mb-4">
            <Tabs value={tab} onValueChange={(v) => setTab(v as TabValue)}>
              <TabsList>
                <TabsTrigger value="active">
                  Active
                  <TabBadge count={active.length} />
                </TabsTrigger>
                <TabsTrigger value="ended">
                  Ended
                  <TabBadge count={ended.length} />
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="flex items-center mb-4">
            {tab === "active" && active.length > 0 ? (
              <p
                className="text-sm font-num font-semibold"
                style={{ color: "var(--color-primary)" }}
              >
                Monthly total {formatVND(monthlyTotal)}
              </p>
            ) : (
              <span />
            )}
            <span className="flex-1" />
            <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <TrendingUp size={14} />
                  Trend
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-3xl p-0 overflow-hidden">
                <DialogHeader className="px-7 py-5 border-b">
                  <DialogTitle>Subscription Trend (Last 12 Months)</DialogTitle>
                </DialogHeader>
                <div className="p-7">
                  {history === null ? (
                    <Skeleton className="h-72 w-full rounded" />
                  ) : (
                    <ChartArea
                      data={history as unknown as Record<string, unknown>[]}
                      config={chartConfig}
                      xKey="label"
                      yKeys={["total"]}
                      filterByDate={false}
                      timeRanges={[]}
                    />
                  )}
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <div className="kg-hide-pagesize">
            <DataTable
              columns={columns}
              data={tableData}
              searchable={false}
              pageSize={100}
              pageSizeOptions={[100]}
              emptyMessage={
                tab === "active"
                  ? "No active subscriptions"
                  : "No ended subscriptions"
              }
            />
          </div>
        </>
      )}

      <Dialog
        open={pendingEnd !== null}
        onOpenChange={(o) => {
          if (!o) setPendingEnd(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>End this subscription?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground px-1">
            "{pendingEnd?.store}" will be moved to Ended. You can bring it back anytime with "Resume".
          </p>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" onClick={() => setPendingEnd(null)}>
              Cancel
            </Button>
            <Button
              disabled={pendingEnd !== null && busyStore === pendingEnd.store}
              onClick={() => {
                const s = pendingEnd;
                setPendingEnd(null);
                if (s) updateActive(s.store, false);
              }}
            >
              End it
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

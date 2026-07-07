"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Trash2, Pencil } from "lucide-react";
import { toast } from "@takaki/go-design-system";
import { formatVND, formatDateWithYear } from "@/lib/format";
import { getCategoryColors } from "@/lib/category-colors";
import {
  Button,
  Card,
  DataTable,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  PageHeader,
  Tag,
} from "@takaki/go-design-system";

interface Transaction {
  id: string;
  store: string;
  amount: number;
  category: string;
  date: string;
}

interface Category {
  id: string;
  name: string;
}

interface UncategorizedStore {
  store: string;
  count: number;
  totalAmount: number;
  suggested: string | null;
  hint: string | null;
}

function CategoryBadge({ category }: { category: string }) {
  if (category === "その他") return <Tag color="danger">未分類</Tag>;
  const { bg, border, text } = getCategoryColors(category);
  return (
    <Tag style={{ backgroundColor: bg, borderColor: border, color: text }}>
      {category}
    </Tag>
  );
}

function CategoryManagerDialog({
  open,
  onOpenChange,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onChanged: () => void;
}) {
  const [items, setItems] = useState<Category[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const data = (await fetch("/api/categories").then((r) =>
      r.json(),
    )) as Category[];
    setItems(data);
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) return;
    setBusy("__add__");
    const res = await fetch("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setBusy(null);
    if (res.status === 409) {
      toast.error("そのカテゴリは既に存在します");
      return;
    }
    if (!res.ok) {
      toast.error("追加に失敗しました");
      return;
    }
    toast.success(`「${name}」を追加しました`);
    setNewName("");
    load();
    onChanged();
  };

  const handleSaveRename = async (item: Category) => {
    const name = editName.trim();
    if (!name || name === item.name) {
      setEditingId(null);
      return;
    }
    setBusy(item.id);
    const res = await fetch(`/api/categories/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setBusy(null);
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: "" }));
      toast.error(error || "更新に失敗しました");
      return;
    }
    toast.success(`「${item.name}」→「${name}」に変更しました`);
    setEditingId(null);
    load();
    onChanged();
  };

  const handleDelete = async (item: Category) => {
    if (
      !window.confirm(
        `「${item.name}」を削除しますか？\nこのカテゴリの取引はすべて「その他」に戻されます。`,
      )
    )
      return;
    setBusy(item.id);
    const res = await fetch(`/api/categories/${item.id}`, { method: "DELETE" });
    setBusy(null);
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: "" }));
      toast.error(error || "削除に失敗しました");
      return;
    }
    toast.success(`「${item.name}」を削除しました`);
    load();
    onChanged();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 overflow-hidden">
        <DialogHeader className="px-6 py-5 border-b">
          <DialogTitle>カテゴリ管理</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto">
          {items
            .filter((item) => item.name !== "その他")
            .map((item) => {
            const isEditing = editingId === item.id;
            const isProtected = false;
            return (
              <div
                key={item.id}
                className="flex items-center gap-2 px-6 py-3 border-b last:border-0"
              >
                {isEditing ? (
                  <>
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSaveRename(item);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      autoFocus
                      className="flex-1 h-9"
                    />
                    <Button
                      size="sm"
                      onClick={() => handleSaveRename(item)}
                      disabled={busy === item.id}
                    >
                      保存
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditingId(null)}
                    >
                      ✕
                    </Button>
                  </>
                ) : (
                  <>
                    <CategoryBadge category={item.name} />
                    <span className="flex-1" />
                    {!isProtected && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setEditingId(item.id);
                            setEditName(item.name);
                          }}
                          aria-label="編集"
                        >
                          <Pencil size={14} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(item)}
                          disabled={busy === item.id}
                          aria-label="削除"
                          style={{ color: "var(--color-danger)" }}
                        >
                          <Trash2 size={14} />
                        </Button>
                      </>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-2 px-6 py-4 border-t bg-muted/30">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAdd();
            }}
            placeholder="新しいカテゴリ名..."
            className="flex-1 h-9"
          />
          <Button
            size="sm"
            onClick={handleAdd}
            disabled={!newName.trim() || busy === "__add__"}
          >
            追加
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCategory, setEditCategory] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [uncategorizedStores, setUncategorizedStores] = useState<
    UncategorizedStore[]
  >([]);
  const [uncategorizedCount, setUncategorizedCount] = useState<number | null>(
    null,
  );
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewSelections, setReviewSelections] = useState<
    Record<string, string>
  >({});
  const [applyingStore, setApplyingStore] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [bulkCategory, setBulkCategory] = useState("");
  const [bulkApplying, setBulkApplying] = useState(false);

  const fetchCategories = useCallback(() => {
    fetch("/api/categories")
      .then((r) => r.json())
      .then((data) =>
        setCategories((data as { name: string }[]).map((c) => c.name)),
      );
  }, []);

  const fetchUncategorizedCount = useCallback(async () => {
    const res = await fetch("/api/transactions/uncategorized-count");
    const { count } = await res.json();
    setUncategorizedCount(count ?? 0);
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);
  useEffect(() => {
    fetchUncategorizedCount();
  }, [fetchUncategorizedCount]);

  const fetchTransactions = useCallback(async () => {
    const params = new URLSearchParams({ period: "all" });
    if (categoryFilter !== "all") params.set("category", categoryFilter);
    const res = await fetch(`/api/transactions?${params}`);
    setTransactions(await res.json());
  }, [categoryFilter]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  const fetchUncategorizedStores = useCallback(async () => {
    setReviewLoading(true);
    const data: UncategorizedStore[] = await fetch(
      "/api/transactions/uncategorized-stores",
    ).then((r) => r.json());
    setUncategorizedStores(data);
    setUncategorizedCount(data.length);
    const defaults: Record<string, string> = {};
    for (const s of data) {
      if (s.suggested) defaults[s.store] = s.suggested;
    }
    setReviewSelections(defaults);
    setReviewLoading(false);
  }, []);

  const handleApplyStore = async (store: string) => {
    const category = reviewSelections[store];
    if (!category) return;
    setApplyingStore(store);
    const { updated } = await fetch("/api/transactions/reclassify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ store, category }),
    }).then((r) => r.json());
    toast.success(`「${store}」の${updated}件を「${category}」に更新しました`);
    setApplyingStore(null);
    setUncategorizedStores((prev) => {
      const next = prev.filter((s) => s.store !== store);
      setUncategorizedCount(next.length);
      return next;
    });
    fetchTransactions();
    fetchCategories();
  };

  const handleSaveCategory = async (tx: Transaction) => {
    if (!editCategory || editCategory === tx.category) {
      setEditingId(null);
      return;
    }
    setSavingId(tx.id);
    await fetch(`/api/transactions/${tx.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: editCategory }),
    });
    toast.success("カテゴリを更新しました");
    setSavingId(null);
    setEditingId(null);
    fetchTransactions();
  };

  const handleBulkApply = async () => {
    if (!bulkCategory || !searchQuery.trim()) return;
    setBulkApplying(true);
    try {
      const res = await fetch("/api/transactions/reclassify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: searchQuery.trim(),
          category: bulkCategory,
        }),
      });
      const { updated, error } = await res.json();
      if (error) throw new Error(error);
      toast.success(
        `「${searchQuery}」を含む${updated}件を「${bulkCategory}」に変更しました`,
      );
      fetchTransactions();
      fetchCategories();
      fetchUncategorizedCount();
    } catch (e) {
      toast.error(
        `変更失敗: ${e instanceof Error ? e.message : "不明なエラー"}`,
      );
    } finally {
      setBulkApplying(false);
    }
  };

  const filteredTransactions = useMemo(
    () =>
      searchQuery.trim()
        ? transactions.filter((tx) =>
            tx.store.toLowerCase().includes(searchQuery.toLowerCase()),
          )
        : transactions,
    [transactions, searchQuery],
  );

  const columns = useMemo<ColumnDef<Transaction>[]>(
    () => [
      {
        id: "store",
        accessorKey: "store",
        header: "名前",
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
        header: "カテゴリ",
        cell: ({ row }) => {
          const tx = row.original;
          const isEditing = editingId === tx.id;
          if (isEditing) {
            return (
              <div className="flex items-center gap-2">
                <Select value={editCategory} onValueChange={setEditCategory}>
                  <SelectTrigger className="w-32 h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  onClick={() => handleSaveCategory(tx)}
                  disabled={savingId === tx.id}
                >
                  {savingId === tx.id ? "…" : "保存"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditingId(null)}
                >
                  ✕
                </Button>
              </div>
            );
          }
          return (
            <button
              type="button"
              onClick={() => {
                setEditingId(tx.id);
                setEditCategory(tx.category);
              }}
              className="cursor-pointer bg-transparent border-0 p-0"
            >
              <CategoryBadge category={tx.category} />
            </button>
          );
        },
      },
      {
        id: "date",
        accessorKey: "date",
        header: "日時",
        cell: ({ row }) => (
          <span className="text-sm text-foreground whitespace-nowrap">
            {formatDateWithYear(row.original.date)}
          </span>
        ),
      },
      {
        id: "amount",
        accessorKey: "amount",
        header: () => <div className="text-right pr-4">金額</div>,
        cell: ({ row }) => (
          <div className="text-right font-num text-sm text-foreground pr-4 min-w-[180px]">
            {formatVND(row.original.amount)}
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editingId, editCategory, savingId, categories],
  );

  // 初期取得中(null) または 0件 ならボタンを出さない（リロード時のチラ見え対策）
  const showReviewButton =
    uncategorizedCount !== null && uncategorizedCount > 0;

  return (
    <div>
      <PageHeader
        title="トランザクション"
        actions={
          showReviewButton ? (
            <Button
              variant="outline"
              size="sm"
              onClick={fetchUncategorizedStores}
              disabled={reviewLoading}
              style={
                uncategorizedCount && uncategorizedCount > 0
                  ? {
                      borderColor: "var(--color-warning)",
                      color: "var(--color-warning)",
                      backgroundColor: "var(--color-warning-subtle)",
                    }
                  : undefined
              }
            >
              {reviewLoading
                ? "読込中..."
                : `要確認リスト${uncategorizedCount ? `（${uncategorizedCount}）` : ""}`}
            </Button>
          ) : null
        }
      />

      {/* 要確認ストア */}
      {uncategorizedStores.length > 0 && (
        <Card
          className="mt-6 mb-6"
          style={{
            border: "1px solid var(--color-warning)",
            background: "var(--color-warning-subtle)",
          }}
        >
          <div
            className="px-6 py-4 border-b"
            style={{ borderColor: "var(--color-warning)" }}
          >
            <p
              className="text-xs font-medium uppercase tracking-widest"
              style={{ color: "var(--color-warning)" }}
            >
              ⚠ 要確認ストア（{uncategorizedStores.length}件）
            </p>
          </div>
          {uncategorizedStores.map((s) => (
            <div
              key={s.store}
              className="flex items-center gap-3 px-6 py-3 border-b last:border-0"
              style={{ borderColor: "var(--color-warning)" }}
            >
              <div className="flex-1 min-w-0">
                <p
                  className="text-sm font-medium truncate"
                  style={{ color: "var(--kg-text)" }}
                >
                  {s.store}
                </p>
                <p className="text-sm text-muted-foreground">
                  {s.count}件 · {formatVND(s.totalAmount)}
                </p>
              </div>
              {s.hint && (
                <span
                  className="text-sm px-2 py-1 rounded-full whitespace-nowrap"
                  style={{
                    backgroundColor: "var(--color-warning-subtle)",
                    color: "var(--color-warning)",
                  }}
                >
                  {s.hint}
                </span>
              )}
              <Select
                value={reviewSelections[s.store] || undefined}
                onValueChange={(val) =>
                  setReviewSelections((prev) => ({ ...prev, [s.store]: val }))
                }
              >
                <SelectTrigger className="w-36">
                  <SelectValue placeholder="カテゴリ選択" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                onClick={() => handleApplyStore(s.store)}
                disabled={
                  !reviewSelections[s.store] || applyingStore === s.store
                }
              >
                {applyingStore === s.store ? "適用中..." : "全件適用"}
              </Button>
            </div>
          ))}
        </Card>
      )}

      {/* 検索 + カテゴリフィルタ + カテゴリ管理 */}
      <div className="flex items-center gap-3 mt-6 mb-4">
        <div className="relative flex-1" style={{ maxWidth: 320 }}>
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground"
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <Input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="名前で検索"
            className="pl-9"
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">カテゴリ</SelectItem>
            {categories.map((cat) => (
              <SelectItem key={cat} value={cat}>
                {cat}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 一括カテゴリ変更バナー */}
      {searchQuery.trim() && filteredTransactions.length > 0 && (
        <div
          className="flex items-center gap-3 px-5 py-3 mb-4 rounded-md"
          style={{
            backgroundColor: "var(--color-success-subtle)",
            border: "1px solid var(--color-success)",
          }}
        >
          <p className="text-sm flex-1 text-muted-foreground">
            <span className="font-medium text-foreground">
              「{searchQuery}」
            </span>
            を含む{filteredTransactions.length}件を一括変更:
          </p>
          <Select
            value={bulkCategory || undefined}
            onValueChange={setBulkCategory}
          >
            <SelectTrigger className="w-40">
              <SelectValue placeholder="カテゴリ選択" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {cat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            onClick={handleBulkApply}
            disabled={!bulkCategory || bulkApplying}
          >
            {bulkApplying ? "変更中..." : "一括変更"}
          </Button>
        </div>
      )}

      {/* 件数 */}
      <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-3">
        {filteredTransactions.length.toLocaleString()}件
        {searchQuery.trim() ? ` — 「${searchQuery}」で絞り込み中` : ""}
      </p>

      <div className="kg-hide-pagesize">
        <DataTable
          columns={columns}
          data={filteredTransactions}
          searchable={false}
          pageSize={100}
          pageSizeOptions={[100]}
          emptyMessage={
            searchQuery.trim()
              ? `「${searchQuery}」に一致する取引はありません`
              : "取引データがありません"
          }
        />
      </div>
    </div>
  );
}

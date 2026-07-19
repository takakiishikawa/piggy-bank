"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { AlertTriangle, Trash2, Pencil } from "lucide-react";
import { toast } from "@takaki/go-design-system";
import { formatVND, formatDateWithYear } from "@/lib/format";
import { getCategoryColors } from "@/lib/category-colors";
import { getCategoryIcon } from "@/lib/category-icons";
import { FALLBACK_CATEGORY } from "@/lib/constants";
import { NoteTag } from "@/components/note-tag";
import { SpecialExpenseToggle } from "@/components/special-expense-toggle";
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
  Tag,
} from "@takaki/go-design-system";

interface Transaction {
  id: string;
  store: string;
  amount: number;
  category: string;
  date: string;
  reviewed: boolean;
  note: string | null;
  excluded_from_dashboard: boolean;
  special_entry_id: string | null;
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

function CategoryBadge({ category, reviewed }: { category: string; reviewed: boolean }) {
  if (category === FALLBACK_CATEGORY && !reviewed) return <Tag color="danger">Uncategorized</Tag>;
  const { bg, border, text } = getCategoryColors(category);
  const Icon = getCategoryIcon(category);
  return (
    <Tag style={{ backgroundColor: bg, borderColor: border, color: text }}>
      <Icon size={11} style={{ color: text }} />
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
      toast.error("That category already exists");
      return;
    }
    if (!res.ok) {
      toast.error("Failed to add");
      return;
    }
    toast.success(`Added "${name}"`);
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
      toast.error(error || "Failed to update");
      return;
    }
    toast.success(`Renamed "${item.name}" to "${name}"`);
    setEditingId(null);
    load();
    onChanged();
  };

  const handleDelete = async (item: Category) => {
    if (
      !window.confirm(
        `Delete "${item.name}"?\nAll transactions in this category will be moved back to "${FALLBACK_CATEGORY}".`,
      )
    )
      return;
    setBusy(item.id);
    const res = await fetch(`/api/categories/${item.id}`, { method: "DELETE" });
    setBusy(null);
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: "" }));
      toast.error(error || "Failed to delete");
      return;
    }
    toast.success(`Deleted "${item.name}"`);
    load();
    onChanged();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 overflow-hidden">
        <DialogHeader className="px-6 py-5 border-b">
          <DialogTitle>Manage Categories</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto">
          {items
            .filter((item) => item.name !== FALLBACK_CATEGORY)
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
                      Save
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
                    <CategoryBadge category={item.name} reviewed={true} />
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
                          aria-label="Edit"
                        >
                          <Pencil size={14} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(item)}
                          disabled={busy === item.id}
                          aria-label="Delete"
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
            placeholder="New category name..."
            className="flex-1 h-9"
          />
          <Button
            size="sm"
            onClick={handleAdd}
            disabled={!newName.trim() || busy === "__add__"}
          >
            Add
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
    toast.success(`Updated ${updated} transactions for "${store}" to "${category}"`);
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
    toast.success("Category updated");
    setSavingId(null);
    setEditingId(null);
    fetchTransactions();
  };

  const handleSaveNote = async (id: string, note: string | null) => {
    setTransactions((prev) =>
      prev.map((tx) => (tx.id === id ? { ...tx, note } : tx)),
    );
    await fetch(`/api/transactions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note }),
    });
  };

  const handleToggleSpecialExpense = async (id: string, next: boolean) => {
    const res = await fetch(`/api/transactions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ specialExpense: next }),
    });
    if (!res.ok) {
      toast.error("Failed to save");
      return;
    }
    const updated = await res.json();
    setTransactions((prev) =>
      prev.map((tx) =>
        tx.id === id
          ? {
              ...tx,
              excluded_from_dashboard: updated.excluded_from_dashboard,
              special_entry_id: updated.special_entry_id,
            }
          : tx,
      ),
    );
    toast.success(
      next ? "Marked as special expense" : "Unmarked as special expense",
    );
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
        `Changed ${updated} transactions matching "${searchQuery}" to "${bulkCategory}"`,
      );
      fetchTransactions();
      fetchCategories();
      fetchUncategorizedCount();
    } catch (e) {
      toast.error(
        `Update failed: ${e instanceof Error ? e.message : "Unknown error"}`,
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
        cell: ({ row }) => {
          const tx = row.original;
          const isEditing = editingId === tx.id;
          if (isEditing) {
            return (
              <div className="flex items-center gap-2">
                <Select value={editCategory} onValueChange={setEditCategory}>
                  <SelectTrigger className="w-32 h-8 transition-colors hover:bg-muted/40 active:bg-muted/60">
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
                  {savingId === tx.id ? "…" : "Save"}
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
              className="cursor-pointer bg-transparent border-0 p-0 rounded-full transition-transform hover:opacity-80 hover:scale-105 active:scale-95"
            >
              <CategoryBadge category={tx.category} reviewed={tx.reviewed} />
            </button>
          );
        },
      },
      {
        id: "note",
        header: "Note",
        cell: ({ row }) => (
          <div className="group flex items-center gap-2 min-w-[160px]">
            <NoteTag
              value={row.original.note}
              onSave={(v) => handleSaveNote(row.original.id, v)}
            />
            <SpecialExpenseToggle
              active={row.original.special_entry_id !== null}
              onToggle={(v) => handleToggleSpecialExpense(row.original.id, v)}
            />
          </div>
        ),
      },
      {
        id: "date",
        accessorKey: "date",
        header: "Date",
        cell: ({ row }) => (
          <span className="text-sm text-foreground whitespace-nowrap">
            {formatDateWithYear(row.original.date)}
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
              className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-widest"
              style={{ color: "var(--color-warning)" }}
            >
              <AlertTriangle size={13} />
              Needs Review ({uncategorizedStores.length})
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
                  {s.count} tx · {formatVND(s.totalAmount)}
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
                <SelectTrigger className="w-36 transition-colors hover:bg-muted/40 active:bg-muted/60">
                  <SelectValue placeholder="Choose category" />
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
                {applyingStore === s.store ? "Applying..." : "Apply to all"}
              </Button>
            </div>
          ))}
        </Card>
      )}

      {/* 検索 + カテゴリフィルタ */}
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
            placeholder="Search by name"
            className="pl-9"
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-44 transition-colors hover:bg-muted/40 active:bg-muted/60">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Category</SelectItem>
            {categories.map((cat) => (
              <SelectItem key={cat} value={cat}>
                {cat}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {showReviewButton && (
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={fetchUncategorizedStores}
            disabled={reviewLoading}
            style={
              uncategorizedCount && uncategorizedCount > 0
                ? { color: "var(--color-warning)" }
                : undefined
            }
          >
            {uncategorizedCount && uncategorizedCount > 0 ? <AlertTriangle size={13} /> : null}
            {reviewLoading
              ? "Loading..."
              : `Needs Review${uncategorizedCount ? ` (${uncategorizedCount})` : ""}`}
          </Button>
        )}
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
            Bulk change {filteredTransactions.length} matching{" "}
            <span className="font-medium text-foreground">
              "{searchQuery}"
            </span>
            :
          </p>
          <Select
            value={bulkCategory || undefined}
            onValueChange={setBulkCategory}
          >
            <SelectTrigger className="w-40 transition-colors hover:bg-muted/40 active:bg-muted/60">
              <SelectValue placeholder="Choose category" />
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
            {bulkApplying ? "Updating..." : "Apply to all"}
          </Button>
        </div>
      )}

      {/* 件数 */}
      <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-3">
        {filteredTransactions.length.toLocaleString()} transactions
        {searchQuery.trim() ? ` — filtered by "${searchQuery}"` : ""}
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
              ? `No transactions match "${searchQuery}"`
              : "No transactions yet"
          }
        />
      </div>
    </div>
  );
}

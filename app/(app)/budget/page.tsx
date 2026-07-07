"use client";

import { useEffect, useState, useCallback } from "react";
import { Pencil, Trash2, Plus, Check, X } from "lucide-react";
import { toast } from "@takaki/go-design-system";
import { formatVND } from "@/lib/format";
import { getCategoryColors } from "@/lib/category-colors";
import {
  Button,
  Card,
  Input,
  PageHeader,
} from "@takaki/go-design-system";

interface Category {
  id: string;
  name: string;
  budget: number;
  is_fixed: boolean;
}

function CategoryDot({ name }: { name: string }) {
  const { bg, border } = getCategoryColors(name);
  return (
    <span
      className="inline-block w-3 h-3 rounded-full shrink-0"
      style={{ backgroundColor: bg, borderColor: border, border: "1px solid" }}
    />
  );
}

function CategoryRow({
  cat,
  onUpdate,
  onDelete,
}: {
  cat: Category;
  onUpdate: (id: string, patch: Partial<Pick<Category, "name" | "budget" | "is_fixed">>) => Promise<void>;
  onDelete: (id: string, name: string) => Promise<void>;
}) {
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(cat.name);
  const [budgetInput, setBudgetInput] = useState(String(cat.budget));
  const [saving, setSaving] = useState(false);

  const saveName = async () => {
    const trimmed = nameInput.trim();
    if (!trimmed || trimmed === cat.name) {
      setEditingName(false);
      setNameInput(cat.name);
      return;
    }
    setSaving(true);
    await onUpdate(cat.id, { name: trimmed });
    setSaving(false);
    setEditingName(false);
  };

  const saveBudget = async () => {
    const val = parseInt(budgetInput.replace(/[^0-9]/g, ""), 10);
    const budget = isNaN(val) ? 0 : val;
    if (budget === cat.budget) return;
    setSaving(true);
    await onUpdate(cat.id, { budget });
    setSaving(false);
  };

  const toggleFixed = async () => {
    setSaving(true);
    await onUpdate(cat.id, { is_fixed: !cat.is_fixed });
    setSaving(false);
  };

  return (
    <div className="flex items-center gap-3 px-5 py-3.5 border-b last:border-0">
      <CategoryDot name={cat.name} />

      {editingName ? (
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Input
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveName();
              if (e.key === "Escape") {
                setEditingName(false);
                setNameInput(cat.name);
              }
            }}
            className="h-7 text-sm flex-1"
            autoFocus
          />
          <button
            type="button"
            onClick={saveName}
            disabled={saving}
            className="p-1 rounded hover:bg-muted/60 transition-colors text-muted-foreground hover:text-foreground"
          >
            <Check size={14} />
          </button>
          <button
            type="button"
            onClick={() => {
              setEditingName(false);
              setNameInput(cat.name);
            }}
            className="p-1 rounded hover:bg-muted/60 transition-colors text-muted-foreground hover:text-foreground"
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-sm font-medium text-foreground truncate">
            {cat.name}
          </span>
          <button
            type="button"
            onClick={() => setEditingName(true)}
            className="p-1 rounded hover:bg-muted/60 transition-colors text-muted-foreground opacity-0 group-hover:opacity-100"
          >
            <Pencil size={12} />
          </button>
        </div>
      )}

      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={toggleFixed}
          disabled={saving}
          className="text-xs px-2 py-1 rounded border transition-colors"
          style={
            cat.is_fixed
              ? {
                  backgroundColor: "var(--color-primary-subtle, #e8f5e9)",
                  borderColor: "var(--color-primary)",
                  color: "var(--color-primary)",
                }
              : {
                  backgroundColor: "transparent",
                  borderColor: "var(--border)",
                  color: "var(--muted-foreground)",
                }
          }
        >
          {cat.is_fixed ? "固定費" : "変動費"}
        </button>

        <div className="relative">
          <Input
            type="text"
            inputMode="numeric"
            value={budgetInput}
            onChange={(e) => setBudgetInput(e.target.value.replace(/[^0-9]/g, ""))}
            onBlur={saveBudget}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                (e.target as HTMLInputElement).blur();
              }
            }}
            className="h-7 text-sm text-right w-36 font-num"
            placeholder="0"
          />
        </div>
        <span className="text-xs text-muted-foreground w-8">VND</span>

        <button
          type="button"
          onClick={() => onDelete(cat.id, cat.name)}
          disabled={saving}
          className="p-1 rounded hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

function AddCategoryRow({
  isFixed,
  onAdd,
}: {
  isFixed: boolean;
  onAdd: (name: string, budget: number, is_fixed: boolean) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [budget, setBudget] = useState("");
  const [saving, setSaving] = useState(false);

  const handleAdd = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const budgetVal = parseInt(budget.replace(/[^0-9]/g, ""), 10);
    setSaving(true);
    await onAdd(trimmed, isNaN(budgetVal) ? 0 : budgetVal, isFixed);
    setSaving(false);
    setName("");
    setBudget("");
    setOpen(false);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-5 py-3 text-sm text-muted-foreground hover:text-foreground transition-colors w-full"
      >
        <Plus size={14} />
        カテゴリを追加
      </button>
    );
  }

  return (
    <div className="flex items-center gap-3 px-5 py-3.5 border-t">
      <span className="inline-block w-3 h-3 rounded-full bg-muted shrink-0" />
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleAdd();
          if (e.key === "Escape") setOpen(false);
        }}
        placeholder="カテゴリ名"
        className="h-7 text-sm flex-1"
        autoFocus
      />
      <Input
        type="text"
        inputMode="numeric"
        value={budget}
        onChange={(e) => setBudget(e.target.value.replace(/[^0-9]/g, ""))}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleAdd();
        }}
        placeholder="予算（VND）"
        className="h-7 text-sm text-right w-36 font-num"
      />
      <span className="text-xs text-muted-foreground w-8">VND</span>
      <Button size="sm" onClick={handleAdd} disabled={saving || !name.trim()}>
        追加
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          setOpen(false);
          setName("");
          setBudget("");
        }}
      >
        キャンセル
      </Button>
    </div>
  );
}

function SectionCard({
  title,
  categories,
  totalBudget,
  onUpdate,
  onDelete,
  onAdd,
}: {
  title: string;
  categories: Category[];
  totalBudget: number;
  onUpdate: (id: string, patch: Partial<Pick<Category, "name" | "budget" | "is_fixed">>) => Promise<void>;
  onDelete: (id: string, name: string) => Promise<void>;
  onAdd: (name: string, budget: number, is_fixed: boolean) => Promise<void>;
}) {
  const isFixed = title === "固定費";
  return (
    <Card className="overflow-hidden mb-6">
      <div className="flex items-center justify-between px-5 py-4 border-b bg-muted/30">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          <span className="text-xs text-muted-foreground">
            {categories.length}カテゴリ
          </span>
        </div>
        {totalBudget > 0 && (
          <span className="text-sm font-num text-muted-foreground">
            合計予算 {formatVND(totalBudget)}
          </span>
        )}
      </div>

      <div className="group">
        {categories.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted-foreground text-center">
            まだカテゴリがありません
          </p>
        ) : (
          categories.map((cat) => (
            <div key={cat.id} className="group">
              <CategoryRow
                cat={cat}
                onUpdate={onUpdate}
                onDelete={onDelete}
              />
            </div>
          ))
        )}
      </div>

      <AddCategoryRow isFixed={isFixed} onAdd={onAdd} />
    </Card>
  );
}

export default function BudgetPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await fetch("/api/categories");
    if (!res.ok) return;
    const data = (await res.json()) as Category[];
    setCategories(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleUpdate = useCallback(
    async (id: string, patch: Partial<Pick<Category, "name" | "budget" | "is_fixed">>) => {
      const res = await fetch(`/api/categories/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (res.status === 409) {
        toast.error("そのカテゴリ名は既に存在します");
        return;
      }
      if (!res.ok) {
        toast.error("更新に失敗しました");
        return;
      }
      setCategories((prev) =>
        prev.map((c) => (c.id === id ? { ...c, ...patch } : c)),
      );
    },
    [],
  );

  const handleDelete = useCallback(async (id: string, name: string) => {
    const confirmed = window.confirm(
      `「${name}」を削除します。このカテゴリの取引は「その他」に移動されます。`,
    );
    if (!confirmed) return;
    const res = await fetch(`/api/categories/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("削除に失敗しました");
      return;
    }
    setCategories((prev) => prev.filter((c) => c.id !== id));
    toast.success(`「${name}」を削除しました`);
  }, []);

  const handleAdd = useCallback(
    async (name: string, budget: number, is_fixed: boolean) => {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, budget, is_fixed }),
      });
      if (res.status === 409) {
        toast.error("そのカテゴリは既に存在します");
        return;
      }
      if (!res.ok) {
        toast.error("追加に失敗しました");
        return;
      }
      const newCat = (await res.json()) as Category;
      setCategories((prev) => [...prev, newCat]);
      toast.success(`「${name}」を追加しました`);
    },
    [],
  );

  const variable = categories.filter((c) => !c.is_fixed);
  const fixed = categories.filter((c) => c.is_fixed);
  const variableBudgetTotal = variable.reduce((s, c) => s + c.budget, 0);
  const fixedBudgetTotal = fixed.reduce((s, c) => s + c.budget, 0);

  if (loading) {
    return (
      <div>
        <PageHeader title="予算・カテゴリ" />
        <div className="mt-8 text-sm text-muted-foreground text-center py-12">
          読み込み中...
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="予算・カテゴリ" />

      <div className="mt-8">
        <SectionCard
          title="変動費"
          categories={variable}
          totalBudget={variableBudgetTotal}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
          onAdd={handleAdd}
        />

        <SectionCard
          title="固定費"
          categories={fixed}
          totalBudget={fixedBudgetTotal}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
          onAdd={handleAdd}
        />
      </div>
    </div>
  );
}

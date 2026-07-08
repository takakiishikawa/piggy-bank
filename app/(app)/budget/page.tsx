"use client";

import { useEffect, useState, useCallback } from "react";
import { Pencil, Trash2, Plus, Check, X } from "lucide-react";
import { toast } from "@takaki/go-design-system";
import { formatVND } from "@/lib/format";
import { getCategoryColors } from "@/lib/category-colors";
import { getCategoryIcon } from "@/lib/category-icons";
import {
  Button,
  Card,
  Input,
} from "@takaki/go-design-system";

interface Category {
  id: string;
  name: string;
  budget: number;
  is_fixed: boolean;
}

function CategoryIcon({ name }: { name: string }) {
  const { text } = getCategoryColors(name);
  const Icon = getCategoryIcon(name);
  return <Icon size={15} style={{ color: text }} className="shrink-0" />;
}

function CategoryCard({
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
    <Card className="px-4 py-3">
      {/* 1行レイアウト: ドット + 名前 + フラグ + 予算 + 操作ボタン */}
      <div className="flex items-center gap-2">
        <CategoryIcon name={cat.name} />
        {editingName ? (
          <>
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
              className="h-7 text-sm flex-1 min-w-0"
              autoFocus
            />
            <button
              type="button"
              onClick={saveName}
              disabled={saving}
              className="p-1 rounded hover:bg-muted/60 transition-colors text-muted-foreground hover:text-foreground shrink-0"
            >
              <Check size={13} />
            </button>
            <button
              type="button"
              onClick={() => {
                setEditingName(false);
                setNameInput(cat.name);
              }}
              className="p-1 rounded hover:bg-muted/60 transition-colors text-muted-foreground hover:text-foreground shrink-0"
            >
              <X size={13} />
            </button>
          </>
        ) : (
          <>
            <span className="text-sm font-medium text-foreground truncate min-w-0 flex-1">
              {cat.name}
            </span>
            <button
              type="button"
              onClick={toggleFixed}
              disabled={saving}
              className="text-xs px-1.5 py-0.5 rounded border transition-colors shrink-0"
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
              {cat.is_fixed ? "F" : "V"}
            </button>
            <Input
              type="text"
              inputMode="numeric"
              value={budgetInput.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}
              onChange={(e) => setBudgetInput(e.target.value.replace(/[^0-9]/g, ""))}
              onBlur={saveBudget}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
              className="h-7 text-xs text-right w-28 shrink-0 font-num"
              placeholder="0"
            />
            <button
              type="button"
              onClick={() => setEditingName(true)}
              className="p-1 rounded hover:bg-muted/60 transition-colors text-muted-foreground hover:text-foreground shrink-0"
            >
              <Pencil size={13} />
            </button>
            <button
              type="button"
              onClick={() => onDelete(cat.id, cat.name)}
              disabled={saving}
              className="p-1 rounded hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive shrink-0"
            >
              <Trash2 size={13} />
            </button>
          </>
        )}
      </div>
    </Card>
  );
}

function AddCategoryCard({
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
        className="flex items-center justify-center gap-2 h-full min-h-[88px] w-full rounded-lg border border-dashed text-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
      >
        <Plus size={14} />
        Add category
      </button>
    );
  }

  return (
    <Card className="p-4 flex flex-col gap-3">
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleAdd();
          if (e.key === "Escape") setOpen(false);
        }}
        placeholder="Category name"
        className="h-7 text-sm"
        autoFocus
      />
      <div className="flex items-center gap-2">
        <Input
          type="text"
          inputMode="numeric"
          value={budget.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}
          onChange={(e) => setBudget(e.target.value.replace(/[^0-9]/g, ""))}
          onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
          placeholder="Budget (VND)"
          className="h-7 text-sm text-right flex-1 font-num"
        />
        <span className="text-xs text-muted-foreground shrink-0">VND</span>
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={handleAdd} disabled={saving || !name.trim()} className="flex-1">
          Add
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => { setOpen(false); setName(""); setBudget(""); }}
        >
          ✕
        </Button>
      </div>
    </Card>
  );
}

function SectionGrid({
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
  const isFixed = title === "Fixed Costs";
  const sorted = [...categories].sort((a, b) => b.budget - a.budget);

  return (
    <div className="mb-8">
      <div
        className="flex items-center justify-between px-4 py-3 rounded-lg mb-4"
        style={{ backgroundColor: "var(--muted)" }}
      >
        <div className="flex items-center gap-2">
          <h2 className="text-base font-bold text-foreground">{title}</h2>
          <span className="text-xs text-muted-foreground">
            {categories.length} {categories.length === 1 ? "category" : "categories"}
          </span>
        </div>
        {totalBudget > 0 && (
          <span className="font-num font-semibold text-base text-foreground">
            {formatVND(totalBudget)}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {sorted.map((cat) => (
          <CategoryCard
            key={cat.id}
            cat={cat}
            onUpdate={onUpdate}
            onDelete={onDelete}
          />
        ))}
        <AddCategoryCard isFixed={isFixed} onAdd={onAdd} />
      </div>
    </div>
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
        toast.error("That category name already exists");
        return;
      }
      if (!res.ok) {
        toast.error("Failed to update");
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
      `Delete "${name}"? Transactions in this category will be moved to "Other".`,
    );
    if (!confirmed) return;
    const res = await fetch(`/api/categories/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Failed to delete");
      return;
    }
    setCategories((prev) => prev.filter((c) => c.id !== id));
    toast.success(`Deleted "${name}"`);
  }, []);

  const handleAdd = useCallback(
    async (name: string, budget: number, is_fixed: boolean) => {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, budget, is_fixed }),
      });
      if (res.status === 409) {
        toast.error("That category already exists");
        return;
      }
      if (!res.ok) {
        toast.error("Failed to add");
        return;
      }
      const newCat = (await res.json()) as Category;
      setCategories((prev) => [...prev, newCat]);
      toast.success(`Added "${name}"`);
    },
    [],
  );

  const variable = categories.filter((c) => !c.is_fixed);
  const fixed = categories.filter((c) => c.is_fixed);
  const variableBudgetTotal = variable.reduce((s, c) => s + c.budget, 0);
  const fixedBudgetTotal = fixed.reduce((s, c) => s + c.budget, 0);
  const grandTotal = variableBudgetTotal + fixedBudgetTotal;

  if (loading) {
    return (
      <div>
        <div className="mt-8 text-sm text-muted-foreground text-center py-12">
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* 月次合計予算サマリ */}
      {grandTotal > 0 && (
        <Card className="mt-6 mb-8 p-6">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-2">
            Total Monthly Budget
          </p>
          <p className="font-num text-4xl font-bold text-foreground leading-none mb-4">
            {formatVND(grandTotal)}
          </p>
          <div className="flex gap-6 text-sm">
            <div>
              <span className="text-muted-foreground">Variable</span>
              <span className="font-num font-semibold text-foreground ml-2">
                {formatVND(variableBudgetTotal)}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Fixed</span>
              <span className="font-num font-semibold text-foreground ml-2">
                {formatVND(fixedBudgetTotal)}
              </span>
            </div>
          </div>
        </Card>
      )}

      <div className="mt-2">
        <SectionGrid
          title="Variable Costs"
          categories={variable}
          totalBudget={variableBudgetTotal}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
          onAdd={handleAdd}
        />

        <SectionGrid
          title="Fixed Costs"
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

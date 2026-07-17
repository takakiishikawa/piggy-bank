"use client";

import { useEffect, useState, useCallback } from "react";
import { Pencil, Trash2, Plus, Check, X } from "lucide-react";
import { toast } from "@takaki/go-design-system";
import { formatVND } from "@/lib/format";
import { getCategoryColors, getCategoryColorTint } from "@/lib/category-colors";
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

function CategoryIcon({ name, fixed }: { name: string; fixed?: boolean }) {
  const { text } = getCategoryColors(name);
  const Icon = getCategoryIcon(name);
  return <Icon size={14} style={{ color: fixed ? "#6B5D45" : text }} className="shrink-0" />;
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

  return (
    <div
      className="flex items-center gap-2.5 rounded-xl border py-3 px-3.5"
      style={{ borderColor: "var(--color-border-default)", backgroundColor: "var(--color-surface-subtle)" }}
    >
      <div
        className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg"
        style={{ backgroundColor: cat.is_fixed ? "var(--kg-track)" : getCategoryColorTint(cat.name) }}
      >
        <CategoryIcon name={cat.name} fixed={cat.is_fixed} />
      </div>
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
            className="p-1 rounded transition-all hover:bg-muted active:scale-90 active:bg-muted/70 disabled:pointer-events-none disabled:opacity-50 shrink-0"
            style={{ color: "var(--color-text-subtle)" }}
          >
            <Check size={13} />
          </button>
          <button
            type="button"
            onClick={() => {
              setEditingName(false);
              setNameInput(cat.name);
            }}
            className="p-1 rounded transition-all hover:bg-muted active:scale-90 active:bg-muted/70 disabled:pointer-events-none disabled:opacity-50 shrink-0"
            style={{ color: "var(--color-text-subtle)" }}
          >
            <X size={13} />
          </button>
        </>
      ) : (
        <>
          <span
            className="text-[13.5px] font-semibold truncate min-w-0 flex-1"
            style={{ color: "var(--color-text-primary)" }}
          >
            {cat.name}
          </span>
          <Input
            type="text"
            inputMode="numeric"
            value={budgetInput.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}
            onChange={(e) => setBudgetInput(e.target.value.replace(/[^0-9]/g, ""))}
            onBlur={saveBudget}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            className="h-8 text-[12.5px] text-right w-28 shrink-0 font-num rounded-lg"
            style={{ borderColor: "var(--color-border-default)" }}
            placeholder="0"
          />
          <button
            type="button"
            onClick={() => setEditingName(true)}
            className="p-1 rounded transition-all hover:bg-muted active:scale-90 active:bg-muted/70 disabled:pointer-events-none disabled:opacity-50 shrink-0"
            style={{ color: "var(--color-text-subtle)" }}
          >
            <Pencil size={14} />
          </button>
          <button
            type="button"
            onClick={() => onDelete(cat.id, cat.name)}
            disabled={saving}
            className="p-1 rounded transition-all hover:bg-muted active:scale-90 active:bg-muted/70 disabled:pointer-events-none disabled:opacity-50 shrink-0"
            style={{ color: "var(--color-text-subtle)" }}
          >
            <Trash2 size={14} />
          </button>
        </>
      )}
    </div>
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
        className="flex items-center justify-center gap-2 h-full min-h-[52px] w-full rounded-[10px] border-[1.5px] border-dashed text-sm font-semibold transition-all hover:opacity-80 hover:bg-muted/30 active:scale-[0.98] active:opacity-70"
        style={{ borderColor: "var(--color-border-default)", color: "var(--color-text-subtle)" }}
      >
        <Plus size={15} />
        Add category
      </button>
    );
  }

  return (
    <Card className="p-4 flex flex-col gap-3" style={{ borderColor: "var(--color-border-default)" }}>
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
        <span className="text-xs shrink-0" style={{ color: "var(--color-text-secondary)" }}>VND</span>
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
    <Card
      className="rounded-2xl overflow-hidden mb-6 p-0"
      style={{
        borderColor: "var(--color-border-default)",
        boxShadow: "0 1px 2px rgba(120,72,10,.04), 0 8px 24px rgba(120,72,10,.05)",
      }}
    >
      <div
        className="flex items-center justify-between px-7 py-5 border-b"
        style={{ borderColor: "var(--color-border-default)" }}
      >
        <span className="font-display text-[17px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
          {title}{" "}
          <span className="text-[13px] font-normal" style={{ color: "var(--color-text-subtle)" }}>
            {categories.length} {categories.length === 1 ? "category" : "categories"}
          </span>
        </span>
        {totalBudget > 0 && (
          <span className="font-num font-bold text-[15px]" style={{ color: "var(--color-text-primary)" }}>
            {formatVND(totalBudget)}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 p-5">
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
        <div className="mt-8 text-sm text-center py-12" style={{ color: "var(--color-text-secondary)" }}>
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div>
      {grandTotal > 0 && (
        <Card
          className="mt-8 mb-6 p-7 rounded-2xl"
          style={{
            borderColor: "var(--color-border-default)",
            boxShadow: "0 1px 2px rgba(120,72,10,.04), 0 8px 24px rgba(120,72,10,.05)",
          }}
        >
          <p className="text-xs font-semibold uppercase tracking-[0.06em] mb-2.5" style={{ color: "var(--color-text-subtle)" }}>
            Total Monthly Budget
          </p>
          <p className="font-display text-[44px] font-bold leading-none mb-4" style={{ color: "var(--color-text-primary)" }}>
            {formatVND(grandTotal)}
          </p>
          <div className="flex gap-7 text-sm">
            <div style={{ color: "var(--color-text-secondary)" }}>
              Variable{" "}
              <b className="font-num font-bold" style={{ color: "var(--color-text-primary)" }}>
                {formatVND(variableBudgetTotal)}
              </b>
            </div>
            <div style={{ color: "var(--color-text-secondary)" }}>
              Fixed{" "}
              <b className="font-num font-bold" style={{ color: "var(--color-text-primary)" }}>
                {formatVND(fixedBudgetTotal)}
              </b>
            </div>
          </div>
        </Card>
      )}

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
  );
}

"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { AlertTriangle, ChevronDown, Plus, Trash2, MessageSquare, CheckSquare, TrendingUp, TrendingDown } from "lucide-react";
import { formatJPY, formatVND } from "@/lib/format";
import type { SimulationMonth, SpecialEntry } from "@/lib/simulation";
import { NoteTag } from "@/components/note-tag";
import {
  Button,
  Card,
  Checkbox,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
  Textarea,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Progress,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  Skeleton,
  Tag,
  toast,
} from "@takaki/go-design-system";

interface SimulationData {
  year: number;
  vndPerJpy: number;
  months: SimulationMonth[];
  annualIncome: number;
  annualExpense: number;
  annualSpecialExpense: number;
  annualRemaining: number;
  yearEndProjection: number;
}

type DisplayCurrency = "JPY" | "VND";

const YEAR_OPTIONS = [2025, 2026, 2027];
const CARD_SHADOW = "0 1px 2px rgba(120,72,10,.04), 0 8px 24px rgba(120,72,10,.05)";
const GRID_COLS = "0.95fr 0.78fr 0.78fr 0.78fr 0.78fr 0.78fr 0.9fr";

function digitsOnly(v: string): string {
  return v.replace(/[^0-9-]/g, "");
}

function withCommas(v: string): string {
  const neg = v.startsWith("-");
  const digits = v.replace(/-/g, "");
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return neg ? `-${grouped}` : grouped;
}

// Every amount in this page is stored/computed in JPY — this renders it in
// whichever currency the switch is set to, converting with the day's rate.
function makeFormatAmount(displayCurrency: DisplayCurrency, vndPerJpy: number) {
  return (jpyAmount: number) =>
    displayCurrency === "JPY" ? formatJPY(jpyAmount) : formatVND(jpyAmount * vndPerJpy);
}

function CurrencySwitch({
  value,
  onChange,
}: {
  value: DisplayCurrency;
  onChange: (v: DisplayCurrency) => void;
}) {
  return (
    <div className="flex rounded-[10px] overflow-hidden shrink-0" style={{ border: "1px solid var(--color-border-default)" }}>
      {(["JPY", "VND"] as const).map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className="px-3 h-[38px] text-sm font-semibold cursor-pointer transition-all hover:opacity-80 active:scale-95"
          style={{
            backgroundColor: value === c ? "var(--color-primary)" : "transparent",
            color: value === c ? "#fff" : "var(--color-text-secondary)",
          }}
        >
          {c === "JPY" ? "¥ JPY" : "₫ VND"}
        </button>
      ))}
    </div>
  );
}

// Income is stored/edited in JPY internally, but shown and typed in
// whichever currency the display switch is set to — converting on the way
// in and out — so it stays consistent with every other figure on the page.
function IncomeInput({
  value,
  displayCurrency,
  vndPerJpy,
  onSave,
}: {
  value: number;
  displayCurrency: DisplayCurrency;
  vndPerJpy: number;
  onSave: (jpyAmount: number) => void;
}) {
  const toDisplay = (jpy: number) =>
    displayCurrency === "JPY" ? Math.round(jpy) : Math.round(jpy * vndPerJpy);
  const toJpy = (displayAmount: number) =>
    displayCurrency === "JPY" ? displayAmount : displayAmount / vndPerJpy;

  const [text, setText] = useState(String(toDisplay(value)));
  const savedValueRef = useRef(value);

  useEffect(() => {
    setText(String(toDisplay(value)));
    savedValueRef.current = value;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, displayCurrency, vndPerJpy]);

  const commit = () => {
    const displayAmount = parseInt(digitsOnly(text), 10) || 0;
    const n = Math.round(toJpy(displayAmount));
    if (n !== savedValueRef.current) {
      savedValueRef.current = n;
      onSave(n);
    }
    setText(String(toDisplay(n)));
  };

  return (
    <Input
      type="text"
      inputMode="numeric"
      value={withCommas(text)}
      onChange={(e) => setText(digitsOnly(e.target.value))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      onClick={(e) => e.stopPropagation()}
      className="h-8 text-right font-num text-[13px] rounded-lg justify-self-end w-full"
      style={{ borderColor: "var(--color-border-default)", backgroundColor: "var(--color-surface-subtle)" }}
    />
  );
}

function MonthRow({
  m,
  formatAmount,
  displayCurrency,
  vndPerJpy,
  onUpdateIncome,
  onOpenEntries,
  onSaveNote,
}: {
  m: SimulationMonth;
  formatAmount: (jpyAmount: number) => string;
  displayCurrency: DisplayCurrency;
  vndPerJpy: number;
  onUpdateIncome: (month: string, jpyAmount: number) => void;
  onOpenEntries: (month: string, kind: "income" | "expense") => void;
  onSaveNote: (month: string, note: string | null) => void;
}) {
  const negative = m.hasRecord && m.cumulative < 0;

  return (
    <div
      className="group grid items-center px-7 py-3.5 border-b last:border-0"
      style={{
        gridTemplateColumns: GRID_COLS,
        gap: 8,
        borderColor: "var(--color-border-subtle)",
        backgroundColor: m.isCurrentMonth ? "#EAF6F4" : "transparent",
      }}
    >
      <span
        className="text-[14.5px] font-semibold flex items-center gap-2 min-w-0"
        style={{ color: m.isCurrentMonth ? "var(--color-primary-hover)" : "var(--color-text-primary)" }}
      >
        {m.label} {m.year}
        {m.isCurrentMonth && (
          <Tag
            className="text-[10.5px] font-bold px-2 py-0.5 shrink-0"
            style={{ backgroundColor: "var(--color-primary)", color: "#fff" }}
          >
            NOW
          </Tag>
        )}
        {m.hasRecord && (
          <NoteTag
            value={m.note}
            onSave={(v) => onSaveNote(m.month, v)}
            placeholder="e.g. Japan trip"
          />
        )}
      </span>
      {!m.hasRecord ? (
        <span className="col-span-6 text-right text-sm" style={{ color: "var(--color-text-secondary)" }}>
          No data
        </span>
      ) : (
        <>
          <IncomeInput
            value={m.regularIncome}
            displayCurrency={displayCurrency}
            vndPerJpy={vndPerJpy}
            onSave={(n) => onUpdateIncome(m.month, n)}
          />
          <button
            type="button"
            onClick={() => onOpenEntries(m.month, "income")}
            className="text-right text-sm font-num transition-all hover:opacity-70 active:scale-95 cursor-pointer"
            style={{ color: "var(--color-success)" }}
          >
            {formatAmount(m.income - m.regularIncome)}
          </button>
          <span
            className="text-right text-sm font-num"
            title={m.isCurrentMonth ? "This month's forecast" : m.isFuture ? "Total Monthly Budget" : "Actual VN spend"}
            style={{ color: m.expense > 0 ? "var(--color-text-secondary)" : "var(--color-text-subtle)" }}
          >
            {m.expense > 0 ? formatAmount(m.expense) : "—"}
          </span>
          <button
            type="button"
            onClick={() => onOpenEntries(m.month, "expense")}
            className="text-right text-sm font-num transition-all hover:opacity-70 active:scale-95 cursor-pointer"
            style={{ color: m.specialExpenseTotal > 0 ? "var(--color-danger)" : "var(--color-text-secondary)" }}
          >
            {m.specialExpenseTotal > 0 ? formatAmount(m.specialExpenseTotal) : "—"}
          </button>
          <span className="text-right text-sm font-num font-semibold" style={{ color: "var(--color-text-primary)" }}>
            {formatAmount(m.remaining)}
          </span>
          <span
            className="text-right font-num text-sm font-bold flex items-center justify-end gap-1.5"
            style={{ color: negative ? "var(--color-danger)" : "var(--color-text-primary)" }}
          >
            {negative && <AlertTriangle size={14} style={{ color: "var(--color-danger)" }} />}
            {formatAmount(m.cumulative)}
          </span>
        </>
      )}
    </div>
  );
}

function SpecialEntriesDialog({
  open,
  onOpenChange,
  month,
  kind,
  entries,
  formatAmount,
  vndPerJpy,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  month: string;
  kind: "income" | "expense";
  entries: SpecialEntry[];
  formatAmount: (jpyAmount: number) => string;
  vndPerJpy: number;
  onChanged: () => void;
}) {
  const [name, setName] = useState("");
  const [amountText, setAmountText] = useState("");
  const [currency, setCurrency] = useState<"JPY" | "VND">("JPY");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName("");
      setAmountText("");
      setCurrency("JPY");
    }
  }, [open]);

  const handleAdd = async () => {
    const amount = parseInt(digitsOnly(amountText), 10) || 0;
    if (!name.trim() || amount === 0) return;
    setSaving(true);
    const res = await fetch("/api/simulation/special-entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ month, kind, name: name.trim(), amount, currency }),
    });
    setSaving(false);
    if (!res.ok) {
      toast.error("Failed to save");
      return;
    }
    setName("");
    setAmountText("");
    onChanged();
  };

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/simulation/special-entries/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Failed to delete");
      return;
    }
    onChanged();
  };

  const title = kind === "income" ? "Special income" : "Special expense";
  const isExpense = kind === "expense";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{title} — {month}</DialogTitle>
        </DialogHeader>
        <div className="px-1 space-y-3">
          {isExpense && (
            <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
              Add a planned expense yourself, or mark a transaction as &quot;Special expense&quot; in Transactions to add one automatically.
            </p>
          )}
          {entries.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
              No entries yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {entries.map((e) => {
                const entryJpy = e.currency === "VND" ? e.amount / vndPerJpy : e.amount;
                return (
                  <li key={e.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0">
                      <span className="truncate block" style={{ color: "var(--color-text-primary)" }}>{e.name}</span>
                      <span className="text-[11px]" style={{ color: "var(--color-text-subtle)" }}>
                        Entered as {e.currency === "VND" ? formatVND(e.amount) : formatJPY(e.amount)}
                      </span>
                    </span>
                    <span className="flex items-center gap-3 shrink-0">
                      <span className="font-num font-semibold" style={{ color: "var(--color-text-primary)" }}>
                        {formatAmount(entryJpy)}
                      </span>
                      {e.source === "manual" ? (
                        <button
                          type="button"
                          onClick={() => handleDelete(e.id)}
                          className="text-xs font-medium cursor-pointer transition-all hover:opacity-70 active:scale-90"
                          style={{ color: "var(--color-danger)" }}
                        >
                          Remove
                        </button>
                      ) : (
                        <span className="text-[11px]" style={{ color: "var(--color-text-subtle)" }}>
                          From Transactions
                        </span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          <div
            className="flex items-center gap-2 pt-3"
            style={{ borderTop: "1px solid var(--color-border-subtle)" }}
          >
            <Input
              placeholder="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="flex-1"
            />
            <Input
              type="text"
              inputMode="numeric"
              placeholder="Amount"
              value={withCommas(amountText)}
              onChange={(e) => setAmountText(digitsOnly(e.target.value))}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAdd();
              }}
              className="w-24 font-num"
            />
            <div className="flex rounded-lg overflow-hidden shrink-0" style={{ border: "1px solid var(--color-border-default)" }}>
              {(["JPY", "VND"] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCurrency(c)}
                  className="px-2 h-9 text-xs font-semibold cursor-pointer transition-all hover:opacity-80 active:scale-95"
                  style={{
                    backgroundColor: currency === c ? "var(--color-primary)" : "transparent",
                    color: currency === c ? "#fff" : "var(--color-text-secondary)",
                  }}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button onClick={handleAdd} disabled={saving || !name.trim()}>
            Add
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface Thread {
  id: string;
  title: string;
  createdAt: string;
  noteCount: number;
  taskCount: number;
  openTaskCount: number;
}

interface Note {
  id: string;
  thread_id: string;
  body: string;
  created_at: string;
  updated_at: string;
}

interface SimTask {
  id: string;
  thread_id: string;
  title: string;
  start_date: string | null;
  done: boolean;
  created_at: string;
}

function formatNoteTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatTaskDate(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function NewThreadButton({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!title.trim()) return;
    setSaving(true);
    const res = await fetch("/api/simulation/threads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim() }),
    });
    setSaving(false);
    if (!res.ok) {
      toast.error("Failed to create thread");
      return;
    }
    setTitle("");
    setOpen(false);
    onCreated();
  };

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) setTitle("");
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1.5 h-[34px] px-3 rounded-full text-sm font-semibold cursor-pointer transition-all hover:bg-muted/40 active:scale-[0.96] active:bg-muted/60"
          style={{ border: "1px dashed var(--color-border-strong)", color: "var(--color-text-secondary)" }}
        >
          <Plus size={14} />
          New thread
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72">
        <div className="space-y-2">
          <Input
            placeholder="e.g. Debt repayment"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
            }}
            autoFocus
          />
          <Button className="w-full active:scale-[0.97]" onClick={handleCreate} disabled={saving || !title.trim()}>
            Create
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ThreadChips({
  threads,
  onOpen,
  onDelete,
}: {
  threads: Thread[] | null;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  if (!threads || threads.length === 0) return null;
  return (
    <>
      {threads.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onOpen(t.id)}
          title={t.title}
          className="group flex items-center gap-2 h-[34px] pl-3 pr-2 rounded-full text-sm font-semibold cursor-pointer transition-all hover:bg-muted/40 active:scale-[0.96] active:bg-muted/60"
          style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border-default)", color: "var(--color-text-primary)" }}
        >
          <span className="truncate max-w-[140px]">{t.title}</span>
          {t.noteCount > 0 && (
            <span className="flex items-center gap-0.5 text-[11px] font-bold" style={{ color: "var(--color-primary-hover)" }}>
              <MessageSquare size={11} />
              {t.noteCount}
            </span>
          )}
          {t.taskCount > 0 && (
            <span
              className="flex items-center gap-0.5 text-[11px] font-bold"
              style={{ color: t.openTaskCount > 0 ? "var(--color-warning)" : "var(--color-success)" }}
            >
              <CheckSquare size={11} />
              {t.openTaskCount}/{t.taskCount}
            </span>
          )}
          <span
            onClick={(e) => {
              e.stopPropagation();
              onDelete(t.id);
            }}
            className="opacity-0 group-hover:opacity-100 transition-all cursor-pointer p-0.5 hover:opacity-70 active:scale-90"
            style={{ color: "var(--color-text-subtle)" }}
          >
            <Trash2 size={12} />
          </span>
        </button>
      ))}
    </>
  );
}

// A note's first line acts as its title — bold/larger in both view and edit.
function splitNoteBody(body: string): { title: string; rest: string } {
  const idx = body.indexOf("\n");
  if (idx === -1) return { title: body, rest: "" };
  return { title: body.slice(0, idx), rest: body.slice(idx + 1) };
}

function joinNoteBody(title: string, rest: string): string {
  return rest.trim() ? `${title}\n${rest}` : title;
}

function ThreadDetailDialog({
  threadId,
  threadTitle,
  onOpenChange,
  onChanged,
}: {
  threadId: string;
  threadTitle: string;
  onOpenChange: (v: boolean) => void;
  onChanged: () => void;
}) {
  const [title, setTitle] = useState(threadTitle);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(threadTitle);

  const [notes, setNotes] = useState<Note[] | null>(null);
  const [newNoteTitle, setNewNoteTitle] = useState("");
  const [newNoteRest, setNewNoteRest] = useState("");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteTitle, setEditingNoteTitle] = useState("");
  const [editingNoteRest, setEditingNoteRest] = useState("");

  const [tasks, setTasks] = useState<SimTask[] | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDate, setNewTaskDate] = useState("");
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingTaskTitle, setEditingTaskTitle] = useState("");

  useEffect(() => {
    setTitle(threadTitle);
    setTitleDraft(threadTitle);
    setEditingTitle(false);
  }, [threadId, threadTitle]);

  const handleSaveTitle = async () => {
    const next = titleDraft.trim();
    if (!next || next === title) {
      setEditingTitle(false);
      setTitleDraft(title);
      return;
    }
    const res = await fetch(`/api/simulation/threads/${threadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: next }),
    });
    if (!res.ok) {
      toast.error("Failed to rename thread");
      return;
    }
    setTitle(next);
    setEditingTitle(false);
    onChanged();
  };

  const loadNotes = useCallback(async () => {
    const res = await fetch(`/api/simulation/threads/${threadId}/notes`);
    if (!res.ok) return;
    setNotes(await res.json());
  }, [threadId]);

  const loadTasks = useCallback(async () => {
    const res = await fetch(`/api/simulation/threads/${threadId}/tasks`);
    if (!res.ok) return;
    setTasks(await res.json());
  }, [threadId]);

  useEffect(() => {
    setNotes(null);
    setTasks(null);
    loadNotes();
    loadTasks();
  }, [threadId, loadNotes, loadTasks]);

  const handleAddNote = async () => {
    if (!newNoteTitle.trim()) return;
    const res = await fetch(`/api/simulation/threads/${threadId}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: joinNoteBody(newNoteTitle.trim(), newNoteRest) }),
    });
    if (!res.ok) {
      toast.error("Failed to save note");
      return;
    }
    setNewNoteTitle("");
    setNewNoteRest("");
    loadNotes();
    onChanged();
  };

  const startEditNote = (note: Note) => {
    const { title: t, rest } = splitNoteBody(note.body);
    setEditingNoteId(note.id);
    setEditingNoteTitle(t);
    setEditingNoteRest(rest);
  };

  const handleSaveNoteEdit = async () => {
    if (!editingNoteId || !editingNoteTitle.trim()) return;
    const res = await fetch(`/api/simulation/notes/${editingNoteId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: joinNoteBody(editingNoteTitle.trim(), editingNoteRest) }),
    });
    if (!res.ok) {
      toast.error("Failed to save note");
      return;
    }
    setEditingNoteId(null);
    loadNotes();
  };

  const handleDeleteNote = async (id: string) => {
    const res = await fetch(`/api/simulation/notes/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Failed to delete note");
      return;
    }
    loadNotes();
    onChanged();
  };

  const handleAddTask = async () => {
    if (!newTaskTitle.trim()) return;
    const res = await fetch(`/api/simulation/threads/${threadId}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newTaskTitle.trim(), startDate: newTaskDate || null }),
    });
    if (!res.ok) {
      toast.error("Failed to save task");
      return;
    }
    setNewTaskTitle("");
    setNewTaskDate("");
    loadTasks();
    onChanged();
  };

  const handleToggleDone = async (task: SimTask) => {
    const res = await fetch(`/api/simulation/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done: !task.done }),
    });
    if (!res.ok) {
      toast.error("Failed to update task");
      return;
    }
    loadTasks();
    onChanged();
  };

  const startEditTask = (task: SimTask) => {
    setEditingTaskId(task.id);
    setEditingTaskTitle(task.title);
  };

  const handleSaveTaskTitle = async () => {
    if (!editingTaskId || !editingTaskTitle.trim()) return;
    const res = await fetch(`/api/simulation/tasks/${editingTaskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: editingTaskTitle.trim() }),
    });
    if (!res.ok) {
      toast.error("Failed to save task");
      return;
    }
    setEditingTaskId(null);
    loadTasks();
  };

  const handleDeleteTask = async (id: string) => {
    const res = await fetch(`/api/simulation/tasks/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Failed to delete task");
      return;
    }
    loadTasks();
    onChanged();
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[85vh] flex flex-col">
        <DialogHeader>
          {editingTitle ? (
            <Input
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={handleSaveTitle}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveTitle();
                if (e.key === "Escape") {
                  setEditingTitle(false);
                  setTitleDraft(title);
                }
              }}
              autoFocus
              className="text-lg font-semibold h-auto py-1"
            />
          ) : (
            <DialogTitle
              onClick={() => setEditingTitle(true)}
              className="cursor-pointer transition-opacity hover:opacity-70 w-fit"
            >
              {title}
            </DialogTitle>
          )}
        </DialogHeader>

        <div className="grid grid-cols-2 gap-6 flex-1 min-h-0 mt-1">
          <div className="flex flex-col min-h-0">
            <p className="text-xs font-semibold uppercase tracking-[0.05em] mb-2.5" style={{ color: "var(--color-text-subtle)" }}>
              Notes
            </p>
            {!notes ? (
              <Skeleton className="h-24 w-full rounded-lg" />
            ) : notes.length === 0 ? (
              <p className="text-sm py-4 text-center flex-1" style={{ color: "var(--color-text-secondary)" }}>
                No notes yet.
              </p>
            ) : (
              <ul className="space-y-2.5 flex-1 overflow-y-auto pr-1">
                {notes.map((n) => {
                  const { title: noteTitle, rest: noteRest } = splitNoteBody(n.body);
                  return (
                    <li
                      key={n.id}
                      className="rounded-lg px-3 py-2.5"
                      style={{ border: "1px solid var(--color-border-default)", backgroundColor: "var(--color-surface-subtle)" }}
                    >
                      {editingNoteId === n.id ? (
                        <div className="space-y-2">
                          <Input
                            value={editingNoteTitle}
                            onChange={(e) => setEditingNoteTitle(e.target.value)}
                            className="text-sm font-bold"
                            placeholder="Title"
                            autoFocus
                          />
                          <Textarea
                            value={editingNoteRest}
                            onChange={(e) => setEditingNoteRest(e.target.value)}
                            className="text-sm"
                            rows={3}
                            placeholder="Details (optional)"
                          />
                          <div className="flex justify-end gap-2">
                            <Button variant="outline" size="sm" className="active:scale-[0.96]" onClick={() => setEditingNoteId(null)}>
                              Cancel
                            </Button>
                            <Button size="sm" className="active:scale-[0.96]" onClick={handleSaveNoteEdit} disabled={!editingNoteTitle.trim()}>
                              Save
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div
                            onClick={() => startEditNote(n)}
                            className="cursor-pointer transition-opacity hover:opacity-70"
                          >
                            <p className="text-sm font-bold" style={{ color: "var(--color-text-primary)" }}>
                              {noteTitle}
                            </p>
                            {noteRest && (
                              <p className="text-sm whitespace-pre-wrap mt-1" style={{ color: "var(--color-text-primary)" }}>
                                {noteRest}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center justify-between mt-2">
                            <span className="text-[11px]" style={{ color: "var(--color-text-subtle)" }}>
                              {formatNoteTime(n.updated_at)}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleDeleteNote(n.id)}
                              className="cursor-pointer transition-all hover:opacity-70 active:scale-90"
                              style={{ color: "var(--color-danger)" }}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            <div
              className="space-y-2 pt-3 mt-2"
              style={{ borderTop: "1px solid var(--color-border-subtle)" }}
            >
              <Input
                placeholder="Title"
                value={newNoteTitle}
                onChange={(e) => setNewNoteTitle(e.target.value)}
                className="font-bold"
              />
              <div className="flex items-end gap-2">
                <Textarea
                  placeholder="Details (optional)"
                  value={newNoteRest}
                  onChange={(e) => setNewNoteRest(e.target.value)}
                  className="text-sm flex-1"
                  rows={2}
                />
                <Button className="active:scale-[0.96]" onClick={handleAddNote} disabled={!newNoteTitle.trim()}>
                  Add
                </Button>
              </div>
            </div>
          </div>

          <div className="flex flex-col min-h-0">
            <p className="text-xs font-semibold uppercase tracking-[0.05em] mb-2.5" style={{ color: "var(--color-text-subtle)" }}>
              Tasks
            </p>
            {!tasks ? (
              <Skeleton className="h-24 w-full rounded-lg" />
            ) : tasks.length === 0 ? (
              <p className="text-sm py-4 text-center flex-1" style={{ color: "var(--color-text-secondary)" }}>
                No tasks yet.
              </p>
            ) : (
              <ul className="space-y-2 flex-1 overflow-y-auto pr-1">
                {tasks.map((t) => (
                  <li key={t.id} className="rounded-lg" style={{ border: "1px solid var(--color-border-default)" }}>
                    <div className="flex items-center gap-2.5 px-3 py-2.5">
                      <Checkbox checked={t.done} onCheckedChange={() => handleToggleDone(t)} />
                      <div className="flex-1 min-w-0">
                        {editingTaskId === t.id ? (
                          <Input
                            value={editingTaskTitle}
                            onChange={(e) => setEditingTaskTitle(e.target.value)}
                            onBlur={handleSaveTaskTitle}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleSaveTaskTitle();
                              if (e.key === "Escape") setEditingTaskId(null);
                            }}
                            autoFocus
                            className="h-7 text-sm"
                          />
                        ) : (
                          <p
                            onClick={() => startEditTask(t)}
                            className="text-sm font-medium truncate cursor-pointer transition-opacity hover:opacity-70"
                            style={{
                              color: t.done ? "var(--color-text-subtle)" : "var(--color-text-primary)",
                              textDecoration: t.done ? "line-through" : "none",
                            }}
                          >
                            {t.title}
                          </p>
                        )}
                        {t.start_date && (
                          <p className="text-[11px]" style={{ color: "var(--color-text-subtle)" }}>
                            Starts {formatTaskDate(t.start_date)}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteTask(t.id)}
                        className="cursor-pointer transition-all hover:opacity-70 active:scale-90 shrink-0"
                        style={{ color: "var(--color-danger)" }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div
              className="space-y-2 pt-3 mt-2"
              style={{ borderTop: "1px solid var(--color-border-subtle)" }}
            >
              <Input
                placeholder="New task"
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddTask();
                }}
              />
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  value={newTaskDate}
                  onChange={(e) => setNewTaskDate(e.target.value)}
                  className="flex-1 font-num"
                />
                <Button className="active:scale-[0.96]" onClick={handleAddTask} disabled={!newTaskTitle.trim()}>
                  <Plus size={15} />
                  Add
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function SimulationPage() {
  const [year, setYear] = useState(2026);
  const [data, setData] = useState<SimulationData | null>(null);
  const [displayCurrency, setDisplayCurrency] = useState<DisplayCurrency>("JPY");
  const [entriesDialog, setEntriesDialog] = useState<{ month: string; kind: "income" | "expense" } | null>(null);
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);

  const loadThreads = useCallback(async () => {
    const res = await fetch("/api/simulation/threads");
    if (!res.ok) return;
    setThreads(await res.json());
  }, []);

  useEffect(() => {
    loadThreads();
  }, [loadThreads]);

  const handleDeleteThread = async (id: string) => {
    const res = await fetch(`/api/simulation/threads/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Failed to delete thread");
      return;
    }
    if (selectedThreadId === id) setSelectedThreadId(null);
    loadThreads();
  };

  const selectedThread = threads?.find((t) => t.id === selectedThreadId) ?? null;

  const load = useCallback(async (y: number) => {
    const res = await fetch(`/api/simulation?year=${y}`);
    if (!res.ok) return;
    const json: SimulationData = await res.json();
    setData(json);
  }, []);

  useEffect(() => {
    setData(null);
    load(year);
  }, [year, load]);

  const handleUpdateIncome = async (month: string, income: number) => {
    const res = await fetch(`/api/simulation/months/${month}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ income }),
    });
    if (!res.ok) {
      toast.error("Failed to save");
      return;
    }
    load(year);
  };

  const handleSaveNote = async (month: string, note: string | null) => {
    const res = await fetch(`/api/simulation/months/${month}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note }),
    });
    if (!res.ok) {
      toast.error("Failed to save");
      return;
    }
    load(year);
  };

  const vndPerJpy = data?.vndPerJpy ?? 1;
  const formatAmount = makeFormatAmount(displayCurrency, vndPerJpy);

  const savingsRatePct =
    data && data.annualIncome > 0
      ? Math.max(0, Math.min(100, Math.round((data.annualRemaining / data.annualIncome) * 100)))
      : 0;

  const editingMonth = data?.months.find((m) => m.month === entriesDialog?.month);
  const editingEntries = entriesDialog
    ? (entriesDialog.kind === "income" ? editingMonth?.specialIncomes : editingMonth?.specialExpenses) ?? []
    : [];

  return (
    <div>
      <div className="mt-8 mb-5 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Select value={String(year)} onValueChange={(v) => setYear(parseInt(v, 10))}>
            <SelectTrigger
              className="w-fit h-auto rounded-[10px] py-2.5 px-4 text-sm font-semibold gap-2 [&>svg]:hidden transition-colors hover:bg-muted/40 active:bg-muted/60"
              style={{ borderColor: "var(--color-border-default)", color: "var(--color-text-primary)" }}
            >
              <SelectValue />
              <ChevronDown size={15} style={{ color: "var(--color-text-subtle)" }} />
            </SelectTrigger>
            <SelectContent>
              {YEAR_OPTIONS.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <CurrencySwitch value={displayCurrency} onChange={setDisplayCurrency} />
        </div>
        <div className="flex items-center flex-wrap justify-end gap-2">
          <ThreadChips threads={threads} onOpen={setSelectedThreadId} onDelete={handleDeleteThread} />
          <NewThreadButton onCreated={loadThreads} />
        </div>
      </div>

      <Card
        className="p-5 rounded-2xl mb-5"
        style={{ borderColor: "var(--color-border-default)", boxShadow: CARD_SHADOW }}
      >
        {!data ? (
          <Skeleton className="h-16 w-full rounded-lg" />
        ) : (
          <>
            <div className="flex items-end justify-between flex-wrap gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.06em] mb-1" style={{ color: "var(--color-text-subtle)" }}>
                  {data.year} projected cumulative balance
                </p>
                <p className="font-display text-[32px] font-bold leading-none" style={{ color: "var(--color-text-primary)" }}>
                  {formatAmount(data.yearEndProjection)}
                </p>
              </div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="flex items-center gap-1 font-num font-bold text-[15px]" style={{ color: "var(--color-success)" }}>
                  <TrendingUp size={14} />
                  {formatAmount(data.annualIncome)}
                </span>
                <span className="text-[15px] font-semibold" style={{ color: "var(--color-text-subtle)" }}>−</span>
                <span className="flex items-center gap-1 font-num font-bold text-[15px]" style={{ color: "var(--color-text-secondary)" }}>
                  <TrendingDown size={14} />
                  {formatAmount(data.annualExpense + data.annualSpecialExpense)}
                </span>
                <span className="text-[15px] font-semibold" style={{ color: "var(--color-text-subtle)" }}>=</span>
                <span className="font-num font-bold text-[16px]" style={{ color: "var(--color-text-primary)" }}>
                  {formatAmount(data.annualRemaining)}
                </span>
              </div>
            </div>
            {data.annualIncome > 0 && (
              <div className="mt-3">
                <Progress
                  value={savingsRatePct}
                  className="h-1.5"
                  style={{ backgroundColor: "var(--kg-track)" }}
                  indicatorStyle={{ backgroundColor: "var(--color-primary)" }}
                />
                <p className="text-xs font-medium mt-1.5" style={{ color: "var(--color-primary-hover)" }}>
                  Saving {savingsRatePct}% of income so far this year
                </p>
              </div>
            )}
          </>
        )}
      </Card>

      <Card
        className="rounded-2xl overflow-hidden p-0"
        style={{ borderColor: "var(--color-border-default)", boxShadow: CARD_SHADOW }}
      >
        <div
          className="grid px-7 py-4 border-b"
          style={{ gridTemplateColumns: GRID_COLS, gap: 8, borderColor: "var(--color-border-default)" }}
        >
          <span className="text-xs font-semibold uppercase tracking-[0.05em]" style={{ color: "var(--color-text-subtle)" }}>Month</span>
          <span className="text-xs font-semibold uppercase tracking-[0.05em] text-right" style={{ color: "var(--color-text-subtle)" }}>Income</span>
          <span className="text-xs font-semibold uppercase tracking-[0.05em] text-right" style={{ color: "var(--color-text-subtle)" }}>Special income</span>
          <span className="text-xs font-semibold uppercase tracking-[0.05em] text-right" style={{ color: "var(--color-text-subtle)" }}>Expense</span>
          <span className="text-xs font-semibold uppercase tracking-[0.05em] text-right" style={{ color: "var(--color-text-subtle)" }}>Special expense</span>
          <span className="text-xs font-semibold uppercase tracking-[0.05em] text-right" style={{ color: "var(--color-text-subtle)" }}>Remaining</span>
          <span className="text-xs font-semibold uppercase tracking-[0.05em] text-right" style={{ color: "var(--color-text-subtle)" }}>Cumulative</span>
        </div>
        {!data ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-8 rounded-lg" />
            ))}
          </div>
        ) : (
          data.months.map((m) => (
            <MonthRow
              key={m.month}
              m={m}
              formatAmount={formatAmount}
              displayCurrency={displayCurrency}
              vndPerJpy={vndPerJpy}
              onUpdateIncome={handleUpdateIncome}
              onOpenEntries={(month, kind) => setEntriesDialog({ month, kind })}
              onSaveNote={handleSaveNote}
            />
          ))
        )}
      </Card>

      {entriesDialog && (
        <SpecialEntriesDialog
          open={entriesDialog !== null}
          onOpenChange={(v) => {
            if (!v) setEntriesDialog(null);
          }}
          month={entriesDialog.month}
          kind={entriesDialog.kind}
          entries={editingEntries}
          formatAmount={formatAmount}
          vndPerJpy={vndPerJpy}
          onChanged={() => load(year)}
        />
      )}

      {selectedThread && (
        <ThreadDetailDialog
          threadId={selectedThread.id}
          threadTitle={selectedThread.title}
          onOpenChange={(v) => {
            if (!v) setSelectedThreadId(null);
          }}
          onChanged={loadThreads}
        />
      )}
    </div>
  );
}

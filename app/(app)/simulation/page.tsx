"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, Plus, Pencil, Trash2, MessageSquare, CheckSquare } from "lucide-react";
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
  Tabs,
  TabsList,
  TabsTrigger,
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
          className="px-3 h-[38px] text-sm font-semibold cursor-pointer transition-colors"
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

// Income is always entered/edited in JPY regardless of the display-currency
// switch — it's the JP salary figure, not something to convert for viewing.
function IncomeInput({
  value,
  onSave,
}: {
  value: number;
  onSave: (n: number) => void;
}) {
  const [text, setText] = useState(String(value));
  const savedValueRef = useRef(value);

  useEffect(() => {
    setText(String(value));
    savedValueRef.current = value;
  }, [value]);

  const commit = () => {
    const n = parseInt(digitsOnly(text), 10) || 0;
    if (n !== savedValueRef.current) {
      savedValueRef.current = n;
      onSave(n);
    }
    setText(String(n));
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
  onUpdateIncome,
  onOpenEntries,
  onSaveNote,
}: {
  m: SimulationMonth;
  formatAmount: (jpyAmount: number) => string;
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
          <IncomeInput value={m.regularIncome} onSave={(n) => onUpdateIncome(m.month, n)} />
          <button
            type="button"
            onClick={() => onOpenEntries(m.month, "income")}
            className="text-right text-sm font-num transition-opacity hover:opacity-70 cursor-pointer"
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
            className="text-right text-sm font-num transition-opacity hover:opacity-70 cursor-pointer"
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
                          className="text-xs font-medium cursor-pointer hover:opacity-70"
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
                  className="px-2 h-9 text-xs font-semibold cursor-pointer transition-colors"
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
  commentCount: number;
}

interface TaskComment {
  id: string;
  task_id: string;
  body: string;
  created_at: string;
  updated_at: string;
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
          className="flex items-center gap-1.5 h-[34px] px-3 rounded-full text-sm font-semibold cursor-pointer transition-colors hover:bg-muted/40"
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
          <Button className="w-full" onClick={handleCreate} disabled={saving || !title.trim()}>
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
          className="group flex items-center gap-2 h-[34px] pl-3 pr-2 rounded-full text-sm font-semibold cursor-pointer transition-colors hover:opacity-90"
          style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border-default)", color: "var(--color-text-primary)" }}
        >
          <span className="truncate max-w-[160px]">{t.title}</span>
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
            className="opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer p-0.5"
            style={{ color: "var(--color-text-subtle)" }}
          >
            <Trash2 size={12} />
          </span>
        </button>
      ))}
    </>
  );
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
  const [tab, setTab] = useState<"notes" | "tasks">("notes");

  const [notes, setNotes] = useState<Note[] | null>(null);
  const [newNoteBody, setNewNoteBody] = useState("");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState("");

  const [tasks, setTasks] = useState<SimTask[] | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDate, setNewTaskDate] = useState("");
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [comments, setComments] = useState<Record<string, TaskComment[]>>({});
  const [newCommentBody, setNewCommentBody] = useState("");

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
    setTab("notes");
    setExpandedTaskId(null);
    setComments({});
    loadNotes();
    loadTasks();
  }, [threadId, loadNotes, loadTasks]);

  const handleAddNote = async () => {
    if (!newNoteBody.trim()) return;
    const res = await fetch(`/api/simulation/threads/${threadId}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: newNoteBody.trim() }),
    });
    if (!res.ok) {
      toast.error("Failed to save note");
      return;
    }
    setNewNoteBody("");
    loadNotes();
    onChanged();
  };

  const startEdit = (note: Note) => {
    setEditingNoteId(note.id);
    setEditingBody(note.body);
  };

  const handleSaveEdit = async () => {
    if (!editingNoteId || !editingBody.trim()) return;
    const res = await fetch(`/api/simulation/notes/${editingNoteId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: editingBody.trim() }),
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

  const handleDeleteTask = async (id: string) => {
    const res = await fetch(`/api/simulation/tasks/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Failed to delete task");
      return;
    }
    if (expandedTaskId === id) setExpandedTaskId(null);
    loadTasks();
    onChanged();
  };

  const loadComments = useCallback(async (taskId: string) => {
    const res = await fetch(`/api/simulation/tasks/${taskId}/comments`);
    if (!res.ok) return;
    const data: TaskComment[] = await res.json();
    setComments((prev) => ({ ...prev, [taskId]: data }));
  }, []);

  const toggleExpand = (taskId: string) => {
    if (expandedTaskId === taskId) {
      setExpandedTaskId(null);
      return;
    }
    setExpandedTaskId(taskId);
    setNewCommentBody("");
    if (!comments[taskId]) loadComments(taskId);
  };

  const handleAddComment = async (taskId: string) => {
    if (!newCommentBody.trim()) return;
    const res = await fetch(`/api/simulation/tasks/${taskId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: newCommentBody.trim() }),
    });
    if (!res.ok) {
      toast.error("Failed to save comment");
      return;
    }
    setNewCommentBody("");
    loadComments(taskId);
    loadTasks();
  };

  const handleDeleteComment = async (taskId: string, commentId: string) => {
    const res = await fetch(`/api/simulation/task-comments/${commentId}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Failed to delete comment");
      return;
    }
    loadComments(taskId);
    loadTasks();
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{threadTitle}</DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "notes" | "tasks")}>
          <TabsList
            className="p-1 rounded-[11px] h-auto gap-1 border-b-0"
            style={{ backgroundColor: "var(--kg-track)" }}
          >
            {(["notes", "tasks"] as const).map((v) => (
              <TabsTrigger
                key={v}
                value={v}
                className="rounded-lg px-4 py-1.5 text-sm font-semibold capitalize border-b-0 transition-all"
                style={
                  tab === v
                    ? {
                        backgroundColor: "var(--color-surface)",
                        color: "var(--color-text-primary)",
                        boxShadow: "0 1px 2px rgba(120,72,10,.08)",
                      }
                    : { backgroundColor: "transparent", color: "var(--color-text-secondary)", boxShadow: "none" }
                }
              >
                {v}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {tab === "notes" ? (
          <div className="px-1 space-y-3 flex flex-col flex-1 min-h-0 mt-2">
            {!notes ? (
              <Skeleton className="h-24 w-full rounded-lg" />
            ) : notes.length === 0 ? (
              <p className="text-sm py-4 text-center" style={{ color: "var(--color-text-secondary)" }}>
                No notes yet — add your first thought below.
              </p>
            ) : (
              <ul className="space-y-2.5 flex-1 overflow-y-auto">
                {notes.map((n) => (
                  <li
                    key={n.id}
                    className="rounded-lg px-3 py-2.5"
                    style={{ border: "1px solid var(--color-border-default)", backgroundColor: "var(--color-surface-subtle)" }}
                  >
                    {editingNoteId === n.id ? (
                      <div className="space-y-2">
                        <Textarea
                          value={editingBody}
                          onChange={(e) => setEditingBody(e.target.value)}
                          className="text-sm"
                          rows={3}
                          autoFocus
                        />
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="sm" onClick={() => setEditingNoteId(null)}>
                            Cancel
                          </Button>
                          <Button size="sm" onClick={handleSaveEdit} disabled={!editingBody.trim()}>
                            Save
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="text-sm whitespace-pre-wrap" style={{ color: "var(--color-text-primary)" }}>
                          {n.body}
                        </p>
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-[11px]" style={{ color: "var(--color-text-subtle)" }}>
                            {formatNoteTime(n.updated_at)}
                          </span>
                          <span className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => startEdit(n)}
                              className="cursor-pointer hover:opacity-70"
                              style={{ color: "var(--color-text-subtle)" }}
                            >
                              <Pencil size={13} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteNote(n.id)}
                              className="cursor-pointer hover:opacity-70"
                              style={{ color: "var(--color-danger)" }}
                            >
                              <Trash2 size={13} />
                            </button>
                          </span>
                        </div>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <div
              className="flex items-end gap-2 pt-3"
              style={{ borderTop: "1px solid var(--color-border-subtle)" }}
            >
              <Textarea
                placeholder="Add a note..."
                value={newNoteBody}
                onChange={(e) => setNewNoteBody(e.target.value)}
                className="text-sm flex-1"
                rows={2}
              />
              <Button onClick={handleAddNote} disabled={!newNoteBody.trim()}>
                Add
              </Button>
            </div>
          </div>
        ) : (
          <div className="px-1 space-y-3 flex flex-col flex-1 min-h-0 mt-2">
            {!tasks ? (
              <Skeleton className="h-24 w-full rounded-lg" />
            ) : tasks.length === 0 ? (
              <p className="text-sm py-4 text-center" style={{ color: "var(--color-text-secondary)" }}>
                No tasks yet — add your first one below.
              </p>
            ) : (
              <ul className="space-y-2 flex-1 overflow-y-auto">
                {tasks.map((t) => (
                  <li key={t.id} className="rounded-lg" style={{ border: "1px solid var(--color-border-default)" }}>
                    <div className="flex items-center gap-2.5 px-3 py-2.5">
                      <Checkbox checked={t.done} onCheckedChange={() => handleToggleDone(t)} />
                      <div className="flex-1 min-w-0">
                        <p
                          className="text-sm font-medium truncate"
                          style={{
                            color: t.done ? "var(--color-text-subtle)" : "var(--color-text-primary)",
                            textDecoration: t.done ? "line-through" : "none",
                          }}
                        >
                          {t.title}
                        </p>
                        {t.start_date && (
                          <p className="text-[11px]" style={{ color: "var(--color-text-subtle)" }}>
                            Starts {formatTaskDate(t.start_date)}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleExpand(t.id)}
                        className="flex items-center gap-1 text-[11px] font-semibold cursor-pointer hover:opacity-70 shrink-0"
                        style={{ color: "var(--color-text-secondary)" }}
                      >
                        <MessageSquare size={12} />
                        {t.commentCount}
                        <ChevronRight
                          size={12}
                          style={{
                            transform: expandedTaskId === t.id ? "rotate(90deg)" : undefined,
                            transition: "transform 0.15s",
                          }}
                        />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteTask(t.id)}
                        className="cursor-pointer hover:opacity-70 shrink-0"
                        style={{ color: "var(--color-danger)" }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                    {expandedTaskId === t.id && (
                      <div className="px-3 pb-3 pt-2 space-y-2" style={{ borderTop: "1px solid var(--color-border-subtle)" }}>
                        {!comments[t.id] ? (
                          <Skeleton className="h-8 w-full rounded" />
                        ) : comments[t.id].length === 0 ? (
                          <p className="text-xs py-1" style={{ color: "var(--color-text-subtle)" }}>
                            No comments yet.
                          </p>
                        ) : (
                          <ul className="space-y-1.5">
                            {comments[t.id].map((c) => (
                              <li
                                key={c.id}
                                className="flex items-start justify-between gap-2 text-xs rounded px-2 py-1.5"
                                style={{ backgroundColor: "var(--color-surface-subtle)" }}
                              >
                                <span style={{ color: "var(--color-text-primary)" }}>{c.body}</span>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteComment(t.id, c.id)}
                                  className="cursor-pointer hover:opacity-70 shrink-0"
                                  style={{ color: "var(--color-danger)" }}
                                >
                                  <Trash2 size={11} />
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                        <div className="flex items-center gap-2">
                          <Input
                            placeholder="Add a comment..."
                            value={newCommentBody}
                            onChange={(e) => setNewCommentBody(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleAddComment(t.id);
                            }}
                            className="flex-1 h-8 text-xs"
                          />
                          <Button size="sm" onClick={() => handleAddComment(t.id)} disabled={!newCommentBody.trim()}>
                            Add
                          </Button>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <div
              className="flex items-center gap-2 pt-3"
              style={{ borderTop: "1px solid var(--color-border-subtle)" }}
            >
              <Input
                placeholder="New task"
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddTask();
                }}
                className="flex-1"
              />
              <Input
                type="date"
                value={newTaskDate}
                onChange={(e) => setNewTaskDate(e.target.value)}
                className="w-[150px] font-num"
              />
              <Button onClick={handleAddTask} disabled={!newTaskTitle.trim()}>
                <Plus size={15} />
                Add
              </Button>
            </div>
          </div>
        )}
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
      <div className="mt-8 mb-4 flex items-center justify-between flex-wrap gap-3">
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
      </div>

      <div className="mb-5 flex items-center flex-wrap gap-2">
        <ThreadChips threads={threads} onOpen={setSelectedThreadId} onDelete={handleDeleteThread} />
        <NewThreadButton onCreated={loadThreads} />
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
                  {data.year} cumulative balance
                </p>
                <p className="font-display text-[32px] font-bold leading-none" style={{ color: "var(--color-text-primary)" }}>
                  {formatAmount(data.yearEndProjection)}
                </p>
              </div>
              <div className="flex items-center gap-5 flex-wrap">
                <div>
                  <p className="text-[11px] mb-0.5" style={{ color: "var(--color-text-secondary)" }}>Income</p>
                  <p className="font-num font-bold text-[14px]" style={{ color: "var(--color-success)" }}>
                    {formatAmount(data.annualIncome)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] mb-0.5" style={{ color: "var(--color-text-secondary)" }}>Expense</p>
                  <p className="font-num font-bold text-[14px]" style={{ color: "var(--color-text-secondary)" }}>
                    {formatAmount(data.annualExpense)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] mb-0.5" style={{ color: "var(--color-text-secondary)" }}>Special expense</p>
                  <p className="font-num font-bold text-[14px]" style={{ color: "var(--color-danger)" }}>
                    {formatAmount(data.annualSpecialExpense)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] mb-0.5" style={{ color: "var(--color-text-secondary)" }}>Remaining</p>
                  <p className="font-num font-bold text-[14px]" style={{ color: "var(--color-text-primary)" }}>
                    {formatAmount(data.annualRemaining)}
                  </p>
                </div>
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

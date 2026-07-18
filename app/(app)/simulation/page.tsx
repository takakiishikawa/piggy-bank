"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { AlertTriangle, ChevronDown, ChevronLeft, StickyNote, Plus, Pencil, Trash2 } from "lucide-react";
import { formatJPY, formatVND } from "@/lib/format";
import type { SimulationMonth, SpecialEntry } from "@/lib/simulation";
import { NoteTag } from "@/components/note-tag";
import {
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
  Textarea,
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
}

interface Note {
  id: string;
  thread_id: string;
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

function ThreadsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [newThreadTitle, setNewThreadTitle] = useState("");
  const [newNoteBody, setNewNoteBody] = useState("");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState("");

  const loadThreads = useCallback(async () => {
    const res = await fetch("/api/simulation/threads");
    if (!res.ok) return;
    setThreads(await res.json());
  }, []);

  const loadNotes = useCallback(async (threadId: string) => {
    const res = await fetch(`/api/simulation/threads/${threadId}/notes`);
    if (!res.ok) return;
    setNotes(await res.json());
  }, []);

  useEffect(() => {
    if (open) {
      setSelectedId(null);
      setNotes(null);
      setNewThreadTitle("");
      loadThreads();
    }
  }, [open, loadThreads]);

  const selectedThread = threads?.find((t) => t.id === selectedId) ?? null;

  const openThread = (id: string) => {
    setSelectedId(id);
    setNotes(null);
    setNewNoteBody("");
    loadNotes(id);
  };

  const handleCreateThread = async () => {
    if (!newThreadTitle.trim()) return;
    const res = await fetch("/api/simulation/threads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newThreadTitle.trim() }),
    });
    if (!res.ok) {
      toast.error("Failed to create thread");
      return;
    }
    setNewThreadTitle("");
    loadThreads();
  };

  const handleDeleteThread = async (id: string) => {
    const res = await fetch(`/api/simulation/threads/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Failed to delete thread");
      return;
    }
    if (selectedId === id) setSelectedId(null);
    loadThreads();
  };

  const handleAddNote = async () => {
    if (!selectedId || !newNoteBody.trim()) return;
    const res = await fetch(`/api/simulation/threads/${selectedId}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: newNoteBody.trim() }),
    });
    if (!res.ok) {
      toast.error("Failed to save note");
      return;
    }
    setNewNoteBody("");
    loadNotes(selectedId);
    loadThreads();
  };

  const startEdit = (note: Note) => {
    setEditingNoteId(note.id);
    setEditingBody(note.body);
  };

  const handleSaveEdit = async () => {
    if (!editingNoteId || !editingBody.trim() || !selectedId) return;
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
    loadNotes(selectedId);
  };

  const handleDeleteNote = async (id: string) => {
    if (!selectedId) return;
    const res = await fetch(`/api/simulation/notes/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Failed to delete note");
      return;
    }
    loadNotes(selectedId);
    loadThreads();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {selectedThread && (
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="cursor-pointer hover:opacity-70"
                style={{ color: "var(--color-text-secondary)" }}
              >
                <ChevronLeft size={18} />
              </button>
            )}
            {selectedThread ? selectedThread.title : "Threads"}
          </DialogTitle>
        </DialogHeader>

        {!selectedThread ? (
          <div className="px-1 space-y-3">
            {!threads ? (
              <Skeleton className="h-24 w-full rounded-lg" />
            ) : threads.length === 0 ? (
              <p className="text-sm py-4 text-center" style={{ color: "var(--color-text-secondary)" }}>
                No threads yet — create one below.
              </p>
            ) : (
              <ul className="space-y-1.5 max-h-[50vh] overflow-y-auto">
                {threads.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => openThread(t.id)}
                      className="w-full flex items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left cursor-pointer transition-colors hover:bg-muted/40"
                      style={{ border: "1px solid var(--color-border-default)" }}
                    >
                      <span className="text-sm font-semibold truncate" style={{ color: "var(--color-text-primary)" }}>
                        {t.title}
                      </span>
                      <span className="flex items-center gap-2 shrink-0">
                        {t.noteCount > 0 && (
                          <Tag
                            className="text-[10.5px] font-bold px-2 py-0.5"
                            style={{ backgroundColor: "var(--color-primary-subtle)", color: "var(--color-primary-hover)" }}
                          >
                            {t.noteCount}
                          </Tag>
                        )}
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteThread(t.id);
                          }}
                          className="cursor-pointer hover:opacity-70 p-0.5"
                          style={{ color: "var(--color-text-subtle)" }}
                        >
                          <Trash2 size={14} />
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div
              className="flex items-center gap-2 pt-3"
              style={{ borderTop: "1px solid var(--color-border-subtle)" }}
            >
              <Input
                placeholder="New thread (e.g. Side business)"
                value={newThreadTitle}
                onChange={(e) => setNewThreadTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateThread();
                }}
                className="flex-1"
              />
              <Button onClick={handleCreateThread} disabled={!newThreadTitle.trim()}>
                <Plus size={15} />
                Add
              </Button>
            </div>
          </div>
        ) : (
          <div className="px-1 space-y-3">
            {!notes ? (
              <Skeleton className="h-24 w-full rounded-lg" />
            ) : notes.length === 0 ? (
              <p className="text-sm py-4 text-center" style={{ color: "var(--color-text-secondary)" }}>
                No notes yet — add your first thought below.
              </p>
            ) : (
              <ul className="space-y-2.5 max-h-[45vh] overflow-y-auto">
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
  const [threadsDialogOpen, setThreadsDialogOpen] = useState(false);
  const [totalNoteCount, setTotalNoteCount] = useState(0);

  const loadThreadsSummary = useCallback(async () => {
    const res = await fetch("/api/simulation/threads");
    if (!res.ok) return;
    const threads: Thread[] = await res.json();
    setTotalNoteCount(threads.reduce((s, t) => s + t.noteCount, 0));
  }, []);

  useEffect(() => {
    loadThreadsSummary();
  }, [loadThreadsSummary]);

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
        <button
          type="button"
          onClick={() => setThreadsDialogOpen(true)}
          title="Threads"
          className="relative flex h-[38px] w-[38px] items-center justify-center rounded-[10px] cursor-pointer transition-colors hover:bg-muted/40"
          style={{ border: "1px solid var(--color-border-default)", color: "var(--color-text-secondary)" }}
        >
          <StickyNote size={17} />
          {totalNoteCount > 0 && (
            <span
              className="absolute -top-1.5 -right-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold"
              style={{ backgroundColor: "var(--color-primary)", color: "#fff" }}
            >
              {totalNoteCount}
            </span>
          )}
        </button>
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

      <ThreadsDialog
        open={threadsDialogOpen}
        onOpenChange={(v) => {
          setThreadsDialogOpen(v);
          if (!v) loadThreadsSummary();
        }}
      />
    </div>
  );
}

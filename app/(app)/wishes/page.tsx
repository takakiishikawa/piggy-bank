"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ExternalLink,
  Heart,
  Pencil,
  Plus,
  Trash2,
  Check,
  X as XIcon,
} from "lucide-react";
import {
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Input,
  Label,
  PageHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Tabs,
  TabsList,
  TabsTrigger,
  Tag,
  Textarea,
  toast,
} from "@takaki/go-design-system";
import { formatVND } from "@/lib/format";
import type { Wish } from "@/lib/supabase/db";

type Priority = Wish["priority"];
type Status = Wish["status"];

const PRIORITY_LABEL: Record<Priority, string> = {
  high: "高",
  mid: "中",
  low: "低",
};

const PRIORITY_ORDER: Record<Priority, number> = { high: 0, mid: 1, low: 2 };

const STATUS_LABEL: Record<Status, string> = {
  want: "欲しい",
  got: "購入済",
  gave_up: "あきらめた",
};

interface WishFormState {
  name: string;
  price: string;
  url: string;
  note: string;
  priority: Priority;
  status: Status;
  image_url: string;
}

const EMPTY_FORM: WishFormState = {
  name: "",
  price: "",
  url: "",
  note: "",
  priority: "mid",
  status: "want",
  image_url: "",
};

function PriorityTag({ priority }: { priority: Priority }) {
  const color =
    priority === "high"
      ? "danger"
      : priority === "mid"
        ? "warning"
        : "default";
  return <Tag color={color}>優先度 {PRIORITY_LABEL[priority]}</Tag>;
}

function StatusTag({ status }: { status: Status }) {
  const color =
    status === "got" ? "success" : status === "gave_up" ? "default" : "info";
  return <Tag color={color}>{STATUS_LABEL[status]}</Tag>;
}

function toForm(w: Wish): WishFormState {
  return {
    name: w.name,
    price: w.price == null ? "" : String(w.price),
    url: w.url ?? "",
    note: w.note ?? "",
    priority: w.priority,
    status: w.status,
    image_url: w.image_url ?? "",
  };
}

function buildPayload(f: WishFormState) {
  const trimmedUrl = f.url.trim();
  const trimmedImg = f.image_url.trim();
  const trimmedNote = f.note.trim();
  const priceNum = f.price.trim() === "" ? null : Number(f.price);
  return {
    name: f.name.trim(),
    price: priceNum != null && Number.isFinite(priceNum) ? priceNum : null,
    url: trimmedUrl === "" ? null : trimmedUrl,
    note: trimmedNote === "" ? null : trimmedNote,
    priority: f.priority,
    status: f.status,
    image_url: trimmedImg === "" ? null : trimmedImg,
  };
}

function WishCard({
  wish,
  onClick,
}: {
  wish: Wish;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg"
    >
      <Card className="p-4 hover:shadow-md transition-shadow h-full flex flex-col gap-3">
        {wish.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={wish.image_url}
            alt={wish.name}
            className="w-full h-36 object-cover rounded-md bg-muted"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <div
            className="w-full h-36 rounded-md flex items-center justify-center"
            style={{ backgroundColor: "var(--kg-surface-2)" }}
          >
            <Heart
              className="opacity-30"
              size={36}
              style={{ color: "var(--color-primary)" }}
            />
          </div>
        )}
        <div className="flex-1 flex flex-col gap-2">
          <p
            className="text-sm font-medium line-clamp-2"
            style={{
              textDecoration: wish.status === "gave_up" ? "line-through" : undefined,
              opacity: wish.status === "gave_up" ? 0.6 : 1,
            }}
          >
            {wish.name}
          </p>
          {wish.price != null && (
            <p className="text-base font-num font-semibold" style={{ color: "var(--color-primary)" }}>
              {formatVND(wish.price)}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2 mt-auto">
            <PriorityTag priority={wish.priority} />
            {wish.status !== "want" && <StatusTag status={wish.status} />}
          </div>
        </div>
      </Card>
    </button>
  );
}

function WishFormDialog({
  open,
  onOpenChange,
  initial,
  title,
  submitLabel,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial: WishFormState;
  title: string;
  submitLabel: string;
  onSubmit: (form: WishFormState) => Promise<void>;
}) {
  const [form, setForm] = useState<WishFormState>(initial);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setForm(initial);
  }, [open, initial]);

  const canSubmit = form.name.trim().length > 0 && !busy;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    try {
      await onSubmit(form);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="wish-name">名前 *</Label>
            <Input
              id="wish-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="例: AirPods Pro"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="wish-price">価格</Label>
              <Input
                id="wish-price"
                type="number"
                inputMode="numeric"
                value={form.price}
                onChange={(e) =>
                  setForm((f) => ({ ...f, price: e.target.value }))
                }
                placeholder="0"
              />
            </div>
            <div className="space-y-1.5">
              <Label>優先度</Label>
              <Select
                value={form.priority}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, priority: v as Priority }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">高</SelectItem>
                  <SelectItem value="mid">中</SelectItem>
                  <SelectItem value="low">低</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>ステータス</Label>
            <Select
              value={form.status}
              onValueChange={(v) =>
                setForm((f) => ({ ...f, status: v as Status }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="want">欲しい</SelectItem>
                <SelectItem value="got">購入済</SelectItem>
                <SelectItem value="gave_up">あきらめた</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="wish-url">商品URL</Label>
            <Input
              id="wish-url"
              type="url"
              value={form.url}
              onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
              placeholder="https://..."
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="wish-image">画像URL</Label>
            <Input
              id="wish-image"
              type="url"
              value={form.image_url}
              onChange={(e) =>
                setForm((f) => ({ ...f, image_url: e.target.value }))
              }
              placeholder="https://..."
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="wish-note">メモ</Label>
            <Textarea
              id="wish-note"
              value={form.note}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              placeholder="任意"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            キャンセル
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {busy ? "保存中..." : submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WishDetailDialog({
  wish,
  onClose,
  onEdit,
  onDelete,
  onQuickStatus,
}: {
  wish: Wish | null;
  onClose: () => void;
  onEdit: (w: Wish) => void;
  onDelete: (w: Wish) => void;
  onQuickStatus: (w: Wish, next: Status) => void;
}) {
  return (
    <Dialog open={wish !== null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="pr-6">{wish?.name}</DialogTitle>
        </DialogHeader>
        {wish && (
          <div className="space-y-4">
            {wish.image_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={wish.image_url}
                alt={wish.name}
                className="w-full max-h-72 object-cover rounded-md bg-muted"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
            )}

            <div className="flex flex-wrap items-center gap-2">
              <PriorityTag priority={wish.priority} />
              <StatusTag status={wish.status} />
            </div>

            {wish.price != null && (
              <p
                className="text-2xl font-num font-bold"
                style={{ color: "var(--color-primary)" }}
              >
                {formatVND(wish.price)}
              </p>
            )}

            {wish.url && (
              <a
                href={wish.url}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1.5 text-sm hover:underline"
                style={{ color: "var(--color-primary)" }}
              >
                <ExternalLink size={14} />
                商品ページを開く
              </a>
            )}

            {wish.note && (
              <p className="text-sm whitespace-pre-wrap text-muted-foreground border-t pt-3">
                {wish.note}
              </p>
            )}

            {wish.status === "want" && (
              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => onQuickStatus(wish, "got")}
                >
                  <Check size={14} />
                  購入済にする
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => onQuickStatus(wish, "gave_up")}
                >
                  <XIcon size={14} />
                  あきらめる
                </Button>
              </div>
            )}
          </div>
        )}
        <DialogFooter className="flex-row justify-between sm:justify-between">
          <Button
            variant="ghost"
            onClick={() => wish && onDelete(wish)}
            style={{ color: "var(--color-danger)" }}
          >
            <Trash2 size={14} />
            削除
          </Button>
          <Button variant="outline" onClick={() => wish && onEdit(wish)}>
            <Pencil size={14} />
            編集
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function WishesPage() {
  const [wishes, setWishes] = useState<Wish[] | null>(null);
  const [tab, setTab] = useState<Status>("want");
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Wish | null>(null);
  const [viewing, setViewing] = useState<Wish | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/wishes");
      if (!r.ok) throw new Error();
      setWishes((await r.json()) as Wish[]);
    } catch {
      toast.error("ウィッシュリストの取得に失敗しました");
      setWishes([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const grouped = useMemo(() => {
    const list = wishes ?? [];
    const sortFn = (a: Wish, b: Wish) => {
      const p = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      if (p !== 0) return p;
      return (
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    };
    return {
      want: list.filter((w) => w.status === "want").sort(sortFn),
      got: list.filter((w) => w.status === "got").sort(sortFn),
      gave_up: list.filter((w) => w.status === "gave_up").sort(sortFn),
    };
  }, [wishes]);

  const visible = grouped[tab];

  const handleCreate = async (form: WishFormState) => {
    const res = await fetch("/api/wishes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildPayload(form)),
    });
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: "" }));
      toast.error(error || "追加に失敗しました");
      return;
    }
    toast.success(`「${form.name}」を追加しました`);
    setAddOpen(false);
    load();
  };

  const handleUpdate = async (form: WishFormState) => {
    if (!editing) return;
    const res = await fetch(`/api/wishes/${editing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildPayload(form)),
    });
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: "" }));
      toast.error(error || "更新に失敗しました");
      return;
    }
    toast.success("更新しました");
    setEditing(null);
    setViewing(null);
    load();
  };

  const handleDelete = async (w: Wish) => {
    if (!window.confirm(`「${w.name}」を削除しますか？`)) return;
    const res = await fetch(`/api/wishes/${w.id}`, { method: "DELETE" });
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: "" }));
      toast.error(error || "削除に失敗しました");
      return;
    }
    toast.success(`「${w.name}」を削除しました`);
    setViewing(null);
    setEditing(null);
    load();
  };

  const handleQuickStatus = async (w: Wish, next: Status) => {
    const res = await fetch(`/api/wishes/${w.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    if (!res.ok) {
      toast.error("更新に失敗しました");
      return;
    }
    toast.success(
      next === "got" ? "購入済にしました" : "あきらめたリストに移しました",
    );
    setViewing(null);
    load();
  };

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
      <PageHeader
        title="ウィッシュリスト"
        actions={
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus size={14} />
            追加
          </Button>
        }
      />

      {wishes === null ? (
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-64 rounded-lg" />
          ))}
        </div>
      ) : (
        <>
          <div className="mt-6 mb-4">
            <Tabs value={tab} onValueChange={(v) => setTab(v as Status)}>
              <TabsList>
                <TabsTrigger value="want">
                  欲しい
                  <TabBadge count={grouped.want.length} />
                </TabsTrigger>
                <TabsTrigger value="got">
                  購入済
                  <TabBadge count={grouped.got.length} />
                </TabsTrigger>
                <TabsTrigger value="gave_up">
                  あきらめた
                  <TabBadge count={grouped.gave_up.length} />
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {visible.length === 0 ? (
            <EmptyState
              icon={<Heart size={32} />}
              title={
                tab === "want"
                  ? "ウィッシュリストは空です"
                  : tab === "got"
                    ? "購入済のアイテムはまだありません"
                    : "あきらめたアイテムはありません"
              }
              description={
                tab === "want" ? "欲しいものを追加してみましょう" : undefined
              }
              action={
                tab === "want"
                  ? { label: "追加する", onClick: () => setAddOpen(true) }
                  : undefined
              }
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {visible.map((w) => (
                <WishCard
                  key={w.id}
                  wish={w}
                  onClick={() => setViewing(w)}
                />
              ))}
            </div>
          )}
        </>
      )}

      <WishFormDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        initial={EMPTY_FORM}
        title="ウィッシュを追加"
        submitLabel="追加"
        onSubmit={handleCreate}
      />

      <WishFormDialog
        open={editing !== null}
        onOpenChange={(v) => !v && setEditing(null)}
        initial={editing ? toForm(editing) : EMPTY_FORM}
        title="ウィッシュを編集"
        submitLabel="保存"
        onSubmit={handleUpdate}
      />

      <WishDetailDialog
        wish={editing ? null : viewing}
        onClose={() => setViewing(null)}
        onEdit={(w) => {
          setViewing(null);
          setEditing(w);
        }}
        onDelete={handleDelete}
        onQuickStatus={handleQuickStatus}
      />
    </div>
  );
}

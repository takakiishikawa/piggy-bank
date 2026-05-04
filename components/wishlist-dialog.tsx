"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Heart, Plus, RotateCcw, X } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Input,
  Skeleton,
  Tabs,
  TabsList,
  TabsTrigger,
  toast,
} from "@takaki/go-design-system";
import type { Wish } from "@/lib/supabase/db";

type Status = Wish["status"];

function WishCard({
  wish,
  onToggle,
  onDelete,
}: {
  wish: Wish;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const isGot = wish.status === "got";
  return (
    <div className="group relative rounded-lg overflow-hidden border border-border bg-card">
      <div className="relative w-full aspect-square">
        {wish.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={wish.image_url}
            alt={wish.name}
            className="w-full h-full object-cover"
            style={{ opacity: isGot ? 0.5 : 1 }}
            onError={(e) => {
              const img = e.currentTarget as HTMLImageElement;
              img.style.display = "none";
            }}
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center"
            style={{ backgroundColor: "var(--kg-surface-2)" }}
          >
            <Heart
              size={36}
              className="opacity-30"
              style={{ color: "var(--color-primary)" }}
            />
          </div>
        )}

        {isGot && (
          <div
            className="absolute inset-0 flex items-center justify-center text-white text-xs font-semibold tracking-widest uppercase pointer-events-none"
            style={{ backgroundColor: "rgba(0,0,0,0.35)" }}
          >
            購入済
          </div>
        )}

        <button
          type="button"
          onClick={onDelete}
          aria-label="削除"
          className="absolute top-2 right-2 inline-flex items-center justify-center h-7 w-7 rounded-full text-white shadow-md transition opacity-0 group-hover:opacity-100 focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
        >
          <X size={14} />
        </button>
      </div>

      <div className="flex items-center gap-2 p-3">
        <p
          className="flex-1 text-sm font-medium line-clamp-2 leading-snug"
          style={{
            textDecoration: isGot ? "line-through" : undefined,
            opacity: isGot ? 0.7 : 1,
          }}
        >
          {wish.name}
        </p>
        <button
          type="button"
          onClick={onToggle}
          aria-label={isGot ? "欲しいに戻す" : "購入済にする"}
          title={isGot ? "欲しいに戻す" : "購入済にする"}
          className="shrink-0 inline-flex items-center justify-center h-8 w-8 rounded-full border transition focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          style={
            isGot
              ? {
                  backgroundColor: "var(--color-success-subtle)",
                  borderColor: "var(--color-success)",
                  color: "var(--color-success)",
                }
              : {
                  backgroundColor: "transparent",
                  borderColor: "var(--border)",
                  color: "var(--muted-foreground)",
                }
          }
        >
          {isGot ? <RotateCcw size={14} /> : <Check size={14} />}
        </button>
      </div>
    </div>
  );
}

export function WishlistDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [wishes, setWishes] = useState<Wish[] | null>(null);
  const [tab, setTab] = useState<Status>("want");
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);

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
    if (open && wishes === null) load();
  }, [open, wishes, load]);

  const grouped = useMemo(() => {
    const list = wishes ?? [];
    const sortFn = (a: Wish, b: Wish) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    return {
      want: list.filter((w) => w.status === "want").sort(sortFn),
      got: list.filter((w) => w.status === "got").sort(sortFn),
    };
  }, [wishes]);

  const visible = grouped[tab];

  const handleAdd = async () => {
    const trimmed = name.trim();
    if (!trimmed || adding) return;
    setAdding(true);
    try {
      const res = await fetch("/api/wishes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: "" }));
        toast.error(error || "追加に失敗しました");
        return;
      }
      const created = (await res.json()) as Wish;
      setWishes((prev) => (prev ? [created, ...prev] : [created]));
      setName("");
      setTab("want");
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (w: Wish) => {
    const prev = wishes;
    setWishes((p) => (p ? p.filter((x) => x.id !== w.id) : p));
    const res = await fetch(`/api/wishes/${w.id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("削除に失敗しました");
      setWishes(prev);
    }
  };

  const handleToggle = async (w: Wish) => {
    const next: Status = w.status === "want" ? "got" : "want";
    const prev = wishes;
    setWishes((p) =>
      p ? p.map((x) => (x.id === w.id ? { ...x, status: next } : x)) : p,
    );
    const res = await fetch(`/api/wishes/${w.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    if (!res.ok) {
      toast.error("更新に失敗しました");
      setWishes(prev);
    }
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl p-0 overflow-hidden flex flex-col max-h-[85vh]">
        <DialogHeader className="px-7 py-5 border-b">
          <DialogTitle>ウィッシュリスト</DialogTitle>
        </DialogHeader>

        <div className="px-7 pt-5">
          <div className="flex items-center gap-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAdd();
              }}
              placeholder="欲しいものの名前を入力（例: AirPods Pro）"
              disabled={adding}
              className="flex-1"
            />
            <Button
              onClick={handleAdd}
              disabled={!name.trim() || adding}
              size="sm"
            >
              <Plus size={14} />
              {adding ? "追加中..." : "追加"}
            </Button>
          </div>
        </div>

        <div className="px-7 pt-4">
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
            </TabsList>
          </Tabs>
        </div>

        <div className="flex-1 overflow-y-auto px-7 py-5">
          {wishes === null ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                <Skeleton key={i} className="aspect-square rounded-lg" />
              ))}
            </div>
          ) : visible.length === 0 ? (
            <EmptyState
              icon={<Heart size={32} />}
              title={
                tab === "want"
                  ? "ウィッシュリストは空です"
                  : "購入済のアイテムはまだありません"
              }
              description={
                tab === "want"
                  ? "上の入力欄に名前を入れて追加しましょう"
                  : undefined
              }
            />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {visible.map((w) => (
                <WishCard
                  key={w.id}
                  wish={w}
                  onToggle={() => handleToggle(w)}
                  onDelete={() => handleDelete(w)}
                />
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

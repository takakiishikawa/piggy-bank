"use client";

import { useEffect, useState } from "react";
import {
  Button,
  Card,
  Input,
  toast,
} from "@takaki/go-design-system";

export default function SettingsPage() {
  const [month, setMonth] = useState<string>("");
  const [targetMonthly, setTargetMonthly] = useState("");
  const [fixedCosts, setFixedCosts] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        setMonth(data.month);
        setTargetMonthly(String(data.targetMonthly));
        setFixedCosts(String(data.fixedCosts));
      });
  }, []);

  const monthLabel = month
    ? `${month.slice(0, 4)}年${parseInt(month.slice(5, 7), 10)}月`
    : "";

  const handleSave = async () => {
    setSaving(true);
    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetMonthly: parseInt(targetMonthly) || 0,
        fixedCosts: parseInt(fixedCosts) || 0,
      }),
    });
    toast.success("予算を保存しました");
    setSaving(false);
  };

  return (
    <div>
      <div className="mt-8 space-y-5 max-w-xl">
        <Card className="p-7 animate-fade-up">
          <div className="flex items-baseline justify-between mb-6">
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              今月の予算
            </p>
            {monthLabel && (
              <p className="text-xs font-num text-muted-foreground">
                {monthLabel}
              </p>
            )}
          </div>
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium mb-2 text-foreground">
                合計月支出（VND）
              </label>
              <Input
                type="number"
                value={targetMonthly}
                onChange={(e) => setTargetMonthly(e.target.value)}
                placeholder="例: 50000000"
              />
              {parseInt(targetMonthly) > 0 && (
                <p
                  className="text-xs mt-2 font-num"
                  style={{ color: "var(--kg-accent)" }}
                >
                  = {parseInt(targetMonthly).toLocaleString("vi-VN")} ₫
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium mb-2 text-foreground">
                固定費（VND）
              </label>
              <Input
                type="number"
                value={fixedCosts}
                onChange={(e) => setFixedCosts(e.target.value)}
                placeholder="例: 17000000"
              />
              {parseInt(fixedCosts) > 0 && (
                <p
                  className="text-xs mt-2 font-num"
                  style={{ color: "var(--kg-accent)" }}
                >
                  = {parseInt(fixedCosts).toLocaleString("vi-VN")} ₫
                </p>
              )}
            </div>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "保存中..." : "保存する"}
            </Button>
            <p className="text-xs text-muted-foreground">
              ※ 変更は今月（{monthLabel}）にのみ反映されます。過去月の予算は変更できません。月別履歴は「レポート」ページの「月毎の倹約」から確認できます。
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}


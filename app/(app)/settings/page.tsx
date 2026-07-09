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
    ? new Date(
        parseInt(month.slice(0, 4), 10),
        parseInt(month.slice(5, 7), 10) - 1,
      ).toLocaleDateString("en-US", { year: "numeric", month: "long" })
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
    toast.success("Budget saved");
    setSaving(false);
  };

  return (
    <div>
      <div className="mt-8 space-y-5 max-w-xl">
        <Card
          className="p-7 rounded-2xl animate-fade-up"
          style={{
            borderColor: "var(--color-border-default)",
            boxShadow: "0 1px 2px rgba(120,72,10,.04), 0 8px 24px rgba(120,72,10,.05)",
          }}
        >
          <div className="flex items-baseline justify-between mb-6">
            <p className="text-xs font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--color-text-subtle)" }}>
              This Month&apos;s Budget
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
                Total Monthly Spending (VND)
              </label>
              <Input
                type="number"
                value={targetMonthly}
                onChange={(e) => setTargetMonthly(e.target.value)}
                placeholder="e.g. 50000000"
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
                Fixed Costs (VND)
              </label>
              <Input
                type="number"
                value={fixedCosts}
                onChange={(e) => setFixedCosts(e.target.value)}
                placeholder="e.g. 17000000"
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
              {saving ? "Saving..." : "Save"}
            </Button>
            <p className="text-xs text-muted-foreground">
              Note: changes only apply to this month ({monthLabel}). Past months' budgets can't be changed.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}


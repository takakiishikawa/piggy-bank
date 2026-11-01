"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { PiggyBank, LayoutGrid, FileChartColumn, Landmark, LogOut, LogIn } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@takaki/go-design-system";
import { usePreferences } from "@/lib/preferences";
import { t } from "@/lib/scenario/dictionary";
import { InvestmentPolicyDialog } from "@/components/investment-policy-dialog";

// hoverしたら各メニュー名・プロダクト名がツールチップで見えるように、
// レール上の全アイテムを共通のラッパーで包む(既存の title 属性による素の
// OSツールチップより表示が速く、見た目もアプリの他のツールチップと揃う)。
function SidebarTooltip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={8} className="text-xs">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

// Claude Design (PiggyBank.dc.html)のサイドバーを1:1で再現した、常時アイコンのみの
// 固定76px幅レール。go-design-systemのSidebar/SidebarProvider(展開/省略の
// 切り替え機構)はあえて使わず、デザイン通りの見た目に最適化したプレーンな実装にする。
const NAV_ITEMS = [
  { href: "/", labelKey: "dashboard" as const, icon: LayoutGrid },
  { href: "/simulation", labelKey: "simulation" as const, icon: FileChartColumn },
];

const DARK_BG = "#20242A";
const DARK_ACCENT_BG = "#2C3038";
const ACCENT = "#BE5B85";
const INACTIVE = "#9B9587";
const MUTED_TEXT = "#C7C2B7";

const supabaseConfigured =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function PiggyBankSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [policyOpen, setPolicyOpen] = useState(false);
  const { currency, lang, toggleCurrency, toggleLang } = usePreferences();

  useEffect(() => {
    if (!supabaseConfigured) return;
    let sub: { unsubscribe: () => void } | undefined;
    import("@/lib/supabase/client").then(({ createClient }) => {
      const supabase = createClient();
      supabase.auth.getUser().then(({ data: { user } }) => setUser(user));
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_, session) => {
        setUser(session?.user ?? null);
      });
      sub = subscription;
    });
    return () => sub?.unsubscribe();
  }, []);

  const handleSignIn = () => router.push("/login");
  const handleSignOut = async () => {
    if (!supabaseConfigured) return;
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    await supabase.auth.signOut();
    router.refresh();
  };

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  return (
    <TooltipProvider delayDuration={150}>
      <div
        className="w-[76px] shrink-0 flex flex-col items-center py-[18px]"
        style={{ backgroundColor: DARK_BG }}
      >
        <SidebarTooltip label="PiggyBank">
          <Link
            href="/"
            className="w-[34px] h-[34px] rounded-[10px] flex items-center justify-center mb-[22px] shrink-0 cursor-pointer transition-all hover:brightness-110 active:scale-95"
            style={{ backgroundColor: ACCENT }}
          >
            <PiggyBank size={18} color="#ffffff" />
          </Link>
        </SidebarTooltip>

        <div className="flex flex-col gap-1.5 flex-1">
          {NAV_ITEMS.map(({ href, labelKey, icon: Icon }) => {
            const active = isActive(href);
            return (
              <SidebarTooltip key={href} label={t(lang, labelKey)}>
                <Link
                  href={href}
                  className="w-12 h-[42px] rounded-[10px] flex items-center justify-center cursor-pointer transition-all hover:brightness-110 active:scale-95"
                  style={{ backgroundColor: active ? ACCENT : "transparent" }}
                >
                  <Icon size={18} color={active ? "#ffffff" : INACTIVE} />
                </Link>
              </SidebarTooltip>
            );
          })}

          {/* 投資方針はページ遷移ではなくポップアップで、どの画面からも1クリックで
              いつでも参照できるようにする */}
          <SidebarTooltip label={t(lang, "investmentPolicy")}>
            <button
              type="button"
              onClick={() => setPolicyOpen(true)}
              className="w-12 h-[42px] rounded-[10px] flex items-center justify-center cursor-pointer transition-all hover:brightness-110 active:scale-95"
            >
              <Landmark size={18} color={INACTIVE} />
            </button>
          </SidebarTooltip>
        </div>

        <SidebarTooltip label={t(lang, "sidebarSwitchLang")}>
          <button
            type="button"
            onClick={toggleLang}
            className="w-[34px] h-7 rounded-lg flex items-center justify-center cursor-pointer mb-2 transition-all hover:brightness-110 active:scale-95 shrink-0"
            style={{ backgroundColor: DARK_ACCENT_BG, color: MUTED_TEXT, fontSize: 10.5, fontWeight: 700 }}
          >
            {lang.toUpperCase()}
          </button>
        </SidebarTooltip>
        <SidebarTooltip label={currency === "JPY" ? t(lang, "sidebarJpy") : t(lang, "sidebarVnd")}>
          <button
            type="button"
            onClick={toggleCurrency}
            className="w-[34px] h-7 rounded-lg flex items-center justify-center cursor-pointer mb-2 transition-all hover:brightness-110 active:scale-95 shrink-0"
            style={{ backgroundColor: DARK_ACCENT_BG, color: "#F5F1EA", fontSize: 13, fontWeight: 700 }}
          >
            {currency === "JPY" ? "¥" : "₫"}
          </button>
        </SidebarTooltip>

        {user ? (
          <SidebarTooltip label={t(lang, "sidebarLogout")}>
            <button
              type="button"
              onClick={handleSignOut}
              className="w-[34px] h-[34px] rounded-[9px] flex items-center justify-center cursor-pointer transition-all hover:brightness-110 active:scale-95 shrink-0"
              style={{ backgroundColor: DARK_ACCENT_BG }}
            >
              <LogOut size={15} color={MUTED_TEXT} />
            </button>
          </SidebarTooltip>
        ) : (
          <SidebarTooltip label={t(lang, "sidebarSignIn")}>
            <button
              type="button"
              onClick={handleSignIn}
              className="w-[34px] h-[34px] rounded-[9px] flex items-center justify-center cursor-pointer transition-all hover:brightness-110 active:scale-95 shrink-0"
              style={{ backgroundColor: DARK_ACCENT_BG }}
            >
              <LogIn size={15} color={MUTED_TEXT} />
            </button>
          </SidebarTooltip>
        )}
      </div>
      <InvestmentPolicyDialog open={policyOpen} onOpenChange={setPolicyOpen} lang={lang} />
    </TooltipProvider>
  );
}

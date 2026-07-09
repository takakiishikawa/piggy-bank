"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  GO_APPS,
} from "@takaki/go-design-system";
import {
  LayoutDashboard,
  BarChart2,
  Sun,
  Moon,
  Lightbulb,
  Wallet,
  PiggyBank,
} from "lucide-react";
import type { User } from "@supabase/supabase-js";

const AppSwitcher = dynamic(() =>
  import("@takaki/go-design-system").then((m) => ({ default: m.AppSwitcher })),
);

const UserMenu = dynamic(() =>
  import("@takaki/go-design-system").then((m) => ({ default: m.UserMenu })),
);

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/budget", label: "Budget", icon: Wallet },
  { href: "/simulation", label: "Simulation", icon: PiggyBank },
  { href: "/weekly", label: "Report", icon: BarChart2 },
];

const supabaseConfigured =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function KenyakuGoSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [isDark, setIsDark] = useState(false);

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

  useEffect(() => {
    const update = () =>
      setIsDark(document.documentElement.classList.contains("dark"));
    update();
    const obs = new MutationObserver(update);
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => obs.disconnect();
  }, []);

  function toggleTheme() {
    const next = isDark ? "light" : "dark";
    localStorage.setItem("kg-theme", next);
    document.documentElement.classList.toggle("dark", next === "dark");
  }

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

  const avatarUrl = user?.user_metadata?.avatar_url as string | undefined;
  const fullName = user?.user_metadata?.full_name as string | undefined;
  const displayName = fullName || user?.email?.split("@")[0] || "";

  return (
    <Sidebar
      style={{ backgroundColor: "var(--kg-sidebar-bg)", borderColor: "var(--kg-sidebar-border)" }}
      className="border-r"
    >
      <SidebarHeader>
        <AppSwitcher currentApp="KenyakuGo" apps={GO_APPS} placement="bottom" />
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {navItems.map(({ href, label, icon: Icon }) => {
                const active = isActive(href);
                return (
                  <SidebarMenuItem key={href}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      className="h-auto rounded-[9px] py-2.5 px-3 hover:bg-transparent active:bg-transparent"
                      style={{
                        backgroundColor: active ? "var(--kg-sidebar-accent-bg)" : "transparent",
                      }}
                    >
                      <Link href={href} className="gap-2.5">
                        <Icon
                          size={17}
                          className="shrink-0"
                          style={{ color: active ? "var(--color-primary)" : "var(--kg-sidebar-inactive)" }}
                        />
                        <span
                          className="text-sm"
                          style={{
                            fontWeight: active ? 600 : 500,
                            color: active ? "var(--color-primary)" : "var(--kg-sidebar-inactive)",
                          }}
                        >
                          {label}
                        </span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        {user ? (
          <UserMenu
            displayName={displayName || "—"}
            email={user.email ?? undefined}
            avatarUrl={avatarUrl}
            items={[
              {
                title: "Concept",
                icon: Lightbulb,
                onSelect: () => router.push("/concept"),
                isActive: isActive("/concept"),
              },
              {
                title: isDark ? "Dark" : "Light",
                icon: isDark ? Moon : Sun,
                onSelect: toggleTheme,
              },
            ]}
            signOut={{ onSelect: handleSignOut }}
          />
        ) : (
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={toggleTheme}
                className="cursor-pointer"
              >
                {isDark ? (
                  <Moon className="h-4 w-4 shrink-0" />
                ) : (
                  <Sun className="h-4 w-4 shrink-0" />
                )}
                {isDark ? "Dark" : "Light"}
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={handleSignIn}
                className="cursor-pointer"
              >
                <span className="text-sm">Sign in with Google</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        )}
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}

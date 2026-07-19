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
  cn,
  Avatar,
  AvatarImage,
  AvatarFallback,
} from "@takaki/go-design-system";
import {
  LayoutDashboard,
  BarChart2,
  Wallet,
  Target,
  LogOut,
} from "lucide-react";
import type { User } from "@supabase/supabase-js";

const AppSwitcher = dynamic(() =>
  import("@takaki/go-design-system").then((m) => ({ default: m.AppSwitcher })),
);

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/budget", label: "Budget", icon: Wallet },
  { href: "/simulation", label: "Simulation", icon: Target },
  { href: "/weekly", label: "Report", icon: BarChart2 },
];

const supabaseConfigured =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function PiggyBankSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);

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

  const avatarUrl = user?.user_metadata?.avatar_url as string | undefined;
  const fullName = user?.user_metadata?.full_name as string | undefined;
  const displayName = fullName || user?.email?.split("@")[0] || "";

  return (
    <Sidebar
      style={{ backgroundColor: "var(--kg-sidebar-bg)", borderColor: "var(--kg-sidebar-border)" }}
      className="border-r"
    >
      <SidebarHeader>
        <AppSwitcher currentApp="PiggyBank" apps={GO_APPS} placement="bottom" />
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
                      className={cn(
                        "h-auto rounded-[9px] py-2.5 px-3 transition-all active:scale-[0.97]",
                        active && "hover:brightness-95 active:brightness-90",
                      )}
                      style={active ? { backgroundColor: "var(--kg-sidebar-accent-bg)" } : undefined}
                    >
                      <Link href={href} className="gap-2.5">
                        <Icon
                          size={17}
                          className="shrink-0"
                          style={{ color: active ? "var(--kg-sidebar-active-icon)" : "var(--kg-sidebar-inactive)" }}
                        />
                        <span
                          className="text-sm"
                          style={{
                            fontWeight: active ? 600 : 500,
                            color: active ? "var(--kg-sidebar-text)" : "var(--kg-sidebar-inactive)",
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
          <div className="flex items-center gap-2.5 px-2 py-2">
            <Avatar className="h-8 w-8 shrink-0">
              {avatarUrl && <AvatarImage src={avatarUrl} alt={displayName} />}
              <AvatarFallback className="text-xs font-semibold">
                {(displayName || "?").charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p
                className="text-sm font-semibold truncate"
                style={{ color: "var(--kg-sidebar-text)" }}
              >
                {displayName || "—"}
              </p>
              {user.email && (
                <p
                  className="text-xs truncate"
                  style={{ color: "var(--kg-sidebar-inactive)" }}
                >
                  {user.email}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              title="Sign out"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] transition-all hover:bg-muted/60 active:scale-90 active:bg-muted cursor-pointer"
              style={{ color: "var(--kg-sidebar-inactive)" }}
            >
              <LogOut size={16} />
            </button>
          </div>
        ) : (
          <SidebarMenu>
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

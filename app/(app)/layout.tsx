import { redirect } from "next/navigation";
import { AppLayout } from "@takaki/go-design-system";
import { createClient } from "@/lib/supabase/server";
import { PiggyBankSidebar } from "./client-sidebar";

const supabaseConfigured =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export default async function AppGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (supabaseConfigured) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/login");
  }
  return <AppLayout sidebar={<PiggyBankSidebar />}>{children}</AppLayout>;
}

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PiggyBankSidebar } from "./client-sidebar";
import { MizuhoImportBanner } from "@/components/mizuho-import-banner";

const supabaseConfigured =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Claude Design (PiggyBank.dc.html) 通りの外枠: 76px固定サイドバー + スクロール可能な
// コンテンツ領域のみの単純なflex構成。go-design-systemのAppLayout(ヘッダーバー+
// 展開/省略トグル付きSidebarProvider)は使わない — デザインにヘッダーバーは無く、
// サイドバーも常時アイコンのみの固定幅という前提のため。
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
  return (
    // h-screen + overflow-hidden をここで固定し、スクロールはコンテンツ領域だけに
    // 閉じ込める(サイドバーの高さがコンテンツの高さに引っ張られてログアウトボタンが
    // 画面外に出てしまわないように)。
    <div className="flex w-full h-screen overflow-hidden" style={{ backgroundColor: "#FAF5EE" }}>
      <PiggyBankSidebar />
      <div className="flex-1 flex flex-col min-w-0 h-full">
        {/* 毎月1日〜、みずほ銀行(日本側)の出金CSVアップロードを促す通知バナー。
            スクロール領域の外に置き、全画面の最上部に常に見えるようにする。 */}
        <MizuhoImportBanner />
        {/* 上部の余白は、スクロールコンテナ自身の padding-top ではなく中の div に
            付ける。scroll containerのpadding-topはCSS仕様上スクロールしても消えず、
            position:stickyな子要素(Simulationテーブルのヘッダー等)がその分だけ
            浮いた位置で貼り付いてしまう(実機で確認済みのバグ)。 */}
        <div className="flex-1 overflow-y-auto px-8 pb-12">
          <div className="pt-6">{children}</div>
        </div>
      </div>
    </div>
  );
}

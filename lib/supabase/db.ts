import { createClient } from "@supabase/supabase-js";

// piggybank スキーマのテーブル型
export interface Category {
  id: string;
  name: string;
  budget: number;
  is_fixed: boolean;
  created_at: string;
}

export type TransactionSource = "vietcombank" | "mizuho";

export interface Transaction {
  id: string;
  gmail_id: string | null;
  store: string;
  amount: number;
  date: string;
  category: string;
  reviewed: boolean;
  note: string | null;
  excluded_from_dashboard: boolean;
  special_entry_id: string | null;
  // データ経由: vietcombank = Gmail自動取込 / mizuho = CSV手動アップロード
  source: TransactionSource;
  // 取込元での一意キー(みずほ = 明細通番)。重複取込の防止に使う。
  external_id: string | null;
  created_at: string;
}

// みずほ銀行CSVの月次アップロード状況(1行 = 1暦月)
export interface MizuhoMonthlyImport {
  month: string; // 'YYYY-MM'
  status: "imported" | "no_expense";
  imported_count: number;
  created_at: string;
}

// ユーザーが手動で確定した店舗→カテゴリの正解ルール（AI推測とは分離）
export interface StoreCategoryRule {
  store: string;
  category: string;
  updated_at: string;
}

export interface Settings {
  id: string;
  target_monthly: number;
  fixed_costs: number;
  google_refresh_token?: string;
  updated_at: string;
}

export interface Wish {
  id: string;
  name: string;
  status: "want" | "got";
  image_url: string | null;
  created_at: string;
  updated_at: string;
}

// 実際に投資した金額の記録(ダッシュボードの「投資を記録」ボタンから登録)
export interface InvestmentEntry {
  id: string;
  amount_vnd: number;
  invested_on: string;
  note: string | null;
  created_at: string;
}

export interface Subscription {
  store: string;
  category: string;
  amount: number;
  last_charged_at: string;
  judgment: "sub" | "not_sub" | "unknown";
  reasoning: string | null;
  is_active: boolean;
  user_locked: boolean;
  judged_at: string;
  updated_at: string;
}

// piggybank スキーマ固定のクライアント
// accessToken を渡すと RLS が認証済みユーザーとして評価される
export function createDb(accessToken?: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      db: { schema: "piggybank" },
      global: accessToken
        ? { headers: { Authorization: `Bearer ${accessToken}` } }
        : undefined,
    },
  );
}

// service_role 接続。cron 等の無人バッチで RLS を bypass するため。
// SUPABASE_SERVICE_ROLE_KEY は秘匿（クライアント側に絶対漏らさない）。
export function createDbAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      db: { schema: "piggybank" },
      auth: { autoRefreshToken: false, persistSession: false },
    },
  );
}

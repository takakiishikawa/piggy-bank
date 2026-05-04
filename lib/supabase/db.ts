import { createClient } from "@supabase/supabase-js";

// kenyakugo スキーマのテーブル型
export interface AiComment {
  period_key: string;
  comment: string;
  created_at: string;
}

export interface Category {
  id: string;
  name: string;
  created_at: string;
}

export interface Transaction {
  id: string;
  gmail_id: string;
  store: string;
  amount: number;
  date: string;
  category: string;
  created_at: string;
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
  price: number | null;
  url: string | null;
  note: string | null;
  priority: "high" | "mid" | "low";
  status: "want" | "got" | "gave_up";
  image_url: string | null;
  created_at: string;
  updated_at: string;
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

// kenyakugo スキーマ固定のクライアント
// accessToken を渡すと RLS が認証済みユーザーとして評価される
export function createDb(accessToken?: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      db: { schema: "kenyakugo" },
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
      db: { schema: "kenyakugo" },
      auth: { autoRefreshToken: false, persistSession: false },
    },
  );
}

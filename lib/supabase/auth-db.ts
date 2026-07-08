import { NextResponse } from "next/server";
import { createClient } from "./server";
import { createDb } from "./db";

/**
 * APIルートで認証済みDBクライアントを取得する。
 * セッションがない場合は401レスポンスを返す。
 *
 * 使用例:
 *   const result = await getAuthDb();
 *   if (result instanceof NextResponse) return result;
 *   const { db } = result;
 */
export async function getAuthDb() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  const db = createDb(session.access_token);
  return { db, session };
}

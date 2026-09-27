/** ダム積み立て開始月 */
export const DAM_START = new Date(2026, 3, 1); // 2026年4月1日

/** 週次比較から除外する固定費カテゴリ */
export const FIXED_CATEGORIES = ["Rent", "Phone"] as const;

/** 未分類・フォールバック用カテゴリ名 */
export const FALLBACK_CATEGORY = "Other";

/** 削除不可の固定費カテゴリ名(常に存在している必要があるもの) */
// 「Cash (Unitemized)」は現金財布(lib/cash.ts)のATM引き出し・現金(内訳なし)用。
export const UNDELETABLE_CATEGORIES = ["Rent", "Cash (Unitemized)"] as const;

/** AI一括分類のバッチサイズ（店名数） */
export const AI_CATEGORIZE_BATCH_SIZE = 100;

/** Gmail同期の1回あたり最大処理件数 */
export const GMAIL_SYNC_BATCH_SIZE = 200;

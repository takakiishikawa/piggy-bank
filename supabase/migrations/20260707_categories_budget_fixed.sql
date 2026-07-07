-- categories テーブルに月次予算と固定費フラグを追加
ALTER TABLE kenyakugo.categories
  ADD COLUMN IF NOT EXISTS budget INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_fixed BOOLEAN NOT NULL DEFAULT FALSE;

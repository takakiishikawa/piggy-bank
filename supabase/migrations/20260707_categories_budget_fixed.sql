-- categories テーブルに月次予算と固定費フラグを追加
ALTER TABLE kenyakugo.categories
  ADD COLUMN IF NOT EXISTS budget INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_fixed BOOLEAN NOT NULL DEFAULT FALSE;

-- これまでコード定数 FIXED_CATEGORIES で固定費扱いしていた家賃・通信を is_fixed=true に移行
UPDATE kenyakugo.categories
  SET is_fixed = TRUE
  WHERE name IN ('家賃', '通信');

-- ブランドを PiggyBank に統一するため、スキーマ名 kenyakugo を piggybank にリネーム。
-- 適用前に Supabase Dashboard > Settings > API > Exposed schemas に
-- "piggybank" を追加しておくこと（追加しないと適用直後 PostgREST が 404 を返す）。
-- 適用後、忘れず "kenyakugo" は Exposed schemas から外す。
alter schema kenyakugo rename to piggybank;

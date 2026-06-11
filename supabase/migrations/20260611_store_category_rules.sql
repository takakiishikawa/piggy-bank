-- 店舗→カテゴリの手動修正ルール
-- ユーザーが手動でカテゴリを修正した「人間が確定した正解」を永続化する。
-- AI の推測（transactions.category）とは分離して保存し、同期・AI分類は
-- このテーブルを最優先で参照する。これにより「一度直した店舗は次回必ず
-- そのカテゴリで取り込まれる」を保証する。
-- 個人・会社への送金（beneficiary 名）も store として同様に扱う。

create table if not exists kenyakugo.store_category_rules (
  store text primary key,
  category text not null,
  updated_at timestamptz not null default now()
);

alter table kenyakugo.store_category_rules enable row level security;

create policy "auth all access" on kenyakugo.store_category_rules
  for all to authenticated
  using (true)
  with check (true);

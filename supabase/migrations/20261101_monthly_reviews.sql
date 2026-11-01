-- 月初の「先月のふりかえり」(lib/monthly-review.ts)。1行 = ふりかえる暦月。
-- - content_ja / content_en: Claude が書いたふりかえり文(うまくいったこと・
--   次は気をつけたいこと・来月に向けて)。月に1回だけ作って保存し、開くたびに
--   作り直さない。言語ごとに別に持つ。
-- - dismissed_at: 自動表示のポップアップを閉じた日時。あればその月はもう自動では
--   出さない(レポート画面からはいつでも開き直せる)。
create table if not exists piggybank.monthly_reviews (
  month text primary key,                 -- 'YYYY-MM'(ふりかえる月)
  content_ja jsonb,
  content_en jsonb,
  dismissed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table piggybank.monthly_reviews enable row level security;

create policy "auth all access" on piggybank.monthly_reviews
  for all to authenticated
  using (true)
  with check (true);

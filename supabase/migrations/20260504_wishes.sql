-- ウィッシュリスト
-- 欲しいもの・将来買いたいものを記録。価格・URL・優先度・ステータスを管理。

create table if not exists kenyakugo.wishes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price bigint,
  url text,
  note text,
  priority text not null default 'mid' check (priority in ('high', 'mid', 'low')),
  status text not null default 'want' check (status in ('want', 'got', 'gave_up')),
  image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists wishes_status_priority_idx
  on kenyakugo.wishes (status, priority);

create index if not exists wishes_created_at_idx
  on kenyakugo.wishes (created_at desc);

alter table kenyakugo.wishes enable row level security;

create policy "auth all access" on kenyakugo.wishes
  for all to authenticated
  using (true)
  with check (true);

-- みずほ銀行(日本側)の出金データを、月1回CSVアップロードで取り込むための対応。
-- Vietcombank は Gmail 自動取込、みずほ は手動CSV取込。取引がどちら経由かを
-- source 列で持ち、Transactions画面のアイコン表示にも使う。

-- 取引のデータ経由。既存行はすべて Vietcombank(Gmail取込)。
alter table piggybank.transactions
  add column if not exists source text not null default 'vietcombank';

-- みずほCSVの明細通番など、取込元での一意キー(重複取込の防止に使う)。
alter table piggybank.transactions
  add column if not exists external_id text;

-- gmail_id は Vietcombank 専用。みずほ明細は持たないため NULL 許容にする。
alter table piggybank.transactions
  alter column gmail_id drop not null;

-- 同じ明細を二重に取り込まないための一意制約(source + 取込元の一意キー)。
create unique index if not exists transactions_source_external_id_uniq
  on piggybank.transactions (source, external_id)
  where external_id is not null;

-- みずほ銀行CSVの月次アップロード状況。1行 = 1暦月。
-- その月に「取込」もしくは「日本側の支出なし」を実施すると1行できて、
-- 毎月1日の通知バナーはその月の行が無いあいだだけ表示される。
create table if not exists piggybank.mizuho_monthly_imports (
  month text primary key,                 -- 'YYYY-MM'(実施した暦月)
  status text not null,                   -- 'imported' | 'no_expense'
  imported_count integer not null default 0,
  created_at timestamptz not null default now()
);

alter table piggybank.mizuho_monthly_imports enable row level security;

create policy "auth all access" on piggybank.mizuho_monthly_imports
  for all to authenticated
  using (true)
  with check (true);

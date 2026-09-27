-- 現金財布機能(lib/cash.ts)。
-- ATMで引き出した現金を「財布」として扱い、覚えている現金支出だけをカテゴリに
-- 振り分ける。分類できなかった分は「現金(内訳なし)」カテゴリの実績として残す。
--
-- - 引き出し: 摘要が「ＡＴＭ－」「７ＢＫ」で始まる取引。category = 'Cash (Unitemized)'。
-- - 現金支出の記録: transactions.source = 'cash' の行(source は text 列なので型変更は不要)。
--   選んだカテゴリの実績に加算し、同じ月の財布(引き出し額)からは差し引く。

-- 「現金(内訳なし)」カテゴリ(変動費、予算は設定画面で入力)。
insert into piggybank.categories (name, budget, is_fixed)
select 'Cash (Unitemized)', 0, false
where not exists (
  select 1 from piggybank.categories where name = 'Cash (Unitemized)'
);

-- 既に取り込み済みのATM引き出しを「現金引き出し」に付け替える
-- (これまでは「その他」や推測カテゴリに入っていた)。
update piggybank.transactions
set category = 'Cash (Unitemized)', reviewed = true
where source <> 'cash'
  and (
    store like 'ＡＴＭ－%'
    or store like '７ＢＫ%'
    or upper(store) like 'ATM-%'
    or upper(store) like '7BK%'
  );

-- 引き出しの摘要は毎回違う通番なので店舗ルールとして意味が無い。学習済みの
-- ルールがあれば消しておく(カテゴリの自動適用で財布から外れないように)。
delete from piggybank.store_category_rules
where store like 'ＡＴＭ－%'
  or store like '７ＢＫ%'
  or upper(store) like 'ATM-%'
  or upper(store) like '7BK%';

-- 現金支出の記録を月単位で引くための索引。
create index if not exists transactions_source_date_idx
  on piggybank.transactions (source, date);

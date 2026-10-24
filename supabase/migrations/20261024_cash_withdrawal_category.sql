-- ATM引き出しを「現金(内訳なし)」から独立した「ATM引き出し」カテゴリ(Cash Withdrawal)へ分ける。
-- これまでは引き出し(口座 → 財布の移動)と、手元の現金との差額(使い道の分からない支出)が
-- 同じ 'Cash (Unitemized)' に入っていて紛らわしかった。差額側は表示名を「用途不明」にする。
--
-- 'Cash Withdrawal' は支出ではないので piggybank.categories には行を作らない
-- (予算・シミュレーション・AI分類の対象外。取引一覧の表示と絞り込みにだけ使う)。
-- 現金財布を始める前(2026-08以前)の引き出しは、引き出した時点で支出扱いだったので
-- 過去月の集計を変えないよう 'Cash (Unitemized)' のまま残す。

update piggybank.transactions
set category = 'Cash Withdrawal', reviewed = true
where category = 'Cash (Unitemized)'
  and source <> 'cash'
  and date >= '2026-09-01';

-- 「手元の現金に合わせる」で作った差額取引の店舗名も新しい表示名にそろえる。
update piggybank.transactions
set store = '用途不明'
where source = 'cash'
  and category = 'Cash (Unitemized)'
  and store = '現金(内訳なし)';

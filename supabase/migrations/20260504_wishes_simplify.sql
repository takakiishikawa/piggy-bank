-- ウィッシュリストの簡略化
-- 名前と画像（Unsplash 自動取得）と status だけ残す。
-- 「あきらめた」を廃止し、status は want / got の2値に。

alter table kenyakugo.wishes drop column if exists price;
alter table kenyakugo.wishes drop column if exists url;
alter table kenyakugo.wishes drop column if exists note;
alter table kenyakugo.wishes drop column if exists priority;

-- 旧 gave_up は want に寄せる（あきらめたを廃止）
update kenyakugo.wishes set status = 'want' where status = 'gave_up';

alter table kenyakugo.wishes drop constraint if exists wishes_status_check;
alter table kenyakugo.wishes
  add constraint wishes_status_check check (status in ('want', 'got'));

drop index if exists kenyakugo.wishes_status_priority_idx;
create index if not exists wishes_status_idx
  on kenyakugo.wishes (status);

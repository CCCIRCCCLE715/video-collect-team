-- Existing records remain reference material; no invented topic suggestions.
alter table public.member_topic_entries
 add column entry_type text not null default 'reference',
 add column topic_suggestion text not null default '',
 add constraint member_entry_type_valid check(entry_type in ('reference','topic')),
 add constraint member_topic_suggestion_valid check(
   (entry_type='reference' and topic_suggestion='') or
   (entry_type='topic' and topic_suggestion ~ '[^[:space:]]' and char_length(topic_suggestion)<=4000));
alter table public.member_topic_entries drop constraint member_topic_entries_topic_id_user_id_week_start_key;
alter table public.member_topic_entries add constraint member_entry_type_unique unique(topic_id,user_id,week_start,entry_type);

create function app_private.validate_entry_type(p_type text,p_suggestion text) returns void
language plpgsql immutable set search_path=pg_catalog as $$
begin
 if coalesce(p_type,'') not in ('reference','topic') then raise exception '请选择参考视频或选题'; end if;
 if p_type='topic' and (p_suggestion is null or p_suggestion !~ '[^[:space:]]' or char_length(btrim(p_suggestion,E' \t\r\n'))>4000) then
 raise exception '请填写视频选题建议，说明做什么主题、准备怎么做（最多 4000 字）'; end if;
end $$;
revoke all on function app_private.validate_entry_type(text,text) from public,anon,authenticated;

create or replace function app_private.capture_topic(p_member_id uuid,p_data jsonb,p_cover_path text,p_at timestamptz)
returns uuid language plpgsql security definer set search_path = public,pg_temp as $$
declare v_topic text; v_data jsonb; v_id uuid; v_week date; v_cover text;
begin
 perform app_private.validate_entry_type(p_data->>'entry_type',p_data->>'topic_suggestion');
 if p_data->>'entry_type'='topic' and jsonb_typeof(p_data->'topic_suggestion')<>'string' then
 raise exception '视频选题建议必须是文字'; end if;
 v_topic=app_private.upsert_topic_metadata(p_member_id,p_data,p_cover_path);
 perform app_private.ensure_library_weeks(p_at);
 v_week=greatest('2026-10-14'::date,app_private.collection_week(p_at));
 select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) into v_data from jsonb_each(p_data)
 where key in ('id','platform','platform_label','url','title','author','description','summary','summary_basis',
 'published_at','month','likes','likes_label','duration','views','comments')
 and value<>'null'::jsonb and value<>'""'::jsonb and (key<>'title' or value<>'"信息待补"'::jsonb);
 select cover_path into v_cover from public.topics where id=v_topic;
 insert into public.member_topic_entries(topic_id,user_id,week_start,data,cover_path,captured_at,updated_at,entry_type,topic_suggestion)
 values(v_topic,p_member_id,v_week,v_data,coalesce(p_cover_path,v_cover),p_at,clock_timestamp(),p_data->>'entry_type',case when p_data->>'entry_type'='topic' then btrim(p_data->>'topic_suggestion',E' \t\r\n') else '' end)
 on conflict(topic_id,user_id,week_start,entry_type) do update set topic_suggestion=excluded.topic_suggestion,data=member_topic_entries.data||excluded.data,
 cover_path=coalesce(p_cover_path,member_topic_entries.cover_path),updated_at=clock_timestamp()
 returning id into v_id;
 return v_id;
end $$;
create or replace function public.list_weekly_topics() returns jsonb
language plpgsql stable security definer set search_path = public,pg_temp as $$
declare result jsonb;
begin
 if not public.is_team_member() then raise exception '未加入团队' using errcode='42501'; end if;
 select coalesce(jsonb_agg(e.data||jsonb_build_object(
 'entry_type',e.entry_type,'topic_suggestion',e.topic_suggestion,'id',e.id,'topic_id',e.topic_id,'owner_id',e.user_id,'owner_name',m.name,
 'week_start',e.week_start,'week_end',w.end_date,
 'collected_on',(e.captured_at at time zone 'Asia/Shanghai')::date,
 'captured_at',e.captured_at,'updated_at',e.updated_at,'deleted_at',e.deleted_at,'cover_path',e.cover_path,
 'title',coalesce(e.data->>'title','信息待补'),'author',coalesce(e.data->>'author',''),
 'summary',coalesce(e.data->>'summary',''),'description',coalesce(e.data->>'description',''),
 'status','link','kind','媒体','origins',jsonb_build_array('import'),'images',jsonb_build_array(),
 'month',case when e.data->>'month' ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
 then e.data->>'month' else to_char(e.captured_at at time zone 'Asia/Shanghai','YYYY-MM') end,
 'contributors',jsonb_build_array(m.name),
 'metadata_status',case when e.data->>'title' is null then 'pending'
 when coalesce(e.data->>'author','')<>'' and coalesce(e.data->>'summary','')<>'' and e.data->>'published_at' is not null then 'complete' else 'partial' end
 ) order by e.captured_at desc),'[]'::jsonb) into result
 from public.member_topic_entries e join public.team_members m on m.user_id=e.user_id
 join public.library_weeks w on w.start_date=e.week_start;
 return result;
end $$;

revoke all on function public.list_weekly_topics() from public,anon;
grant execute on function public.list_weekly_topics() to authenticated;

-- Reclassification keeps the entry ID, cover, week, comments and favorites.
create function public.set_entry_type(p_id uuid,p_type text,p_suggestion text default '') returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_entry public.member_topic_entries;
begin
 if not public.is_team_member() then raise exception '未加入团队' using errcode='42501'; end if;
 select * into v_entry from public.member_topic_entries where id=p_id and user_id=auth.uid() for update;
 if not found then raise exception '只能修改自己的记录' using errcode='42501'; end if;
 if v_entry.deleted_at is not null then raise exception '记录已删除，请恢复后修改'; end if;
 perform app_private.validate_entry_type(p_type,p_suggestion);
 if exists(select 1 from public.member_topic_entries where topic_id=v_entry.topic_id and user_id=v_entry.user_id
   and week_start=v_entry.week_start and entry_type=p_type and id<>p_id) then
 raise exception '本周已有这个分类的同一视频，请编辑已有记录（也请检查已删除列表）'; end if;
 update public.member_topic_entries set entry_type=p_type,
 topic_suggestion=case when p_type='topic' then btrim(p_suggestion,E' \t\r\n') else '' end,
 updated_at=clock_timestamp() where id=p_id;
exception when unique_violation then raise exception '本周已有这个分类的同一视频，请刷新后重试';
end $$;
revoke all on function public.set_entry_type(uuid,text,text) from public,anon,authenticated;
grant execute on function public.set_entry_type(uuid,text,text) to authenticated;

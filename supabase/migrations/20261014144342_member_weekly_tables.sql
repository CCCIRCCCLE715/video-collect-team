-- Weekly collections begin Wednesday 00:00 in Asia/Shanghai.
create schema if not exists app_private;
revoke all on schema app_private from public,anon,authenticated;
create function app_private.collection_week(p_at timestamptz) returns date
language sql immutable set search_path = pg_catalog as $$
 select (p_at at time zone 'Asia/Shanghai')::date
   - ((extract(dow from p_at at time zone 'Asia/Shanghai')::int+4)%7);
$$;
create table public.library_weeks (
 start_date date primary key,
 end_date date not null,
 created_at timestamptz not null default now(),
 check(end_date=start_date+6),
 check(start_date>='2026-10-14'::date and extract(dow from start_date)=3)
);
create table public.member_week_tables (
 user_id uuid references public.team_members(user_id) on delete cascade,
 week_start date references public.library_weeks(start_date) on delete cascade,
 created_at timestamptz not null default now(),
 primary key(user_id,week_start)
);
create index member_week_tables_week on public.member_week_tables(week_start);
create table public.member_topic_entries (
 id uuid primary key default gen_random_uuid(),
 topic_id text not null references public.topics(id) on delete cascade,
 user_id uuid not null,
 week_start date not null,
 data jsonb not null,
 cover_path text,
 captured_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 deleted_at timestamptz,
 unique(topic_id,user_id,week_start),
 foreign key(user_id,week_start) references public.member_week_tables(user_id,week_start) on delete cascade
);
create index member_topic_entries_member_week on public.member_topic_entries(user_id,week_start);
create index member_topic_entries_cover on public.member_topic_entries(cover_path) where cover_path is not null;
alter table public.library_weeks enable row level security;
alter table public.member_week_tables enable row level security;
alter table public.member_topic_entries enable row level security;
create policy team_read_weeks on public.library_weeks for select to authenticated using((select public.is_team_member()));
create policy team_read_week_tables on public.member_week_tables for select to authenticated using((select public.is_team_member()));
create policy team_read_entries on public.member_topic_entries for select to authenticated using((select public.is_team_member()));
revoke all on public.library_weeks,public.member_week_tables,public.member_topic_entries from public,anon,authenticated;
grant select on public.library_weeks,public.member_week_tables,public.member_topic_entries to authenticated;

create function app_private.ensure_library_weeks(p_at timestamptz default now()) returns void
language plpgsql security definer set search_path = public,pg_temp as $$
begin
 insert into public.library_weeks(start_date,end_date)
 select day::date,day::date+6 from generate_series('2026-10-14'::date,
   app_private.collection_week(p_at),'7 days'::interval) day
 on conflict do nothing;
 insert into public.member_week_tables(user_id,week_start)
 select m.user_id,w.start_date from public.team_members m cross join public.library_weeks w
 on conflict do nothing;
end $$;
update public.team_members set name='鲍朴' where name='豹朴';
select app_private.ensure_library_weeks();
-- Existing selections enter the first collection without changing their metadata.
insert into public.member_topic_entries(topic_id,user_id,week_start,data,cover_path,captured_at,updated_at,deleted_at)
 select t.id,c.user_id,greatest('2026-10-14'::date,app_private.collection_week(t.created_at)),
 t.data,t.cover_path,t.created_at,t.updated_at,t.deleted_at
 from public.topics t join public.topic_contributors c on c.topic_id=t.id
 join public.team_members m on m.user_id=c.user_id;

-- Retain the existing validation code behind a private wrapper. Agent imports keep their API.
alter function public.upsert_topic_as_member(uuid,jsonb,text) rename to upsert_topic_metadata;
alter function public.upsert_topic_metadata(uuid,jsonb,text) set schema app_private;
revoke all on function app_private.upsert_topic_metadata(uuid,jsonb,text) from public,anon,authenticated,service_role;
create function app_private.capture_topic(p_member_id uuid,p_data jsonb,p_cover_path text,p_at timestamptz)
returns uuid language plpgsql security definer set search_path = public,pg_temp as $$
declare v_topic text; v_data jsonb; v_id uuid; v_week date; v_cover text;
begin
 v_topic=app_private.upsert_topic_metadata(p_member_id,p_data,p_cover_path);
 perform app_private.ensure_library_weeks(p_at);
 v_week=greatest('2026-10-14'::date,app_private.collection_week(p_at));
 select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) into v_data from jsonb_each(p_data)
 where key in ('id','platform','platform_label','url','title','author','description','summary','summary_basis',
 'published_at','month','likes','likes_label','duration','views','comments')
 and value<>'null'::jsonb and value<>'""'::jsonb and (key<>'title' or value<>'"信息待补"'::jsonb);
 select cover_path into v_cover from public.topics where id=v_topic;
 insert into public.member_topic_entries(topic_id,user_id,week_start,data,cover_path,captured_at,updated_at)
 values(v_topic,p_member_id,v_week,v_data,coalesce(p_cover_path,v_cover),p_at,clock_timestamp())
 on conflict(topic_id,user_id,week_start) do update set data=member_topic_entries.data||excluded.data,
 cover_path=coalesce(p_cover_path,member_topic_entries.cover_path),updated_at=clock_timestamp()
 returning id into v_id;
 return v_id;
end $$;
create function public.upsert_topic_as_member(p_member_id uuid,p_data jsonb,p_cover_path text default null)
returns text language plpgsql security definer set search_path = public,pg_temp as $$
begin
 perform app_private.capture_topic(p_member_id,p_data,p_cover_path,now());
 return p_data->>'id';
end $$;

create function public.weekly_library_state() returns jsonb
language plpgsql security definer set search_path = public,pg_temp as $$
declare v_current date; v_weeks jsonb; v_members jsonb; v_revision text;
begin
 if not public.is_team_member() then raise exception '未加入团队' using errcode='42501'; end if;
 perform app_private.ensure_library_weeks();
 v_current=greatest('2026-10-14'::date,app_private.collection_week(now()));
 select coalesce(jsonb_agg(jsonb_build_object('start_date',start_date,'end_date',end_date) order by start_date desc),'[]'::jsonb) into v_weeks from public.library_weeks;
 select coalesce(jsonb_agg(jsonb_build_object('user_id',user_id,'name',name) order by name),'[]'::jsonb) into v_members from public.team_members;
 select md5(coalesce(max(updated_at)::text,'')||count(*)::text||v_weeks::text||v_members::text) into v_revision from public.member_topic_entries;
 return jsonb_build_object('current_week',v_current,'weeks',v_weeks,'members',v_members,'revision',v_revision);
end $$;
create function public.list_weekly_topics() returns jsonb
language plpgsql stable security definer set search_path = public,pg_temp as $$
declare result jsonb;
begin
 if not public.is_team_member() then raise exception '未加入团队' using errcode='42501'; end if;
 select coalesce(jsonb_agg(e.data||jsonb_build_object(
 'id',e.id,'topic_id',e.topic_id,'owner_id',e.user_id,'owner_name',m.name,
 'week_start',e.week_start,'week_end',w.end_date,
 'collected_on',(e.captured_at at time zone 'Asia/Shanghai')::date,
 'captured_at',e.captured_at,'updated_at',e.updated_at,'deleted_at',e.deleted_at,'cover_path',e.cover_path,
 'title',coalesce(e.data->>'title','信息待补'),'author',coalesce(e.data->>'author',''),
 'summary',coalesce(e.data->>'summary',''),'description',coalesce(e.data->>'description',''),
 'status','link','kind','媒体','origins',jsonb_build_array('import'),'images',jsonb_build_array(),
 'month',to_char(e.captured_at at time zone 'Asia/Shanghai','YYYY-MM'),
 'contributors',jsonb_build_array(m.name),
 'metadata_status',case when e.data->>'title' is null then 'pending'
 when coalesce(e.data->>'author','')<>'' and coalesce(e.data->>'summary','')<>'' and e.data->>'published_at' is not null then 'complete' else 'partial' end
 ) order by e.captured_at desc),'[]'::jsonb) into result
 from public.member_topic_entries e join public.team_members m on m.user_id=e.user_id
 join public.library_weeks w on w.start_date=e.week_start;
 return result;
end $$;
create function public.set_entry_deleted(p_id uuid,p_deleted boolean) returns void
language plpgsql security definer set search_path = public,pg_temp as $$
begin
 if not public.is_team_member() then raise exception '未加入团队' using errcode='42501'; end if;
 update public.member_topic_entries set deleted_at=case when p_deleted then now() else null end,
 updated_at=clock_timestamp() where id=p_id and user_id=auth.uid();
 if not found then raise exception '只能修改自己的选题' using errcode='42501'; end if;
end $$;
create function public.replace_entry_cover(p_id uuid,p_cover_path text) returns void
language plpgsql security definer set search_path = public,pg_temp as $$
begin
 if not public.is_team_member() then raise exception '未加入团队' using errcode='42501'; end if;
 if not exists(select 1 from public.member_topic_entries where id=p_id and user_id=auth.uid()) then
 raise exception '只能修改自己的选题' using errcode='42501'; end if;
 if p_cover_path is null or p_cover_path !~ ('^'||auth.uid()::text||'/[a-f0-9]{32}[.](jpg|png|webp)$') then raise exception '封面路径无效'; end if;
 if not exists(select 1 from storage.objects where bucket_id='covers' and name=p_cover_path) then raise exception '封面尚未上传'; end if;
 update public.member_topic_entries set cover_path=p_cover_path,updated_at=clock_timestamp() where id=p_id;
end $$;
drop policy own_unused_cover_cleanup on storage.objects;
create policy own_unused_cover_cleanup on storage.objects for delete to authenticated
using(bucket_id='covers' and public.is_team_member() and (storage.foldername(name))[1]=auth.uid()::text
 and not exists(select 1 from public.topics where cover_path=name)
 and not exists(select 1 from public.member_topic_entries where cover_path=name));

revoke all on function app_private.collection_week(timestamptz),app_private.ensure_library_weeks(timestamptz),
 app_private.capture_topic(uuid,jsonb,text,timestamptz),public.upsert_topic_as_member(uuid,jsonb,text),
 public.weekly_library_state(),public.list_weekly_topics(),public.set_entry_deleted(uuid,boolean),public.replace_entry_cover(uuid,text)
 from public,anon,authenticated;
grant execute on function public.upsert_topic_as_member(uuid,jsonb,text) to service_role;
grant execute on function public.weekly_library_state(),public.list_weekly_topics(),public.set_entry_deleted(uuid,boolean),public.replace_entry_cover(uuid,text) to authenticated;

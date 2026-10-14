-- Run once in a new Supabase project. No personal catalog is included.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table public.team_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80)
);
create function public.limit_team_members() returns trigger language plpgsql
set search_path = public, pg_temp as $$
begin
  perform pg_advisory_xact_lock(941013);
  if (select count(*) from public.team_members) >= 4 then
    raise exception '团队最多四名成员';
  end if;
  return new;
end $$;
create trigger limit_team_members before insert on public.team_members
for each row execute function public.limit_team_members();

create table public.topics (
  id text primary key,
  data jsonb not null,
  cover_path text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null
);
create table public.topic_contributors (
  topic_id text references public.topics(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  primary key (topic_id,user_id)
);
create table public.agent_tokens (
  user_id uuid primary key references public.team_members(user_id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now()
);
create index topics_updated_at on public.topics(updated_at desc);
create function public.is_team_member() returns boolean language sql stable
security definer set search_path = public, pg_temp as $$
  select exists(select 1 from public.team_members where user_id=auth.uid());
$$;
alter table public.team_members enable row level security;
alter table public.topics enable row level security;
alter table public.topic_contributors enable row level security;
alter table public.agent_tokens enable row level security;
create policy member_read_members on public.team_members for select to authenticated using(public.is_team_member());
create policy member_read_topics on public.topics for select to authenticated using(public.is_team_member());
create policy member_read_contributors on public.topic_contributors for select to authenticated using(public.is_team_member());
revoke all on public.team_members,public.topics,public.topic_contributors,public.agent_tokens from anon,authenticated;
grant select on public.team_members,public.topics,public.topic_contributors to authenticated;

-- Every privileged operation checks membership. Direct table writes are disabled.
create function public.upsert_topic_as_member(p_member_id uuid,p_data jsonb,p_cover_path text default null)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id text; v_platform text; v_url text; v_post text; v_data jsonb;
begin
  if not exists(select 1 from public.team_members where user_id=p_member_id) then
    raise exception '未加入团队' using errcode='42501';
  end if;
  if jsonb_typeof(p_data) <> 'object' or octet_length(p_data::text)>100000 then raise exception '选题格式无效'; end if;
  v_id=p_data->>'id'; v_platform=p_data->>'platform'; v_url=p_data->>'url';
  v_post=split_part(v_id,':',2);
  if v_id is null or v_platform is null or v_url is null or v_id<>v_platform||':'||v_post or v_post='' then raise exception '选题 ID 无效'; end if;
  if not coalesce(case v_platform
    when 'instagram' then v_post ~ '^[A-Za-z0-9_-]+$' and (v_url='https://www.instagram.com/reel/'||v_post||'/' or v_url='https://www.instagram.com/p/'||v_post||'/')
    when 'douyin' then v_post ~ '^[0-9]+$' and v_url='https://www.douyin.com/video/'||v_post
    when 'xiaohongshu' then v_post ~ '^[a-f0-9]{24}$'
      and v_url ~ ('^https://www[.]xiaohongshu[.]com/explore/'||v_post||'([?]xsec_token=[A-Za-z0-9_%=-]+)?$')
      and length(v_url)<=length('https://www.xiaohongshu.com/explore/'||v_post||'?xsec_token=')+1500
    when 'bilibili' then v_post ~ '^BV[A-Za-z0-9]+$' and v_url='https://www.bilibili.com/video/'||v_post||'/'
    when 'youtube' then v_post ~ '^[A-Za-z0-9_-]{11}$' and v_url='https://www.youtube.com/watch?v='||v_post
    when 'tiktok' then v_post ~ '^[0-9]+$' and v_url ~ ('^https://www[.]tiktok[.]com/@[A-Za-z0-9._]+/video/'||v_post||'$')
    when 'x' then v_post ~ '^[0-9]+$' and v_url ~ ('^https://x[.]com/[A-Za-z0-9_]+/status/'||v_post||'$')
    else false end,false) then raise exception '原帖链接无效'; end if;
  if p_cover_path is not null and p_cover_path !~ ('^'||p_member_id::text||'/[a-f0-9]{32}[.](jpg|png|webp)$') then raise exception '封面路径无效'; end if;
  if p_cover_path is not null and not exists(select 1 from storage.objects where bucket_id='covers' and name=p_cover_path) then raise exception '封面尚未上传'; end if;
  if exists(select 1 from jsonb_each(p_data) where key in ('title','author','description','summary','summary_basis','month','published_at','platform_label','likes_label') and value<>'null'::jsonb and jsonb_typeof(value)<>'string') then raise exception '文字字段格式无效'; end if;
  if coalesce(p_data->>'month','')<>'' and (p_data->>'month')!~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then raise exception '月份格式无效'; end if;
  if coalesce(p_data->>'published_at','')<>'' then
    if (p_data->>'published_at')!~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception '日期格式无效'; end if;
    perform (p_data->>'published_at')::date;
  end if;
  if exists(select 1 from jsonb_each(p_data) where key in ('likes','views','comments','duration') and value<>'null'::jsonb and (jsonb_typeof(value)<>'number' or value::text !~ '^[0-9]+$')) then raise exception '统计数字格式无效'; end if;
  -- Allow only metadata; never accept executable URLs, local paths or client ownership fields.
  select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) into v_data from jsonb_each(p_data)
    where key in ('id','platform','platform_label','url','title','author','description','summary','summary_basis','published_at','month','likes','likes_label','duration','views','comments')
    and value <> 'null'::jsonb and value <> '""'::jsonb and (key<>'title' or value<>'"信息待补"'::jsonb);
  v_data=v_data||jsonb_build_object('id',v_id,'platform',v_platform,'url',v_url,'status','link','kind','媒体','origins',jsonb_build_array('import'),'images',jsonb_build_array());
  insert into public.topics(id,data,cover_path,created_by) values(v_id,v_data,p_cover_path,p_member_id)
    on conflict(id) do update set data=topics.data||excluded.data,
      cover_path=coalesce(excluded.cover_path,topics.cover_path),updated_at=clock_timestamp();
  insert into public.topic_contributors(topic_id,user_id) values(v_id,p_member_id) on conflict do nothing;
  return v_id;
end $$;

create function public.upsert_topic(p_data jsonb,p_cover_path text default null) returns text
language sql security definer set search_path = public, pg_temp as $$
  select public.upsert_topic_as_member(auth.uid(),p_data,p_cover_path);
$$;
create function public.set_topic_deleted(p_id text,p_deleted boolean) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.is_team_member() then raise exception '未加入团队' using errcode='42501'; end if;
  update public.topics set deleted_at=case when p_deleted then now() else null end,
    deleted_by=case when p_deleted then auth.uid() else null end,updated_at=clock_timestamp() where id=p_id;
  if not found then raise exception '选题不存在'; end if;
end $$;
create function public.list_topics() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare result jsonb;
begin
  if not public.is_team_member() then raise exception '未加入团队' using errcode='42501'; end if;
  select coalesce(jsonb_agg(t.data||jsonb_build_object(
    'id',t.id,'title',coalesce(t.data->>'title','信息待补'),'author',coalesce(t.data->>'author',''),
    'summary',coalesce(t.data->>'summary',''),'description',coalesce(t.data->>'description',''),
    'captured_at',t.created_at,'month',coalesce(t.data->>'month',to_char(t.created_at,'YYYY-MM')),
    'cover_path',t.cover_path,'deleted_at',t.deleted_at,'updated_at',t.updated_at,
    'metadata_status',case when t.data->>'title' is null then 'pending'
      when coalesce(t.data->>'author','')<>'' and coalesce(t.data->>'summary','')<>'' and t.data->>'published_at' is not null then 'complete' else 'partial' end,
    'contributors',coalesce((select jsonb_agg(m.name order by m.name) from public.topic_contributors c join public.team_members m on m.user_id=c.user_id where c.topic_id=t.id),'[]'::jsonb)
  ) order by t.created_at desc),'[]'::jsonb) into result from public.topics t;
  return result;
end $$;
create function public.issue_agent_token() returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare token text;
begin
  if not public.is_team_member() then raise exception '未加入团队' using errcode='42501'; end if;
  token=encode(extensions.gen_random_bytes(32),'hex');
  insert into public.agent_tokens(user_id,token_hash) values(auth.uid(),encode(extensions.digest(token,'sha256'),'hex'))
    on conflict(user_id) do update set token_hash=excluded.token_hash,created_at=now();
  return token;
end $$;
-- Cheap polling: fetch the full catalog only after a metadata/member change.
create function public.library_revision() returns text
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.is_team_member() then raise exception '未加入团队' using errcode='42501'; end if;
  return md5(coalesce((select max(updated_at)::text from public.topics),'')||
    coalesce((select string_agg(user_id::text||name,',' order by user_id) from public.team_members),''));
end $$;
create function public.revoke_agent_token() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.is_team_member() then raise exception '未加入团队' using errcode='42501'; end if;
  delete from public.agent_tokens where user_id=auth.uid();
end $$;
create function public.resolve_agent_member(p_token text) returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select a.user_id from public.agent_tokens a join public.team_members m on m.user_id=a.user_id
  where a.token_hash=encode(extensions.digest(p_token,'sha256'),'hex');
$$;

revoke all on function public.limit_team_members(),public.is_team_member(),public.upsert_topic_as_member(uuid,jsonb,text),public.upsert_topic(jsonb,text),public.set_topic_deleted(text,boolean),public.list_topics(),public.library_revision(),public.issue_agent_token(),public.revoke_agent_token(),public.resolve_agent_member(text) from public,anon,authenticated;
grant execute on function public.is_team_member(),public.upsert_topic(jsonb,text),public.set_topic_deleted(text,boolean),public.list_topics(),public.library_revision(),public.issue_agent_token(),public.revoke_agent_token() to authenticated;
grant execute on function public.resolve_agent_member(text),public.upsert_topic_as_member(uuid,jsonb,text) to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('covers','covers',false,2097152,array['image/jpeg','image/png','image/webp']);
create policy team_cover_read on storage.objects for select to authenticated
using(bucket_id='covers' and public.is_team_member());
create policy own_cover_upload on storage.objects for insert to authenticated
with check(bucket_id='covers' and public.is_team_member() and (storage.foldername(name))[1]=auth.uid()::text);
create policy own_unused_cover_cleanup on storage.objects for delete to authenticated
using(bucket_id='covers' and public.is_team_member() and (storage.foldername(name))[1]=auth.uid()::text
  and not exists(select 1 from public.topics where cover_path=name));

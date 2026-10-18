-- Comments belong to a specific member/week entry, shared by all teammates.
create table public.topic_comments (
 id uuid primary key default gen_random_uuid(),
 entry_id uuid not null references public.member_topic_entries(id) on delete cascade,
 user_id uuid default auth.uid() references auth.users(id) on delete set null,
 body text not null check(char_length(body) between 1 and 2000 and body=btrim(body) and body ~ '[^[:space:]]'),
 created_at timestamptz not null default clock_timestamp()
);
create index topic_comments_entry_created_idx on public.topic_comments(entry_id,created_at,id);
create index topic_comments_user_idx on public.topic_comments(user_id);
alter table public.topic_comments enable row level security;
revoke all on public.topic_comments from public,anon,authenticated;
grant select on public.topic_comments to authenticated;
-- Callers cannot supply another member's identity or a fabricated timestamp.
grant insert(id,entry_id,body) on public.topic_comments to authenticated;
create policy comments_read_team on public.topic_comments for select to authenticated
 using((select public.is_team_member()) and exists(
  select 1 from public.member_topic_entries e where e.id=entry_id and e.deleted_at is null
 ));
create policy comments_insert_team on public.topic_comments for insert to authenticated
 with check((select public.is_team_member()) and user_id=(select auth.uid()) and exists(
  select 1 from public.member_topic_entries e where e.id=entry_id and e.deleted_at is null
 ));

create function public.topic_comment_counts() returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare result jsonb;
begin
 if not public.is_team_member() then raise exception '未加入团队' using errcode='42501'; end if;
 select coalesce(jsonb_object_agg(entry_id,n),'{}'::jsonb) into result
 from (select entry_id,count(*) as n from public.topic_comments group by entry_id) counts;
 return result;
end $$;

create function public.list_topic_comments(p_entry_id uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare result jsonb;
begin
 if not public.is_team_member() then raise exception '未加入团队' using errcode='42501'; end if;
 if not exists(select 1 from public.member_topic_entries where id=p_entry_id and deleted_at is null) then
  raise exception '这条选题不存在或已删除';
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'entry_id',c.entry_id,'user_id',c.user_id,
  'author_name',coalesce(m.name,'已离开成员'),'body',c.body,'created_at',c.created_at)
  order by c.created_at,c.id),'[]'::jsonb) into result
 from public.topic_comments c left join public.team_members m on m.user_id=c.user_id
 where c.entry_id=p_entry_id;
 return result;
end $$;

create function public.add_topic_comment(p_entry_id uuid,p_body text,p_request_id uuid) returns uuid
language plpgsql security invoker set search_path=public,pg_temp as $$
declare cleaned text=btrim(p_body);
begin
 if not public.is_team_member() then raise exception '未加入团队' using errcode='42501'; end if;
 if cleaned is null or char_length(cleaned) not between 1 and 2000 or cleaned !~ '[^[:space:]]' then
  raise exception '评论请输入 1–2000 个字';
 end if;
 if p_request_id is null then raise exception '评论请求标识不能为空'; end if;
 if not exists(select 1 from public.member_topic_entries where id=p_entry_id and deleted_at is null) then
  raise exception '这条选题不存在或已删除';
 end if;
 insert into public.topic_comments(id,entry_id,body) values(p_request_id,p_entry_id,cleaned) on conflict(id) do nothing;
 if not exists(select 1 from public.topic_comments where id=p_request_id and entry_id=p_entry_id and user_id=auth.uid() and body=cleaned) then
  raise exception '评论请求已改变，请重新发送';
 end if;
 return p_request_id;
end $$;
revoke all on function public.topic_comment_counts(),public.list_topic_comments(uuid),public.add_topic_comment(uuid,text,uuid) from public,anon;
grant execute on function public.topic_comment_counts(),public.list_topic_comments(uuid),public.add_topic_comment(uuid,text,uuid) to authenticated;

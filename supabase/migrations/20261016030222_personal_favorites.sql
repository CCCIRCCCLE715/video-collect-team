-- Names change without changing the Auth user IDs or ownership of existing topics.
update public.team_members set name='豹朴' where name='鲍朴';
update public.team_members set name='奕伶' where name='弈伶';

create table public.topic_favorites (
 user_id uuid not null references public.team_members(user_id) on delete cascade,
 topic_id text not null references public.topics(id) on delete cascade,
 entry_id uuid not null references public.member_topic_entries(id) on delete cascade,
 created_at timestamptz not null default now(),
 primary key(user_id,topic_id)
);
create index topic_favorites_topic_idx on public.topic_favorites(topic_id);
create index topic_favorites_entry_idx on public.topic_favorites(entry_id);
alter table public.topic_favorites enable row level security;
revoke all on public.topic_favorites from public,anon,authenticated;
grant select,insert,delete on public.topic_favorites to authenticated;
create policy favorites_read_team on public.topic_favorites for select to authenticated
 using((select public.is_team_member()));
create policy favorites_insert_team on public.topic_favorites for insert to authenticated
 with check((select public.is_team_member()) and exists(
  select 1 from public.member_topic_entries e where e.id=entry_id and e.topic_id=topic_favorites.topic_id and e.deleted_at is null
 ));
create policy favorites_delete_team on public.topic_favorites for delete to authenticated
 using((select public.is_team_member()));

create function public.set_topic_favorite(p_entry_id uuid,p_favorite boolean,p_member_id uuid default auth.uid())
returns void language plpgsql security invoker set search_path=public,pg_temp as $$
declare post_id text;
begin
 if not public.is_team_member() then raise exception '未加入团队' using errcode='42501'; end if;
 if not exists(select 1 from public.team_members where user_id=p_member_id) then raise exception '该成员不存在'; end if;
 if p_favorite is null then raise exception '请选择收藏或取消收藏'; end if;
 select e.topic_id into post_id from public.member_topic_entries e
 where e.id=p_entry_id and (not p_favorite or e.deleted_at is null);
 if post_id is null then raise exception '这条选题不存在或已删除'; end if;
 if p_favorite then
  insert into public.topic_favorites(user_id,topic_id,entry_id) values(p_member_id,post_id,p_entry_id)
  on conflict(user_id,topic_id) do nothing;
 else
  delete from public.topic_favorites where user_id=p_member_id and topic_id=post_id;
 end if;
end;
$$;
revoke all on function public.set_topic_favorite(uuid,boolean,uuid) from public,anon;
grant execute on function public.set_topic_favorite(uuid,boolean,uuid) to authenticated;

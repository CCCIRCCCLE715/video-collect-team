-- Each display name belongs to one team login; the current account is resolved server-side.
alter table public.team_members add constraint team_members_name_unique unique(name);
create or replace function public.current_team_member()
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare member jsonb;
begin
 select jsonb_build_object('user_id',m.user_id,'name',m.name,'email',u.email) into member
 from public.team_members m join auth.users u on u.id=m.user_id where m.user_id=auth.uid();
 if member is null then raise exception '这个账号尚未加入团队，请联系管理员。' using errcode='42501'; end if;
 return member;
end;
$$;
revoke all on function public.current_team_member() from public,anon;
grant execute on function public.current_team_member() to authenticated;

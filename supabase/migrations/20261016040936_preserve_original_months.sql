-- Preserve the source library month for existing and future imports.
-- This only changes the read projection; capture dates, entries and favorites stay intact.
create or replace function public.list_weekly_topics() returns jsonb
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

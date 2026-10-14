-- pg_cron uses GMT: Tuesday 16:00 = Wednesday 00:00 Asia/Shanghai.
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('video-collect-weekly-tables','0 16 * * 2',
 $$select app_private.ensure_library_weeks();$$);

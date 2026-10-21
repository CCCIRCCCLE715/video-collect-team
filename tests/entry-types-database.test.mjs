import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';

test('reference and topic entries persist independently; suggestions and ownership are enforced',async()=>{
 const db=new PGlite({extensions:{pgcrypto}});
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
   create schema auth;create table auth.users(id uuid primary key,email text);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema auth,public to anon,authenticated,service_role;
   grant execute on function auth.uid() to anon,authenticated,service_role;
   create schema storage;
   create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
   create table storage.objects(id bigserial primary key,bucket_id text,name text);
   alter table storage.objects enable row level security;
   create function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1,'/')$$;`);
  let legacyId,legacyBefore;
  for(const file of (await readdir(new URL('../supabase/migrations/',import.meta.url))).sort()){
   if(file.includes('_reference_and_topics')){
    await db.exec("insert into auth.users values('11111111-1111-1111-1111-111111111111','one@test.invalid');insert into team_members values('11111111-1111-1111-1111-111111111111','黄白');");
    legacyId=(await db.query("select app_private.capture_topic('11111111-1111-1111-1111-111111111111',$1::jsonb,null,'2026-10-14T04:00:00Z') as id",[JSON.stringify({id:'instagram:LegacyType',platform:'instagram',url:'https://www.instagram.com/reel/LegacyType/',title:'历史资料',month:'2026-08'})])).rows[0].id;
    legacyBefore=(await db.query('select id,data,week_start,captured_at,cover_path from member_topic_entries where id=$1',[legacyId])).rows[0];
   }
   if(!file.includes('cron'))await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
  }
  const ids=['11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','33333333-3333-3333-3333-333333333333'];
  for(const id of ids)await db.query('insert into auth.users values($1,$2) on conflict do nothing',[id,id+'@test.invalid']);
  for(let i=0;i<2;i++)await db.query('insert into team_members(user_id,name) values($1,$2) on conflict do nothing',[ids[i],['黄白','正源'][i]]);
  const as=async(role,id,sql,args=[])=>{await db.exec('set role '+role);await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);try{return await db.query(sql,args);}finally{await db.exec('reset role');}};

  assert.deepEqual((await db.query('select id,data,week_start,captured_at,cover_path from member_topic_entries where id=$1',[legacyId])).rows[0],legacyBefore);
  assert.deepEqual((await db.query('select entry_type,topic_suggestion from member_topic_entries where id=$1',[legacyId])).rows[0],{entry_type:'reference',topic_suggestion:''});
  const input={id:'instagram:Types1',platform:'instagram',url:'https://www.instagram.com/reel/Types1/',title:'案例',entry_type:'reference'};
  const capture=async(data,owner=ids[0])=>(await db.query("select app_private.capture_topic($1,$2::jsonb,null,'2026-10-21T03:00:00Z') as id",[owner,JSON.stringify(data)])).rows[0].id;
  const ref=await capture(input);
  await assert.rejects(capture({...input,entry_type:null}),/参考视频|选题/);
  await assert.rejects(capture({...input,entry_type:'topic'}),/选题建议/);
  await assert.rejects(capture({...input,entry_type:'topic',topic_suggestion:' \n '}),/选题建议/);
  await assert.rejects(capture({...input,entry_type:'topic',topic_suggestion:42}),/选题建议/);
  const idea=await capture({...input,entry_type:'topic',topic_suggestion:'做 AI 桌宠教程，演示制作过程。'});
  assert.notEqual(ref,idea);
  assert.equal(await capture(input),ref);
  assert.equal(await capture({...input,entry_type:'topic',topic_suggestion:'补充效果对比与制作步骤。'}),idea);
  const other=await capture({...input,entry_type:'topic',topic_suggestion:'成员二的拍摄思路。'},ids[1]);
  const rows=(await as('authenticated',ids[1],'select list_weekly_topics() as rows')).rows[0].rows;
  assert.equal(rows.find(x=>x.id===ref).entry_type,'reference');
  assert.equal(rows.find(x=>x.id===ref).topic_suggestion,'');
  assert.equal(rows.find(x=>x.id===idea).topic_suggestion,'补充效果对比与制作步骤。');
  assert.equal(rows.find(x=>x.id===other).topic_suggestion,'成员二的拍摄思路。');
  await assert.rejects(as('authenticated',ids[1],'select set_entry_type($1,$2,$3)',[ref,'topic','冒用']),/自己的/);
  await assert.rejects(as('authenticated',ids[0],'select set_entry_type($1,$2,$3)',[ref,'topic','新的建议']),/已有/);
  await assert.rejects(as('anon',null,'select set_entry_type($1,$2,$3)',[ref,'topic','建议']),/permission denied/);
  await as('authenticated',ids[0],'select set_entry_deleted($1,true)',[idea]);
  await assert.rejects(as('authenticated',ids[0],'select set_entry_type($1,$2,$3)',[idea,'reference','']),/已删除/);
  const unique=await capture({...input,id:'instagram:Types2',url:'https://www.instagram.com/reel/Types2/'});
  await as('authenticated',ids[1],'select add_topic_comment($1,$2,$3)',[unique,'保留评论','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa']);
  await as('authenticated',ids[0],'select set_entry_type($1,$2,$3)',[unique,'topic','拍摄一个案例拆解，讲解镜头如何实现。']);
  assert.equal((await as('authenticated',ids[1],'select list_topic_comments($1) as rows',[unique])).rows[0].rows.length,1);
  assert.equal((await db.query('select entry_type,topic_suggestion from member_topic_entries where id=$1',[unique])).rows[0].entry_type,'topic');
 }finally{await db.close();}
});

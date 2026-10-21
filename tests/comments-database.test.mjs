import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';

test('teammates append comments as themselves; retries deduplicate and outsiders cannot read or write',async()=>{
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
  for(const file of (await readdir(new URL('../supabase/migrations/',import.meta.url))).sort()){
   if(!file.includes('cron'))await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
  }
  const ids=['11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','33333333-3333-3333-3333-333333333333'];
  for(const id of ids)await db.query('insert into auth.users values($1,$2)',[id,id+'@test.invalid']);
  for(let i=0;i<2;i++)await db.query('insert into team_members(user_id,name) values($1,$2)',[ids[i],['黄白','正源'][i]]);
  const as=async(role,id,sql,args=[])=>{await db.exec('set role '+role);await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);try{return await db.query(sql,args);}finally{await db.exec('reset role');}};
  const entry=(await db.query(`select app_private.capture_topic($1,$2::jsonb,null,'2026-10-18T00:00:00Z') as id`,[ids[0],JSON.stringify({entry_type:'reference',id:'instagram:Comments1',platform:'instagram',url:'https://www.instagram.com/reel/Comments1/',title:'评论测试'})])).rows[0].id;
  assert.deepEqual((await as('authenticated',ids[0],'select topic_comment_counts() as counts')).rows[0].counts,{});
  const request='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  await as('authenticated',ids[0],'select add_topic_comment($1,$2,$3)',[entry,'  想试试这个运镜  ',request]);
  await as('authenticated',ids[0],'select add_topic_comment($1,$2,$3)',[entry,'想试试这个运镜',request]);
  await as('authenticated',ids[1],'select add_topic_comment($1,$2,$3)',[entry,'我来做分镜','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb']);
  const list=(await as('authenticated',ids[1],'select list_topic_comments($1) as comments',[entry])).rows[0].comments;
  assert.deepEqual(list.map(x=>[x.author_name,x.body]),[['黄白','想试试这个运镜'],['正源','我来做分镜']]);
  assert.ok(list.every(x=>x.created_at&&x.id));
  assert.equal((await as('authenticated',ids[1],'select topic_comment_counts() as counts')).rows[0].counts[entry],2);
  await assert.rejects(as('authenticated',ids[1],'select add_topic_comment($1,$2,$3)',[entry,'冒用重复请求',request]),/请求/);
  for(const body of ['', ' \n ', 'x'.repeat(2001)])await assert.rejects(as('authenticated',ids[0],'select add_topic_comment($1,$2,$3)',[entry,body,'cccccccc-cccc-cccc-cccc-cccccccccccc']),/评论/);
  await assert.rejects(as('anon',null,'select list_topic_comments($1)',[entry]),/permission denied/);
  await assert.rejects(as('authenticated',ids[2],'select list_topic_comments($1)',[entry]),/未加入团队/);
  await assert.rejects(as('authenticated',ids[2],'select add_topic_comment($1,$2,$3)',[entry,'不是成员','cccccccc-cccc-cccc-cccc-cccccccccccc']),/未加入团队/);
  await assert.rejects(as('authenticated',ids[0],'insert into topic_comments(entry_id,user_id,body) values($1,$2,$3)',[entry,ids[1],'冒用成员']),/permission denied/);
  await assert.rejects(as('authenticated',ids[0],"update topic_comments set body='改写评论'"),/permission denied/);
  await assert.rejects(as('authenticated',ids[0],'delete from topic_comments'),/permission denied/);
  await as('authenticated',ids[0],'select set_entry_deleted($1,true)',[entry]);
  assert.deepEqual((await as('authenticated',ids[1],'select topic_comment_counts() as counts')).rows[0].counts,{});
  await assert.rejects(as('authenticated',ids[1],'select add_topic_comment($1,$2,$3)',[entry,'已删除的选题','cccccccc-cccc-cccc-cccc-cccccccccccc']),/不存在或已删除/);
  await as('authenticated',ids[0],'select set_entry_deleted($1,false)',[entry]);
  assert.equal((await as('authenticated',ids[0],'select list_topic_comments($1) as comments',[entry])).rows[0].comments.length,2);
 }finally{await db.close();}
});

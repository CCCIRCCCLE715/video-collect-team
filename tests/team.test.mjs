import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {existsSync} from 'node:fs';
import {TeamClient} from '../assets/team-client.js';
test('browser fetch keeps its global receiver for login and authenticated requests',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async function(url){
  assert.equal(this,globalThis,'browser fetch requires the Window receiver');
  if(url.includes('/auth/v1/token'))return Response.json({access_token:'fixture',refresh_token:'fixture-refresh',expires_at:Date.now()/1000+3600,user:{id:'fixture'}});
  return Response.json([]);
 };
 try{
  let saved=null;
  const c=new TeamClient({supabaseUrl:'https://fixture.supabase.co',publishableKey:'public'},{storage:{getItem:()=>saved,setItem(k,v){saved=v;}}});
  await c.login('fixture@example.com','fixture-password');
  assert.equal(c.session.access_token,'fixture');
  assert.deepEqual(await c.list(),[]);
 }finally{globalThis.fetch=original;}
});
const modulePath=new URL('../assets/topic.js',import.meta.url);
let topic=null;
if(existsSync(modulePath))topic=await import(modulePath.href);
test('rounded like labels survive import without inventing an exact count',()=>{
 const x=topic.normalizeTopic({url:'https://www.douyin.com/video/123456789',likes:null,likes_label:'4.1万',duration:15});
 assert.equal(x.likes,null);assert.equal(x.likes_label,'4.1万');assert.equal(x.duration,15);
});
test('sharing parameters and Instagram URL variants deduplicate to one post',()=>{
 assert.ok(topic,'shared ingestion module is missing');
 const a=topic.normalizeTopic({url:'https://www.instagram.com/reel/Abc123/?utm_source=copy',title:'教程',summary:'讲解运镜。'});
 const b=topic.normalizeTopic({url:'https://www.instagram.com/creator/reel/Abc123/'});
 assert.equal(a.id,'instagram:Abc123');assert.equal(b.id,a.id);
 assert.equal(a.url,'https://www.instagram.com/reel/Abc123/');
});
test('an untrusted URL cannot become a stored post or executable link',()=>{
 assert.ok(topic,'shared ingestion module is missing');
 for(const url of ['javascript:alert(1)','http://127.0.0.1/private','https://instagram.com.attacker.test/reel/Abc123/','https://www.instagram.com/accounts/login/'])assert.throws(()=>topic.normalizeTopic({url}));
});
test('unknown metadata stays pending, and local media paths cannot enter a cloud record',()=>{
 assert.ok(topic,'shared ingestion module is missing');
 const x=topic.normalizeTopic({url:'https://www.douyin.com/video/123456789',poster:'/Users/private/cover.jpg',video:'/tmp/movie.mp4',origins:['like']});
 assert.equal(x.status,'link');assert.equal(x.poster,null);assert.equal(x.video,null);assert.deepEqual(x.origins,['import']);assert.equal(x.metadata_status,'pending');
});
test('invalid calendar dates stay unknown and necessary XHS access parameters survive',()=>{
 const x=topic.normalizeTopic({url:'https://www.xiaohongshu.com/explore/1234567890abcdef12345678?xsec_token=abc%3D&utm_source=copy',published_at:'2026-02-30'});
 assert.equal(x.published_at,null);assert.equal(x.month,null);assert.equal(x.url,'https://www.xiaohongshu.com/explore/1234567890abcdef12345678?xsec_token=abc%3D');
});
test('XHS posts opened from a profile deduplicate to the canonical note',()=>{
 const x=topic.normalizeTopic({url:'https://www.xiaohongshu.com/user/profile/bbbbbbbbbbbbbbbbbbbbbbbb/aaaaaaaaaaaaaaaaaaaaaaaa?xsec_token=abc%3D&utm_source=copy'});
 assert.equal(x.id,'xiaohongshu:aaaaaaaaaaaaaaaaaaaaaaaa');
 assert.equal(x.url,'https://www.xiaohongshu.com/explore/aaaaaaaaaaaaaaaaaaaaaaaa?xsec_token=abc%3D');
});
let handler=null;const handlerPath=new URL('../supabase/functions/agent-import/handler.js',import.meta.url);
if(existsSync(handlerPath))handler=(await import(handlerPath.href)).createHandler;
const body={topic:{url:'https://www.instagram.com/reel/Abc123/',title:'教程',author:'作者',description:'文案',summary:'讲解运镜。',published_at:'2026-10-13'}};
function backend(){const state={uploads:[],writes:[]};const fetcher=async(url,options={})=>{
 if(url.endsWith('/rpc/resolve_agent_member'))return Response.json(options.body.includes('valid-token')?'11111111-1111-1111-1111-111111111111':null);
 if(url.includes('/storage/v1/object/')){state.uploads.push(options);return Response.json({Key:'x'});}
 if(url.endsWith('/rpc/upsert_topic_as_member')){state.writes.push(JSON.parse(options.body));return Response.json('instagram:Abc123');}
 throw Error('unexpected endpoint '+url);
 };return {state,fetcher};}
test('invalid agent credentials never upload a cover or write a row',async()=>{
 assert.ok(handler,'agent handler is missing');const b=backend();const h=handler({url:'https://fixture.supabase.co',serviceKey:'server-only',fetcher:b.fetcher});
 const r=await h(new Request('https://fixture/agent-import',{method:'POST',headers:{'X-Agent-Token':'bad-token'},body:JSON.stringify(body)}));
 assert.equal(r.status,401);assert.equal(b.state.uploads.length,0);assert.equal(b.state.writes.length,0);
});
test('authenticated import attaches the verified member and deduplicated ID',async()=>{
 assert.ok(handler,'agent handler is missing');const b=backend();const h=handler({url:'https://fixture.supabase.co',serviceKey:'server-only',fetcher:b.fetcher});
 const r=await h(new Request('https://fixture/agent-import',{method:'POST',headers:{'X-Agent-Token':'valid-token'},body:JSON.stringify(body)}));
 assert.equal(r.status,200);const saved=b.state.writes[0];assert.equal(saved.p_member_id,'11111111-1111-1111-1111-111111111111');assert.equal(saved.p_data.id,'instagram:Abc123');
});
test('a failed cover upload leaves no record claiming a saved cover',async()=>{
 assert.ok(handler,'agent handler is missing');const b=backend();const h=handler({url:'https://fixture.supabase.co',serviceKey:'server-only',fetcher:async(u,o)=>u.includes('/storage/')?Response.json({message:'storage full'},{status:503}):b.fetcher(u,o)});
 const r=await h(new Request('https://fixture/agent-import',{method:'POST',headers:{'X-Agent-Token':'valid-token'},body:JSON.stringify({...body,cover:{mime:'image/jpeg',base64:'/9j/AA=='}})}));
 assert.equal(r.status,502);assert.equal(b.state.writes.length,0);
});
test('private covers use cached signed URLs, never public bucket URLs',async()=>{
 const calls=[],storage={getItem:()=>null,setItem(){}};
 const c=new TeamClient({supabaseUrl:'https://fixture.supabase.co',publishableKey:'public'},{storage,fetcher:async(u,o)=>{
  calls.push({u,o});if(u.includes('list_topics'))return Response.json([{id:'instagram:Abc123',cover_path:'member/cover.jpg'}]);
  if(u.includes('/object/sign/'))return Response.json({signedURL:'/object/sign/covers/member/cover.jpg?token=fixture'});
  throw Error('unexpected endpoint');
 }});
 c.session={access_token:'member-session',expires_at:Date.now()/1000+3600};
 const one=await c.list(),two=await c.list();
 assert.equal(one[0].poster,'https://fixture.supabase.co/storage/v1/object/sign/covers/member/cover.jpg?token=fixture');
 assert.equal(two[0].poster,one[0].poster);assert.equal(calls.filter(x=>x.u.includes('/object/sign/')).length,1);
 assert.equal(calls[0].o.headers.Authorization,'Bearer member-session');
});
test('an expired browser session is cleared on rejection',async()=>{
 const c=new TeamClient({supabaseUrl:'https://fixture.supabase.co',publishableKey:'public'},{storage:{getItem:()=>null,setItem(){}},fetcher:async()=>Response.json({message:'expired'},{status:401})});
 c.session={access_token:'expired',expires_at:Date.now()/1000+3600};
 await assert.rejects(c.list(),/重新登录/);assert.equal(c.session,null);
});
test('a browser upload failure cannot write a row or claim a saved cover',async()=>{
 const calls=[];const c=new TeamClient({supabaseUrl:'https://fixture.supabase.co',publishableKey:'public'},{storage:{getItem:()=>null,setItem(){}},fetcher:async u=>{calls.push(u);return Response.json({message:'full'},{status:503});}});
 c.session={user:{id:'member'},access_token:'member-session',expires_at:Date.now()/1000+3600};
 const file=new File([Uint8Array.from([255,216,255,0])],'fixture.jpg',{type:'image/jpeg'});
 await assert.rejects(c.upsert(body.topic,file),/full/);assert.equal(calls.filter(u=>u.includes('/rpc/')).length,0);
});
test('oversized and disguised cover payloads are rejected before a write',async()=>{
 const b=backend(),h=handler({url:'https://fixture.supabase.co',serviceKey:'server-only',fetcher:b.fetcher});
 for(const cover of [{mime:'image/jpeg',base64:'aGVsbG8='},{mime:'text/html',base64:'/9j/AA=='}]){
  const r=await h(new Request('https://fixture/agent-import',{method:'POST',headers:{'X-Agent-Token':'valid-token'},body:JSON.stringify({...body,cover})}));assert.equal(r.status,400);
 }
 const r=await h(new Request('https://fixture/agent-import',{method:'POST',headers:{'X-Agent-Token':'valid-token'},body:'x'.repeat(3000001)}));assert.equal(r.status,400);assert.equal(b.state.writes.length,0);assert.equal(b.state.uploads.length,0);
});
test('modern secret keys are sent only as apikey, not as a fake JWT',async()=>{
 const b=backend(),calls=[];const h=handler({url:'https://fixture.supabase.co',serviceKey:'sb_secret_fixture',fetcher:async(u,o)=>{calls.push(o);return b.fetcher(u,o);}});
 const r=await h(new Request('https://fixture/agent-import',{method:'POST',headers:{'X-Agent-Token':'valid-token'},body:JSON.stringify(body)}));assert.equal(r.status,200);
 assert.equal(calls[0].headers.apikey,'sb_secret_fixture');assert.equal(calls[0].headers.Authorization,undefined);
});

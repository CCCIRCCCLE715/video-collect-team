import test from 'node:test';
import assert from 'node:assert/strict';
import {TeamClient} from '../assets/team-client.js';
const config={supabaseUrl:'https://fixture.supabase.co',publishableKey:'fixture'};
const old={access_token:'old',refresh_token:'refresh-old',expires_at:1,user:{id:'cached-user'}};
function setup(fetcher,session=old){const map=new Map([['video-collect-session:'+config.supabaseUrl,JSON.stringify(session)]]);const storage={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)};return {client:new TeamClient(config,{fetcher,storage}),storage};}
test('offline and server refresh failures retain the persisted login',async()=>{
 for(const fetcher of [async()=>{throw new TypeError('offline');},async()=>Response.json({message:'unavailable'},{status:503}),async()=>Response.json({message:'rate limited'},{status:429})]){
  const {client,storage}=setup(fetcher);await assert.rejects(client.token());assert.deepEqual(client.session,old);assert.deepEqual(JSON.parse(storage.getItem(client.storageKey)),old);
 }
});
test('refresh rotation persists expiry and a reopened page reuses its login',async()=>{
 let calls=0;const {client,storage}=setup(async()=>{calls++;return Response.json({access_token:'new',refresh_token:'rotated',expires_in:3600,user:{id:'cached-user'}});});
 assert.equal(await client.token(),'new');assert.ok(client.session.expires_at>Date.now()/1000+3500);
 const reopened=new TeamClient(config,{storage,fetcher:async()=>{throw Error('should not refresh yet');}});assert.equal(await reopened.token(),'new');assert.equal(calls,1);
});
test('manual logout cannot be undone by a refresh response in flight',async()=>{
 let resolve;const {client,storage}=setup(async url=>url.endsWith('/logout')?Response.json({}):await new Promise(r=>{resolve=r;}));
 const pending=client.token();await new Promise(r=>setTimeout(r,0));await client.logout();resolve(Response.json({...old,access_token:'new',expires_at:Date.now()/1000+3600}));
 await assert.rejects(pending);assert.equal(client.session,null);assert.equal(storage.getItem(client.storageKey),'null');
});
test('parallel requests share refresh and expired API tokens retry once',async()=>{
 let refreshes=0;const {client}=setup(async(url,o)=>{
  if(url.includes('grant_type=refresh_token')){refreshes++;return Response.json({...old,access_token:'fresh',expires_at:Date.now()/1000+3600});}
  return o.headers.Authorization==='Bearer old'?Response.json({message:'expired'},{status:401}):Response.json({ok:true});
 },{...old,expires_at:Date.now()/1000+3600});
 assert.deepEqual(await client.request('/test'),{ok:true});assert.equal(refreshes,1);
 client.session.expires_at=1;await Promise.all([client.token(),client.token()]);assert.equal(refreshes,2);
});
test('member identity comes from the authenticated server RPC, never a cached user filter',async()=>{
 const {client}=setup(async url=>{assert.equal(new URL(url).pathname,'/rest/v1/rpc/current_team_member');return Response.json({user_id:'authenticated-user',name:'正源',email:'two@example.test'});},{...old,expires_at:Date.now()/1000+3600});
 assert.deepEqual(await client.member(),{user_id:'authenticated-user',name:'正源',email:'two@example.test'});
});
test('an invalid refresh ends the session and another tab logout propagates',async()=>{
 const {client,storage}=setup(async()=>Response.json({error_code:'refresh_token_not_found'},{status:400}));await assert.rejects(client.token(),/重新登录/);assert.equal(client.session,null);
 const x=setup(async()=>Response.json({}),{...old,expires_at:Date.now()/1000+3600});x.storage.setItem(x.client.storageKey,'null');x.client.syncSession();assert.equal(x.client.session,null);
});

test('a form for one member cannot upload under another logged-in account',async()=>{
 const {client}=setup(async()=>{throw Error('must not write');},{...old,expires_at:Date.now()/1000+3600});
 await assert.rejects(client.upsert({url:'https://www.instagram.com/reel/Switch123/'},null,'different-user'),/账号已切换/);
});

"""Create a local UI fixture; requests and records remain simulated."""
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
script = r'''
window.VIDEO_COLLECT_TEAM={supabaseUrl:'https://fixture.supabase.co',publishableKey:'sb_publishable_fixture',teamName:'周表功能测试（模拟云端）',pollSeconds:5};
const originalFetch=window.fetch.bind(window),store='video-collect-weekly-fixture-v1';
const members=['黄白','正源','豹朴','奕伶'].map((name,n)=>({name,user_id:String(n+1).repeat(8)+'-1111-1111-1111-111111111111'}));
const current='2026-10-14',end='2026-10-20';
const base={title:'AI 生成电影镜头的制作流程',author:'示例作者',summary:'演示用 AI 制作电影镜头的流程。',description:'这是用于检查界面的模拟选题。',url:'https://www.instagram.com/reel/Fixture123/',platform:'instagram',platform_label:'Instagram',origins:['import'],status:'link',kind:'媒体',images:[],published_at:'2026-10-13',likes:42,month:'2026-10',deleted_at:null,cover_path:'fixture.png',week_start:current,week_end:end,collected_on:current,captured_at:current+'T03:00:00Z'};
const seed=members.slice(0,2).map((m,n)=>({...base,id:'fixture-entry-'+n,topic_id:'instagram:Fixture123',owner_id:m.user_id,owner_name:m.name,contributors:[m.name],title:n?'AI 电影片段的剪辑方法':base.title}));
const read=()=>JSON.parse(localStorage.getItem(store)||JSON.stringify(seed));
const save=rows=>localStorage.setItem(store,JSON.stringify(rows));
window.fetch=async(url,o={})=>{
 if(!String(url).startsWith('https://fixture.supabase.co'))return originalFetch(url,o);
 const path=String(url).slice('https://fixture.supabase.co'.length),body=o.body&&typeof o.body==='string'?JSON.parse(o.body):{};
 const index=(o.headers?.Authorization||'').endsWith('member2')?1:0,user=members[index];
 if(path.startsWith('/auth/v1/token')){const n=body.email?.startsWith('two')?1:0;return Response.json({access_token:'member'+(n+1),refresh_token:'fixture',expires_at:Date.now()/1000+3600,user:{id:members[n].user_id}});}
 if(path==='/auth/v1/logout')return Response.json({});
 if(path==='/rest/v1/rpc/current_team_member')return Response.json({...user,email:index?'two@example.test':'one@example.test'});
 const allFavorites=JSON.parse(localStorage.getItem(store+'-favorites')||'{}'),mine=allFavorites[user.user_id]||[];
 if(path.startsWith('/rest/v1/topic_favorites?'))return Response.json(Object.values(allFavorites).flat());
 if(path==='/rest/v1/rpc/set_topic_favorite'){
  const target=body.p_member_id||user.user_id,collection=allFavorites[target]||[];
  const row=read().find(x=>x.id===body.p_entry_id);if(!row)return Response.json({message:'这条选题不存在'},{status:400});
  allFavorites[target]=body.p_favorite?(collection.some(f=>f.topic_id===row.topic_id)?collection:[{user_id:target,topic_id:row.topic_id,entry_id:row.id,created_at:new Date().toISOString()},...collection]):collection.filter(f=>f.topic_id!==row.topic_id);
  localStorage.setItem(store+'-favorites',JSON.stringify(allFavorites));return Response.json(null);
 }
 if(path==='/rest/v1/rpc/weekly_library_state')return Response.json({current_week:current,weeks:[{start_date:current,end_date:end}],members,revision:JSON.stringify(read())});
 if(path==='/rest/v1/rpc/list_weekly_topics')return Response.json(read());
 if(path==='/rest/v1/rpc/upsert_topic'){
  const rows=read(),at=rows.findIndex(x=>x.topic_id===body.p_data.id&&x.owner_id===user.user_id&&x.week_start===current),old=at<0?{}:rows[at];
  const fresh={...base,...old,...body.p_data,id:old.id||crypto.randomUUID(),topic_id:body.p_data.id,owner_id:user.user_id,owner_name:user.name,contributors:[user.name],cover_path:body.p_cover_path||old.cover_path||null,updated_at:new Date().toISOString(),deleted_at:old.deleted_at||null};
  if(at<0)rows.push(fresh);else rows[at]=fresh;save(rows);return Response.json(body.p_data.id);
 }
 if(path==='/rest/v1/rpc/set_entry_deleted'||path==='/rest/v1/rpc/replace_entry_cover'){
  const rows=read(),row=rows.find(x=>x.id===body.p_id&&x.owner_id===user.user_id);
  if(!row)return Response.json({message:'只能修改自己的选题'},{status:403});
  if(path.endsWith('set_entry_deleted'))row.deleted_at=body.p_deleted?new Date().toISOString():null;else row.cover_path=body.p_cover_path;
  row.updated_at=new Date().toISOString();save(rows);return Response.json(null);
 }
 if(path==='/rest/v1/rpc/issue_agent_token')return Response.json('a'.repeat(64));
 if(path==='/rest/v1/rpc/revoke_agent_token')return Response.json(null);
 if(path.startsWith('/storage/v1/object/sign/'))return Response.json({signedURL:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a8o8AAAAASUVORK5CYII='});
 if(path.startsWith('/storage/v1/object/'))return Response.json({Key:'fixture'});
 return Response.json({error:'Unhandled fixture request'},{status:500});
};
'''
page=(ROOT/'index.html').read_text().replace('<script src="team-config.js" data-team-only></script>','<script>'+script+'</script>').replace('<head>','<head><base href="/">')
target=ROOT/'data/team-ui-fixture.html';target.parent.mkdir(exist_ok=True);target.write_text(page)
print('UI fixture: http://127.0.0.1:8798/data/team-ui-fixture.html (simulated cloud only)')

"""Create a local UI fixture. All simulated requests stay inside this page."""
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
script = r'''
window.VIDEO_COLLECT_TEAM={supabaseUrl:'https://fixture.supabase.co',publishableKey:'sb_publishable_fixture',teamName:'共享功能测试（模拟云端）',pollSeconds:5};
const originalFetch=window.fetch.bind(window),store='video-collect-test-rows';
const read=()=>JSON.parse(localStorage.getItem(store)||'[]');
const save=rows=>localStorage.setItem(store,JSON.stringify(rows));
window.fetch=async(url,o={})=>{
 if(!String(url).startsWith('https://fixture.supabase.co'))return originalFetch(url,o);
 const path=String(url).slice('https://fixture.supabase.co'.length),body=o.body&&typeof o.body==='string'?JSON.parse(o.body):{};
 const user=(o.headers?.Authorization||'').endsWith('member2')?'22222222-2222-2222-2222-222222222222':'11111111-1111-1111-1111-111111111111';
 if(path.startsWith('/auth/v1/token'))return Response.json({access_token:body.email?.startsWith('two')?'member2':'member1',refresh_token:'fixture',expires_at:Date.now()/1000+3600,user:{id:body.email?.startsWith('two')?'22222222-2222-2222-2222-222222222222':'11111111-1111-1111-1111-111111111111'}});
 if(path==='/auth/v1/logout')return Response.json({});
 if(path.startsWith('/rest/v1/team_members'))return Response.json([{user_id:user,name:user.startsWith('2')?'测试成员二':'测试成员一'}]);
 if(path==='/rest/v1/rpc/list_topics')return Response.json(read());
 if(path==='/rest/v1/rpc/library_revision')return Response.json(JSON.stringify(read()));
 if(path==='/rest/v1/rpc/upsert_topic'){
  const rows=read(),at=rows.findIndex(x=>x.id===body.p_data.id),old=at<0?{}:rows[at];
  const fresh={...old,...body.p_data,month:body.p_data.month||old.month||new Date().toISOString().slice(0,7),cover_path:body.p_cover_path||old.cover_path||null,contributors:[...new Set([...(old.contributors||[]),user.startsWith('2')?'测试成员二':'测试成员一'])],updated_at:new Date().toISOString(),deleted_at:old.deleted_at||null};
  if(at<0)rows.push(fresh);else rows[at]=fresh;save(rows);return Response.json(fresh.id);
 }
 if(path==='/rest/v1/rpc/set_topic_deleted'){const rows=read();for(const x of rows)if(x.id===body.p_id){x.deleted_at=body.p_deleted?new Date().toISOString():null;x.updated_at=new Date().toISOString();}save(rows);return Response.json(null);}
 if(path==='/rest/v1/rpc/issue_agent_token')return Response.json('a'.repeat(64));
 if(path==='/rest/v1/rpc/revoke_agent_token')return Response.json(null);
 if(path.startsWith('/storage/v1/object/sign/'))return Response.json({signedURL:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a8o8AAAAASUVORK5CYII='});
 if(path.startsWith('/storage/v1/object/'))return Response.json({Key:'fixture'});
 return Response.json({error:'Unhandled fixture request'},{status:500});
};
'''
page = (ROOT / 'index.html').read_text()
page = page.replace('<script src="team-config.js" data-team-only></script>', '<script>' + script + '</script>')
page = page.replace('src="assets/team-ui.js"', 'src="/assets/team-ui.js"')
page = page.replace('<head>', '<head><base href="/">')
target=ROOT/'data/team-ui-fixture.html'
target.parent.mkdir(exist_ok=True)
target.write_text(page)
print('UI fixture: http://127.0.0.1:8798/data/team-ui-fixture.html (simulated cloud only)')

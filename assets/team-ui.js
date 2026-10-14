import {TeamClient} from './team-client.js?v=20261014-identity';
import {MEMBER_NAMES,memberOrder,weekStart,weekDates,weekLabel} from './weekly.js?v=20261014-weekly';
const config=window.VIDEO_COLLECT_TEAM||{},ui=window.VideoCollectUI,$=id=>document.getElementById(id);
const style=document.createElement('link');style.rel='stylesheet';style.href='assets/team.css?v=20261014-weekly';document.head.append(style);
const bar=document.createElement('section');bar.className='team-bar';bar.setAttribute('aria-label','团队账号');
bar.innerHTML='<div class="member-cards" id="member-cards" aria-label="成员选题库"></div><div class="team-toolbar"><button id="team-add" class="primary" disabled>新增选题</button><button id="team-refresh" disabled>刷新</button><div class="team-info"><small id="team-member">请登录团队账号</small></div><span id="team-status" class="team-status" role="status"></span><button id="team-agent" hidden>Agent 入库</button><button id="team-login">登录</button><button id="team-logout" hidden>退出</button></div><p id="week-note" class="week-note"></p>';
document.querySelector('.workspace').before(bar);
const signedOutLabel='请登录团队账号';
$('team-member').textContent=signedOutLabel;
document.querySelector('.intro').textContent='按成员、平台和日期整理视频选题。每周三开启新一周，往期内容随时可查。';
document.querySelector('.console-status').textContent='TEAM LIBRARY';
document.querySelector('.month-panel').setAttribute('aria-label','日期导航');
document.querySelector('.month-panel h2').textContent='周表与日期';
$('month-nav').setAttribute('aria-label','按周表和收录日期浏览');
document.querySelector('.month-hint').textContent='按北京时间的收录日期归档。每周三至下周二为一张表，往期内容保留。';
$('sort').options[1].textContent='日期内按点赞数';$('sort').options[2].textContent='日期内按归档顺序';
document.title=(config.teamName||'团队选题库')+' · 选题中台';
document.querySelector('.scope-note').textContent='选择成员后查看其周表。每周三 00:00（北京时间）自动创建四份新表，成员更新会自动同步。';
document.querySelector('.library-notes p').textContent='点击封面可放大预览。选题按收录日期归入当周，同一成员在同一周重复收录会合并。大家可以查看全部成员的表，封面替换、删除和恢复只能操作自己收录的条目，其他成员和往期表中的同一视频会继续保留。播放请打开原帖。';
$('delete-title').nextElementSibling.textContent='这条选题会从你的这份周表中隐藏，可在“已删除”中恢复。其他成员和其他周的记录会保留，原平台的视频也不受影响。';
document.querySelector('.cover-upload').firstChild.textContent='添加或替换这条选题的封面（最大 2 MB）';
const dialog=document.createElement('dialog');dialog.className='manage-dialog';document.body.append(dialog);
function show(title,body){dialog.replaceChildren();const h=document.createElement('h2');h.textContent=title;dialog.append(h);const box=document.createElement('div');box.innerHTML=body;dialog.append(box);dialog.setAttribute('aria-label',title);dialog.showModal();return box;}
function close(){dialog.close();dialog.replaceChildren();}
dialog.addEventListener('cancel',()=>{dialog.replaceChildren();});
function status(text,error=false){$('team-status').textContent=text;$('team-status').classList.toggle('error',error);}
let client=null,member=null,busy=false,timer=null,signature='',revision='',generation=0;
let members=memberOrder([]),catalog=[],weeks=[],selectedMember=null,selectedWeek=weekStart(),selectedDate='all',currentWeek=selectedWeek;
const cardButtons=MEMBER_NAMES.map((name,index)=>{
 const b=document.createElement('button');b.type='button';b.className='member-card';b.innerHTML='<strong></strong><span></span><small></small>';
 b.querySelector('strong').textContent=name;b.setAttribute('aria-pressed','false');
 b.onclick=()=>{if(!member)return;selectedMember=members[index].user_id;selectedDate='all';updateCards();ui.refreshScope();};
 $('member-cards').append(b);return b;
});
function updateCards(){
 members=memberOrder(members);
 cardButtons.forEach((b,i)=>{const m=members[i];b.disabled=!member||!m.user_id;b.setAttribute('aria-pressed',selectedMember===m.user_id&&!!member?'true':'false');
  b.querySelector('span').textContent=member?catalog.filter(x=>x.owner_id===m.user_id&&(selectedWeek==='all'||x.week_start===selectedWeek)&&!x.deleted_at).length+' 条选题':'登录后查看';
  b.querySelector('small').textContent=member?(m.user_id===member.user_id?'我的选题':m.user_id?'查看选题':'尚未绑定账号'):'每周独立收录';});
 $('week-note').textContent='每周三 00:00 自动更新 · 北京时间 · '+(selectedWeek==='all'?'全部周表':weekLabel(selectedWeek));
}
function account(on){for(const id of ['team-agent','team-logout'])$(id).hidden=!on;for(const id of ['team-refresh','team-add'])$(id).disabled=!on;$('team-login').hidden=on;$('team-member').textContent=on?'当前账号：'+member.name+' · '+member.email:signedOutLabel;updateCards();}
function clear(){generation++;clearTimeout(timer);signature='';revision='';member=null;catalog=[];weeks=[];members=memberOrder([]);selectedMember=null;selectedWeek=weekStart();selectedDate='all';ui.refreshScope();ui.replaceCatalog([]);account(false);}
function renderNavigation(all,current){
 const nav=$('month-nav'),focused=nav.contains(document.activeElement)?document.activeElement.dataset.period:null;nav.replaceChildren();
 const name=members.find(m=>m.user_id===selectedMember)?.name||'成员';
 $('current-heading').textContent=member?name+' · '+(selectedWeek==='all'?'全部日期':selectedDate==='all'?weekLabel(selectedWeek):selectedDate):'每周选题表';
 $('current-description').textContent=member?'收录 '+current.length+' 条 · 按平台查看 · '+(selectedMember===member.user_id?'可维护自己的选题':'正在查看其他成员的选题'):'登录后查看成员选题和历史周表';
 const add=(label,value,count,active,action,cls='')=>{const b=document.createElement('button');b.type='button';b.className='month-option '+cls+(active?' active':'');b.setAttribute('aria-pressed',String(active));b.dataset.period=value;const span=document.createElement('span');span.textContent=label;const small=document.createElement('small');small.textContent=count;b.append(span,small);b.onclick=action;nav.append(b);};
 add('全部日期','all',all.length,selectedWeek==='all',()=>{selectedWeek='all';selectedDate='all';updateCards();ui.refreshScope();});
 for(const w of weeks){
  const rows=all.filter(x=>x.week_start===w.start_date);
  add(weekLabel(w.start_date,w.end_date)+(w.start_date===currentWeek?' · 本周':''),w.start_date,rows.length,selectedWeek===w.start_date&&selectedDate==='all',()=>{selectedWeek=w.start_date;selectedDate='all';updateCards();ui.refreshScope();},'week-option');
  if(w.start_date===selectedWeek)for(const d of weekDates(w.start_date))add(d,d,rows.filter(x=>x.collected_on===d).length,selectedDate===d,()=>{selectedDate=d;ui.refreshScope();},'day-option');
 }
 if(focused)Array.from(nav.querySelectorAll('button')).find(b=>b.dataset.period===focused)?.focus();
}
async function refresh(force=false){
  if(busy)return;busy=true;const version=generation;
  try{
    const state=await client.weeklyState();if(version!==generation)return;
    const previous=currentWeek;currentWeek=state.current_week;weeks=state.weeks;members=memberOrder(state.members);
    if(!selectedMember)selectedMember=member.user_id;
    if(previous!==currentWeek&&selectedWeek===previous){selectedWeek=currentWeek;selectedDate='all';}
    const currentRevision=state.revision;
    if(!force&&revision===currentRevision&&!client.coversExpiring()){status('已同步 · '+new Date().toLocaleTimeString('zh-CN',{hour12:false}));return;}
    const rows=await client.listWeekly();if(version!==generation)return;
    const next=JSON.stringify(rows);
    catalog=rows;updateCards();if(force||next!==signature||revision!==currentRevision){ui.replaceCatalog(rows);signature=next;}
    revision=rows.some(x=>x.cover_error)?'':currentRevision;
    status(rows.some(x=>x.cover_error)?'部分封面暂时无法加载，稍后会重试':'已同步 · '+new Date().toLocaleTimeString('zh-CN',{hour12:false}));
    if(!$('rows').children.length)$('empty').textContent='当前成员在所选日期还没有选题。新增内容会保存到当前账号的本周表。';
  }catch(e){status('同步失败：'+e.message,true);if(!client.session||e.status===403){clear();await client.logout();ui.message(e.status===403?'你已不在团队成员列表中，请联系管理员。':'登录已过期，请重新登录。');}}
  finally{busy=false;}
}
function poll(){clearTimeout(timer);timer=setTimeout(async()=>{if(!document.hidden){if(member)await refresh();else if(client.session)await restore();}if(client.session)poll();},Math.max(5,Number(config.pollSeconds)||5)*1000);}
async function connect(){const version=generation;const identity=await client.member();if(version!==generation)return;member=identity;if(member.name==='豹朴')member.name='鲍朴';selectedMember=member.user_id;selectedWeek=weekStart();selectedDate='all';account(true);await refresh(true);poll();}
let restoring=false;
async function restore(){
 if(restoring)return;restoring=true;
 try{await connect();}
 catch(e){status(e.message,true);clear();if(!client.session||e.status===403){await client.logout();}else{status('暂时无法连接，登录状态已保留，联网后自动重试。',true);$('team-logout').hidden=false;poll();}}
 finally{restoring=false;}
}
ui.bind({
  scope:x=>!!member&&x.owner_id===selectedMember,
  periodFilter:x=>(selectedWeek==='all'||x.week_start===selectedWeek)&&(selectedDate==='all'||x.collected_on===selectedDate),
  groupKey:x=>x.collected_on,
  platforms:['xiaohongshu','douyin','instagram'],renderNavigation,
  clearFilters(){selectedWeek=currentWeek;selectedDate='all';updateCards();},
  canEdit:x=>!!member&&x.owner_id===member.user_id,
  async setDeleted(id,value){await client.setEntryDeleted(id,value);await refresh(true);},
  async replaceCover(row,file){await client.replaceEntryCover(row.id,file);await refresh(true);}
});
account(false);ui.replaceCatalog([]);$('empty').textContent='请登录后查看团队选题。';
if(!config.supabaseUrl||!config.publishableKey){
  $('team-login').disabled=true;status('尚未连接云端');
  const setup=document.createElement('section');setup.className='team-setup';
  setup.innerHTML='<h2>共享版已准备好，先连接免费项目</h2><p>管理员开通 Supabase 项目后，配置连接地址并添加四位成员。大家就能在同一个网址上传选题和封面。</p><p><a href="docs/SETUP.md" target="_blank" rel="noopener">查看开通与部署步骤 ↗</a></p><p>现有本地选题会继续保留，连接完成后可一并迁移。</p>';
  bar.after(setup);
}else{
  try{const url=new URL(config.supabaseUrl);if(url.protocol!=='https:'||url.username||url.password)throw Error('云端地址应使用 HTTPS。');let publicKey=config.publishableKey.startsWith('sb_publishable_');if(!publicKey)try{publicKey=JSON.parse(atob(config.publishableKey.split('.')[1].replaceAll('-','+').replaceAll('_','/'))).role==='anon';}catch{}if(!publicKey)throw Error('网页只能填写 publishable / anon key。');client=new TeamClient(config);}
  catch(e){status(e.message,true);$('team-login').disabled=true;}
  if(client){
    $('team-login').onclick=()=>{
      const box=show('登录团队选题库','<form class="team-form"><label>邮箱<input name="email" type="email" autocomplete="username" required></label><label>密码<input name="password" type="password" autocomplete="current-password" required></label><small>使用管理员为你开通的账号。登录后会自动保持，下次打开无需重复登录。</small><p role="status"></p><div class="dialog-actions"><button type="submit" class="primary">登录</button><button type="button" data-close>取消</button></div></form>');
      box.querySelector('[data-close]').onclick=close;
      box.querySelector('form').onsubmit=async e=>{e.preventDefault();const f=e.target,b=f.querySelector('[type=submit]'),msg=f.querySelector('[role=status]');b.disabled=true;msg.textContent='正在登录…';try{await client.login(f.email.value,f.password.value);await connect();f.password.value='';close();}catch(err){msg.textContent=err.message;f.password.value='';clear();if(!client.session||err.status===403)await client.logout();else{status('登录状态已保留，正在重试连接。',true);$('team-logout').hidden=false;poll();}}finally{b.disabled=false;}};
    };
    $('team-logout').onclick=async()=>{clear();close();status('已退出');await client.logout();};
    $('team-refresh').onclick=()=>refresh(true);
    $('team-add').onclick=()=>{
      const box=show('新增视频选题 · '+member.name+' · '+weekLabel(currentWeek),'<form class="team-form"><label>原帖链接<input name="url" type="url" placeholder="粘贴完整视频链接" required></label><div class="form-grid"><label>标题<input name="title" maxlength="1000"></label><label>作者<input name="author" maxlength="300"></label><label>发布时间<input name="published_at" type="date"></label><label>点赞数<input name="likes" type="number" min="0"></label></div><label>一句话总结<textarea name="summary" maxlength="2000"></textarea></label><label>原帖文案<textarea name="description" maxlength="20000"></textarea></label><label>原帖封面<input name="cover" type="file" accept="image/jpeg,image/png,image/webp"></label><small>内容归入当前登录账号的选题表。不确定的信息留空。想自动读取信息和封面，可将链接发给已配置的 Agent。</small><p role="status"></p><div class="dialog-actions"><button type="submit" class="primary">保存到我的本周表</button><button type="button" data-close>取消</button></div></form>');
      box.querySelector('[data-close]').onclick=close;
      box.querySelector('form').onsubmit=async e=>{e.preventDefault();const f=e.target,b=f.querySelector('[type=submit]'),msg=f.querySelector('[role=status]');b.disabled=true;msg.textContent='正在保存…';try{const input=Object.fromEntries(new FormData(f));await client.upsert(input,f.cover.files[0]||null,member.user_id);selectedMember=member.user_id;selectedWeek=currentWeek;selectedDate='all';await refresh(true);ui.refreshScope();close();ui.message('已保存到你的本周表。重复链接会合并；已删除的记录可在“已删除”中恢复。');}catch(err){msg.textContent=err.message;}finally{b.disabled=false;}};
    };
    $('team-agent').onclick=()=>{
      const box=show('连接你的 Agent','<div class="team-form"><p class="team-help">为自己的 Agent 生成一份入库凭证。它可以新增信息和封面，不能读取选题库或删除记录。重新生成后，旧凭证立即失效。</p><button class="primary" data-mint>生成 / 重置入库凭证</button><label>入库凭证<input type="password" class="token" readonly data-token autocomplete="off" placeholder="点击生成，凭证默认隐藏"></label><button type="button" data-copy>复制凭证</button><small>将凭证保存到你本机的 .agent.env 中，不要发到群聊或提交到 GitHub。关闭此窗口后不再显示。</small><p><a href="docs/AGENT.md" target="_blank" rel="noopener">查看 Agent 接入步骤 ↗</a></p><p role="status"></p><div class="dialog-actions"><button data-revoke>撤销凭证</button><button data-close>关闭</button></div></div>');
      box.querySelector('[data-close]').onclick=close;
      box.querySelector('[data-copy]').onclick=async()=>{const value=box.querySelector('[data-token]').value,msg=box.querySelector('[role=status]');if(!value){msg.textContent='请生成入库凭证。';return;}try{await navigator.clipboard.writeText(value);msg.textContent='已复制，请粘贴到 .agent.env。';}catch{msg.textContent='复制失败，请使用其他浏览器重试。';}};
      box.querySelector('[data-mint]').onclick=async e=>{e.target.disabled=true;try{box.querySelector('[data-token]').value=await client.rpc('issue_agent_token');box.querySelector('[role=status]').textContent='已生成，旧凭证已失效。';}catch(err){box.querySelector('[role=status]').textContent=err.message;}finally{e.target.disabled=false;}};
      box.querySelector('[data-revoke]').onclick=async()=>{try{await client.rpc('revoke_agent_token');box.querySelector('[data-token]').value='';box.querySelector('[role=status]').textContent='凭证已撤销。';}catch(err){box.querySelector('[role=status]').textContent=err.message;}};
    };
    const resume=()=>{client.syncSession();if(client.session){if(member)void refresh();else void restore();}else if(member)clear();};
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)resume();});
    window.addEventListener('online',resume);
    window.addEventListener('storage',e=>{if(e.key!==client.storageKey)return;const previous=client.session?.user?.id;client.syncSession();if(previous!==client.session?.user?.id){close();clear();if(client.session)void restore();else status('已退出');}});
    if(client.session)void restore();
  }
}

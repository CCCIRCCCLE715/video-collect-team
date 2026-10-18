// One thread per weekly entry. Drafts live only in this signed-in page.
export class CommentThread {
 constructor(api,entryId,userId){this.api=api;this.entryId=entryId;this.userId=userId;this.rows=[];this.draft='';this.epoch=0;this.pending=null;this.request=null;}
 async load(){const epoch=++this.epoch,rows=await this.api.comments(this.entryId);if(epoch===this.epoch)this.rows=rows;return this.rows;}
 send(text){
  if(this.pending)return this.pending;
  const body=text.trim();if(!body||body.length>2000)return Promise.reject(Error('评论请输入 1–2000 个字。'));
  this.draft=text;
  if(this.request?.body!==body)this.request={body,id:crypto.randomUUID()};
  const request=this.request;this.epoch++;
  this.pending=(async()=>{await this.api.addComment(this.entryId,body,request.id,this.userId);await this.load();if(this.draft===text)this.draft='';this.request=null;})().finally(()=>{this.pending=null;});
  return this.pending;
 }
}

export class CommentsUI {
 constructor({client,member}){
  this.client=client;this.member=member;this.counts={};this.threads=new Map();this.active=null;this.epoch=0;this.countEpoch=0;
  const panel=document.createElement('section');panel.id='topic-comments';panel.className='comments-panel';panel.setAttribute('popover','auto');panel.setAttribute('role','dialog');panel.setAttribute('aria-labelledby','comments-heading');
  panel.innerHTML='<header><div><h2 id="comments-heading">评论</h2><p class="comments-topic"></p></div><button type="button" class="comments-close" aria-label="关闭评论">×</button></header><ol class="comments-list" aria-label="评论列表" tabindex="0"></ol><p class="comments-message" role="status"></p><form class="comments-form"><label for="comment-body">发表评论</label><textarea id="comment-body" maxlength="2000" rows="3" placeholder="写下你的想法…"></textarea><div><small>回车发送 · Shift + 回车换行</small><button type="submit">发送</button></div></form>';
  document.body.append(panel);this.panel=panel;this.list=panel.querySelector('ol');this.input=panel.querySelector('textarea');this.message=panel.querySelector('[role=status]');this.sendButton=panel.querySelector('[type=submit]');
  panel.querySelector('.comments-close').onclick=()=>this.close();
  panel.addEventListener('toggle',e=>{if(e.newState==='closed'){this.active=null;this.epoch++;this.updateButtons();}});
  panel.querySelector('form').onsubmit=e=>{e.preventDefault();void this.send();};
  this.input.oninput=()=>{if(this.active)this.active.thread.draft=this.input.value;};
  panel.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();this.close();}});
  this.input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing&&e.keyCode!==229){e.preventDefault();void this.send();}});
  window.addEventListener('resize',()=>this.position());
  window.addEventListener('scroll',e=>{if(this.active&&!this.panel.contains(e.target))this.position();},true);
 }
 button(row){const button=document.createElement('button');button.type='button';button.className='comment-button';button.dataset.commentEntry=row.id;button.dataset.commentTitle=row.title||'未命名';button.setAttribute('aria-controls',this.panel.id);this.updateButton(button);button.onclick=e=>void this.open(row,e.currentTarget,e.detail===0);return button;}
 updateButton(b){const n=Number(this.counts[b.dataset.commentEntry])||0;b.textContent=n?String(n):'评论';b.title='评论 · '+n+' 条';b.setAttribute('aria-label',(n?n+' 条评论：':'评论：')+b.dataset.commentTitle);b.setAttribute('aria-expanded',String(this.active?.row.id===b.dataset.commentEntry));}
 updateButtons(){document.querySelectorAll('[data-comment-entry]').forEach(b=>this.updateButton(b));}
 close(restoreFocus=true){const id=this.active?.row.id;if(this.panel.matches(':popover-open'))this.panel.hidePopover();this.active=null;this.epoch++;this.updateButtons();if(restoreFocus&&id)[...document.querySelectorAll('[data-comment-entry]')].find(b=>b.dataset.commentEntry===id)?.focus({preventScroll:true});}
 clear(){this.close(false);this.countEpoch++;this.counts={};this.threads.clear();this.input.value='';this.list.replaceChildren();this.message.textContent='';}
 position(){
  if(!this.active)return;
  const anchor=[...document.querySelectorAll('[data-comment-entry]')].find(b=>b.dataset.commentEntry===this.active.row.id);
  if(!anchor){this.close();return;}
  const r=anchor.getBoundingClientRect(),width=Math.min(360,window.innerWidth-24),height=Math.min(520,window.innerHeight-24);
  this.panel.style.width=width+'px';this.panel.style.maxHeight=height+'px';
  this.panel.style.left=Math.max(12,Math.min(r.left-width-10,window.innerWidth-width-12))+'px';
  this.panel.style.top=Math.max(12,Math.min(r.top,window.innerHeight-height-12))+'px';
 }
 render(){
  if(!this.active)return;
  const rows=this.active.thread.rows,nearBottom=this.list.scrollHeight-this.list.scrollTop-this.list.clientHeight<60;
  this.list.replaceChildren();
  if(!rows.length){const empty=document.createElement('li');empty.className='comments-empty';empty.textContent='还没有评论，聊聊这个选题吧。';this.list.append(empty);}
  for(const row of rows){const item=document.createElement('li'),meta=document.createElement('div'),name=document.createElement('strong'),time=document.createElement('time'),body=document.createElement('p');name.textContent=row.author_name||'已离开成员';time.dateTime=row.created_at;time.textContent=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(row.created_at));meta.append(name,time);body.textContent=row.body;item.append(meta,body);this.list.append(item);}
  this.panel.querySelector('h2').textContent='评论'+(rows.length?' · '+rows.length:'');
  if(nearBottom)this.list.scrollTop=this.list.scrollHeight;
 }
 async open(row,button,keyboard){
  if(this.active?.row.id===row.id){this.close();return;}
  this.close(false);const member=this.member();if(!member)return;
  let thread=this.threads.get(row.id);if(!thread){thread=new CommentThread(this.client(),row.id,member.user_id);this.threads.set(row.id,thread);}
  const epoch=++this.epoch;this.active={row,thread};this.panel.querySelector('.comments-topic').textContent=row.title||'未命名';this.input.value=thread.draft;this.sendButton.disabled=!!thread.pending;this.message.textContent='正在读取评论…';this.list.replaceChildren();this.panel.showPopover();this.position();this.updateButtons();this.input.focus({preventScroll:true});
  if(!keyboard&&!matchMedia('(prefers-reduced-motion: reduce)').matches)this.panel.animate([{opacity:0,transform:'translateX(8px)'},{opacity:1,transform:'translateX(0)'}],{duration:160,easing:'cubic-bezier(0.23, 1, 0.32, 1)'});
  try{await thread.load();if(this.epoch!==epoch)return;this.render();this.message.textContent='';this.countEpoch++;this.counts[row.id]=thread.rows.length;this.updateButtons();}catch(e){if(this.epoch===epoch)this.message.textContent='评论读取失败，可重新打开重试：'+e.message;}
 }
 async send(){
  const active=this.active;if(!active||active.thread.pending)return;
  const member=this.member();if(!member||member.user_id!==active.thread.userId){this.clear();return;}
  const {thread,row}=active;this.sendButton.disabled=true;this.message.textContent='正在发送…';
  try{await thread.send(this.input.value);if(this.member()?.user_id!==thread.userId)return;this.countEpoch++;this.counts[row.id]=thread.rows.length;this.updateButtons();if(this.active?.thread!==thread)return;this.input.value=thread.draft;this.render();this.list.scrollTop=this.list.scrollHeight;this.message.textContent='已发送';this.input.focus({preventScroll:true});}
  catch(e){if(this.active?.thread===thread&&this.member()?.user_id===thread.userId)this.message.textContent='未发送成功：'+e.message;}
  finally{if(this.active?.thread===thread&&this.member()?.user_id===thread.userId)this.sendButton.disabled=false;}
 }
 async sync(){
  if(!this.member()||this.syncPending)return;this.syncPending=true;const epoch=this.countEpoch;
  try{const counts=await this.client().commentCounts();if(epoch!==this.countEpoch)return;this.counts=counts;this.updateButtons();const active=this.active;
   if(active&&!active.thread.pending&&Number(counts[active.row.id]||0)!==active.thread.rows.length){await active.thread.load();if(this.active===active){this.render();this.message.textContent='';}}
  }catch(e){if(this.active)this.message.textContent='评论同步暂时失败：'+e.message;}finally{this.syncPending=false;}
 }
}

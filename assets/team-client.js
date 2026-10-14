import {normalizeTopic,decodeCover} from './topic.js?v=20261014-migration';
export class TeamClient {
  constructor(config,{fetcher=globalThis.fetch.bind(globalThis),storage=localStorage}={}){
    this.url=config.supabaseUrl.replace(/\/$/,'');this.key=config.publishableKey;
    this.fetcher=fetcher;this.storage=storage;this.session=null;this.coverCache=new Map();
    this.storageKey='video-collect-session:'+this.url;
    try{this.session=JSON.parse(storage.getItem(this.storageKey)||'null');}catch{}
  }
  saveSession(value){this.storage.setItem(this.storageKey,JSON.stringify(value));this.session=value;}
  async auth(path,body){
    const r=await this.fetcher(this.url+'/auth/v1/'+path,{method:'POST',headers:{apikey:this.key,'Content-Type':'application/json'},body:JSON.stringify(body)});
    const v=await r.json();if(!r.ok)throw Error('登录失败，请核对邮箱和密码。');return v;
  }
  async login(email,password){this.saveSession(await this.auth('token?grant_type=password',{email,password}));}
  async logout(){
    const s=this.session;this.saveSession(null);this.coverCache.clear();
    if(s)try{await this.fetcher(this.url+'/auth/v1/logout',{method:'POST',headers:{apikey:this.key,Authorization:'Bearer '+s.access_token}});}catch{}
  }
  async token(){
    if(!this.session)throw Error('请先登录。');
    if(!this.session.expires_at||this.session.expires_at*1000<Date.now()+60000){
      if(!this.refreshing)this.refreshing=this.auth('token?grant_type=refresh_token',{refresh_token:this.session.refresh_token}).then(s=>{this.saveSession(s);return s;}).catch(e=>{this.saveSession(null);throw e;}).finally(()=>{this.refreshing=null;});
      await this.refreshing;
    }
    return this.session.access_token;
  }
  async request(path,{method='GET',body,raw=false,contentType='application/json'}={}){
    const token=await this.token();
    const r=await this.fetcher(this.url+path,{method,headers:{apikey:this.key,Authorization:'Bearer '+token,'Content-Type':contentType},body:body===undefined?undefined:raw?body:JSON.stringify(body)});
    const v=await r.json().catch(()=>null);
    if(!r.ok){if(r.status===401){this.saveSession(null);throw Error('登录已过期，请重新登录。');}const error=Error(v?.message||v?.error||'请求失败，请稍后重试。');error.status=r.status;throw error;}
    return v;
  }
  rpc(name,body={}){return this.request('/rest/v1/rpc/'+name,{method:'POST',body});}
  async member(){const rows=await this.request('/rest/v1/team_members?user_id=eq.'+encodeURIComponent(this.session.user.id)+'&select=user_id,name');if(!rows.length)throw Error('这个账号尚未加入团队，请联系管理员。');return rows[0];}
  async signedCover(path){
    const cached=this.coverCache.get(path);if(cached&&cached.until>Date.now())return cached.url;
    const v=await this.request('/storage/v1/object/sign/covers/'+path,{method:'POST',body:{expiresIn:3600}});
    const signed=v.signedURL||v.signedUrl;if(!signed)throw Error('封面地址未生成。');
    const url=signed.startsWith('/')?this.url+'/storage/v1'+signed:signed;
    this.coverCache.set(path,{url,until:Date.now()+3300000});return url;
  }
  async list(){
    const items=await this.rpc('list_topics');
    await Promise.all(items.map(async x=>{x.poster=null;if(x.cover_path)try{x.poster=await this.signedCover(x.cover_path);}catch{x.cover_error=true;}}));return items;
  }
  weeklyState(){return this.rpc('weekly_library_state');}
  async listWeekly(){
    const items=await this.rpc('list_weekly_topics');
    await Promise.all(items.map(async x=>{x.poster=null;if(x.cover_path)try{x.poster=await this.signedCover(x.cover_path);}catch{x.cover_error=true;}}));return items;
  }
  setEntryDeleted(id,deleted){return this.rpc('set_entry_deleted',{p_id:id,p_deleted:deleted});}
  async replaceEntryCover(id,file){
    let path=null;
    try{path=await this.upload(file);return await this.rpc('replace_entry_cover',{p_id:id,p_cover_path:path});}
    catch(e){if(path)await this.cleanup(path);throw e;}
  }
  async upload(file){
    const base64=btoa(String.fromCharCode(...new Uint8Array(await file.arrayBuffer()).slice(0,12)));
    decodeCover({mime:file.type,base64});if(file.size>2097152)throw Error('封面不能超过 2 MB。');
    const path=this.session.user.id+'/'+crypto.randomUUID().replaceAll('-','')+'.'+({'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[file.type]);
    await this.request('/storage/v1/object/covers/'+path,{method:'POST',raw:true,body:file,contentType:file.type});return path;
  }
  async cleanup(path){try{await this.request('/storage/v1/object/covers',{method:'DELETE',body:{prefixes:[path]}});}catch{}}
  async upsert(input,file=null){
    const data=normalizeTopic(input);let path=null;
    try{if(file)path=await this.upload(file);return await this.rpc('upsert_topic',{p_data:data,p_cover_path:path});}
    catch(e){if(path)await this.cleanup(path);throw e;}
  }
  setDeleted(id,deleted){return this.rpc('set_topic_deleted',{p_id:id,p_deleted:deleted});}
  revision(){return this.rpc('library_revision');}
  coversExpiring(){return [...this.coverCache.values()].some(x=>x.until<Date.now());}
}

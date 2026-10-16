import {normalizeTopic,decodeCover} from './topic.js?v=20261014-migration';
export class TeamClient {
  constructor(config,{fetcher=globalThis.fetch.bind(globalThis),storage=localStorage}={}){
    this.url=config.supabaseUrl.replace(/\/$/,'');this.key=config.publishableKey;
    this.fetcher=fetcher;this.storage=storage;this.session=null;this.coverCache=new Map();
    this.storageKey='video-collect-session:'+this.url;
    this.sessionVersion=0;this.savedValue=storage.getItem(this.storageKey);
    try{this.session=JSON.parse(this.savedValue||'null');}catch{}
  }
  syncSession(){
    const value=this.storage.getItem(this.storageKey);
    if(value!==this.savedValue){this.savedValue=value;this.sessionVersion++;this.coverCache.clear();try{this.session=JSON.parse(value||'null');}catch{this.session=null;}}
    return this.session;
  }
  saveSession(value){
    if(value&&!value.expires_at&&value.expires_in)value={...value,expires_at:Math.floor(Date.now()/1000)+value.expires_in};
    this.savedValue=JSON.stringify(value);this.storage.setItem(this.storageKey,this.savedValue);this.session=value;this.sessionVersion++;
  }
  async auth(path,body){
    let r;
    try{r=await this.fetcher(this.url+'/auth/v1/'+path,{method:'POST',headers:{apikey:this.key,'Content-Type':'application/json'},body:JSON.stringify(body)});}
    catch{throw Error('连接暂时失败，已保留登录状态，联网后会重试。');}
    const v=await r.json().catch(()=>null);
    if(!r.ok){const error=Error(r.status>=500||r.status===429?'连接暂时失败，已保留登录状态，稍后会重试。':path.includes('refresh_token')?'登录已失效，请重新登录。':'登录失败，请核对邮箱和密码。');error.status=r.status;error.authExpired=path.includes('refresh_token')&&[400,401,403].includes(r.status);throw error;}
    if(!v?.access_token||!v?.refresh_token)throw Error('登录服务暂时未返回完整信息，请稍后重试。');return v;
  }
  async login(email,password){
    const version=this.sessionVersion,s=await this.auth('token?grant_type=password',{email,password});
    this.syncSession();if(version!==this.sessionVersion)throw Error('账号状态已改变，请重新操作。');this.saveSession(s);
  }
  async logout(){
    const s=this.session;this.saveSession(null);this.coverCache.clear();
    if(s)try{await this.fetcher(this.url+'/auth/v1/logout',{method:'POST',headers:{apikey:this.key,Authorization:'Bearer '+s.access_token}});}catch{}
  }
  async refreshSession(rejectedToken=null){
    if(!this.refreshing){
      const run=async()=>{
        this.syncSession();const s=this.session,version=this.sessionVersion;
        if(!s)throw Error('请先登录。');
        if(rejectedToken&&s.access_token!==rejectedToken)return;
        if(!rejectedToken&&s.expires_at*1000>=Date.now()+60000)return;
        if(!s.refresh_token){this.saveSession(null);throw Error('登录已失效，请重新登录。');}
        try{
          const fresh=await this.auth('token?grant_type=refresh_token',{refresh_token:s.refresh_token});
          this.syncSession();if(version!==this.sessionVersion)throw Error('账号状态已改变，请重新操作。');
          this.saveSession(fresh);
        }catch(e){this.syncSession();if(e.authExpired&&version===this.sessionVersion)this.saveSession(null);throw e;}
      };
      const locks=globalThis.navigator?.locks;
      this.refreshing=(locks?locks.request(this.storageKey,run):run()).finally(()=>{this.refreshing=null;});
    }
    await this.refreshing;
  }
  async token(){
    this.syncSession();if(!this.session)throw Error('请先登录。');
    if(!this.session.expires_at||this.session.expires_at*1000<Date.now()+60000)await this.refreshSession();
    if(!this.session)throw Error('请先登录。');return this.session.access_token;
  }
  async request(path,{method='GET',body,raw=false,contentType='application/json',expectedUserId=null}={}){
    let token=await this.token();const accountId=this.session.user?.id;
    if(expectedUserId&&accountId!==expectedUserId)throw Error('账号已切换，请重新操作。');
    const send=()=>this.fetcher(this.url+path,{method,headers:{apikey:this.key,Authorization:'Bearer '+token,'Content-Type':contentType},body:body===undefined?undefined:raw?body:JSON.stringify(body)});
    let r=await send();
    if(r.status===401){this.syncSession();if(this.session?.user?.id!==accountId)throw Error('账号已切换，请重新操作。');await this.refreshSession(token);token=await this.token();if(this.session.user?.id!==accountId)throw Error('账号已切换，请重新操作。');r=await send();}
    const v=await r.json().catch(()=>null);
    if(!r.ok){const error=Error(r.status===401?'登录已失效，请重新登录。':v?.message||v?.error||'请求失败，请稍后重试。');error.status=r.status;if(r.status===401){this.syncSession();if(this.session?.access_token===token)this.saveSession(null);}throw error;}
    return v;
  }
  rpc(name,body={}){return this.request('/rest/v1/rpc/'+name,{method:'POST',body});}
  member(){return this.rpc('current_team_member');}
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
  favorites(){return this.request('/rest/v1/topic_favorites?select=user_id,topic_id,entry_id,created_at&order=created_at.desc,topic_id.asc');}
  setFavorite(id,value,memberId,expectedUserId){return this.request('/rest/v1/rpc/set_topic_favorite',{method:'POST',body:{p_entry_id:id,p_favorite:value,p_member_id:memberId},expectedUserId});}
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
  async upload(file,expectedUserId=null){
    const base64=btoa(String.fromCharCode(...new Uint8Array(await file.arrayBuffer()).slice(0,12)));
    decodeCover({mime:file.type,base64});if(file.size>2097152)throw Error('封面不能超过 2 MB。');
    await this.token();
    const path=this.session.user.id+'/'+crypto.randomUUID().replaceAll('-','')+'.'+({'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[file.type]);
    await this.request('/storage/v1/object/covers/'+path,{method:'POST',raw:true,body:file,contentType:file.type,expectedUserId});return path;
  }
  async cleanup(path){try{await this.request('/storage/v1/object/covers',{method:'DELETE',body:{prefixes:[path]}});}catch{}}
  async upsert(input,file=null,expectedUserId=null){
    await this.token();if(expectedUserId&&this.session.user.id!==expectedUserId)throw Error('账号已切换，请重新打开新增选题。');
    const data=normalizeTopic(input);let path=null;
    try{if(file)path=await this.upload(file,expectedUserId);return await this.request('/rest/v1/rpc/upsert_topic',{method:'POST',body:{p_data:data,p_cover_path:path},expectedUserId});}
    catch(e){if(path)await this.cleanup(path);throw e;}
  }
  setDeleted(id,deleted){return this.rpc('set_topic_deleted',{p_id:id,p_deleted:deleted});}
  revision(){return this.rpc('library_revision');}
  coversExpiring(){return [...this.coverCache.values()].some(x=>x.until<Date.now());}
}

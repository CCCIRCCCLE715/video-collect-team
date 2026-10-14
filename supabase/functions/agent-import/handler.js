import {normalizeTopic,decodeCover} from '../../../assets/topic.js';
export function createHandler({url,serviceKey,fetcher=fetch}) {
  const authHeaders={apikey:serviceKey,...(serviceKey?.startsWith('sb_secret_')?{}:{Authorization:`Bearer ${serviceKey}`})};
  const headers={...authHeaders,'Content-Type':'application/json'};
  const rpc=async(name,body)=>{
    const r=await fetcher(`${url}/rest/v1/rpc/${name}`,{method:'POST',headers,body:JSON.stringify(body)});
    if(!r.ok)throw Error('数据库请求失败。');return r.json();
  };
  return async request=>{
    if(request.method!=='POST')return Response.json({error:'仅接受 POST 入库请求。'},{status:405});
    if(!url||!serviceKey)return Response.json({error:'服务尚未配置。'},{status:503});
    const token=request.headers.get('X-Agent-Token');
    if(!token||token.length>200)return Response.json({error:'入库凭证无效。'},{status:401});
    let member;
    try{member=await rpc('resolve_agent_member',{p_token:token});}catch{return Response.json({error:'暂时无法验证凭证，请稍后重试。'},{status:503});}
    if(!member)return Response.json({error:'入库凭证无效或已撤销。'},{status:401});
    let payload,topic,cover;
    try{
      // Bound the actual stream, even when Content-Length is missing or incorrect.
      const reader=request.body?.getReader();if(!reader)throw Error('请求正文为空。');
      const chunks=[];let size=0;
      for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>3000000){await reader.cancel();throw Error('请求过大。');}chunks.push(value);}
      const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}
      payload=JSON.parse(new TextDecoder().decode(bytes));topic=normalizeTopic(payload.topic);
      if(payload.cover)cover=decodeCover(payload.cover);
    }catch(e){return Response.json({error:e.message||'请求格式无效。'},{status:400});}
    let path=null;
    try{
      if(cover){
        path=`${member}/${crypto.randomUUID().replaceAll('-','')}.${cover.ext}`;
        const r=await fetcher(`${url}/storage/v1/object/covers/${path}`,{method:'POST',headers:{...authHeaders,'Content-Type':cover.mime},body:cover.bytes});
        if(!r.ok)throw Error('封面上传失败，请重试；选题尚未入库。');
      }
      const id=await rpc('upsert_topic_as_member',{p_member_id:member,p_data:topic,p_cover_path:path});
      return Response.json({id,ok:true,cover_saved:!!path});
    }catch(e){
      if(path)try{await fetcher(`${url}/storage/v1/object/covers`,{method:'DELETE',headers,body:JSON.stringify({prefixes:[path]})});}catch{}
      return Response.json({error:e.message||'入库失败，请稍后重试。'},{status:502});
    }
  };
}

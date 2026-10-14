const platforms = {
  instagram:'Instagram', douyin:'抖音', xiaohongshu:'小红书', bilibili:'哔哩哔哩', youtube:'YouTube', tiktok:'TikTok', x:'X'
};
export function identifyPost(value) {
  const u=new URL(String(value||'').trim());
  if(u.protocol!=='https:'||u.username||u.password||u.port)throw Error('请使用原平台的 HTTPS 视频链接。');
  const host=u.hostname.toLowerCase(),path=u.pathname;let p,id,url;
  if(['instagram.com','www.instagram.com'].includes(host)){
    const m=path.match(/^\/(?:[^/]+\/)?(reel|p)\/([A-Za-z0-9_-]+)\/?$/);
    if(m){p='instagram';id=m[2];url=`https://www.instagram.com/${m[1]}/${id}/`;}
  }else if(['douyin.com','www.douyin.com'].includes(host)){
    const m=path.match(/^\/video\/(\d+)\/?$/);if(m){p='douyin';id=m[1];url=`https://www.douyin.com/video/${id}`;}
  }else if(['xiaohongshu.com','www.xiaohongshu.com'].includes(host)){
    const m=path.match(/^\/(?:explore|discovery\/item)\/([a-fA-F0-9]{24})\/?$/)||path.match(/^\/user\/profile\/[a-fA-F0-9]{24}\/([a-fA-F0-9]{24})\/?$/);
    if(m){p='xiaohongshu';id=m[1].toLowerCase();url=`https://www.xiaohongshu.com/explore/${id}`;const token=u.searchParams.get('xsec_token');if(token&&/^[A-Za-z0-9_=-]{1,500}$/.test(token))url+='?xsec_token='+encodeURIComponent(token);}
  }else if(['bilibili.com','www.bilibili.com'].includes(host)){
    const m=path.match(/^\/video\/(BV[A-Za-z0-9]+)\/?$/);if(m){p='bilibili';id=m[1];url=`https://www.bilibili.com/video/${id}/`;}
  }else if(['youtube.com','www.youtube.com','m.youtube.com','youtu.be'].includes(host)){
    id=host==='youtu.be'?path.slice(1):path.startsWith('/shorts/')?path.split('/')[2]:path==='/watch'?u.searchParams.get('v'):null;
    if(/^[A-Za-z0-9_-]{11}$/.test(id||'')){p='youtube';url=`https://www.youtube.com/watch?v=${id}`;}
  }else if(['tiktok.com','www.tiktok.com'].includes(host)){
    const m=path.match(/^\/@([A-Za-z0-9._]+)\/video\/(\d+)\/?$/);if(m){p='tiktok';id=m[2];url=`https://www.tiktok.com/@${m[1]}/video/${id}`;}
  }else if(['x.com','www.x.com','twitter.com','www.twitter.com'].includes(host)){
    const m=path.match(/^\/([A-Za-z0-9_]+)\/status\/(\d+)\/?$/);if(m){p='x';id=m[2];url=`https://x.com/${m[1]}/status/${id}`;}
  }
  if(!p||!id)throw Error('未识别到原帖。短链接请先在浏览器打开，再使用完整原帖链接。');
  return {id:`${p}:${id}`,platform:p,platform_label:platforms[p],url};
}
const text=(v,max)=>typeof v==='string'?v.trim().slice(0,max):'';
const metric=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))&&Number(v)>=0?Math.floor(Number(v)):null;
export function normalizeTopic(input={}) {
  const post=identifyPost(input.url),now=new Date().toISOString();
  const title=text(input.title,1000),author=text(input.author,300),description=text(input.description,20000),summary=text(input.summary,2000);
  const date=text(input.published_at,10),stamp=Date.parse(date),published_at=/^\d{4}-\d{2}-\d{2}$/.test(date)&&!Number.isNaN(stamp)&&new Date(stamp).toISOString().slice(0,10)===date?date:null;
  return {...post,title:title||'信息待补',author,description,summary,published_at,
    month:/^\d{4}-(0[1-9]|1[0-2])$/.test(input.month||'')?input.month:null,
    captured_at:now,likes:metric(input.likes),likes_label:text(input.likes_label,50),duration:metric(input.duration),comments:metric(input.comments),views:metric(input.views),
    kind:'媒体',status:'link',origins:['import'],source_names:['导入'],poster:null,video:null,images:[],
    metadata_status:!title?'pending':author&&summary&&published_at?'complete':'partial',
    summary_basis:text(input.summary_basis,500)};
}
export function decodeCover(cover) {
  if(!cover||!['image/jpeg','image/png','image/webp'].includes(cover.mime)||typeof cover.base64!=='string'||cover.base64.length>2800000)throw Error('封面应为不超过 2 MB 的 JPG、PNG 或 WebP 图片。');
  let bytes;try{bytes=Uint8Array.from(atob(cover.base64),x=>x.charCodeAt(0));}catch{throw Error('封面编码无效。');}
  const valid=cover.mime==='image/jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:
    cover.mime==='image/png'?bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71:
    String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP';
  if(!valid||bytes.length>2097152)throw Error('封面格式或大小无效。');
  return {bytes,ext:{'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[cover.mime],mime:cover.mime};
}

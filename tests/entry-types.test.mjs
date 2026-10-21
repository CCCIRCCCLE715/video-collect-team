import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeTopic} from '../assets/topic.js';
import {createHandler} from '../supabase/functions/agent-import/handler.js';
const url='https://www.instagram.com/reel/Type123/';
test('imports require an explicit category and topic suggestions cannot be blank or truncated',()=>{
 for(const entry_type of [undefined,'','case','TOPIC',null])assert.throws(()=>normalizeTopic({url,entry_type}),/参考视频|选题/);
 for(const topic_suggestion of [undefined,' \n ',42,'x'.repeat(4001)])assert.throws(()=>normalizeTopic({url,entry_type:'topic',topic_suggestion}),/选题建议/);
 const x=normalizeTopic({url,entry_type:'topic',topic_suggestion:'  做一期 AI 桌宠教程，展示制作步骤和效果。  '});
 assert.equal(x.entry_type,'topic');assert.equal(x.topic_suggestion,'做一期 AI 桌宠教程，展示制作步骤和效果。');
 const reference=normalizeTopic({url,entry_type:'reference',topic_suggestion:'旧建议'});
 assert.equal(reference.entry_type,'reference');assert.equal(reference.topic_suggestion,'');
});
test('Agent does not write unspecified links and preserves explicit topic instructions',async()=>{
 const writes=[];
 const h=createHandler({url:'https://fixture.supabase.co',serviceKey:'server',fetcher:async(u,o)=>{
  if(u.endsWith('resolve_agent_member'))return Response.json('11111111-1111-1111-1111-111111111111');
  if(u.endsWith('upsert_topic_as_member')){writes.push(JSON.parse(o.body));return Response.json('instagram:Type123');}
  throw Error('unexpected write');
 }});
 const send=topic=>h(new Request('https://fixture/agent-import',{method:'POST',headers:{'X-Agent-Token':'valid'},body:JSON.stringify({topic})}));
 assert.equal((await send({url})).status,400);assert.equal(writes.length,0);
 assert.equal((await send({url,entry_type:'topic'})).status,400);assert.equal(writes.length,0);
 assert.equal((await send({url,entry_type:'topic',topic_suggestion:'做一期入门教程，演示从提示词到成片。'})).status,200);
 assert.equal(writes[0].p_data.entry_type,'topic');assert.equal(writes[0].p_data.topic_suggestion,'做一期入门教程，演示从提示词到成片。');
});

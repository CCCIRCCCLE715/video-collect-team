import test from 'node:test';
import assert from 'node:assert/strict';
import {CommentThread,CommentsUI} from '../assets/comments.js';

test('failed submissions keep a stable request and draft; retries append once and whitespace is rejected',async()=>{
 let reject=true,calls=[];
 const api={async addComment(entry,body,id,user){calls.push({entry,body,id,user});if(reject)throw Error('offline');},async comments(){return [{id:'one',body:'测试评论',author_name:'正源'}];}};
 const thread=new CommentThread(api,'entry','zhengyuan');
 await assert.rejects(thread.send(' \n '),/评论/);assert.equal(calls.length,0);
 await assert.rejects(thread.send(' 测试评论 '),/offline/);assert.equal(thread.draft,' 测试评论 ');
 reject=false;await thread.send(' 测试评论 ');
 assert.equal(calls[0].id,calls[1].id);assert.equal(calls[1].body,'测试评论');assert.equal(calls[1].user,'zhengyuan');
 assert.equal(thread.draft,'');assert.equal(thread.rows.length,1);
});

test('rapid sends share one write, and a draft changed while sending is preserved',async()=>{
 let finish,writes=0;const gate=new Promise(r=>finish=r);
 const api={async addComment(){writes++;await gate;},async comments(){return [{id:'one',body:'第一条'}];}};
 const thread=new CommentThread(api,'entry','zhengyuan');
 const first=thread.send('第一条');const second=thread.send('第一条');thread.draft='下一条';finish();await Promise.all([first,second]);
 assert.equal(writes,1);assert.equal(thread.draft,'下一条');assert.equal(thread.rows.length,1);
});

test('refresh during a send cannot replace the newly returned comment list with an older response',async()=>{
 let resolveOld,reads=0;const api={async comments(){if(++reads===1)return new Promise(r=>resolveOld=r);return [{id:'new',body:'新评论'}];},async addComment(){}};
 const thread=new CommentThread(api,'entry','zhengyuan');const old=thread.load();await thread.send('新评论');resolveOld([]);await old;
 assert.equal(thread.rows[0].id,'new');
});


test('closing and reopening the same thread during send updates the reopened panel and enables sending',async()=>{
 let finish,stored=false,rendered=[];
 const gate=new Promise(r=>finish=r);
 const api={async addComment(){await gate;stored=true;},async comments(){return stored?[{id:'one',body:'正在发送的评论'}]:[];}};
 const thread=new CommentThread(api,'entry','zhengyuan'),row={id:'entry'};
 const ui={active:{thread,row},member:()=>({user_id:'zhengyuan'}),sendButton:{disabled:false},message:{textContent:''},input:{value:'正在发送的评论',focus(){}},list:{scrollTop:0,scrollHeight:30},countEpoch:0,counts:{},updateButtons(){},render(){rendered=[...this.active.thread.rows];}};
 const sending=CommentsUI.prototype.send.call(ui);
 ui.active=null;ui.active={thread,row};ui.sendButton.disabled=!!thread.pending;
 await thread.load();assert.equal(thread.rows.length,0);
 finish();await sending;
 assert.equal(rendered.length,1);assert.equal(ui.counts.entry,1);assert.equal(ui.input.value,'');assert.equal(ui.sendButton.disabled,false);assert.equal(ui.message.textContent,'已发送');
});

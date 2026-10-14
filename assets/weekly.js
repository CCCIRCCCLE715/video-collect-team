const dayMs=86400000;
export const MEMBER_NAMES=['黄白','正源','鲍朴','弈伶'];
export function shanghaiDate(at=new Date()){
 const value=new Date(at);if(!Number.isFinite(value.getTime()))throw Error('日期无效');
 return new Date(value.getTime()+8*3600000).toISOString().slice(0,10);
}
export function weekStart(at=new Date()){
 const date=new Date(shanghaiDate(at)+'T00:00:00Z');
 return new Date(date.getTime()-((date.getUTCDay()+4)%7)*dayMs).toISOString().slice(0,10);
}
export function weekEnd(start){return new Date(Date.parse(start+'T00:00:00Z')+6*dayMs).toISOString().slice(0,10);}
export function weekDates(start){return Array.from({length:7},(_,n)=>new Date(Date.parse(start+'T00:00:00Z')+n*dayMs).toISOString().slice(0,10));}
export function memberOrder(members){
 const rows=members.map(m=>({...m,name:m.name==='豹朴'?'鲍朴':m.name}));
 return MEMBER_NAMES.map(name=>rows.find(m=>m.name===name)||{name,user_id:null});
}
export function weekLabel(start,end=weekEnd(start)){return start+' 至 '+end;}

const dayMs=86400000;
export const MEMBER_NAMES=['黄白','正源','豹朴','奕伶'];
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
 const rows=members.map(m=>({...m,name:m.name==='鲍朴'?'豹朴':m.name==='弈伶'?'奕伶':m.name}));
 return MEMBER_NAMES.map(name=>rows.find(m=>m.name===name)||{name,user_id:null});
}
export function weekLabel(start,end=weekEnd(start)){return start+' 至 '+end;}

// Archive month is the month assigned by the source library, not import time.
export function topicMonth(row){
 if(/^\d{4}-(0[1-9]|1[0-2])$/.test(row.month||''))return row.month;
 if(row.captured_at&&Number.isFinite(Date.parse(row.captured_at)))return shanghaiDate(row.captured_at).slice(0,7);
 return '未标月份';
}
export function monthList(rows){
 return [...new Set(rows.map(topicMonth))].sort((a,b)=>a==='未标月份'?1:b==='未标月份'?-1:b.localeCompare(a));
}
export function matchesPeriod(row,{mode='month',month='all',week='all',date='all'}={}){
 return mode==='month'?(month==='all'||topicMonth(row)===month):
  (week==='all'||row.week_start===week)&&(date==='all'||row.collected_on===date);
}

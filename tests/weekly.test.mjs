import test from 'node:test';
import assert from 'node:assert/strict';
import {weekStart,shanghaiDate,weekEnd,memberOrder} from '../assets/weekly.js';
test('Beijing Wednesday midnight starts a new collection even on a Tuesday UTC clock',()=>{
 for(const [at,want] of [
  ['2026-10-13T15:59:59Z','2026-10-07'],
  ['2026-10-13T16:00:00Z','2026-10-14'],
  ['2026-10-20T15:59:59Z','2026-10-14'],
  ['2026-10-20T16:00:00Z','2026-10-21'],
  ['2026-12-31T16:00:00Z','2026-12-30'],
 ])assert.equal(weekStart(at),want);
 assert.equal(shanghaiDate('2026-10-13T16:00:00Z'),'2026-10-14');
 assert.equal(weekEnd('2026-10-14'),'2026-10-20');
 assert.equal(weekEnd('2026-12-30'),'2027-01-05');
});
test('member cards preserve the requested order while accepting the old member spelling',()=>{
 const members=[{name:'弈伶'},{name:'豹朴'},{name:'黄白'},{name:'正源'}];
 assert.deepEqual(memberOrder(members).map(m=>m.name),['黄白','正源','豹朴','奕伶']);
});

test('historical months are independent from the actual import date and weekly view',async()=>{
 const {topicMonth,matchesPeriod,monthList}=await import('../assets/weekly.js');
 const rows=[
  {month:'2026-08',captured_at:'2026-10-16T03:00:00Z',week_start:'2026-10-14',collected_on:'2026-10-16'},
  {month:'2026-09',captured_at:'2026-10-16T03:00:00Z',week_start:'2026-10-14',collected_on:'2026-10-16'},
  {month:null,captured_at:'2026-09-30T16:00:00Z',week_start:'2026-10-14',collected_on:'2026-10-01'}
 ];
 assert.equal(topicMonth(rows[0]),'2026-08');
 assert.equal(topicMonth(rows[2]),'2026-10','Unspecified month falls back to Beijing capture month');
 assert.equal(topicMonth({month:'2026-99',captured_at:'invalid'}),'未标月份');
 assert.deepEqual(monthList(rows),['2026-10','2026-09','2026-08']);
 assert.deepEqual(rows.filter(x=>matchesPeriod(x,{mode:'month',month:'2026-08',week:'2026-10-21'})),[rows[0]]);
 assert.equal(rows.filter(x=>matchesPeriod(x,{mode:'month',month:'all'})).length,3);
 assert.equal(rows.filter(x=>matchesPeriod(x,{mode:'week',week:'2026-10-14',date:'2026-10-16'})).length,2);
 assert.equal(rows.filter(x=>matchesPeriod(x,{mode:'week',week:'2026-10-21'})).length,0);
});

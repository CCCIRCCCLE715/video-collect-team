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

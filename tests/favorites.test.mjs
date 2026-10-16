import test from 'node:test';
import assert from 'node:assert/strict';
import * as helper from '../assets/favorites.js';
test('favorites retain the selected snapshot across owners and weeks, deduplicate videos and hide deleted entries',()=>{
 const catalog=[{id:'a',topic_id:'video1',owner_id:'one',week_start:'2026-10-14'},{id:'b',topic_id:'video1',owner_id:'two',week_start:'2026-10-21'},{id:'c',topic_id:'video2',deleted_at:'2026-10-16'},{id:'d',topic_id:'video3'}];
 const stars=[{entry_id:'b',topic_id:'video1'},{entry_id:'c',topic_id:'video2'}];
 assert.deepEqual(helper.favoriteRows(catalog,stars).map(x=>x.id),['b']);
 catalog[1].deleted_at='2026-10-16';assert.deepEqual(helper.favoriteRows(catalog,stars).map(x=>x.id),['a']);
});

test('the four member collections remain separate even when they favorite the same video',()=>{
 const rows=[{id:'a',topic_id:'v1'},{id:'b',topic_id:'v2'}];
 const favorites=[{user_id:'one',entry_id:'a',topic_id:'v1'},{user_id:'two',entry_id:'b',topic_id:'v2'}];
 assert.deepEqual(helper.favoriteRows(rows,favorites,'one').map(x=>x.id),['a']);
 assert.deepEqual(helper.favoriteRows(rows,favorites,'two').map(x=>x.id),['b']);
 assert.deepEqual(helper.favoriteRows(rows,favorites,'three'),[]);
});

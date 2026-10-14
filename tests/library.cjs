// Run the real page script with a minimal DOM boundary and isolated browser storage.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const page = fs.readFileSync(require('node:path').join(__dirname, '../index.html'), 'utf8');
const code = [...page.matchAll(/<script(?: [^>]*)?>([\s\S]*?)<\/script>/g)].at(-1)[1];
class Element {
  constructor(tag) { this.tagName=tag.toUpperCase(); this.children=[]; this.value=''; this.textContent=''; this.classList={add(){},remove(){}}; }
  append(...nodes){this.children.push(...nodes)}
  replaceChildren(...nodes){this.children=nodes}
  setAttribute(name,value){this[name]=value}
  getAttribute(name){return this[name]}
  removeAttribute(name){delete this[name]}
  addEventListener(){}
  showModal(){this.open=true}
  close(){this.open=false}
  load(){}
  pause(){}
  remove(){}
  focus(){}
}
const fixture = ['a','b'].map(id=>({id,title:'选题 '+id,author:'作者',url:'https://example.com/'+id,month:'2026-10',platform:'web',platform_label:'网页',origins:['favorite'],source_names:['收藏'],kind:'媒体',captured_at:'2026-10-13',published_at:'2026-10-01',likes:10,status:'link',images:[],poster:id==='a'?'covers/a.jpg':null}));
function load(storage){
  const elements=Object.fromEntries([...page.matchAll(/\bid="([^"]+)"/g)].map(m=>[m[1],new Element(m[1])]));
  elements.catalog.textContent=JSON.stringify(fixture);
  for(const id of ['kind','media'])elements[id].value='all';
  elements.sort.value='captured';
  const document={body:new Element('body'),getElementById:id=>elements[id],createElement:t=>new Element(t),createTextNode:t=>t,addEventListener(){}};
  const context=vm.createContext({document,localStorage:storage,window:{location:{href:'http://localhost/site/',origin:'http://localhost'},addEventListener(){}},URL,Intl,console,setTimeout,clearTimeout,setInterval,clearInterval});
  vm.runInContext(code,context);
  return {elements,run:s=>vm.runInContext(s,context)};
}
const saved=new Map();
const storage={getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v)};
let p=load(storage);
assert.equal(p.elements.total.textContent,'2');
p.run('requestDelete(items[0])');
assert.equal(p.elements.total.textContent,'2','Requesting deletion must wait for confirmation');
p.elements['delete-confirm'].onclick();
assert.equal(p.elements.total.textContent,'1');
assert.equal(p.run('shareRows().length'),1,'Deleted rows must be excluded from exports');
p=load(storage);
assert.equal(p.elements.total.textContent,'1','Deletion must survive a refresh');
p.run("restoreItem('a')");
assert.equal(p.elements.total.textContent,'2');
p=load(storage);
assert.equal(p.elements.total.textContent,'2','Restoration must survive a refresh');
p.run('openCover(items[0])');
assert.equal(p.elements['cover-preview'].open,true);
assert.equal(p.elements['cover-image'].src,'covers/a.jpg');
assert.equal(p.elements['cover-source'].href,'https://example.com/a');
p.run('openCover(items[1])');
assert.equal(p.elements['cover-image'].hidden,true,'A missing cover must not show the previous image');
const denied=load({getItem:()=>null,setItem:()=>{throw Error('storage denied')}});
denied.run('requestDelete(items[0])');
denied.elements['delete-confirm'].onclick();
assert.equal(denied.elements.total.textContent,'2','A failed save must not silently remove a row');
assert.ok(denied.elements['library-feedback'].textContent.length);
console.log('PASS: delete confirmation, refresh persistence, export exclusion, restore, cover preview, storage failure');
const team=load({getItem:()=>null,setItem(){}});
team.run(`
 let chosenOwner='one',chosenWeek='2026-10-14',chosenDay='all';
 window.VideoCollectUI.bind({scope:x=>x.owner_id===chosenOwner,
 periodFilter:x=>x.week_start===chosenWeek&&(chosenDay==='all'||x.collected_on===chosenDay),
 groupKey:x=>x.collected_on,canEdit:x=>x.owner_id==='one',renderNavigation(){}});
 const base={...items[0],origins:['import'],poster:'covers/a.jpg'};
 window.VideoCollectUI.replaceCatalog([
 {...base,id:'entry1',owner_id:'one',week_start:'2026-10-14',collected_on:'2026-10-14'},
 {...base,id:'entry2',owner_id:'two',week_start:'2026-10-14',collected_on:'2026-10-14'},
 {...base,id:'entry3',owner_id:'one',week_start:'2026-10-21',collected_on:'2026-10-21'}]);
`);
assert.equal(team.elements.total.textContent,'1');
assert.equal(team.run('shareRows().length'),1,'Export must stay within the selected member and week');
team.run("chosenOwner='two';window.VideoCollectUI.refreshScope();openCover(items[1]);requestDelete(items[1]);");
assert.equal(team.elements['cover-file'].disabled,true,'Other members can preview but cannot replace a cover');
assert.equal(team.elements['delete-dialog'].open,false,'Other members cannot open a deletion confirmation');
team.run("chosenOwner='one';chosenWeek='2026-10-21';window.VideoCollectUI.refreshScope();");
assert.equal(team.elements.total.textContent,'1');
team.run("chosenDay='2026-10-22';window.VideoCollectUI.refreshScope();");
assert.equal(team.elements.total.textContent,'0','Specific-date navigation must filter actual collection dates');
console.log('PASS: member, weekly and daily scope, export scope, read-only covers and deletion');

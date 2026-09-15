const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'../public/js/main.js'),'utf8');
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function deferred(){let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};}
function room(version,currentPlayerId='captain',cash=30){return {code:'SYNC01',version,status:'playing',phase:'placement',currentPlayerId,players:[{id:'captain',nickname:'船长',cash}]};}
async function client(initial=room(10)){
  const reads=[],renders=[],calls=[],events={},timers=[],errors=[];
  const nodes=new Map();
  const node=id=>{if(!nodes.has(id))nodes.set(id,{value:id==='game-mode'?'manila':'',classList:{toggle(){}},addEventListener(){}});return nodes.get(id);};
  let handlers;
  const API={hasSession:()=>true,playerId:()=>'captain',nickname:()=>'船长',events:()=>({addEventListener:(name,fn)=>events[name]=fn,close(){}}),
    state:async()=>{assert.ok(reads.length,'测试必须提供每次状态读取');return reads.shift()();},
    action:async(action,payload,version)=>{calls.push({action,payload,version});return {success:true,room:room(version+1,'other')};},
    listRooms:async()=>({rooms:[]})};
  const UI={show(){},alertTurn(){},toast:message=>errors.push(message),renderLobby(){},renderGame:(r,me,h)=>{renders.push(r);handlers=h;}};
  const document={getElementById:node,querySelectorAll:()=>[]};
  const context={document,window:{MANILA_API:API,MANILA_UI:UI,EventSource:function(){}},setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout(){},setInterval(){},clearInterval(){},console};
  reads.push(()=>({room:initial}));
  vm.runInNewContext(source,context);await settle();
  return {API,reads,renders,calls,events,errors,get handlers(){return handlers;}};
}

test('较早的同步请求晚于行动完成返回，不得覆盖新回合',async()=>{
  const c=await client(),old=deferred();
  c.reads.push(()=>old.promise);c.events.change();
  await c.handlers.act('bid',{amount:1});
  assert.equal(c.renders.at(-1).version,11);
  old.resolve({room:room(10)});await settle();
  assert.equal(c.renders.at(-1).version,11);
  assert.equal(c.renders.at(-1).currentPlayerId,'other');
});
test('两次 SSE 同步乱序返回时只采用新请求，低版本也不能倒退',async()=>{
  const c=await client(),a=deferred(),b=deferred();
  c.reads.push(()=>a.promise,()=>b.promise);c.events.change();c.events.change();
  b.resolve({room:room(12,'other')});await settle();
  a.resolve({room:room(11)});await settle();
  assert.equal(c.renders.at(-1).version,12);
  c.reads.push(()=>({room:room(10)}));c.events.change();await settle();
  assert.equal(c.renders.at(-1).version,12);
});
test('港务长派遣先刷新回合与资金，再用最新版本提交，双击仅提交一次',async()=>{
  const c=await client(room(10,'other',0)),fresh=deferred();
  c.reads.push(()=>fresh.promise);
  const action=c.handlers.act('place',{location:'boat:ginseng'});
  await c.handlers.act('place',{location:'boat:ginseng'});
  assert.equal(c.calls.length,0,'刷新完成前不能拿旧状态提交');
  fresh.resolve({room:room(12,'captain',30)});await action;
  assert.equal(c.calls.length,1);
  assert.equal(c.calls[0].version,12);
  assert.equal(c.calls[0].payload.location,'boat:ginseng');
  assert.equal(c.renders.at(-1).version,13);
});
test('派遣刷新发现已解散或换房时，不把棋子投到其他房间',async()=>{
  for(const result of [{noRoom:true},{room:{...room(12),code:'OTHER1'}}]){
    const c=await client();c.reads.push(()=>result);
    await c.handlers.act('place',{location:'pirate'});
    assert.equal(c.calls.length,0);assert.equal(c.errors.length,1);
  }
});

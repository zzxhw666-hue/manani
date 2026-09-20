'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
const {WebSocket}=require('ws');
const {install}=require('../lib/duel');
const {fighter,reset,advanceFighter}=require('../public/js/duel-core');
const {Predictor}=require('../public/js/duel-netcode');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function setup(t){let handle;const server=http.createServer((req,res)=>handle(req,res,new URL(req.url,'http://localhost')));handle=install(server);await new Promise(r=>server.listen(0,'127.0.0.1',r));const sockets=[];t.after(async()=>{for(const s of sockets)s.terminate();await new Promise(r=>server.close(r));});const base=`http://127.0.0.1:${server.address().port}`;const post=async(a,b)=>{const r=await fetch(base+'/api/duel/'+a,{method:'POST',body:JSON.stringify(b)});return {status:r.status,...await r.json()};};
  async function connect(auth){const ws=new WebSocket(base.replace('http','ws')+'/api/duel/socket');sockets.push(ws);const messages=[];ws.on('message',raw=>messages.push(JSON.parse(raw)));await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j);});ws.send(JSON.stringify({type:'auth',...auth}));return {ws,messages,wait:async predicate=>{const until=Date.now()+3000;while(Date.now()<until){const m=messages.find(predicate);if(m)return m;await delay(8);}throw Error('WebSocket message timeout');}};}
  return {base,post,connect};
}
test('WebSocket 鉴权、输入序号、双客户端状态同步、重连和关闭通知',async t=>{
  const {post,connect}=await setup(t);const a=await post('create',{name:'甲'}),b=await post('join',{code:a.code,name:'乙'});
  const ca=await connect(a),cb=await connect(b);await ca.wait(m=>m.type==='welcome');await cb.wait(m=>m.type==='state');
  const bad=await connect({...a,token:'bad'});await bad.wait(m=>m.type==='error');
  ca.ws.send(JSON.stringify({type:'input',seq:5,input:{right:true},hp:999}));
  const snapshot=await ca.wait(m=>m.type==='state'&&m.state.ack[0]===5);
  assert.equal(snapshot.state.fighters[0].hp,100);assert.equal(snapshot.state.fighters[0].input.right,true);assert.ok(!JSON.stringify(snapshot).includes(a.token));
  ca.ws.send(JSON.stringify({type:'input',seq:4,input:{left:true}}));
  await post('ready',a);await post('ready',b);const match=await cb.wait(m=>m.type==='state'&&m.state.phase==='countdown');assert.equal(match.state.fighters.length,2);
  const reconnected=await connect(a);const welcome=await reconnected.wait(m=>m.type==='welcome');assert.equal(welcome.seq,5);
  reconnected.ws.send(JSON.stringify({type:'ping',at:123}));await reconnected.wait(m=>m.type==='pong'&&m.at===123);
  await post('leave',b);await reconnected.wait(m=>m.type==='closed');
});
test('拒绝跨域 WebSocket，训练支持满气重置与回房间',async t=>{
  const {base,post,connect}=await setup(t);
  const denied=await new Promise(resolve=>{const ws=new WebSocket(base.replace('http','ws')+'/api/duel/socket',{origin:'https://untrusted.example'});ws.on('unexpected-response',(_,res)=>{resolve(res.statusCode);res.resume();ws.terminate();});ws.on('error',()=>{});});assert.equal(denied,403);
  const a=await post('create',{});assert.equal((await post('reset-training',a)).status,400);await post('add-dummy',a);const client=await connect(a);await client.wait(m=>m.type==='welcome');await post('reset-training',a);const v=await client.wait(m=>m.type==='state'&&m.state.phase==='fight');assert.equal(v.state.training,true);assert.equal(v.state.fighters[0].energy,100);assert.equal((await post('lobby',a)).status,400);
});
function snapshot(){const room={players:[{lastSeen:Date.now(),type:'stick'},{lastSeen:Date.now(),type:'cross'}]};reset(room);room.phase='fight';room.countdown=0;room.ack=[0,0];return room;}
test('120ms 往返延迟下，本机按键在下一模拟帧响应，伤害仍以服务器为准',()=>{
  const p=new Predictor(),state=snapshot();p.receive(state,0);p.input(1,{right:true,light:true},0);
  const render=p.render(34,0,120);assert.ok(render.fighters[0].attack);assert.equal(render.fighters[1].hp,100);assert.equal(state.fighters[0].attack,null);
  const move=new Predictor();move.receive(snapshot(),0);move.input(1,{right:true},0);assert.ok(move.render(34,0,120).fighters[0].x>370);
  const authoritative=snapshot();authoritative.fighters[0].hp=80;authoritative.fighters[0].down='air';authoritative.fighters[0].stun=.5;authoritative.ack=[1,0];p.receive(authoritative,120);const corrected=p.render(121,0,120);assert.equal(corrected.fighters[0].hp,80);assert.equal(corrected.fighters[0].attack,null);
});
test('预测重放与共享模拟一致、断线停止预测、换局清空输入',()=>{
  const state=snapshot(),p=new Predictor();p.receive(state,0);p.input(1,{right:true},0);const predicted=p.render(100,0,0);
  const expected=fighter('stick',0);expected.input={right:true};for(let i=0;i<5;i++)advanceFighter(expected,fighter('cross',1),{effects:[],effectSerial:0});
  assert.ok(Math.abs(predicted.fighters[0].x-expected.x)<5);
  assert.equal(p.render(2000,0,0).fighters[0].x,370);reset(state);state.phase='fight';state.ack=[1,0];p.receive(state,2100);assert.equal(p.inputs.length,0);
});
test('真实 WebSocket 注入单程 60ms 延迟：本机先响应、服务器确认、松键后停止',async t=>{
  const {post,connect}=await setup(t),auth=await post('create',{});
  await post('add-dummy',auth);const client=await connect(auth);await client.wait(m=>m.type==='welcome');
  await post('reset-training',auth);const initial=(await client.wait(m=>m.type==='state'&&m.state.phase==='fight')).state;
  const predictor=new Predictor();predictor.receive(initial,0);predictor.input(1,{right:true},0);
  const outgoing=delay(60).then(()=>client.ws.send(JSON.stringify({type:'input',seq:1,input:{right:true}})));
  assert.ok(predictor.render(34,0,120).fighters[0].x>initial.fighters[0].x);
  assert.ok(!client.messages.some(m=>m.type==='state'&&m.state.ack[0]===1));
  await outgoing;const confirmed=(await client.wait(m=>m.type==='state'&&m.state.ack[0]===1&&m.state.fighters[0].x>370)).state;
  await delay(60);predictor.receive(confirmed,120);assert.equal(predictor.render(121,0,120).fighters[0].hp,100);
  client.ws.send(JSON.stringify({type:'input',seq:2,input:{}}));
  const stopped=(await client.wait(m=>m.type==='state'&&m.state.ack[0]===2)).state;
  await delay(100);const latest=client.messages.filter(m=>m.type==='state').at(-1).state;
  assert.equal(latest.fighters[0].x,stopped.fighters[0].x);assert.equal(latest.fighters[0].input.right,false);
});
test('WebSocket 同步四段普攻、飞行手里剑与锁定落点',async t=>{
 const {post,connect}=await setup(t),auth=await post('create',{});await post('add-dummy',auth);
 const client=await connect(auth);await client.wait(m=>m.type==='welcome');await post('reset-training',auth);
 await client.wait(m=>m.type==='state'&&m.state.phase==='fight');let seq=0;
 const press=()=>{for(const input of [{},{light:true}])client.ws.send(JSON.stringify({type:'input',seq:++seq,input}));};
 press();for(const stage of [1,2,3]){await client.wait(m=>m.type==='state'&&m.state.fighters[0].attack?.chain===stage);press();}
 const projectile=(await client.wait(m=>m.type==='state'&&!!m.state.fighters[0].projectile)).state.fighters[0];assert.ok(projectile.mark);assert.equal(projectile.projectile.damage,7);
 const dive=(await client.wait(m=>m.type==='state'&&m.state.fighters[0].attack?.chain===4)).state.fighters[0];assert.equal(dive.attack.targetX,projectile.mark.x);assert.equal(dive.attack.motion,'dive');
 await post('leave',auth);
});

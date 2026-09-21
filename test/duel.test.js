'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
const {reset,step,startAttack,install}=require('../lib/duel');
function room(){const r={players:[{type:'stick',lastSeen:Date.now()},{type:'cross',lastSeen:Date.now()}]};reset(r);r.countdown=0;r.phase='fight';r.fighters[0].x=500;r.fighters[1].x=560;return r;}
function advance(r,n=20){for(let i=0;i<n;i++)step(r);}
test('命中、格挡、消耗和攻击距离由服务端判定',()=>{let r=room();startAttack(r.fighters[0],'light');advance(r);assert.equal(r.fighters[1].hp,98);r=room();r.fighters[1].input={block:true};startAttack(r.fighters[0],'light');advance(r);assert.equal(r.fighters[1].hp,99);r=room();startAttack(r.fighters[0],'ultimate');assert.equal(r.fighters[0].attack,null);r.fighters[0].energy=100;startAttack(r.fighters[0],'ultimate');assert.equal(r.fighters[0].energy,0);advance(r,180);assert.equal(r.fighters[1].hp,42);r=room();r.fighters[1].x=1000;startAttack(r.fighters[0],'light');advance(r);assert.equal(r.fighters[1].hp,100);});
test('掉线暂停、时间胜负和再战重置',()=>{const r=room();r.players[1].lastSeen=0;advance(r);assert.equal(r.paused,true);assert.equal(r.time,99);r.players[1].lastSeen=Date.now();r.time=.01;r.fighters[1].hp=90;step(r);assert.equal(r.winner,0);assert.equal(r.phase,'over');reset(r);assert.equal(r.fighters[1].hp,100);assert.equal(r.countdown,3);});
test('两个独立客户端建房、加入、鉴权、同步输入和准备再战',async t=>{let handle;const server=http.createServer((req,res)=>handle(req,res,new URL(req.url,'http://localhost')));handle=install(server);await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));const base=`http://127.0.0.1:${server.address().port}/api/duel/`;const post=async(a,b)=>{const r=await fetch(base+a,{method:'POST',body:JSON.stringify(b)});return {status:r.status,data:await r.json()};};const a=(await post('create',{type:'stick',name:'甲'})).data,b=(await post('join',{code:a.code,name:'乙'})).data;assert.equal(b.index,1);assert.equal((await post('join',{code:a.code})).status,400);assert.equal((await post('input',{...a,token:'fake'})).status,400);assert.equal((await post('ready',a)).status,200);assert.equal((await post('ready',b)).status,200);const abort=new AbortController();const stream=await fetch(base+'events?'+new URLSearchParams(a),{signal:abort.signal});const reader=stream.body.getReader();const chunk=await reader.read();const view=JSON.parse(new TextDecoder().decode(chunk.value).split('data: ')[1].trim());assert.equal(view.phase,'countdown');assert.equal(view.players.length,2);assert.ok(!JSON.stringify(view).includes(a.token));abort.abort();await post('input',{...a,input:{right:true},hp:999});await post('leave',a);assert.equal((await post('ping',b)).status,400);});
test('假人不需要心跳、不主动行动，正常受击；真人掉线仍暂停',()=>{
  const r=room();r.players[1]={type:'cross',dummy:true,ready:true};r.fighters[1].x=570;
  const x=r.fighters[1].x;advance(r,60);
  assert.equal(r.paused,false);assert.equal(r.fighters[1].x,x);assert.equal(r.fighters[0].hp,100);assert.equal(r.fighters[1].attack,null);
  startAttack(r.fighters[0],'light');advance(r);assert.equal(r.fighters[1].hp,98);assert.ok(r.fighters[1].x>x);
  r.time=.001;advance(r);assert.equal(r.phase,'fight');r.fighters[1].hp=0;advance(r);assert.equal(r.phase,'over');assert.equal(r.players[1].ready,true);assert.equal(r.players[0].ready,false);
  reset(r);assert.equal(r.fighters[1].hp,100);r.players[0].lastSeen=0;step(r);assert.equal(r.paused,true);
});
test('房主添加移除假人、独自开战，拒绝满房与非房主操作和假人凭证',async t=>{
  let handle;const server=http.createServer((req,res)=>handle(req,res,new URL(req.url,'http://localhost')));handle=install(server);await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
  const base=`http://127.0.0.1:${server.address().port}/api/duel/`;
  const post=async(a,b)=>{const r=await fetch(base+a,{method:'POST',body:JSON.stringify(b)});return {status:r.status,data:await r.json()};};
  const snapshot=async auth=>{const abort=new AbortController();try{const r=await fetch(base+'events?'+new URLSearchParams(auth),{signal:abort.signal});const {value}=await r.body.getReader().read();return JSON.parse(new TextDecoder().decode(value).split('data: ')[1].split('\n\n')[0]);}finally{abort.abort();}};
  const a=(await post('create',{type:'cross'})).data;
  assert.equal((await post('add-dummy',a)).status,200);let v=await snapshot(a);assert.equal(v.players[1].dummy,true);assert.equal(v.players[1].type,'stick');assert.equal(v.players[1].ready,true);
  assert.equal((await post('input',{code:a.code,input:{right:true}})).status,400);
  assert.equal((await post('add-dummy',a)).status,400);assert.equal((await post('join',{code:a.code})).status,400);
  assert.equal((await post('remove-dummy',a)).status,200);assert.equal((await snapshot(a)).players.length,1);
  const b=(await post('join',{code:a.code})).data;assert.equal((await post('remove-dummy',b)).status,400);assert.equal((await post('add-dummy',a)).status,400);await post('leave',a);
  const c=(await post('create',{})).data;await post('add-dummy',c);await post('ready',c);v=await snapshot(c);assert.equal(v.phase,'countdown');assert.equal((await post('remove-dummy',c)).status,400);await post('leave',c);
});
test('重击浮空后落地倒下，倒地期间不能出招，起身后恢复并短暂无敌',()=>{
  const r=room(), attacker=r.fighters[0], victim=r.fighters[1];
  attacker.energy=100;startAttack(attacker,'special');advance(r,22);
  assert.equal(victim.down,'air');assert.ok(victim.y>0);assert.equal(victim.hp,78);
  for(let n=0;n<120&&victim.down!=='floor';n++)step(r);
  assert.equal(victim.down,'floor');assert.equal(victim.y,0);
  victim.energy=100;startAttack(victim,'ultimate');assert.equal(victim.attack,null);assert.equal(victim.energy,100);
  const hp=victim.hp;attacker.x=victim.x-40;attacker.attack=null;startAttack(attacker,'light');advance(r,12);assert.equal(victim.hp,hp);
  for(let n=0;n<100&&victim.down;n++)step(r);
  assert.equal(victim.down,null);assert.ok(victim.wakeInv>0);startAttack(victim,'light');assert.ok(victim.attack);
});
test('KO 后仍模拟落地，败者保持倒下，重开恢复站姿',()=>{
  const r=room();r.fighters[1].hp=1;startAttack(r.fighters[0],'light');advance(r,10);
  assert.equal(r.phase,'over');advance(r,120);
  assert.equal(r.fighters[1].y,0);assert.equal(r.fighters[1].down,'floor');assert.equal(r.fighters[1].action,'ko');
  reset(r);assert.equal(r.fighters[1].down,null);assert.equal(r.fighters[1].hp,100);
});
test('移动关节姿势连续，技能出招姿势不同于待机且正常收招',()=>{
  const {pose}=require('../public/js/duel-renderer');
  const base={type:'stick',action:'idle',y:0};const idle=pose(base,0);
  for(const key of ['light','skill','special','ultimate']){
    const f={...base,attack:{key,duration:.8,active:.2,age:.3}};
    const a=pose(f,0);assert.ok(a.flat().every(Number.isFinite));assert.notDeepEqual(a,idle);
    const next=pose({...f,attack:{...f.attack,age:.301}},0);
    assert.ok(a.flat().every((v,i)=>Math.abs(v-next.flat()[i])<2));
    assert.deepEqual(pose({...f,attack:{...f.attack,age:.8}},0),idle);
  }
  assert.notDeepEqual(pose({...base,down:'floor'},0),idle);
});

test('贴身冲刺时两个角色保持身体间距',()=>{const r=room();r.fighters[0].energy=100;startAttack(r.fighters[0],'skill');advance(r,24);assert.ok(Math.abs(r.fighters[0].x-r.fighters[1].x)>=65);});

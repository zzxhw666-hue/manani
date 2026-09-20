'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {reset,step,startAttack,advanceFighter,LIGHTS}=require('../public/js/duel-core');
const {Predictor}=require('../public/js/duel-netcode');
const {pose}=require('../public/js/duel-renderer');
function room(type='stick',x=500,enemyX=570){const r={players:[{type,dummy:true},{type:type==='stick'?'cross':'stick',dummy:true}]};reset(r);r.phase='fight';r.countdown=0;r.ack=[0,0];r.fighters[0].x=x;r.fighters[1].x=enemyX;return r;}
function ticks(r,n){for(let i=0;i<n;i++)step(r);}
function chain(r){
 const f=r.fighters[0],stages=[],trace=[];let queued=0;
 for(let i=0;i<240;i++){
  f.input={};
  if(i===0||(f.attack?.chain<4&&f.attack.age>.09&&queued!==f.attack.id)){f.input={light:true};queued=f.attack?.id||0;}
  step(r);if(f.attack&&!stages.includes(f.attack.chain))stages.push(f.attack.chain);
  trace.push(JSON.parse(JSON.stringify({f,enemy:r.fighters[1]})));
 }
 return {stages,trace};
}
for(const type of ['stick','cross'])test(`${type} 四次预输入依次衔接四段，每段只伤害一次，终结击倒`,()=>{
 const r=room(type),{stages,trace}=chain(r),expected=LIGHTS[type].reduce((s,a)=>s+a.damage,0);
 assert.deepEqual(stages,[1,2,3,4]);assert.equal(r.fighters[0].attackSerial,4);assert.equal(r.fighters[1].hp,100-expected);
 const losses=trace.filter((v,i)=>i&&v.enemy.hp<trace[i-1].enemy.hp);assert.equal(losses.length,4);
 assert.ok(trace.some(v=>v.f.attack?.chain===4&&v.enemy.down==='air'));
 assert.ok(trace.some(v=>v.enemy.down==='floor'));assert.equal(r.fighters[0].y,0);
});
test('疾进空挥前进 132 单位；第三段向背后跃起、退 128 单位并只发一枚手里剑',()=>{
 const r=room('stick',400,1100),f=r.fighters[0],enemy=r.fighters[1];f.chain=1;f.chainTime=1;startAttack(f,'light',enemy);
 ticks(r,35);assert.ok(Math.abs(f.x-532)<.01);
 startAttack(f,'light',enemy);let peak=0,hadProjectile=false;const origin=f.x;
 for(let i=0;i<55;i++){step(r);peak=Math.max(peak,f.y);hadProjectile ||= !!f.projectile;}
 assert.ok(peak>=130);assert.ok(Math.abs(f.x-(origin-128))<.01);assert.equal(f.y,0);assert.ok(hadProjectile);assert.ok(f.mark);assert.equal(enemy.hp,100);
});
test('第四段锁定手里剑实际落点，敌人移动不会令落点跟踪；下砸空挥也产生震地特效',()=>{
 const r=room('stick',400,1100),f=r.fighters[0],enemy=r.fighters[1];f.chain=2;f.chainTime=1;startAttack(f,'light',enemy);ticks(r,51);
 const target=f.mark.x;enemy.x=100;startAttack(f,'light',enemy);assert.equal(f.attack.chain,4);assert.equal(f.attack.targetX,target);
 let peak=0,slam=false;for(let i=0;i<65;i++){step(r);peak=Math.max(peak,f.y);slam ||= r.effects.some(e=>e.kind==='slam');}
 assert.ok(peak>=210);assert.ok(Math.abs(f.x-target)<.01);assert.equal(f.y,0);assert.equal(enemy.hp,100);assert.ok(slam);
});
test('长按只出一段、快速重复输入最多缓存下一段，停顿超时与技能会重置段数',()=>{
 let r=room('stick',300,1100),f=r.fighters[0];f.input={light:true};ticks(r,100);assert.equal(f.attackSerial,1);
 r=room('stick',300,1100);f=r.fighters[0];f.input={light:true};step(r);f.input={};step(r);f.input={light:true};ticks(r,120);assert.equal(f.attackSerial,2);assert.equal(f.attack,null);
 f.input={};step(r);f.input={light:true};step(r);assert.equal(f.attack.chain,1);
 f.attack=null;f.cooldown=0;f.energy=100;startAttack(f,'skill');assert.equal(f.chain,0);assert.equal(f.mark,null);
});
test('普攻受击会取消排队与段数，不会继续执行下砸',()=>{
 const r=room(),[f,e]=r.fighters;f.chain=2;f.chainTime=1;startAttack(f,'light',e);f.attack.queued=true;e.face=-1;startAttack(e,'light',f);e.attack.age=e.attack.active;step(r);
 assert.ok(f.hp<100);assert.equal(f.chain,0);assert.equal(f.attack,null);assert.equal(f.bufferTime,0);
});
test('两边墙角、左右朝向的全套位移保持边界和有限数值',()=>{
 for(const type of ['stick','cross'])for(const [x,enemyX]of [[65,130],[1135,1060]]){
  const r=room(type,x,enemyX),{stages,trace}=chain(r);assert.deepEqual(stages,[1,2,3,4]);
  for(const {f,enemy}of trace)for(const fighter of [f,enemy]){assert.ok(Number.isFinite(fighter.x)&&Number.isFinite(fighter.y));assert.ok(fighter.x>=60&&fighter.x<=1140);assert.ok(fighter.y>=0);}
 }
});
test('飞行手里剑参与本机预测但不会修改原始快照或预测敌方掉血',()=>{
 const state=room('stick',400,1000),f=state.fighters[0];f.chain=2;f.chainTime=1;startAttack(f,'light',state.fighters[1]);ticks(state,15);assert.ok(f.projectile);
 const before=JSON.stringify(state),p=new Predictor();p.receive(state,0);const render=p.render(60,0,120);
 assert.equal(JSON.stringify(state),before);assert.equal(render.fighters[1].hp,100);assert.notEqual(render.fighters[0].x,f.x);
 const expected=JSON.parse(JSON.stringify(f));for(let i=0;i<7;i++)advanceFighter(expected,state.fighters[1],{effects:[],effectSerial:0});
 assert.ok(Math.abs(render.fighters[0].x-expected.x)<5);
});
test('火柴人四段动作骨架各不相同且关键帧连续',()=>{
 const poses=LIGHTS.stick.map((a,i)=>pose({type:'stick',action:'light',y:0,attack:{...a,key:'light',chain:i+1,age:a.active+.035}},0));
 assert.equal(new Set(poses.map(p=>JSON.stringify(p))).size,4);
 for(const [i,a]of LIGHTS.stick.entries()){
  const f={type:'stick',action:'light',y:0,attack:{...a,key:'light',chain:i+1,age:a.active+.035}};
  const next=pose({...f,attack:{...f.attack,age:f.attack.age+.001}},0);
  assert.ok(poses[i].flat().every((v,j)=>Number.isFinite(v)&&Math.abs(v-next.flat()[j])<3));
 }
});

test('四段普攻及手里剑均可格挡，格挡终结段不会倒地',()=>{
 for(const type of ['stick','cross']){const r=room(type);r.fighters[1].input={block:true};const {trace}=chain(r);
 const chip=LIGHTS[type].reduce((s,a)=>s+Math.ceil(a.damage*.15),0);assert.equal(r.fighters[1].hp,100-chip);assert.ok(trace.every(v=>!v.enemy.down));}
});

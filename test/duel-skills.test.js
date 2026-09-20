'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {reset,step,startAttack,LIGHTS,SKILLS,hasLightArmor}=require('../public/js/duel-core');
const {Predictor}=require('../public/js/duel-netcode');
function room(type='stick'){const r={players:[{type,dummy:true},{type:type==='stick'?'cross':'stick',dummy:true}]};reset(r);r.countdown=0;r.phase='fight';r.ack=[0,0];r.fighters[0].x=500;r.fighters[1].x=570;return r;}
function ticks(r,n){for(let i=0;i<n;i++)step(r);}
test('普攻全套降低约三分之二，六种技能颜色与动作标识独立',()=>{
 assert.equal(LIGHTS.stick.reduce((s,a)=>s+a.damage,0),12);assert.equal(LIGHTS.cross.reduce((s,a)=>s+a.damage,0),14);
 const all=Object.values(SKILLS).flatMap(Object.values);assert.equal(new Set(all.map(a=>a.color)).size,6);assert.equal(new Set(all.map(a=>a.motion)).size,6);
});
test('受击僵直禁止技能和普攻，期间输入不缓存为恢复后的自动出招',()=>{
 const r=room(),f=r.fighters[0];f.stun=.6;f.energy=100;
 for(const key of ['light','skill','special','ultimate']){startAttack(f,key);assert.equal(f.attack,null);assert.equal(f.energy,100);}
 f.stun=.08;f.input={ultimate:true};ticks(r,20);assert.equal(f.attack,null);assert.equal(f.bufferTime,0);assert.equal(f.energy,100);
 f.input={};step(r);f.input={ultimate:true};step(r);assert.equal(f.attack.key,'ultimate');
});
for(const type of ['stick','cross'])for(const key of ['skill','special','ultimate'])test(`${type} ${key} 施放抵抗普攻终结击倒，但正常扣血`,()=>{
 const r=room(type==='stick'?'cross':'stick'),[f,e]=r.fighters;e.energy=100;startAttack(e,key,f);const id=e.attack.id;
 f.chain=3;f.chainTime=1;startAttack(f,'light',e);f.attack.age=f.attack.active;step(r);
 assert.equal(e.hp,95);assert.equal(e.attack.id,id);assert.equal(e.stun,0);assert.equal(e.knockVx,0);assert.equal(e.down,null);assert.ok(hasLightArmor(e));assert.ok(r.effects.some(e=>e.armored));
});
test('技能霸体也抵抗飞行手里剑，受到技能攻击时正常中断；KO 不受霸体保护',()=>{
 let r=room(),[f,e]=r.fighters;e.energy=100;startAttack(e,'ultimate',f);
 f.projectile={key:'light',chain:3,face:1,x:550,y:55,fromX:550,fromY:55,targetX:600,age:0,duration:.4,damage:3,knock:6,stun:.9};step(r);
 assert.equal(e.hp,97);assert.equal(e.attack.key,'ultimate');assert.equal(e.stun,0);
 f.energy=100;startAttack(f,'skill',e);f.attack.age=f.attack.strikes[0].at;step(r);assert.equal(e.attack,null);assert.ok(e.stun>0);assert.equal(e.action,'hit');
 r=room();[f,e]=r.fighters;e.hp=1;e.energy=100;startAttack(e,'ultimate',f);startAttack(f,'light',e);f.attack.age=f.attack.active;step(r);
 assert.equal(e.hp,0);assert.equal(r.phase,'over');assert.equal(e.attack,null);assert.equal(e.down,'air');
});
test('霸体收招后消失，普通站立被普攻命中正常僵直',()=>{
 const r=room(),[f,e]=r.fighters;e.energy=100;startAttack(e,'special',f);e.attack.age=e.attack.duration-.005;
 e.attack.nextStrike=e.attack.strikes.length;startAttack(f,'light',e);f.attack.age=f.attack.active;step(r);
 assert.equal(e.attack,null);assert.ok(e.stun>0);assert.equal(e.action,'hit');assert.ok(!hasLightArmor(e));
});
test('技能分段判定：两次青岚踢、一次挑斩、熔岩冲钻、依次出现的晶棘',()=>{
 const expected={stick:{skill:18,special:22},cross:{skill:20,special:20}};
 for(const type of ['stick','cross'])for(const key of ['skill','special']){
  const r=room(type),[f,e]=r.fighters;f.energy=100;startAttack(f,key,e);const losses=[];let peak=0;
  for(let i=0;i<140;i++){const hp=e.hp;step(r);peak=Math.max(peak,f.y);if(e.hp<hp)losses.push(hp-e.hp);}
  assert.equal(100-e.hp,expected[type][key]);if(type==='stick'&&key==='skill')assert.deepEqual(losses,[9,9]);
  if(type==='stick'&&key==='special'){assert.ok(peak>150);assert.equal(f.y,0);}
 }
});
test('两种大招可破防且总伤害分别为 58 / 62，前摇结束前不造成伤害',()=>{
 for(const type of ['stick','cross']){const r=room(type),[f,e]=r.fighters;f.energy=100;e.input={block:true};startAttack(f,'ultimate',e);
 ticks(r,30);assert.equal(e.hp,100);let strikes=0;for(let i=0;i<180;i++){const hp=e.hp;step(r);if(e.hp<hp)strikes++;}
 assert.equal(e.hp,type==='stick'?42:38);assert.equal(strikes,type==='stick'?4:1);assert.equal(f.y,0);assert.ok(f.energy<15);
 }
});
test('大招锁定施放时落点，目标可离开范围躲避；晶棘可从高处跳过',()=>{
 for(const type of ['stick','cross']){const r=room(type),[f,e]=r.fighters;f.energy=100;startAttack(f,'ultimate',e);const target=f.attack.targetX;e.x=1100;
 ticks(r,200);assert.equal(e.hp,100);assert.ok(Math.abs(f.x-target)<1);}
 const r=room('cross'),[f,e]=r.fighters;f.energy=100;startAttack(f,'special',e);
 for(let i=0;i<85;i++){e.y=280;e.vy=0;step(r);}assert.equal(e.hp,100);
});
test('技能输入预测不修改服务器快照，僵直快照禁止预测偷放技能',()=>{
 const state=room(),f=state.fighters[0];f.energy=100;f.stun=.5;const p=new Predictor();p.receive(state,0);p.input(1,{ultimate:true},0);
 const before=JSON.stringify(state),render=p.render(60,0,120);assert.equal(render.fighters[0].attack,null);assert.equal(JSON.stringify(state),before);
 f.stun=0;state.ack=[1,0];f.input={ultimate:true};f.previous={ultimate:true};p.receive(state,140);p.input(2,{},141);p.input(3,{special:true},160);const cast=p.render(210,0,80);
 assert.equal(cast.fighters[0].attack.motion,'thunder');assert.equal(f.attack,null);
});
test('六种技能在左右墙角均能正常落地收招，不产生越界或无效数值',()=>{
 for(const type of ['stick','cross'])for(const key of ['skill','special','ultimate'])for(const right of [false,true]){
  const r=room(type),[f,e]=r.fighters;f.x=right?1135:65;e.x=right?1060:135;f.face=right?-1:1;f.energy=100;startAttack(f,key,e);
  for(let i=0;i<220;i++){step(r);for(const actor of [f,e]){assert.ok(Number.isFinite(actor.x)&&Number.isFinite(actor.y));assert.ok(actor.x>=60&&actor.x<=1140);assert.ok(actor.y>=0);}}
  assert.equal(f.attack,null);assert.equal(f.y,0);
 }
});
test('大招预测推进独立的攻击时间线，不能修改权威命中次数',()=>{
 const state=room(),f=state.fighters[0];f.energy=100;startAttack(f,'ultimate',state.fighters[1]);ticks(state,43);
 const p=new Predictor(),before=JSON.stringify(state);p.receive(state,0);const render=p.render(100,0,120);
 assert.ok(render.fighters[0].attack.nextStrike>f.attack.nextStrike);assert.equal(JSON.stringify(state),before);assert.equal(render.fighters[1].hp,100);
});

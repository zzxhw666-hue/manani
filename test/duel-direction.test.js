'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const core=require('../public/js/duel-core');
const {Predictor}=require('../public/js/duel-netcode');
function room(type='stick',distance=70){const r={players:[{type,dummy:true},{type:'cross',dummy:true}]};core.reset(r);r.countdown=0;r.phase='fight';r.ack=[0,0];r.fighters[0].x=500;r.fighters[1].x=500+distance;return r;}
function tick(r,n=1){for(let i=0;i<n;i++)core.step(r);}
for(const type of ['stick','cross'])test(type+' 四段均可左右选向，出招后锁定方向',()=>{
 for(let chain=1;chain<=4;chain++)for(const dir of [-1,1]){
  const r=room(type,400),[f,e]=r.fighters;f.face=-dir;f.chain=chain-1;f.chainTime=2;f.input=dir<0?{left:true}:{right:true};f.mark={x:900,life:90};core.startAttack(f,'light',e);
  assert.equal(f.attack.face,dir);assert.equal(f.attack.chain,chain);const origin=f.x;
  f.input=dir<0?{right:true}:{left:true};tick(r,12);assert.equal(f.attack.face,dir);
  if(chain===2)assert.ok((f.x-origin)*dir>0);
  if(type==='stick'&&chain===3){assert.ok((f.x-origin)*dir<0);assert.equal(f.projectile.face,dir);assert.ok((f.projectile.targetX-origin)*dir>0);}
  if(type==='stick'&&chain===4)assert.equal(f.attack.targetX,origin+dir*180);
 }
});
test('缓存下一段在起手时读取方向，反向攻击不会击中背后敌人',()=>{
 const r=room(),[f,e]=r.fighters;f.input={light:true};tick(r);f.input={};tick(r);f.input={light:true,left:true};tick(r);
 while(f.attack.chain===1)tick(r);assert.equal(f.attack.chain,2);assert.equal(f.attack.face,-1);const hp=e.hp;tick(r,25);assert.equal(e.hp,hp);
});
test('普攻命中可接 U/I，空挥、格挡与技能霸体不开放取消',()=>{
 for(const key of ['skill','special']){const r=room(),f=r.fighters[0];f.energy=100;core.startAttack(f,'light',r.fighters[1]);tick(r,8);assert.ok(f.confirmTime>0);f.input={[key]:true};r.hitstop=0;tick(r);assert.equal(f.attack.key,key);assert.equal(f.chain,0);assert.ok(r.effects.some(e=>e.kind==='cancel'));}
 for(const mode of ['whiff','block','armor']){const r=room('stick',mode==='whiff'?400:70),[f,e]=r.fighters;f.energy=e.energy=100;if(mode==='block')e.input={block:true};if(mode==='armor')core.startAttack(e,'ultimate',f);core.startAttack(f,'light',e);tick(r,8);f.input={skill:true};r.hitstop=0;tick(r);assert.equal(f.attack.key,'light');assert.equal(f.confirmTime,0);}
});
test('命中技能取消接奥义消耗气且缩短蓄力，气不足不取消原招',()=>{
 for(const energy of [100,50]){const r=room(),[f,e]=r.fighters;f.energy=100;core.startAttack(f,'skill',e);tick(r,18);assert.ok(f.confirmTime>0);f.energy=energy;f.input={ultimate:true};r.hitstop=0;tick(r);
  assert.equal(f.attack.key,energy===100?'ultimate':'skill');if(energy===100){assert.ok(f.attack.age>.35);assert.ok(f.energy<1);}
 }
});
test('连续第八次命中触发落地保护，追击不能再次伤害，起身保护可走动并由主动出招结束',()=>{
 const r=room(),[f,e]=r.fighters;
 for(let i=0;i<8;i++){f.x=500;e.x=570;e.knockVx=0;r.hitstop=0;f.attack=null;f.chain=0;f.chainTime=0;core.startAttack(f,'light',e);f.attack.age=f.attack.active;tick(r);}
 assert.equal(f.combo,8);assert.equal(f.comboDamage,16);assert.equal(e.hp,84);assert.equal(e.juggleProtected,true);assert.equal(core.canHit(e),false);
 const hp=e.hp;f.attack=null;f.chain=0;core.startAttack(f,'light',e);f.attack.age=f.attack.active;r.hitstop=0;tick(r);assert.equal(e.hp,hp);
 f.input={};let phases=new Set();for(let i=0;i<150&&!(e.wakeInv>0);i++){tick(r);phases.add(e.down);}
 assert.ok(phases.has('floor')&&phases.has('rise'));assert.ok(e.wakeInv>=.5);assert.equal(e.juggleProtected,false);assert.equal(core.canHit(e),false);
 e.input={right:true};const x=e.x;tick(r,3);assert.ok(e.x>x);e.input={light:true};tick(r);assert.equal(e.wakeInv,0);assert.equal(e.attack.key,'light');
});
test('脱离僵直后重新命中连击从一开始，防御伤害不计入连击',()=>{
 const r=room(),[f,e]=r.fighters;core.startAttack(f,'light',e);tick(r,8);assert.equal(f.combo,1);e.stun=0;f.attack=null;f.chainTime=0;r.hitstop=0;core.startAttack(f,'light',e);f.attack.age=f.attack.active;tick(r);assert.equal(f.combo,1);assert.equal(f.comboDamage,2);
 const blocked=room();blocked.fighters[1].input={block:true};core.startAttack(blocked.fighters[0],'light',blocked.fighters[1]);tick(blocked,10);assert.equal(blocked.fighters[0].combo,0);
});
test('预测保持方向与保护计时，不能提前判定命中取消或修改服务端状态',()=>{
 const r=room('stick',400),f=r.fighters[0];f.wakeInv=.55;const p=new Predictor();p.receive(r,0);p.input(1,{left:true,light:true},10);const before=JSON.stringify(r),render=p.render(70,0,40);assert.equal(render.fighters[0].attack.face,-1);assert.equal(render.fighters[0].wakeInv,0);assert.equal(render.fighters[0].confirmTime,0);assert.equal(JSON.stringify(r),before);
});
test('满气起手的小技能命中后可实际衔接奥义，抵扣本次小技能消耗',()=>{
 for(const type of ['stick','cross'])for(const key of ['skill','special']){
  const r=room(type),[f,e]=r.fighters;f.energy=100;core.startAttack(f,key,e);
  for(let i=0;i<90&&!f.confirmTime;i++)tick(r);
  assert.ok(f.confirmTime>0);assert.ok(f.energy<100);f.input={ultimate:true};r.hitstop=0;tick(r);
  assert.equal(f.attack.key,'ultimate');assert.ok(f.energy<1);
 }
});

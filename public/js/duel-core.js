'use strict';
(function(root){
const DT = 1 / 60;
const TYPES = {
  stick: { name: '火柴人', speed: 290, light: 6, reach: 78 },
  cross: { name: '叉叉怪', speed: 235, light: 9, reach: 86 },
};
// Each press advances one authored move; only one follow-up can be queued.
const LIGHTS = {
  stick: [
    {name:'推掌',duration:.38,active:.10,linkAt:.27,reach:88,damage:6,knock:14,stun:.44},
    {name:'疾进',duration:.50,active:.23,linkAt:.38,reach:100,damage:8,knock:12,stun:.65,motion:'rush',distance:132},
    {name:'退影镖',duration:.84,active:.18,linkAt:.69,reach:0,damage:7,knock:6,stun:.90,motion:'retreat',distance:128},
    {name:'落星坠',duration:.96,active:.62,reach:115,damage:14,knock:85,stun:.55,motion:'dive',launch:true},
  ],
  cross: [
    {name:'磐石推',duration:.44,active:.14,linkAt:.32,reach:94,damage:9,knock:16,stun:.46},
    {name:'团身碾',duration:.58,active:.25,linkAt:.44,reach:105,damage:8,knock:10,stun:.70,motion:'roll',distance:132},
    {name:'弹山锤',duration:.72,active:.44,linkAt:.59,reach:115,damage:9,knock:8,stun:.70,motion:'bounce',distance:52},
    {name:'十字崩',duration:.88,active:.47,reach:165,damage:15,knock:100,stun:.60,motion:'quake',launch:true},
  ],
};
const clampX=x=>Math.max(60,Math.min(1140,x));
const unit=t=>Math.max(0,Math.min(1,t));
const ease=t=>{t=unit(t);return t*t*(3-2*t);};
function breakChain(f){f.chain=0;f.chainTime=0;f.bufferTime=0;f.mark=null;}
function fighter(type, i) {
  return { type, x: i ? 830 : 370, y: 0, vy: 0, face: i ? -1 : 1, hp: 100, energy: 0, knockVx: 0, down: null, downTime: 0, attackSerial: 0, stun: 0, cooldown: 0, dash: 0, inv: 0, combo: 0, chain: 0, chainTime: 0, action: 'idle', attack: null, input: {}, previous: {}, projectile: null, mark: null };
}
function reset(room) {
  room.round=(room.round||0)+1;
  room.fighters = room.players.map((p, i) => fighter(p.type, i));
  room.time = 99; room.countdown = 3; room.phase = 'countdown'; room.winner = null; room.effects = []; room.tick = 0; room.hitstop = 0; room.effectSerial = 0;
}
function startAttack(f, key, enemy) {
  if (!['light','skill','special','ultimate'].includes(key)) return;
  if (f.down || f.hp <= 0) return;
  const cross = f.type === 'cross';
  const moves = {
    light: { duration: .28, active: .09, reach: TYPES[f.type].reach, damage: TYPES[f.type].light, knock: 22, stun: .23 },
    skill: { duration: .65, active: .20, reach: 105, damage: cross ? 16 : 12, knock: 100, stun: .36, cost: 22, rush: cross ? 480 : 570 },
    special: { duration: .75, active: .26, reach: cross ? 175 : 100, damage: 16, knock: 45, stun: .48, cost: 30, launch: true },
    ultimate: { duration: 1.05, active: .38, reach: cross ? 270 : 240, damage: 30, knock: 160, stun: .65, cost: 100 },
  };
  const chain=key==='light'?(f.chainTime>0?f.chain%4+1:1):0;
  const m = { ...(key==='light'?LIGHTS[f.type][chain-1]:moves[key]) };
  if (f.energy < (m.cost || 0)) return;
  f.energy -= m.cost || 0;
  if(key==='light') {f.chain=chain;f.chainTime=m.duration+.55;if(chain===1)f.mark=null;}
  else breakChain(f);
  const face=f.face||1;
  const targetX=key==='light'&&chain===4&&f.type==='stick'&&f.mark?f.mark.x:
    clampX(f.x+face*Math.max(90,Math.min(220,enemy?(enemy.x-f.x)*face:180)));
  f.attack = { ...m, key, chain, face, originX:f.x, originY:f.y, targetX, id: ++f.attackSerial, age: 0, hit: false }; f.cooldown = m.duration; f.action = key;
}
function effect(room, data) {
  room.effects.push({id: ++room.effectSerial, life: 24, maxLife: 24, ...data});
}
function bodyStep(f, room) {
  const wasAirborne = f.y > 0;
  f.x = Math.max(60, Math.min(1140, f.x + f.knockVx * DT));
  f.knockVx *= Math.exp(-9 * DT);
  const scripted=!f.down&&['retreat','dive','bounce'].includes(f.attack?.motion);
  if(!scripted){f.y = Math.max(0, f.y + f.vy * DT);f.vy -= 1600 * DT;}
  if (!f.y && f.vy < 0) f.vy = 0;
  if (wasAirborne && !f.y) {
    effect(room, {kind:'land', x:f.x, y:0, heavy:!!f.down});
    if (f.down === 'air') { f.down = 'floor'; f.downTime = .65; }
  }
  if (f.down === 'floor' && f.hp > 0) {
    f.downTime = Math.max(0, f.downTime - DT);
    if (!f.downTime) { f.down='rise'; f.downTime=.38; }
  } else if (f.down === 'rise') {
    f.downTime = Math.max(0, f.downTime - DT);
    if (!f.downTime) { f.down=null; f.action='idle'; f.inv=.20; }
  }
  if (f.down) { f.action=f.hp<=0?'ko':f.down; f.attack=null; f.dash=0; f.bufferTime=0; }
}
function step(room) {
  if (room.phase === 'over') {
    room.tick++;
    room.effects = room.effects.filter(e => --e.life > 0);
    room.fighters.forEach(f => bodyStep(f, room));
    return;
  }

  if (!['countdown', 'fight'].includes(room.phase)) return;
  if (room.players.some(p => !p.dummy && Date.now() - p.lastSeen > 3500)) { room.paused = true; return; }
  room.paused = false; room.tick++;
  room.effects = room.effects.filter(e => --e.life > 0);
  if (room.countdown > 0) { room.countdown -= DT; if (room.countdown <= 0) room.phase = 'fight'; return; }
  if (room.hitstop > 0) { room.hitstop -= DT; return; }
  if (!room.players.some(p=>p.dummy)) room.time = Math.max(0, room.time - DT);
  const hits = [];
  room.fighters.forEach((f, i) => {
    const a = advanceFighter(f, room.fighters[1-i], room);
    if(a) hits.push({i, a});
  });
  // Keep bodies legible when a rushing attack reaches its target.
  const [left, right] = room.fighters[0].x <= room.fighters[1].x ? room.fighters : [...room.fighters].reverse();
  if (Math.abs(left.y-right.y)<75 && !left.down && !right.down && right.x-left.x<66) {
    const center=Math.max(93,Math.min(1107,(left.x+right.x)/2));
    left.x=center-33;right.x=center+33;
  }
  for (const {i,a} of hits) {
    const f = room.fighters[i], e = room.fighters[1-i];
    const blocked = e.action === 'block' && a.key !== 'ultimate';
    e.hp = Math.max(0,e.hp - (blocked ? Math.ceil(a.damage*.15) : a.damage));
    e.stun = blocked ? .10 : a.stun; e.knockVx = (a.face||f.face) * a.knock * (blocked ? 2 : 8);
    if (!blocked) { breakChain(e);e.attack=null; e.action='hit'; e.dash=0; if(a.launch || a.key==='ultimate' || e.hp<=0) { e.vy=a.launch?470:260; e.down='air'; } }
    f.energy=Math.min(100,f.energy+12); e.energy=Math.min(100,e.energy+7); f.combo = e.stun > 0 ? f.combo+1 : 1;
    room.hitstop = blocked ? .025 : .055;
    effect(room, {x:e.x,y:e.y+65,blocked,kind:a.key,type:f.type,face:f.face,heavy:a.key!=='light'||a.chain===4});
  }
  for (const f of room.fighters) if (!room.fighters.find(e=>e!==f).stun) f.combo=0;
  if (room.fighters.some(f=>f.hp<=0) || room.time<=0) { room.phase='over'; const [a,b]=room.fighters; room.winner=a.hp===b.hp?-1:a.hp>b.hp?0:1; room.players.forEach(p=>p.ready=!!p.dummy); room.fighters.forEach(f=>{ f.attack=null; f.projectile=null; f.mark=null; f.input={}; f.dash=0; if(f.hp>0&&!f.down)f.action='idle'; }); }
}

function advanceFighter(f, enemy, room) {
    const input = f.input;
    let hit = null;
    f.face = f.attack?.face || (enemy.x >= f.x ? 1 : -1);
    if(f.mark&&--f.mark.life<=0)f.mark=null;
    for (const k of ['stun','cooldown','dash','inv','chainTime']) f[k] = Math.max(0, f[k] - DT);
    f.energy = Math.min(100, f.energy + DT * 3);
    bodyStep(f, room);
    const pressed = k => (f.pulses?.[k] || (input[k] && !f.previous[k]));
    f.bufferTime = Math.max(0, (f.bufferTime || 0) - DT);
    for (const k of ['light','skill','special','ultimate']) if (pressed(k)) {
      if(k==='light'&&f.attack?.key==='light'&&f.attack.chain<4)f.attack.queued=true;
      else {f.buffer=k;f.bufferTime=.18;}
    }
    if(f.attack?.queued&&f.attack.age>=f.attack.linkAt&&!f.stun&&!f.down){
      f.attack=null;f.cooldown=0;startAttack(f,'light',enemy);f.bufferTime=0;
    }
    if (!f.stun && !f.attack && !f.down) {
      f.action = input.block && !f.y ? 'block' : 'idle';
      if (pressed('jump') && !f.y) f.vy = 650;
      if (pressed('dash') && !f.cooldown) { f.dash = .14; f.inv = .12; f.cooldown = .45; }
      if (!f.cooldown && f.action !== 'block') for (const key of ['ultimate','special','skill','light']) if (pressed(key) || (f.buffer === key && f.bufferTime > 0)) { startAttack(f,key,enemy); f.bufferTime = 0; break; }
      if (f.action !== 'block' && !f.attack) { const dir = (input.right?1:0)-(input.left?1:0); f.x += dir * TYPES[f.type].speed * DT; if(dir) f.action = 'run'; }
    }
    if (f.dash) f.x += (input.left ? -1 : input.right ? 1 : f.face) * 700 * DT;
    if (f.attack) {
      const a = f.attack; a.age += DT;
      if(a.motion==='rush'||a.motion==='roll') {
        const previous=ease((a.age-DT-.04)/.28),next=ease((a.age-.04)/.28);
        f.x+=a.face*a.distance*(next-previous);
      } else if(a.motion==='retreat'||a.motion==='bounce') {
        const span=a.motion==='retreat'?.60:.44,u=unit(a.age/span),old=unit((a.age-DT)/span);
        f.x+=a.face*a.distance*(u-old)*(a.motion==='retreat'?-1:1);
        f.y=u===1?0:a.originY*(1-u)+Math.sin(Math.PI*u)*(a.motion==='retreat'?135:100);f.vy=0;
        if(old<1&&u===1)effect(room,{kind:'land',x:f.x,y:0,heavy:a.motion==='bounce'});
      } else if(a.motion==='dive') {
        const peak=Math.max(210,a.originY+100);
        if(a.age<.28){const u=ease(a.age/.28);f.x=a.originX+(a.targetX-a.originX)*u;f.y=a.originY+(peak-a.originY)*u;}
        else {if(a.age-DT<a.active)f.x=a.targetX;f.y=peak*(1-ease((a.age-.38)/.24));}
        f.vy=0;
      }
      if (a.rush && a.age < .32) f.x += a.face * a.rush * DT;
      if (!a.hit && a.age >= a.active) {
        a.hit=true;
        if(a.motion==='retreat') {
          f.projectile={key:'light',chain:3,name:'手里剑',face:a.face,x:f.x,y:f.y+65,fromX:f.x,fromY:f.y+65,targetX:a.targetX,age:0,duration:.40,damage:a.damage,knock:a.knock,stun:a.stun};
          f.mark={x:a.targetX,life:100};
        } else {
          if(a.motion==='dive'||a.motion==='quake')effect(room,{kind:'slam',x:f.x,y:0,heavy:true,type:f.type});
          const ahead=(enemy.x-f.x)*a.face;
          const radial=a.motion==='dive'||a.motion==='quake'||a.key==='special'||a.key==='ultimate';
          if(Math.abs(f.x-enemy.x)<a.reach&&(radial||ahead>=-15)&&Math.abs(f.y-enemy.y)<100&&!enemy.inv&&!['floor','rise'].includes(enemy.down))hit=a;
        }
      }
      if (a.age >= a.duration) { f.attack = null; f.action = 'idle'; }
    }
    const projectile=f.projectile;
    if(projectile){
      const oldX=projectile.x,oldY=projectile.y;
      projectile.age+=DT;const u=unit(projectile.age/projectile.duration);
      projectile.x=projectile.fromX+(projectile.targetX-projectile.fromX)*u;
      projectile.y=projectile.fromY*(1-u)+Math.sin(Math.PI*u)*20;
      // Swept collision keeps a fast, visible shuriken from skipping a target.
      const dx=projectile.x-oldX,dy=projectile.y-oldY;
      const q=unit(((enemy.x-oldX)*dx+(enemy.y+55-oldY)*dy)/(dx*dx+dy*dy||1));
      if(!enemy.inv&&!['floor','rise'].includes(enemy.down)&&Math.abs(oldX+dx*q-enemy.x)<34&&Math.abs(oldY+dy*q-(enemy.y+55))<58){
        hit=projectile;f.mark={x:clampX(oldX+dx*q),life:90};f.projectile=null;
      }else if(u===1){f.mark={x:projectile.targetX,life:90};f.projectile=null;}
    }
    f.x = Math.max(60,Math.min(1140,f.x)); f.previous = {...input}; f.pulses = {};
  return hit;
}

const api={DT,TYPES,LIGHTS,fighter,reset,startAttack,step,advanceFighter};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.InkDuelCore=api;
})(typeof window==='undefined'?globalThis:window);

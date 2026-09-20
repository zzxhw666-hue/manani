'use strict';
(function(root){
const DT = 1 / 60;
const TYPES = {
  stick: { name: '火柴人', speed: 290, light: 6, reach: 78 },
  cross: { name: '叉叉怪', speed: 235, light: 9, reach: 86 },
};
function fighter(type, i) {
  return { type, x: i ? 830 : 370, y: 0, vy: 0, face: i ? -1 : 1, hp: 100, energy: 0, knockVx: 0, down: null, downTime: 0, attackSerial: 0, stun: 0, cooldown: 0, dash: 0, inv: 0, combo: 0, chain: 0, chainTime: 0, action: 'idle', attack: null, input: {}, previous: {} };
}
function reset(room) {
  room.round=(room.round||0)+1;
  room.fighters = room.players.map((p, i) => fighter(p.type, i));
  room.time = 99; room.countdown = 3; room.phase = 'countdown'; room.winner = null; room.effects = []; room.tick = 0; room.hitstop = 0; room.effectSerial = 0;
}
function startAttack(f, key) {
  if (!['light','skill','special','ultimate'].includes(key)) return;
  if (f.down || f.hp <= 0) return;
  const cross = f.type === 'cross';
  const moves = {
    light: { duration: .28, active: .09, reach: TYPES[f.type].reach, damage: TYPES[f.type].light, knock: 22, stun: .23 },
    skill: { duration: .65, active: .20, reach: 105, damage: cross ? 16 : 12, knock: 100, stun: .36, cost: 22, rush: cross ? 480 : 570 },
    special: { duration: .75, active: .26, reach: cross ? 175 : 100, damage: 16, knock: 45, stun: .48, cost: 30, launch: true },
    ultimate: { duration: 1.05, active: .38, reach: cross ? 270 : 240, damage: 30, knock: 160, stun: .65, cost: 100 },
  };
  const m = { ...moves[key] };
  if (f.energy < (m.cost || 0)) return;
  f.energy -= m.cost || 0;
  if (key === 'light') { f.chain = f.chainTime > 0 ? f.chain % 3 + 1 : 1; f.chainTime = .8; if (f.chain === 3) { m.damage += 5; m.knock = 85; m.launch = true; } }
  f.attack = { ...m, key, id: ++f.attackSerial, age: 0, hit: false }; f.cooldown = m.duration; f.action = key;
}
function effect(room, data) {
  room.effects.push({id: ++room.effectSerial, life: 24, maxLife: 24, ...data});
}
function bodyStep(f, room) {
  const wasAirborne = f.y > 0;
  f.x = Math.max(60, Math.min(1140, f.x + f.knockVx * DT));
  f.knockVx *= Math.exp(-9 * DT);
  f.y = Math.max(0, f.y + f.vy * DT);
  f.vy -= 1600 * DT;
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
    e.stun = blocked ? .10 : a.stun; e.knockVx = f.face * a.knock * (blocked ? 2 : 8);
    if (!blocked) { e.attack=null; e.action='hit'; e.dash=0; if(a.launch || a.key==='ultimate' || e.hp<=0) { e.vy=a.launch?470:260; e.down='air'; } }
    f.energy=Math.min(100,f.energy+12); e.energy=Math.min(100,e.energy+7); f.combo = e.stun > 0 ? f.combo+1 : 1;
    room.hitstop = blocked ? .025 : .055;
    effect(room, {x:e.x,y:e.y+65,blocked,kind:a.key,type:f.type,face:f.face,heavy:a.key!=='light'});
  }
  for (const f of room.fighters) if (!room.fighters.find(e=>e!==f).stun) f.combo=0;
  if (room.fighters.some(f=>f.hp<=0) || room.time<=0) { room.phase='over'; const [a,b]=room.fighters; room.winner=a.hp===b.hp?-1:a.hp>b.hp?0:1; room.players.forEach(p=>p.ready=!!p.dummy); room.fighters.forEach(f=>{ f.attack=null; f.input={}; f.dash=0; if(f.hp>0&&!f.down)f.action='idle'; }); }
}

function advanceFighter(f, enemy, room) {
    const input = f.input;
    let hit = null;
    f.face = enemy.x >= f.x ? 1 : -1;
    for (const k of ['stun','cooldown','dash','inv','chainTime']) f[k] = Math.max(0, f[k] - DT);
    f.energy = Math.min(100, f.energy + DT * 3);
    bodyStep(f, room);
    const pressed = k => (f.pulses?.[k] || (input[k] && !f.previous[k]));
    f.bufferTime = Math.max(0, (f.bufferTime || 0) - DT);
    for (const k of ['light','skill','special','ultimate']) if (pressed(k)) { f.buffer = k; f.bufferTime = .18; }
    if (!f.stun && !f.attack && !f.down) {
      f.action = input.block && !f.y ? 'block' : 'idle';
      if (pressed('jump') && !f.y) f.vy = 650;
      if (pressed('dash') && !f.cooldown) { f.dash = .14; f.inv = .12; f.cooldown = .45; }
      if (!f.cooldown && f.action !== 'block') for (const key of ['ultimate','special','skill','light']) if (pressed(key) || (f.buffer === key && f.bufferTime > 0)) { startAttack(f,key); f.bufferTime = 0; break; }
      if (f.action !== 'block' && !f.attack) { const dir = (input.right?1:0)-(input.left?1:0); f.x += dir * TYPES[f.type].speed * DT; if(dir) f.action = 'run'; }
    }
    if (f.dash) f.x += (input.left ? -1 : input.right ? 1 : f.face) * 700 * DT;
    if (f.attack) {
      const a = f.attack; a.age += DT;
      if (a.rush && a.age < .32) f.x += f.face * a.rush * DT;
      if (!a.hit && a.age >= a.active) { a.hit = true; if (Math.abs(f.x-enemy.x) < a.reach && Math.abs(f.y-enemy.y)<100 && !enemy.inv && !['floor','rise'].includes(enemy.down)) hit = a; }
      if (a.age >= a.duration) { f.attack = null; f.action = 'idle'; }
    }
    f.x = Math.max(60,Math.min(1140,f.x)); f.previous = {...input}; f.pulses = {};
  return hit;
}

const api={DT,TYPES,fighter,reset,startAttack,step,advanceFighter};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.InkDuelCore=api;
})(typeof window==='undefined'?globalThis:window);

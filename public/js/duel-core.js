'use strict';
(function(root){
const DT = 1 / 60;
const TYPES = {
  stick: { name: '火柴人', speed: 290, light: 2, reach: 78 },
  cross: { name: '叉叉怪', speed: 235, light: 3, reach: 86 },
};
// Each press advances one authored move; only one follow-up can be queued.
const LIGHTS = {
  stick: [
    {name:'推掌',duration:.38,active:.10,linkAt:.27,reach:88,damage:2,knock:14,stun:.44},
    {name:'疾进',duration:.50,active:.23,linkAt:.38,reach:100,damage:2,knock:12,stun:.65,motion:'rush',distance:132},
    {name:'退影镖',duration:.84,active:.18,linkAt:.69,reach:0,damage:3,knock:6,stun:.90,motion:'retreat',distance:128},
    {name:'落星坠',duration:.96,active:.62,reach:115,damage:5,knock:85,stun:.55,motion:'dive',launch:true},
  ],
  cross: [
    {name:'磐石推',duration:.44,active:.14,linkAt:.32,reach:94,damage:3,knock:16,stun:.46},
    {name:'团身碾',duration:.58,active:.25,linkAt:.44,reach:105,damage:3,knock:10,stun:.70,motion:'roll',distance:132},
    {name:'弹山锤',duration:.72,active:.44,linkAt:.59,reach:115,damage:3,knock:8,stun:.70,motion:'bounce',distance:52},
    {name:'十字崩',duration:.88,active:.47,reach:165,damage:5,knock:100,stun:.60,motion:'quake',launch:true},
  ],
};
// Timelines drive both authoritative collision and predicted movement. Strike data is immutable.
const SKILLS = {
  stick: {
    skill:{name:'青岚连踢',color:'#35d8ed',motion:'gale',duration:.86,active:.27,cost:22,damage:18,knock:12,stun:.48,
      strikes:[{at:.27,damage:9,reach:120},{at:.47,damage:9,reach:140,knock:65}]},
    special:{name:'紫电升空斩',color:'#aa83ff',motion:'thunder',duration:1.12,active:.24,cost:30,damage:22,knock:38,stun:.72,
      strikes:[{at:.24,damage:22,reach:125,height:210,anchor:'ground',launch:true}]},
    ultimate:{name:'天隙 · 千影雷葬',color:'#cfb4ff',motion:'storm',duration:2.50,active:.78,cost:100,damage:58,knock:2,stun:.60,
      strikes:[{at:.78,damage:8,reach:145,height:230,anchor:'target'},{at:1.08,damage:8,reach:145,height:230,anchor:'target'},
        {at:1.38,damage:8,reach:145,height:230,anchor:'target'},{at:1.85,damage:34,reach:180,height:260,anchor:'target',knock:140,launch:true,final:true}]},
  },
  cross: {
    skill:{name:'熔岩破城钻',color:'#ff873d',motion:'magma',duration:1.02,active:.38,cost:22,damage:20,knock:80,stun:.60,
      strikes:[{at:.38,damage:20,reach:135}]},
    special:{name:'地脉晶棘阵',color:'#46e4a5',motion:'crystal',duration:1.25,active:.38,cost:30,damage:30,knock:4,stun:.38,
      strikes:[{at:.38,damage:10,reach:95,height:115,anchor:'origin',offset:85},{at:.60,damage:10,reach:95,height:115,anchor:'origin',offset:165},
        {at:.82,damage:10,reach:95,height:115,anchor:'origin',offset:245,knock:55,launch:true}]},
    ultimate:{name:'赤曜 · 陨星灭界',color:'#ff6459',motion:'meteor',duration:2.65,active:1.80,cost:100,damage:62,knock:170,stun:1,
      strikes:[{at:1.80,damage:62,reach:235,height:240,anchor:'target',launch:true,final:true}]},
  },
};
function hasLightArmor(f){return !!f.attack&&f.attack.key!=='light'&&!f.stun&&!f.down&&f.hp>0;}
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
  if (f.down || f.stun > 0 || f.hp <= 0) return;
  const chain=key==='light'?(f.chainTime>0?f.chain%4+1:1):0;
  const m = { ...(key==='light'?LIGHTS[f.type][chain-1]:SKILLS[f.type][key]) };
  if (f.energy < (m.cost || 0)) return;
  f.energy -= m.cost || 0;
  if(key==='light') {f.chain=chain;f.chainTime=m.duration+.55;if(chain===1)f.mark=null;}
  else breakChain(f);
  const face=f.face||1;
  const targetX=key==='light'&&chain===4&&f.type==='stick'&&f.mark?f.mark.x:
    clampX(f.x+face*Math.max(90,Math.min(key==='ultimate'?(f.type==='stick'?420:320):220,enemy?(enemy.x-f.x)*face:180)));
  f.attack = { ...m, key, chain, face, originX:f.x, originY:f.y, targetX, id: ++f.attackSerial, age: 0, hit: false, nextStrike:0 }; f.cooldown = m.duration; f.action = key;
}
function effect(room, data) {
  room.effects.push({id: ++room.effectSerial, life: 24, maxLife: 24, ...data});
}
function bodyStep(f, room) {
  const wasAirborne = f.y > 0;
  f.x = Math.max(60, Math.min(1140, f.x + f.knockVx * DT));
  f.knockVx *= Math.exp(-9 * DT);
  const scripted=!f.down&&['retreat','dive','bounce','thunder','storm','meteor'].includes(f.attack?.motion);
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
  const armor=room.fighters.map(hasLightArmor);
  for (const {i,a} of hits) {
    const f = room.fighters[i], e = room.fighters[1-i];
    const blocked = e.action === 'block' && a.key !== 'ultimate';
    e.hp = Math.max(0,e.hp - (blocked ? Math.ceil(a.damage*.15) : a.damage));
    const armored=a.key==='light'&&armor[1-i]&&e.hp>0;
    if(!armored){
      e.stun = blocked ? .10 : Math.max(e.stun,a.stun);e.bufferTime=0;e.buffer=null;
      e.knockVx = (a.face||f.face) * a.knock * (blocked ? 2 : 8);
      if (!blocked) {breakChain(e);e.attack=null;e.action='hit';e.dash=0;
        if(a.launch || e.hp<=0) {e.vy=a.launch?470:260;e.down='air';}
      }
    }
    f.energy=Math.min(100,f.energy+(a.key==='light'?6:a.key==='ultimate'?0:10));
    e.energy=Math.min(100,e.energy+(a.key==='light'?4:8));f.combo=e.stun>0?f.combo+1:1;
    room.hitstop=Math.max(room.hitstop||0,armored?0:blocked?.025:a.final?.10:.045);
    effect(room,{x:e.x,y:e.y+65,blocked,armored,kind:a.key,type:f.type,face:a.face||f.face,color:a.color,heavy:a.key!=='light'||a.chain===4,final:!!a.final});
  }
  for (const f of room.fighters) if (!room.fighters.find(e=>e!==f).stun) f.combo=0;
  if (room.fighters.some(f=>f.hp<=0) || room.time<=0) { room.phase='over'; const [a,b]=room.fighters; room.winner=a.hp===b.hp?-1:a.hp>b.hp?0:1; room.players.forEach(p=>p.ready=!!p.dummy); room.fighters.forEach(f=>{ f.attack=null; f.projectile=null; f.mark=null; f.input={}; f.dash=0; if(f.hp>0&&!f.down)f.action='idle'; }); }
}

function advanceSkill(f,enemy,room,a){
  const t=a.age;
  if(t<=DT)effect(room,{kind:'cast',x:f.x,y:f.y+55,color:a.color,heavy:false});
  if(a.motion==='gale'||a.motion==='magma'){
    const begin=a.motion==='gale'?.10:.15,span=a.motion==='gale'?.42:.38,distance=a.motion==='gale'?245:270;
    f.x+=a.face*distance*(ease((t-begin)/span)-ease((t-DT-begin)/span));
  }else if(a.motion==='thunder'){
    const u=unit((t-.12)/.80);f.y=u===1?0:a.originY*(1-u)+155*Math.sin(Math.PI*u);f.vy=0;
  }else if(a.motion==='storm'||a.motion==='meteor'){
    const meteor=a.motion==='meteor',rise=meteor?.60:.35,apex=meteor?1:.65,fall=meteor?1.40:1.60,impact=meteor?1.80:1.85;
    const peak=meteor?235:205,hoverX=meteor?a.targetX:clampX(a.targetX-a.face*80);
    if(t<rise){f.y=a.originY;}
    else if(t<apex){const u=ease((t-rise)/(apex-rise));f.x=a.originX+(hoverX-a.originX)*u;f.y=a.originY+(peak-a.originY)*u;}
    else if(t<fall){f.x=hoverX;f.y=peak;}
    else if(t-DT<impact){const u=ease((t-fall)/(impact-fall));f.x=hoverX+(a.targetX-hoverX)*u;f.y=peak*(1-u);}
    else f.y=0;
    f.vy=0;
  }
  const strike=a.strikes[a.nextStrike];if(!strike||t<strike.at)return null;
  a.nextStrike++;
  const x=strike.anchor==='target'?a.targetX:strike.anchor==='origin'?clampX(a.originX+a.face*strike.offset):f.x;
  const y=strike.anchor?0:f.y;
  effect(room,{kind:a.motion,x,y,color:a.color,face:a.face,heavy:true,final:!!strike.final,life:strike.final?42:24,maxLife:strike.final?42:24});
  const ahead=(enemy.x-x)*a.face;
  if(Math.abs(enemy.x-x)<strike.reach&&(strike.anchor||ahead>=-20)&&Math.abs(enemy.y-y)<(strike.height||110)&&!enemy.inv&&!['floor','rise'].includes(enemy.down))
    return {...a,...strike,hitX:x,hitY:y};
  return null;
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
    if(f.stun||f.down){f.bufferTime=0;f.buffer=null;}
    for (const k of ['light','skill','special','ultimate']) if (!f.stun&&!f.down&&pressed(k)) {
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
      if(a.key!=='light')hit=advanceSkill(f,enemy,room,a);
      if (a.key==='light'&&!a.hit && a.age >= a.active) {
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

const api={DT,TYPES,LIGHTS,SKILLS,hasLightArmor,fighter,reset,startAttack,step,advanceFighter};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.InkDuelCore=api;
})(typeof window==='undefined'?globalThis:window);

'use strict';
const crypto = require('node:crypto');
const DT = 1 / 60;
const TYPES = {
  stick: { name: '火柴人', speed: 290, light: 6, reach: 78 },
  cross: { name: '叉叉怪', speed: 235, light: 9, reach: 86 },
};
function fighter(type, i) {
  return { type, x: i ? 830 : 370, y: 0, vy: 0, face: i ? -1 : 1, hp: 100, energy: 0, stun: 0, cooldown: 0, dash: 0, inv: 0, combo: 0, chain: 0, chainTime: 0, action: 'idle', attack: null, input: {}, previous: {} };
}
function reset(room) {
  room.fighters = room.players.map((p, i) => fighter(p.type, i));
  room.time = 99; room.countdown = 3; room.phase = 'countdown'; room.winner = null; room.effects = []; room.tick = 0; room.hitstop = 0;
}
function startAttack(f, key) {
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
  f.attack = { ...m, key, age: 0, hit: false }; f.cooldown = m.duration; f.action = key;
}
function step(room) {
  if (!['countdown', 'fight'].includes(room.phase)) return;
  if (room.players.some(p => Date.now() - p.lastSeen > 1800)) { room.paused = true; return; }
  room.paused = false; room.tick++;
  room.effects = room.effects.filter(e => --e.life > 0);
  if (room.countdown > 0) { room.countdown -= DT; if (room.countdown <= 0) room.phase = 'fight'; return; }
  if (room.hitstop > 0) { room.hitstop -= DT; return; }
  room.time = Math.max(0, room.time - DT);
  const hits = [];
  room.fighters.forEach((f, i) => {
    const enemy = room.fighters[1-i], input = f.input;
    f.face = enemy.x >= f.x ? 1 : -1;
    for (const k of ['stun','cooldown','dash','inv','chainTime']) f[k] = Math.max(0, f[k] - DT);
    f.energy = Math.min(100, f.energy + DT * 3);
    f.y = Math.max(0, f.y + f.vy * DT); f.vy -= 1600 * DT; if (!f.y && f.vy < 0) f.vy = 0;
    const pressed = k => (f.pulses?.[k] || (input[k] && !f.previous[k]));
    f.bufferTime = Math.max(0, (f.bufferTime || 0) - DT);
    for (const k of ['light','skill','special','ultimate']) if (pressed(k)) { f.buffer = k; f.bufferTime = .18; }
    if (!f.stun && !f.attack) {
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
      if (!a.hit && a.age >= a.active) { a.hit = true; if (Math.abs(f.x-enemy.x) < a.reach && Math.abs(f.y-enemy.y)<100 && !enemy.inv) hits.push({i, a}); }
      if (a.age >= a.duration) { f.attack = null; f.action = 'idle'; }
    }
    f.x = Math.max(60,Math.min(1140,f.x)); f.previous = {...input}; f.pulses = {};
  });
  for (const {i,a} of hits) {
    const f = room.fighters[i], e = room.fighters[1-i];
    const blocked = e.action === 'block' && a.key !== 'ultimate';
    e.hp = Math.max(0,e.hp - (blocked ? Math.ceil(a.damage*.15) : a.damage));
    e.stun = blocked ? .10 : a.stun; e.x = Math.max(60,Math.min(1140,e.x+f.face*a.knock*(blocked?.25:1)));
    if (!blocked) { e.attack=null; e.action='hit'; if(a.launch) e.vy=470; }
    f.energy=Math.min(100,f.energy+12); e.energy=Math.min(100,e.energy+7); f.combo = e.stun > 0 ? f.combo+1 : 1;
    room.hitstop = blocked ? .025 : .055;
    room.effects.push({x:(f.x+e.x)/2,y:Math.max(f.y,e.y)+65,life:14,blocked,kind:a.key});
  }
  for (const f of room.fighters) if (!room.fighters.find(e=>e!==f).stun) f.combo=0;
  if (room.fighters.some(f=>f.hp<=0) || room.time<=0) { room.phase='over'; const [a,b]=room.fighters; room.winner=a.hp===b.hp?-1:a.hp>b.hp?0:1; room.players.forEach(p=>p.ready=false); }
}
function install(server) {
  const rooms = new Map();
  const reply=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  const view=r=>({code:r.code,players:r.players.map(p=>({name:p.name,type:p.type,ready:p.ready,online:Date.now()-p.lastSeen<1800})),fighters:r.fighters,phase:r.phase,time:r.time,countdown:r.countdown,winner:r.winner,effects:r.effects,paused:r.paused,tick:r.tick});
  const timer=setInterval(()=>{ for(const [code,r] of rooms) { if(Date.now()-r.touched>30*60*1000){r.streams.forEach(s=>s.end());rooms.delete(code);continue;} step(r); if(r.tick%2===0 || r.phase==='waiting'||r.phase==='over'||r.paused) {const data=`data: ${JSON.stringify(view(r))}\n\n`; for(const s of r.streams) if(!s.writableNeedDrain)s.write(data);} } },1000/60); timer.unref();
  server.on('close',()=>{clearInterval(timer);for(const r of rooms.values())r.streams.forEach(s=>s.end());});
  return async function handle(req,res,url) {
    try {
      if(req.method==='GET'&&url.pathname==='/api/duel/events') {
        const r=rooms.get(url.searchParams.get('code')); const p=r?.players.find(p=>p.token===url.searchParams.get('token')); if(!p)return reply(res,403,{error:'房间凭证失效，请重新加入'});
        res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive','X-Accel-Buffering':'no'});res.write(`data: ${JSON.stringify(view(r))}\n\n`);r.streams.add(res);req.on('close',()=>r.streams.delete(res));return;
      }
      if(req.method!=='POST')return reply(res,405,{error:'不支持的请求'});
      if(req.headers.origin && req.headers.origin!==`http://${req.headers.host}` && req.headers.origin!==`https://${req.headers.host}`)return reply(res,403,{error:'来源不符'});
      let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>4096)throw Error('请求过大');}const b=JSON.parse(raw||'{}');
      const action=url.pathname.split('/').pop(); let r;
      if(action==='create'||action==='join') {
        if(action==='create'){if(rooms.size>=200)throw Error('房间已满');let code;do{code=crypto.randomInt(100000,1000000).toString();}while(rooms.has(code));r={code,players:[],fighters:[],streams:new Set(),phase:'waiting',effects:[],time:99,tick:0,touched:Date.now()};rooms.set(code,r);}else {r=rooms.get(String(b.code));if(!r)throw Error('房间不存在或已过期');}
        if(r.players.length>=2)throw Error('房间已满');const type=r.players.length?(r.players[0].type==='stick'?'cross':'stick'):(b.type==='cross'?'cross':'stick');
        const p={name:String(b.name||'无名侠客').slice(0,16),type,token:crypto.randomBytes(24).toString('hex'),lastSeen:Date.now(),ready:false};r.players.push(p);r.fighters.push(fighter(type,r.players.length-1));r.touched=Date.now();return reply(res,200,{code:r.code,token:p.token,index:r.players.length-1});
      }
      r=rooms.get(String(b.code));const i=r?.players.findIndex(p=>p.token===b.token);if(!r||i<0)throw Error('房间凭证失效，请重新加入');const p=r.players[i];p.lastSeen=Date.now();r.touched=Date.now();
      if(action==='input'){const input={};for(const k of ['left','right','jump','dash','block','light','skill','special','ultimate'])input[k]=b.input?.[k]===true;const f=r.fighters[i]; f.pulses ||= {}; for(const k of ['jump','dash','light','skill','special','ultimate']) if(input[k]&&!f.input[k])f.pulses[k]=true; f.input=input;}
      else if(action==='ready'){if(!['waiting','over'].includes(r.phase))throw Error('对局进行中');p.ready=true;if(r.players.length===2&&r.players.every(p=>p.ready))reset(r);}
      else if(action==='leave'){r.streams.forEach(s=>s.end());rooms.delete(r.code);}
      else if(action!=='ping')throw Error('未知操作');
      reply(res,200,{ok:true});
    }catch(e){if(!res.headersSent)reply(res,400,{error:e.message});}
  };
}
module.exports={install,step,reset,fighter,startAttack};

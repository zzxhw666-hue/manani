'use strict';
const crypto = require('node:crypto');
const { performance } = require('node:perf_hooks');
const { WebSocketServer, WebSocket } = require('ws');
const { fighter, reset, step, startAttack } = require('../public/js/duel-core');
const INPUTS = ['left','right','jump','dash','block','light','skill','special','ultimate'];
const EDGES = ['jump','dash','light','skill','special','ultimate'];

function install(server) {
  const rooms = new Map();
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4096, perMessageDeflate: false });
  const reply = (res, status, data) => {
    res.writeHead(status, { 'Content-Type':'application/json', 'Cache-Control':'no-store' });
    res.end(JSON.stringify(data));
  };
  const validOrigin = req => !req.headers.origin || ['http://','https://'].some(p=>req.headers.origin===p+req.headers.host);
  const identify = b => {
    const room = rooms.get(String(b.code));
    const index = room?.players.findIndex(p=>!p.dummy && p.token===b.token);
    if (!room || index<0) throw Error('房间凭证失效，请重新加入');
    return { room, index, player:room.players[index] };
  };
  const view = r => ({
    code:r.code, round:r.round||0, tick:r.tick, phase:r.phase, time:r.time,
    countdown:r.countdown, winner:r.winner, effects:r.effects, paused:r.paused,
    hitstop:r.hitstop, training:r.players.some(p=>p.dummy), fighters:r.fighters,
    ack:r.players.map(p=>p.appliedSeq||0),
    players:r.players.map(p=>({ name:p.name,type:p.type,ready:p.ready,dummy:!!p.dummy,online:!!p.dummy||Date.now()-p.lastSeen<3500 }))
  });
  const send = (ws, message) => {
    if (ws.readyState!==WebSocket.OPEN) return;
    if(ws.bufferedAmount>128*1024) { ws.close(1013,'Connection too slow'); return; }
    ws.send(message);
  };
  const broadcast = r => {
    const state=view(r), raw=JSON.stringify(state);
    for(const s of r.streams) if(!s.writableNeedDrain)s.write(`data: ${raw}\n\n`);
    const message=`{"type":"state","state":${raw}}`;
    for(const ws of r.sockets)send(ws,message);
    r.sentAt=performance.now();
  };
  const closeRoom = (r, message='房间已关闭') => {
    for(const ws of r.sockets) {send(ws,JSON.stringify({type:'closed',message}));ws.close(1000);}
    for(const s of r.streams) {s.write(`event: closed\ndata: ${JSON.stringify({message})}\n\n`);s.end();}
    rooms.delete(r.code);
  };
  function input(r, i, b) {
    const p=r.players[i], f=r.fighters[i];
    if(b.seq!==undefined) {
      if(!Number.isSafeInteger(b.seq)||b.seq<1)throw Error('输入序号无效');
      if(b.seq<=(p.receivedSeq||0))return;
      p.receivedSeq=b.seq;
    }
    const next={};for(const k of INPUTS)next[k]=b.input?.[k]===true;
    f.pulses ||= {};
    for(const k of EDGES)if(b.pulses?.[k]===true||(next[k]&&!f.input[k]))f.pulses[k]=true;
    f.input=next;
  }
  function action(r, i, a, b) {
    const p=r.players[i];p.lastSeen=Date.now();r.touched=Date.now();
    if(a==='input') {input(r,i,b);return;}
    if(a==='ping')return;
    if(a==='leave') {closeRoom(r,'有玩家退出，房间已关闭');return;}
    if(a==='lobby') {
      if(r.phase!=='over')throw Error('请先完成本局');
      r.phase='waiting';r.effects=[];r.paused=false;
      r.players.forEach(p=>p.ready=!!p.dummy);
      r.fighters=r.players.map((p,i)=>fighter(p.type,i));
    } else if(a==='reset-training') {
      if(i!==0||!r.players[1]?.dummy)throw Error('仅训练房间可以重置');
      reset(r);r.phase='fight';r.countdown=0;r.fighters.forEach(f=>f.energy=100);
    } else if(a==='add-dummy'||a==='remove-dummy') {
      if(i!==0)throw Error('只有房主可以管理测试假人');
      if(!['waiting','over'].includes(r.phase))throw Error('请在开战前或本局结束后管理假人');
      if(a==='add-dummy') {
        if(r.players.length!==1)throw Error('房间已满，无法添加假人');
        const type=p.type==='stick'?'cross':'stick';
        r.players.push({name:'训练假人',type,dummy:true,ready:true});r.fighters.push(fighter(type,1));
        if(p.ready)reset(r);
      } else {
        if(!r.players[1]?.dummy)throw Error('房间中没有测试假人');
        r.players.pop();r.fighters=[fighter(p.type,0)];p.ready=false;
        r.phase='waiting';r.paused=false;r.effects=[];r.winner=null;r.time=99;r.countdown=0;
      }
    } else if(a==='ready') {
      if(!['waiting','over'].includes(r.phase))throw Error('对局进行中');
      p.ready=true;
      if(r.players.length===2&&r.players.every(p=>p.ready))reset(r);
    } else throw Error('未知操作');
    broadcast(r);
  }
  // Monotonic fixed timestep: timers can jitter without changing game speed.
  let last=performance.now(),accumulator=0,frame=0;
  const timer=setInterval(()=>{
    const now=performance.now();accumulator+=Math.min(100,now-last);last=now;
    while(accumulator>=1000/60) {
      accumulator-=1000/60;frame++;
      for(const r of rooms.values()) {
        if(Date.now()-r.touched>30*60*1000){closeRoom(r,'房间长时间无人操作，已关闭');continue;}
        step(r);r.players.forEach(p=>p.appliedSeq=p.receivedSeq||0);
        const live=['fight','countdown'].includes(r.phase)||r.fighters.some(f=>f.y>0||Math.abs(f.knockVx)>1);
        if((live&&frame%2===0)||now-(r.sentAt||0)>500)broadcast(r);
      }
    }
  },8);timer.unref();
  server.on('upgrade',(req,socket,head)=>{
    const url=new URL(req.url,'http://localhost');
    if(url.pathname!=='/api/duel/socket') {socket.destroy();return;}
    if(!validOrigin(req)||wss.clients.size>=400) {socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');return;}
    socket.setNoDelay(true);
    wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws));
  });
  wss.on('connection',ws=>{
    let joined=null,windowAt=Date.now(),count=0;
    const timeout=setTimeout(()=>ws.close(1008,'Authentication required'),3000);timeout.unref();
    ws.on('error',()=>{});
    ws.on('message',raw=>{
      try {
        if(Date.now()-windowAt>1000){windowAt=Date.now();count=0;}
        if(++count>180){ws.close(1008,'Too many inputs');return;}
        const b=JSON.parse(raw.toString());
        if(!joined) {
          if(b.type!=='auth')throw Error('请先验证房间身份');
          joined=identify(b);clearTimeout(timeout);
          for(const other of joined.room.sockets)if(other.playerIndex===joined.index){other.close(4001,'Connected elsewhere');joined.room.sockets.delete(other);}
          ws.playerIndex=joined.index;joined.room.sockets.add(ws);
          joined.player.lastSeen=Date.now();joined.room.touched=Date.now();
          send(ws,JSON.stringify({type:'welcome',seq:joined.player.receivedSeq||0}));
          send(ws,JSON.stringify({type:'state',state:view(joined.room)}));return;
        }
        if(!rooms.has(joined.room.code)) {ws.close(1000);return;}
        if(b.type==='ping') {action(joined.room,joined.index,'ping',b);send(ws,JSON.stringify({type:'pong',at:b.at}));}
        else if(b.type==='input')action(joined.room,joined.index,'input',b);
      } catch(e) {send(ws,JSON.stringify({type:'error',message:e.message}));if(!joined)ws.close(1008);}
    });
    ws.on('close',()=>{clearTimeout(timeout);joined?.room.sockets.delete(ws);});
  });
  server.on('close',()=>{clearInterval(timer);for(const ws of wss.clients)ws.terminate();wss.close();for(const r of rooms.values())r.streams.forEach(s=>s.end());});
  return async function handle(req,res,url) {
    try {
      if(req.method==='GET'&&url.pathname==='/api/duel/events') {
        const {room:r}=identify(Object.fromEntries(url.searchParams));
        res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive','X-Accel-Buffering':'no'});
        res.write(`data: ${JSON.stringify(view(r))}\n\n`);r.streams.add(res);req.on('close',()=>r.streams.delete(res));return;
      }
      if(req.method!=='POST')return reply(res,405,{error:'不支持的请求'});
      if(!validOrigin(req))return reply(res,403,{error:'来源不符'});
      let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>4096)throw Error('请求过大');}
      const b=JSON.parse(raw||'{}'),a=url.pathname.split('/').pop();
      if(a==='create'||a==='join') {
        let r;
        if(a==='create') {
          if(rooms.size>=200)throw Error('房间已满');
          let code;do{code=crypto.randomInt(100000,1000000).toString();}while(rooms.has(code));
          r={code,players:[],fighters:[],streams:new Set(),sockets:new Set(),phase:'waiting',effects:[],time:99,tick:0,touched:Date.now()};rooms.set(code,r);
        } else {r=rooms.get(String(b.code));if(!r)throw Error('房间不存在或已过期');}
        if(r.players.length>=2)throw Error('房间已满');
        const type=r.players.length?(r.players[0].type==='stick'?'cross':'stick'):(b.type==='cross'?'cross':'stick');
        const p={name:String(b.name||'无名侠客').trim().slice(0,16)||'无名侠客',type,token:crypto.randomBytes(24).toString('hex'),lastSeen:Date.now(),ready:false};
        r.players.push(p);r.fighters.push(fighter(type,r.players.length-1));r.touched=Date.now();broadcast(r);
        return reply(res,200,{code:r.code,token:p.token,index:r.players.length-1});
      }
      const {room,index}=identify(b);action(room,index,a,b);reply(res,200,{ok:true});
    }catch(e){if(!res.headersSent)reply(res,400,{error:e.message});}
  };
}
module.exports={install,step,reset,fighter,startAttack};

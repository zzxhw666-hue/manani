'use strict';
const $=id=>document.getElementById(id);
const canvas=$('arena'),predictor=new InkDuelPredictor();
const keyMap={KeyA:'left',KeyD:'right',KeyW:'jump',Space:'dash',KeyS:'block',KeyJ:'light',KeyU:'skill',KeyI:'special',KeyO:'ultimate'};
let auth=null,state=null,keys={},faction='stick',socket=null,stream=null,seq=0,rtt=0;
let receivedAt=0,lastUI=0,screen='',resultAt=0,renderer=null,sound=null,muted=false;
let generation=0,reconnectTimer=0,fallbackTimer=0,toastTimer=0,httpInputBusy=false,httpInputQueue=[],transport='connecting';
try{auth=JSON.parse(sessionStorage.getItem('ink-duel'));$('name').value=localStorage.getItem('ink-name')||'';muted=localStorage.getItem('ink-muted')==='1';}catch{}
$('code').value=new URLSearchParams(location.search).get('room')||'';
const text=(id,value)=>{const el=$(id);if(el.textContent!==value)el.textContent=value;};
function toast(message){clearTimeout(toastTimer);text('toast',message);$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,6000);}
function unlockSound(){if(!sound)sound=new (window.AudioContext||window.webkitAudioContext)();sound.resume().catch(()=>{});}
function hitSound(){if(!sound||muted)return;const osc=sound.createOscillator(),gain=sound.createGain();osc.type='triangle';osc.frequency.setValueAtTime(150,sound.currentTime);osc.frequency.exponentialRampToValueAtTime(40,sound.currentTime+.08);gain.gain.setValueAtTime(.10,sound.currentTime);gain.gain.exponentialRampToValueAtTime(.001,sound.currentTime+.10);osc.connect(gain).connect(sound.destination);osc.start();osc.stop(sound.currentTime+.11);}
async function request(action,body={}){
  const res=await fetch('/api/duel/'+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...auth,...body}),signal:AbortSignal.timeout(8000)});
  const data=await res.json();if(!res.ok)throw Error(data.error||'请求失败');return data;
}
async function command(button,action,body={}){button.disabled=true;try{await request(action,body);}catch(e){toast(e.name==='TimeoutError'?'连接超时，请重试':e.message);}finally{button.disabled=false;updateUI();}}
function showScreen(next){
  if(screen===next)return;screen=next;
  for(const name of ['lobby','room','battle'])$(name+'-screen').hidden=name!==next;
  $('site-header').hidden=next==='battle';document.body.classList.toggle('in-battle',next==='battle');
  if(next==='battle'){if(!renderer)renderer=new InkDuelRenderer(canvas,hitSound);canvas.focus({preventScroll:true});}
  else window.scrollTo(0,0);
}
function disconnect(){generation++;httpInputQueue=[];clearTimeout(reconnectTimer);clearTimeout(fallbackTimer);socket?.close();socket=null;stream?.close();stream=null;transport='connecting';}
function clearRoom(message){disconnect();for(const dialog of document.querySelectorAll('dialog[open]'))dialog.close();if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});auth=null;state=null;keys={};seq=0;predictor.reset();try{sessionStorage.removeItem('ink-duel');}catch{}showScreen('lobby');if(message)toast(message);}
function receive(next){
  if(!auth)return;
  const was=state;state=next;receivedAt=performance.now();
  if(was?.round!==next.round){keys={};predictor.reset();sendInput();}
  if(next.phase==='over'&&was?.phase!=='over')resultAt=performance.now();
  predictor.receive(next,receivedAt);updateUI();
}
function startFallback(gen){
  if(gen!==generation||!auth||transport==='ws'||stream)return;
  transport='fallback';stream=new EventSource('/api/duel/events?'+new URLSearchParams({code:auth.code,token:auth.token}));
  stream.onmessage=e=>{if(gen===generation&&transport!=='ws'){transport='fallback';receive(JSON.parse(e.data));}};
  stream.addEventListener('closed',e=>{if(gen===generation)clearRoom(JSON.parse(e.data).message);});
  stream.onerror=()=>{if(gen===generation)transport='reconnecting';};
  sendInput();
}
function connect(){
  disconnect();const gen=generation;transport='connecting';
  const dial=()=>{
    if(gen!==generation||!auth)return;
    const ws=new WebSocket((location.protocol==='https:'?'wss:':'ws:')+'//'+location.host+'/api/duel/socket');socket=ws;
    ws.onopen=()=>{if(gen===generation)ws.send(JSON.stringify({type:'auth',...auth}));};
    ws.onmessage=e=>{
      if(gen!==generation||ws!==socket)return;
      const msg=JSON.parse(e.data);
      if(msg.type==='welcome'){seq=Math.max(seq,msg.seq||0);transport='ws';clearTimeout(fallbackTimer);stream?.close();stream=null;sendInput();ws.send(JSON.stringify({type:'ping',at:performance.now()}));}
      if(msg.type==='state'){transport='ws';receive(msg.state);}
      if(msg.type==='pong'){const sample=performance.now()-msg.at;rtt=rtt?Math.round(rtt*.65+sample*.35):Math.round(sample);}
      if(msg.type==='closed')clearRoom(msg.message);
      if(msg.type==='error'){toast(msg.message);if(/凭证|身份/.test(msg.message))clearRoom(msg.message);}
    };
    ws.onerror=()=>{};
    ws.onclose=e=>{
      if(gen!==generation||ws!==socket)return;
      if(e.code===4001){clearRoom('这个席位已在其他页面连接');return;}
      transport='reconnecting';startFallback(gen);reconnectTimer=setTimeout(dial,2500);
    };
    clearTimeout(fallbackTimer);fallbackTimer=setTimeout(()=>startFallback(gen),1800);
  };
  dial();
}
function sendInput(){
  if(!auth)return;
  const at=performance.now(),command={seq:++seq,input:{...keys}};predictor.input(seq,keys,at);
  if(socket?.readyState===WebSocket.OPEN&&transport==='ws')socket.send(JSON.stringify({type:'input',...command}));
  else if(stream){httpInputQueue.push(command);if(httpInputQueue.length>32)httpInputQueue.splice(0,httpInputQueue.length-32);flushHttpInput();}
}
function flushHttpInput(){
  if(httpInputBusy||!auth||!httpInputQueue.length)return;
  if(transport==='ws'){httpInputQueue=[];return;}
  httpInputBusy=true;const gen=generation,command=httpInputQueue.shift();
  request('input',command).catch(e=>{if(gen===generation&&/凭证/.test(e.message))clearRoom(e.message);}).finally(()=>{httpInputBusy=false;flushHttpInput();});
}
function setKey(key,down){if(!!keys[key]===down)return;if(down)keys[key]=true;else delete keys[key];sendInput();}
function releaseKeys(){keys={};sendInput();}
setInterval(()=>{
  if(!auth)return;
  if(socket?.readyState===WebSocket.OPEN&&transport==='ws')socket.send(JSON.stringify({type:'ping',at:performance.now()}));
  sendInput();updateUI();
},500);
function canPlay(){return screen==='battle'&&state?.phase==='fight'&&!state.paused&&performance.now()-receivedAt<1500&&!document.querySelector('dialog[open]');}
window.addEventListener('keydown',e=>{const key=keyMap[e.code];if(!key||/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)||!canPlay())return;e.preventDefault();if(!e.repeat)setKey(key,true);});
window.addEventListener('keyup',e=>{if(keyMap[e.code])setKey(keyMap[e.code],false);});
window.addEventListener('blur',releaseKeys);document.addEventListener('visibilitychange',()=>{if(document.hidden)releaseKeys();});
window.addEventListener('pagehide',()=>{releaseKeys();socket?.close();stream?.close();});
for(const button of document.querySelectorAll('[data-faction]'))button.onclick=()=>{faction=button.dataset.faction;for(const b of document.querySelectorAll('[data-faction]')){b.classList.toggle('selected',b===button);b.setAttribute('aria-pressed',String(b===button));}};
async function enter(action,button){
  if(auth)return;button.disabled=true;
  try{const name=$('name').value.trim()||'无名侠客';auth=await request(action,{name,type:faction,code:$('code').value.trim()});try{sessionStorage.setItem('ink-duel',JSON.stringify(auth));localStorage.setItem('ink-name',name);}catch{}seq=0;state=null;showScreen('room');text('room-status','正在连接房间…');connect();}
  catch(e){toast(e.name==='TimeoutError'?'连接超时，请重试':e.message);}finally{button.disabled=false;}
}
$('create').onclick=()=>enter('create',$('create'));
$('join-form').onsubmit=e=>{e.preventDefault();enter('join',$('join'));};
$('dummy').onclick=()=>command($('dummy'),state?.training?'remove-dummy':'add-dummy');
for(const id of ['ready','rematch'])$(id).onclick=()=>{unlockSound();releaseKeys();command($(id),'ready');};
$('training-reset').onclick=()=>{releaseKeys();command($('training-reset'),'reset-training');};
$('back-room').onclick=()=>command($('back-room'),'lobby');
$('leave-room').onclick=async()=>{try{await request('leave');clearRoom();}catch(e){toast(e.message);}};
$('exit-battle').onclick=()=>{releaseKeys();$('exit-dialog').showModal();};
$('confirm-exit').onclick=async()=>{try{await request('leave');$('exit-dialog').close();clearRoom();}catch(e){toast(e.message);}};
$('copy').onclick=async()=>{const url=new URL('/duel.html',location.href);url.searchParams.set('room',auth.code);try{await navigator.clipboard.writeText(url.href);toast('邀请链接已复制');}catch{toast('邀请链接：'+url.href);}};
for(const button of document.querySelectorAll('[data-help]'))button.onclick=()=>{releaseKeys();$('help-dialog').showModal();};
for(const button of document.querySelectorAll('[data-close]'))button.onclick=()=>button.closest('dialog').close();
for(const dialog of document.querySelectorAll('dialog'))dialog.addEventListener('close',()=>{if(screen==='battle')canvas.focus({preventScroll:true});});
$('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('battle-screen').requestFullscreen();}catch{toast('当前浏览器不支持全屏，可放大窗口游玩');}};
function muteLabel(){text('mute',muted?'音效 关':'音效 开');$('mute').setAttribute('aria-pressed',String(muted));$('mute').setAttribute('aria-label',muted?'开启音效':'关闭音效');}
$('mute').onclick=()=>{muted=!muted;try{localStorage.setItem('ink-muted',String(muted));}catch{}unlockSound();muteLabel();};muteLabel();
for(const b of document.querySelectorAll('[data-move]')){
  b.onpointerdown=e=>{if(!canPlay())return;e.preventDefault();b.setPointerCapture(e.pointerId);setKey(b.dataset.move,true);};
  b.onlostpointercapture=b.onpointerup=b.onpointercancel=()=>setKey(b.dataset.move,false);
  b.onclick=e=>{if(e.detail===0&&canPlay()){setKey(b.dataset.move,true);setTimeout(()=>setKey(b.dataset.move,false),70);}};
}
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let seatsSignature='';
function updateUI(){
  if(!auth){showScreen('lobby');return;}
  if(!state){showScreen('room');$('ready').disabled=true;$('dummy').hidden=true;return;}
  const battle=['countdown','fight','over'].includes(state.phase),stale=performance.now()-receivedAt>1500;
  showScreen(battle?'battle':'room');
  text('room-title',state.training?'训练准备':state.players.length===2?'对手已入场':'等一位对手');
  text('room-code-label',state.code);text('battle-code','房间 '+state.code);
  const signature=JSON.stringify(state.players);if(signature!==seatsSignature){seatsSignature=signature;for(let i=0;i<2;i++){const p=state.players[i],el=$('seat-'+i);el.classList.toggle('empty',!p);el.innerHTML=p?`<div class="portrait">${p.type==='stick'?'○':'⊗'}</div><h2>${esc(p.name)}${i===auth.index?' · 你':''}</h2><p>${p.type==='stick'?'火柴人 · 疾风流':'叉叉怪 · 磐石流'}</p><span class="badge ${p.ready?'ready':''}">${!p.online?'连接中':p.ready?'已准备 ✓':'等待准备'}</span>`:'<div class="portrait">＋</div><h2>虚位以待</h2><p>邀请一位朋友<br>或添加训练假人</p>';}}
  const me=state.players[auth.index],canReady=['waiting','over'].includes(state.phase)&&!me?.ready&&!stale;
  $('ready').disabled=!canReady;$('rematch').disabled=!canReady;text('ready',me?.ready?'已准备 · 等待对手':'准备开战 →');text('rematch',me?.ready?'已准备 · 等待对手':'准备再战');
  $('dummy').hidden=auth.index!==0||(state.players.length===2&&!state.training);text('dummy',state.training?'移除训练假人':'添加训练假人');
  text('room-status',state.players.length===1?'把房间码分享给朋友，或添加假人独自练习。':me?.ready?'你已准备，等待对方准备。':'对手已入场，准备好就开始吧。');
  const quality=stale?'连接中断':transport==='ws'?`${Math.round(rtt)} ms`:transport==='fallback'?'兼容连接':'正在重连';text('network',quality);$('network').classList.toggle('warning',stale||rtt>120||transport!=='ws');
  $('reconnecting').hidden=!(battle&&(stale||state.paused));
  $('result').hidden=state.phase!=='over'||performance.now()-resultAt<700;
  if(state.phase==='over'){text('result-title',state.winner===-1?'势均力敌':state.winner===auth.index?'此战告捷':'下次再战');text('result-detail',state.winner===-1?'双方生命相同，本局平局。':`${state.players[state.winner]?.type==='stick'?'火柴人 · 疾风':'叉叉怪 · 磐石'} 赢得本局`);}
  $('training-reset').hidden=!state.training||auth.index!==0;
  const f=state.fighters[auth.index],names=f?.type==='cross'?['磐石四式','滚雷撞','震地波','崩山印']:['疾风四式','追风踢','升龙击','无影破'];
  document.querySelectorAll('[data-move]').forEach((b,i)=>{b.querySelector('span').textContent=i===0&&f.attack?.key==='light'?f.attack.name:names[i];if(i===0)b.querySelector('small').textContent=f.attack?.key==='light'?`${f.attack.chain}/4 · ${f.attack.chain===4?'终结段':f.attack.queued?'已衔接':'J 接下一段'}`:'四段连击';b.disabled=!canPlay()||f.energy<[0,22,30,100][i];b.classList.toggle('available',i===3&&f.energy>=100);});
  text('battle-hint',rtt>120?'网络延迟偏高，建议双方使用稳定网络，并选择较近的服务器。':state.training?'每按一次 J 衔接一段 · 训练不限时 · 重置可回满生命与气':'J 连按衔接四段攻击 · 冲刺有短暂无敌 · O 奥义可破防');
}
function frame(now){
  if(now-lastUI>100){lastUI=now;updateUI();}
  if(screen==='battle'&&state&&renderer)renderer.render(now,predictor.render(now,auth.index,rtt),auth.index,now-receivedAt>1500);
  requestAnimationFrame(frame);
}
showScreen('lobby');if(auth)connect();requestAnimationFrame(frame);

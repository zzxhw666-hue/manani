'use strict';
const $=id=>document.getElementById(id), canvas=$('arena'), ctx=canvas.getContext('2d');
let sound=null;
function unlockSound(){if(!sound) sound=new (window.AudioContext||window.webkitAudioContext)();sound.resume().catch(()=>{});}
function hitSound(){if(!sound)return;const osc=sound.createOscillator(),gain=sound.createGain();osc.type='triangle';osc.frequency.setValueAtTime(150,sound.currentTime);osc.frequency.exponentialRampToValueAtTime(40,sound.currentTime+.08);gain.gain.setValueAtTime(.10,sound.currentTime);gain.gain.exponentialRampToValueAtTime(.001,sound.currentTime+.10);osc.connect(gain).connect(sound.destination);osc.start();osc.stop(sound.currentTime+.11);}
let auth=null,state=null,stream=null,keys={},lastSnapshot=performance.now(),inflight=false,pending=false,ping=0;
const map={KeyA:'left',KeyD:'right',KeyW:'jump',Space:'dash',KeyS:'block',KeyJ:'light',KeyU:'skill',KeyI:'special',KeyO:'ultimate'};
try{auth=JSON.parse(sessionStorage.getItem('ink-duel'));}catch{}
$('code').value=new URLSearchParams(location.search).get('room')||'';
async function request(action,body={}){const t=performance.now();const r=await fetch('/api/duel/'+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...auth,...body})});const data=await r.json();ping=Math.round(performance.now()-t);if(!r.ok)throw Error(data.error);return data;}
function error(e){$('error').textContent=e.message;}
async function enter(action){try{$('error').textContent='';auth=await request(action,{name:$('name').value,type:$('faction').value,code:$('code').value.trim()});sessionStorage.setItem('ink-duel',JSON.stringify(auth));connect();}catch(e){error(e);}}
$('create').onclick=()=>enter('create');$('join').onclick=()=>enter('join');
$('ready').onclick=async()=>{try{unlockSound();await request('ready');}catch(e){error(e);}};
$('dummy').onclick=async()=>{try{$('error').textContent='';await request(state?.players.some(p=>p.dummy)?'remove-dummy':'add-dummy');}catch(e){error(e);}};
$('leave').onclick=async()=>{try{await request('leave');}catch{}clearRoom();};
function clearRoom(){stream?.close();stream=null;auth=null;state=null;keys={};sessionStorage.removeItem('ink-duel');$('entry').hidden=false;$('joined').hidden=true;$('copy').hidden=true;$('network').textContent='尚未入场';$('room-label').textContent='创建房间，邀请一位对手';$('status').textContent='等待入场';}
$('copy').onclick=async()=>{const u=new URL('/duel.html',location.href);u.searchParams.set('room',auth.code);try{await navigator.clipboard.writeText(u.href);$('status').textContent='邀请链接已复制';}catch{$('error').textContent='邀请链接：'+u.href;}};
function connect(){stream?.close();$('entry').hidden=true;$('joined').hidden=false;$('copy').hidden=false;$('room-label').textContent='房间 '+auth.code+' · 你是 '+(auth.index===0?'房主':'挑战者');stream=new EventSource('/api/duel/events?'+new URLSearchParams({code:auth.code,token:auth.token}));stream.onmessage=e=>{const oldPhase=state?.phase;state=JSON.parse(e.data);if(state.phase==='countdown'&&oldPhase!=='countdown')canvas.scrollIntoView({block:'center',behavior:'smooth'});lastSnapshot=performance.now();const hasDummy=state.players.some(p=>p.dummy);$('dummy').hidden=auth.index!==0||!['waiting','over'].includes(state.phase)||(state.players.length===2&&!hasDummy);$('dummy').textContent=hasDummy?'移除测试假人':'添加测试假人';$('dummy-hint').hidden=!hasDummy;$('players').textContent=state.players.map((p,i)=>`${i===auth.index?'你：':''}${p.name} · ${p.type==='stick'?'火柴人':'叉叉怪'}${p.ready?' ✓':''}`).join(' / ');$('network').textContent=state.paused?'连接中断 · 对局暂停':`● 已连接 · ${ping} ms`;$('ready').disabled=!['waiting','over'].includes(state.phase)||state.players[auth.index]?.ready;$('ready').textContent=state.phase==='over'?'准备再战':'准备开战';$('status').textContent=state.phase==='waiting'?'等待双方准备':state.phase==='countdown'?'即将开战':state.phase==='over'?'本局结束 · 双方准备可再战':state.paused?'等待对手重连':'对战进行中';};stream.onerror=()=>{$('network').textContent='连接中断 · 正在重连';};sendInput();}
async function sendInput(){if(!auth)return;if(inflight){pending=true;return;}inflight=true;try{await request('input',{input:keys});}catch(e){error(e);if(/凭证/.test(e.message))clearRoom();}finally{inflight=false;if(pending){pending=false;sendInput();}}}
window.addEventListener('keydown',e=>{if(/INPUT|SELECT/.test(e.target.tagName)||!auth||!map[e.code])return;e.preventDefault();if(!keys[map[e.code]]){keys[map[e.code]]=true;sendInput();}});
window.addEventListener('keyup',e=>{if(map[e.code]){delete keys[map[e.code]];sendInput();}});window.addEventListener('blur',()=>{keys={};sendInput();});document.addEventListener('visibilitychange',()=>{if(document.hidden){keys={};sendInput();}});setInterval(sendInput,450);if(auth)connect();
const renderer=new InkDuelRenderer(canvas,hitSound);
function render(now){renderer.render(now,state,auth?.index,!!state&&now-lastSnapshot>2500);requestAnimationFrame(render);}
requestAnimationFrame(render);

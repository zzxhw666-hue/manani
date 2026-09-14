// Run against an isolated test server (DATA_DIR=$(mktemp -d)); Chrome CDP and Node 22+ required.
// node tools/check-splendor-live.mjs http://localhost:4205 http://localhost:9224 /tmp/splendor-live.png
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),engine=require('../lib/splendor');
const [base='http://localhost:4205',cdp='http://localhost:9224',screenshot='/tmp/splendor-live.png']=process.argv.slice(2);
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function connect(url){
  const ws=new WebSocket(url);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
  let id=0;const pending=new Map(),errors=[];
  ws.onmessage=e=>{const d=JSON.parse(e.data);if(d.id){pending.get(d.id)?.(d);pending.delete(d.id);}else if(d.method==='Runtime.exceptionThrown')errors.push(d.params.exceptionDetails);};
  const send=(method,params={})=>new Promise((resolve,reject)=>{const key=++id,t=setTimeout(()=>reject(new Error('CDP timeout: '+method)),15000);pending.set(key,d=>{clearTimeout(t);d.error?reject(new Error(JSON.stringify(d.error))):resolve(d.result);});ws.send(JSON.stringify({id:key,method,params}));});
  const evalJS=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});assert.equal(r.exceptionDetails,undefined,JSON.stringify(r.exceptionDetails));return r.result.value;};
  const until=async expression=>{for(let i=0;i<100;i++){if(await evalJS(expression))return;await pause(120);}throw new Error('Timeout: '+expression);};
  return {send,evalJS,until,errors,close:()=>ws.close()};
}
const post=async(path,body)=>{const r=await(await fetch(base+'/api/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})).json();assert.equal(r.success,true,r.error);return r;};
const sessions=[],contexts=[],clients=[];let browser,roomCode;
const clickSelector=async(c,selector)=>{await c.until(`Boolean(document.querySelector(${JSON.stringify(selector)}))`);return c.evalJS(`document.querySelector(${JSON.stringify(selector)}).click()`);};
async function pick(c,query){
  await c.send('Page.bringToFront');
  // Headless macOS can defer compositor frames in isolated browser contexts.
  await c.send('Page.captureScreenshot',{format:'jpeg',quality:1});
  await c.until('window.SPLENDOR_UI.inspect()?.scene?.triangles>1000');
  await pause(80);
  const t=await c.evalJS(`window.SPLENDOR_UI.inspect().targets.find(t=>${query})`);assert.ok(t,'Raycast target exists: '+query);
  await c.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:t.x,y:t.y});
  await c.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,x:t.x,y:t.y});
  await c.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,x:t.x,y:t.y});
}
try{
  browser=await connect((await(await fetch(cdp+'/json/version')).json()).webSocketDebuggerUrl);
  for(let i=0;i<2;i++){
    const s=await post('session',{nickname:['小雨','老周'][i]+'验收'+Date.now().toString().slice(-5)});sessions.push(s);
    const {browserContextId}=await browser.send('Target.createBrowserContext');contexts.push(browserContextId);
    const {targetId}=await browser.send('Target.createTarget',{url:base,browserContextId});
    const pages=await(await fetch(cdp+'/json')).json();const c=await connect(pages.find(p=>p.id===targetId).webSocketDebuggerUrl);clients.push(c);
    await c.send('Runtime.enable');await c.send('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false});
    await c.until('Boolean(window.MANILA_API)');
    await c.evalJS(`localStorage.setItem('manila_session',${JSON.stringify(s.sessionToken)});localStorage.setItem('manila_player_id',${JSON.stringify(s.playerId)});localStorage.setItem('manila_nickname',${JSON.stringify(s.nickname)});location.reload()`);
    await c.until('Boolean(window.MANILA_API)&&window.MANILA_API.hasSession()');
  }
  const [a,b]=clients,[sa,sb]=sessions;
  roomCode=(await post('rooms/create',{sessionToken:sa.sessionToken,name:'3D自动验收'+Date.now(),gameMode:'splendor',maxPlayers:2,decisionSeconds:30})).code;
  await post('rooms/join',{sessionToken:sb.sessionToken,code:roomCode});
  await post('action',{sessionToken:sa.sessionToken,action:'start-game'});
  for(let i=0;i<2;i++){
    await clients[i].send('Page.bringToFront');
    await clients[i].until('document.querySelector("#game-root").dataset.ready === "true"');
    assert.equal(await clients[i].evalJS('window.SPLENDOR_UI.inspect().viewer'),sessions[i].playerId);
    assert.equal(await clients[i].evalJS('window.SPLENDOR_UI.inspect().scene.self'),sessions[i].playerId);
  }
  for(const color of ['white','blue','green'])await pick(a,`t.kind==='bank'&&t.name==='${color}'`);
  await clickSelector(a,'[data-take]');await b.until('!document.querySelector("[data-take]").disabled || document.querySelector("#game-root").dataset.turnOwner === '+JSON.stringify(sb.playerId));
  let state=(await post('rooms/state',{sessionToken:sa.sessionToken})).room;
  assert.equal(state.currentPlayerId,sb.playerId);assert.equal(state.players[0].tokens.blue,1);
  const reservedId=state.tiers[1].visible[0].id;
  await pick(b,`t.cardId===${JSON.stringify(reservedId)}`);await clickSelector(b,'[data-live-reserve]');
  await a.until('document.querySelector("#game-root").dataset.turnOwner === '+JSON.stringify(sa.playerId));
  state=(await post('rooms/state',{sessionToken:sa.sessionToken})).room;
  assert.equal(state.players[1].reservedCount,1);assert.equal(state.players[1].reserved,undefined);
  assert.ok(!(await a.evalJS('window.SPLENDOR_UI.inspect().scene.cards')).includes(reservedId));
  assert.ok((await b.evalJS('window.SPLENDOR_UI.inspect().scene.cards')).includes(reservedId));
  await pick(a,"t.kind==='bank'&&t.name==='black'");await clickSelector(a,'[data-double]');
  await b.until('document.querySelector("#game-root").dataset.turnOwner === '+JSON.stringify(sb.playerId));
  state=(await post('rooms/state',{sessionToken:sa.sessionToken})).room;assert.equal(state.players[0].tokens.black,2);
  await pick(b,"t.kind==='deck'&&t.tier===1");await clickSelector(b,'.spl-modal-mask [data-confirm]');
  await a.until('document.querySelector("#game-root").dataset.turnOwner === '+JSON.stringify(sa.playerId));
  state=(await post('rooms/state',{sessionToken:sa.sessionToken})).room;
  assert.equal(state.players[1].reservedCount,2);assert.equal(state.players[1].tokens.gold,2);
  const ownCard=state.tiers[2].visible[0].id;
  await pick(a,`t.cardId===${JSON.stringify(ownCard)}`);await clickSelector(a,'[data-live-reserve]');
  await b.until('document.querySelector("#game-root").dataset.turnOwner === '+JSON.stringify(sb.playerId));
  await a.send('Page.reload');await a.until('document.querySelector("#game-root").dataset.ready === "true"');
  assert.equal(await a.evalJS('window.SPLENDOR_UI.inspect().viewer'),sa.playerId);
  assert.ok((await a.evalJS('window.SPLENDOR_UI.inspect().scene.cards')).includes(ownCard));
  // Verify actual atlas crops, not merely distinct filenames or manifest indexes.
  const ids=Object.values(engine.CARD_POOL).flat().concat(engine.NOBLE_POOL).map(c=>c.id);
  const unique=await a.evalJS(`(async()=>{const ids=${JSON.stringify(ids)},images={},hashes=[];for(const id of ids){const art=SPLENDOR_ART.cardArt(id);if(!images[art.src]){const im=new Image();im.src=art.src;await im.decode();images[art.src]=im;}const im=images[art.src],canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;const ctx=canvas.getContext('2d');ctx.drawImage(im,art.column*im.width/art.columns,art.row*im.height/art.rows,im.width/art.columns,im.height/art.rows,0,0,64,64);hashes.push(canvas.toDataURL());}return new Set(hashes).size;})()`);
  assert.equal(unique,100);
  await pause(2600);const shot=await a.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(screenshot,Buffer.from(shot.data,'base64'));
  // Close only the room created by this script and check render lifecycle cleanup.
  await post('rooms/leave',{sessionToken:sa.sessionToken});roomCode=null;
  await a.until('!document.body.classList.contains("splendor-3d-active")');
  assert.equal(await a.evalJS('document.querySelectorAll(".live-scene canvas").length'),0);
  await a.evalJS('window.MANILA_API.logout()');

  const fixture=engine.createRoom({code:'UITEST',name:'受控界面验收',maxPlayers:4,decisionSeconds:30,host:{id:'self',nickname:'我的珠宝行'}});
  for(let i=1;i<4;i++)engine.addPlayer(fixture,{id:'other'+i,nickname:'对手'+i});engine.startGame(fixture,'self');
  fixture.decisionDeadlineAt=null;let turn=40;
  async function render(change=()=>{}){
    const r=engine.clone(fixture);r.turnNumber=++turn;r.version=turn;change(r);
    await a.evalJS(`window.__uiActions=[];window.__uiRoom=${JSON.stringify(engine.publicRoom(r,'self'))};window.__uiTools={show:MANILA_UI.show,toast:MANILA_UI.toast};SPLENDOR_UI.renderGame(window.__uiRoom,{id:'self'}, {act:async(action,payload)=>{window.__uiActions.push({action,payload});},chat:async()=>{},leave:()=>{}},window.__uiTools)`);
    await a.until('document.querySelector("#game-root").dataset.ready === "true"');return r;
  }
  await render(r=>{r.nobles=[];r.players[0].bonuses=Object.fromEntries(engine.COLORS.map(c=>[c,20]));});
  await pick(a,"t.kind==='card'&&!t.reserved");await clickSelector(a,'[data-live-buy]');
  assert.equal((await a.evalJS('__uiActions'))[0].action,'splendor-buy');
  await render(r=>{r.nobles=[];r.players[0].tokens.white=9;r.players[0].tokens.blue=1;});
  for(const color of ['white','blue','green'])await pick(a,`t.kind==='bank'&&t.name==='${color}'`);
  await clickSelector(a,'[data-take]');
  await a.until('Boolean(document.querySelector("[data-return]"))');
  await clickSelector(a,'.spl-modal-mask [data-confirm]');assert.equal((await a.evalJS('__uiActions')).length,0,'Incorrect return total cannot submit');
  await a.evalJS('document.querySelector("[data-return=white]").value="3"');await clickSelector(a,'.spl-modal-mask [data-confirm]');
  assert.equal((await a.evalJS('__uiActions'))[0].payload.returns.white,3);
  const nobleRoom=await render(r=>{r.players[0].bonuses=Object.fromEntries(engine.COLORS.map(c=>[c,4]));});
  for(const color of ['white','blue','green'])await pick(a,`t.kind==='bank'&&t.name==='${color}'`);
  await clickSelector(a,'[data-take]');await a.until('document.querySelectorAll("input[name=noble]").length>1');
  await a.evalJS('document.querySelectorAll("input[name=noble]")[1].checked=true');await clickSelector(a,'.spl-modal-mask [data-confirm]');
  assert.equal((await a.evalJS('__uiActions'))[0].payload.nobleId,nobleRoom.nobles[1].id);
  await render(r=>{r.currentPlayerId='other1';});await pick(a,"t.kind==='card'");
  assert.equal(await a.evalJS('document.querySelector("[data-live-buy]").disabled'),true);
  // A real turn change invalidates an open card dialog and selected gems.
  await render();assert.equal(await a.evalJS('document.querySelectorAll(".spl-modal-mask").length'),0);
  for(const [width,height] of [[1440,900],[1280,800]]){
    await a.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await pause(250);
    const targets=await a.evalJS('SPLENDOR_UI.inspect().targets');
    assert.ok(targets.every(t=>t.x>0&&t.x<width&&t.y>145&&t.y<height),'All tabletop controls remain in the viewport');
  }
  await a.send('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false});
  await clickSelector(a,'[data-flat]');assert.equal(await a.evalJS('document.body.classList.contains("splendor-3d-active")'),false);
  assert.ok(await a.evalJS('document.querySelector(".spl-card-art").style.backgroundImage.includes("development-")'));
  await a.evalJS('[...document.querySelectorAll("#game-header button")].find(b=>b.textContent==="重试 3D").click()');
  await a.until('document.querySelector("#game-root").dataset.ready === "true"');
  await render(r=>{r.status='finished';r.currentPlayerId=null;r.scores=[{pid:'self',nickname:'我的珠宝行',points:16,cards:8},{pid:'other1',nickname:'对手1',points:12,cards:9}];r.winners=['self'];});
  assert.ok(await a.evalJS('document.querySelector(".spl-finish").textContent.includes("获胜")'));
  await a.evalJS('MANILA_UI.show("lobby")');assert.equal(await a.evalJS('document.querySelectorAll(".live-scene canvas").length'),0);
  for(const c of clients)assert.deepEqual(c.errors,[]);
  console.log(JSON.stringify({passed:true,base,artworks:100,realSessions:2,checks:['SSE self perspective','take different','take same','reserve visible','reserve blind','private cards','reload','purchase UI','exact returns','noble choice','turn guards','3 viewport sizes','fallback/retry','final scores','renderer disposal']}));
}catch(error){
  for(let i=0;i<clients.length;i++){
    console.error('Browser',i,await clients[i].evalJS('JSON.stringify({errors:document.querySelector("#toast-root").textContent,screen:MANILA_UI.currentScreen(),text:document.querySelector("#game-root").textContent.slice(0,400),inspect:SPLENDOR_UI.inspect()?.scene})').catch(()=>''),clients[i].errors);
    const shot=await clients[i].send('Page.captureScreenshot',{format:'png'}).catch(()=>null);if(shot)fs.writeFileSync('/tmp/splendor-failure-'+i+'.png',Buffer.from(shot.data,'base64'));
  }
  throw error;
}finally{
  if(roomCode&&sessions[0])await post('rooms/leave',{sessionToken:sessions[0].sessionToken}).catch(()=>{});
  for(const c of clients)c.close();
  if(browser){for(const browserContextId of contexts)await browser.send('Target.disposeBrowserContext',{browserContextId}).catch(()=>{});browser.close();}
}

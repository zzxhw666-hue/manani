// Browser acceptance check. Requires Node 22+ and an existing Chrome CDP session.
// node tools/check-splendor-demo.mjs http://localhost:4203 http://localhost:9224 /tmp/splendor-preview.png
import assert from 'node:assert/strict';
import fs from 'node:fs';
const [base='http://localhost:4203',cdp='http://localhost:9224',screenshot]=process.argv.slice(2);
const pages=await(await fetch(cdp+'/json')).json();
const page=pages.find(p=>p.type==='page');
assert.ok(page,'Open a Chrome page with remote debugging enabled');
const ws=new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
let id=0;const pending=new Map(),errors=[];
ws.onmessage=e=>{
  const data=JSON.parse(e.data);
  if(data.id){pending.get(data.id)?.(data);pending.delete(data.id);}
  else if(data.method==='Runtime.exceptionThrown')errors.push(data.params.exceptionDetails);
  else if(data.method==='Log.entryAdded'&&data.params.entry.level==='error')errors.push(data.params.entry);
};
const send=(method,params={})=>new Promise((resolve,reject)=>{
  const key=++id;
  const timeout=setTimeout(()=>{pending.delete(key);reject(new Error('CDP timeout: '+method));},15000);
  pending.set(key,data=>{clearTimeout(timeout);data.error?reject(new Error(JSON.stringify(data.error))):resolve(data.result);});
  ws.send(JSON.stringify({id:key,method,params}));
});
const evaluate=async expression=>{
  const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  assert.equal(result.exceptionDetails,undefined,JSON.stringify(result.exceptionDetails));
  return result.result.value;
};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(expression){
  for(let attempt=0;attempt<80;attempt++){if(await evaluate(expression))return;await pause(150);}
  throw new Error('Timed out: '+expression);
}
async function click(x,y){
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x,y});
  await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,x,y});
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,x,y});
}
try{
  await send('Runtime.enable');await send('Log.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:base+'/splendor-3d-demo.html'});
  await until('Boolean(window.splendorDemo)');
  const reservations={lin:['green'],zhou:['blue','white'],kai:[],an:['red']};
  for(const [seat,reserved] of Object.entries(reservations)){
    await evaluate(`document.querySelector('#seat-select').value=${JSON.stringify(seat)};document.querySelector('#seat-select').dispatchEvent(new Event('change'))`);
    await pause(180);
    const state=await evaluate('window.splendorDemo.snapshot()');
    assert.equal(state.self,seat);assert.deepEqual(state.reserved,reserved);
    assert.equal(state.opponents.length,3);assert.ok(!state.opponents.includes(seat));
    const ui=await evaluate(`({self:document.querySelector('#self-accessible').dataset.playerId,opponents:[...document.querySelectorAll('#opponents article')].map(p=>p.dataset.playerId)})`);
    assert.equal(ui.self,seat);assert.deepEqual(ui.opponents,state.opponents);
    assert.ok(state.triangles>0,'WebGL rendered visible geometry');
  }
  const target=await evaluate('window.splendorDemo.targets().find(t=>t.kind==="bank"&&t.name==="blue")');
  await click(target.x,target.y);
  await until('window.splendorDemo.snapshot().selected === "蓝宝石"');
  const button=await evaluate('(()=>{const r=document.querySelector("#confirm-demo").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()');
  await click(button.x,button.y);
  await until('document.querySelector("#selection-copy").textContent.includes("动画完成")');
  // Changing seats clears transient selections and the private foreground.
  await evaluate('document.querySelector("#seat-select").value="kai";document.querySelector("#seat-select").dispatchEvent(new Event("change"))');
  assert.equal(await evaluate('window.splendorDemo.snapshot().selected'),null);
  assert.deepEqual(await evaluate('window.splendorDemo.snapshot().reserved'),[]);
  for(const [width,height] of [[1440,900],[1280,800]]){
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await pause(300);
    const targets=await evaluate('window.splendorDemo.targets()');
    for(const t of targets)assert.ok(t.x>0&&t.x<width&&t.y>150&&t.y<height,`Visible target at ${width}: ${t.label}`);
    assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'),false);
  }
  await send('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:base+'/splendor-3d-demo.html?seat=invalid'});
  await until('Boolean(window.splendorDemo)');
  assert.equal(await evaluate('window.splendorDemo.snapshot().self'),'lin');
  await pause(500);
  assert.deepEqual(errors,[],'No JavaScript or browser resource errors');
  if(screenshot){const result=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(screenshot,Buffer.from(result.data,'base64'));}
  console.log(JSON.stringify({base,passed:true,seats:4,viewports:3,checks:['self perspective','reserved faces','opponent ordering','WebGL rendering','raycast selection','take animation','selection reset','viewport bounds','unknown-seat fallback','browser errors']}));
}finally{ws.close();}

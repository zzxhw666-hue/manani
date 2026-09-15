const test = require('node:test');
const assert = require('node:assert/strict');
const game = require('../lib/game');
const model = import('../public/js/manila-table-state.mjs');

function fixture() {
  const room=game.createRoom({code:'LIVE01',name:'3D 验收',maxPlayers:3,host:{id:'p1',nickname:'甲商人'}});
  for(let i=2;i<=3;i++)game.addPlayer(room,{id:'p'+i,nickname:'商人'+i});
  game.dispatch(room,'p1','start-game',{},()=>.42);
  game.dispatch(room,'p1','bid',{amount:1});
  while(room.phase==='auction')game.dispatch(room,room.currentPlayerId,'pass-auction');
  game.dispatch(room,'p1','harbor-setup',{wares:['ginseng','nutmeg','jade'],starts:{ginseng:3,nutmeg:3,jade:3}});
  return room;
}
test('3D 船位来自服务端：负点位、13、抵港和船厂均明确区分',async()=>{
  const {tableState,positionText,shipScale}=await model,room=fixture();
  room.boats[0].position=-1;room.boats[1].position=13;room.boats[2].status='port';room.boats[2].dock='B';
  const view=tableState(game.publicRoom(room,'p1'),'p1');
  assert.equal(view.boats[0].text,'外海 · -1');assert.equal(view.boats[1].text,'航道 13 · 海盗点');
  assert.equal(view.boats[2].text,'已抵港 · B');assert.equal(positionText({status:'shipyard',dock:'C'}),'修船厂 · C');
  assert.ok(shipScale<=.75);
  assert.ok(view.slots.filter(s=>s.x!=null).every(s=>Math.hypot(s.x-view.boats[2].x,s.z-view.boats[2].z)>.9),'停泊船不覆盖圆形放置位');
});
test('3D 与服务端可放置位置一致，按真实船员颜色并仅开放下一席',async()=>{
  const {tableState}=await model,room=fixture();
  game.dispatch(room,'p1','place',{location:'boat:jade'});
  const pid=room.currentPlayerId,view=tableState(game.publicRoom(room,pid),pid);
  assert.deepEqual([...new Set(view.slots.filter(s=>s.canPlace).map(s=>s.location))].sort(),game.legalLocations(room).map(s=>s.id).sort());
  const jade=view.boats.find(b=>b.ware==='jade');
  assert.equal(jade.capacity,4);assert.equal(jade.seats[0].owner.color,room.players[0].color);
  assert.equal(jade.seats[0].canPlace,false);assert.equal(jade.seats[1].canPlace,true);assert.equal(jade.seats[2].canPlace,false);
  assert.equal(view.slots.length,21); // 3 + 3 + 4 ship seats, 6 docks, 5 special seats.
  assert.ok(tableState(game.publicRoom(room,'p1'),'p1').slots.every(s=>!s.canPlace),'不能在他人回合放置');
});
test('3D 投影不泄露股票，不修改房间，刷新与新航程不会沿用旧船员',async()=>{
  const {tableState}=await model,room=fixture(),before=JSON.stringify(room);
  const view=tableState(game.publicRoom(room,'p1'),'p1');
  assert.equal(JSON.stringify(room),before);assert.doesNotMatch(JSON.stringify(view),/shares|mortgaged/);
  game.dispatch(room,'p1','place',{location:'pilot:large'});
  const updated=tableState(game.publicRoom(room,'p1'),'p1');
  assert.equal(updated.slots.find(s=>s.key==='pilot:large').owner.id,'p1');
  assert.equal(view.slots.find(s=>s.key==='pilot:large').owner,null);
  const fresh=tableState(game.publicRoom(fixture(),'p1'),'p1');
  assert.ok(fresh.slots.every(s=>s.owner===null));
});
test('完整托管对局中每位玩家的 3D 状态始终跟随权威船位与所有权',async()=>{
  const {tableState}=await model,room=fixture();let seed=7301,steps=0;const phases=new Set();
  const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  while(room.status!=='finished'&&steps++<1800){
    phases.add(room.phase);
    for(const player of room.players){
      const view=tableState(game.publicRoom(room,player.id),player.id);
      assert.deepEqual(view.boats.map(b=>[b.ware,b.position,b.status,b.dock]),room.boats.map(b=>[b.ware,b.position,b.status,b.dock]));
      for(const b of view.boats)assert.deepEqual(b.crew.map(p=>p.id),room.boats.find(r=>r.ware===b.ware).crew.map(t=>t.pid));
      if(player.id!==room.currentPlayerId||room.phase!=='placement')assert.ok(view.slots.every(s=>!s.canPlace));
    }
    room.lockedUntil=0; // Advance past the visual-event wait in this engine-only test.
    game.runTimeoutTurn(room,random);
  }
  assert.equal(room.status,'finished');
  for(const phase of ['placement','dice','move','settlement_review'])assert.ok(phases.has(phase),phase);
});

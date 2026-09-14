const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const engine=require('../lib/splendor');
const {cardArt}=require('../public/js/splendor-art');
const source=fs.readFileSync(path.join(__dirname,'../public/js/splendor-table-state.js'),'utf8');
const adapter=import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
function jpegSize(buffer){
  assert.equal(buffer.readUInt16BE(0),0xffd8);
  for(let offset=2;offset+9<buffer.length;){
    const marker=buffer.readUInt16BE(offset),length=buffer.readUInt16BE(offset+2);
    if(marker===0xffc0||marker===0xffc2)return {width:buffer.readUInt16BE(offset+7),height:buffer.readUInt16BE(offset+5)};
    assert.ok(length>=2,'JPEG segment is valid');offset+=2+length;
  }
  throw new Error('JPEG dimensions not found');
}

test('90 张发展卡及 10 张贵族各自绑定不同插画，洗牌不改变绑定',()=>{
  const cards=Object.values(engine.CARD_POOL).flat().concat(engine.NOBLE_POOL);
  assert.equal(cards.length,100);
  const assignments=cards.map(c=>cardArt(c.id));
  assert.equal(new Set(assignments.map(a=>[a.src,a.column,a.row].join(':'))).size,100);
  assert.equal(new Set(assignments.map(a=>a.title)).size,100);
  for(const c of [...cards].reverse())assert.deepEqual(cardArt(c.id),assignments.find(a=>a.id===c.id));
  for(const a of assignments){
    const buffer=fs.readFileSync(path.join(__dirname,'../public',a.src));
    const {width,height}=jpegSize(buffer);
    assert.ok(width/a.columns>=250&&height/a.rows>=250,'每张插画拥有足够的源像素');
    assert.ok(Math.abs(width/height-a.columns/a.rows)<.03,'图集采用规则网格');
  }
});

test('无效牌 ID 不能通过取模悄悄重复其他卡面',()=>{
  for(const id of ['s1-white-0','s1-white-9','s2-red-7','s3-blue-5','noble-11','missing'])assert.throws(()=>cardArt(id),RangeError);
});

test('正式 2–4 人房间中，每位会话的资源与预留牌只属于自己',async()=>{
  const {toTableState}=await adapter;
  for(const count of [2,3,4]){
    const room=engine.createRoom({code:'VIEW'+count,name:'视角测试',maxPlayers:count,decisionSeconds:30,host:{id:'p0',nickname:'甲'}});
    for(let i=1;i<count;i++)engine.addPlayer(room,{id:'p'+i,nickname:'玩家'+i});
    engine.startGame(room,'p0');
    room.players.forEach((p,i)=>{p.reserved=[engine.CARD_POOL[1][i]];p.tokens.blue=i;p.points=i+2;});
    for(let i=0;i<count;i++){
      const view=toTableState(engine.publicRoom(room,'p'+i),'p'+i);
      assert.equal(view.self.id,'p'+i);assert.equal(view.self.tokens[1],i);assert.equal(view.self.score,i+2);
      assert.deepEqual(view.self.reserved,[engine.CARD_POOL[1][i]]);
      assert.equal(view.opponents.length,count-1);
      assert.equal(view.opponents[0].id,'p'+((i+1)%count));
      assert.ok(view.opponents.every(p=>p.id!==view.self.id&&!Object.hasOwn(p,'reserved')));
      assert.equal(view.nobles.length,count+1);
    }
    assert.throws(()=>toTableState(engine.publicRoom(room,'p0'),'not-a-player'),RangeError);
  }
});

test('界面支付预览正确应用永久折扣及黄金补足',async()=>{
  const {buyPayment}=await adapter;
  const player={bonuses:{white:2,blue:1},tokens:{white:1,blue:1,gold:2}};
  const card={cost:{white:4,blue:3}};
  assert.deepEqual(buyPayment(player,card),{payment:{white:1,blue:1,green:0,red:0,black:0,gold:2},affordable:true});
  assert.equal(buyPayment({...player,tokens:{...player.tokens,gold:1}},card).affordable,false);
  assert.equal(buyPayment({...player,bonuses:{white:4,blue:3}},card).payment.gold,0);
});

// Read-only projection of the server's public room. No dice or decisions here.
export const cargo = {
  ginseng: { name:'人参', pool:18, costs:[1,2,3], sail:'#d6bc83' },
  nutmeg: { name:'肉豆蔻', pool:24, costs:[2,3,4], sail:'#a3613e' },
  silk: { name:'丝绸', pool:30, costs:[3,4,5], sail:'#23569a' },
  jade: { name:'翡翠', pool:36, costs:[3,4,5,5], sail:'#267958' }
};
export const laneZ = [-3.95,-1.27,1.41];
export const shipScale = .70;
export function positionText(boat) {
  if(boat.status==='port')return '已抵港 · '+boat.dock;
  if(boat.status==='shipyard')return '修船厂 · '+boat.dock;
  if(boat.position<0)return '外海 · '+boat.position;
  return '航道 '+boat.position+(boat.position===13?' · 海盗点':'');
}
export function tableState(room,viewerId) {
  const owner=t=>{const p=room.players.find(p=>p.id===t?.pid);return p?{id:p.id,name:p.nickname,color:p.color}:null;};
  const self=room.players.find(p=>p.id===viewerId);
  const active=room.phase==='placement'&&room.currentPlayerId===viewerId&&self?.pawnsAvailable>0&&!self.stoppedPlacing;
  const slots=[];
  const add=(key,location,label,cost,token,available,extra={})=>{
    const seat={key,location,label,cost,owner:owner(token),available:!!available,...extra};slots.push(seat);return seat;
  };
  const boats=room.boats.map((b,lane)=>{
    const ware=cargo[b.ware],text=positionText(b);
    // Arrivals occupy a distinct berth, never cover the port/shipyard pawn seats.
    const docked=b.status!=='sea';
    const boat={ware:b.ware,name:ware.name,lane,status:b.status,position:b.position,dock:b.dock,text,
      x:docked?3.9:-7.75+Math.max(-1,Math.min(13,b.position))*.78,
      z:laneZ[lane]-(docked?1.0:.20),crew:b.crew.map(owner),capacity:ware.costs.length,
      detail:ware.name+'船 · '+text+' · 船员 '+b.crew.length+'/'+ware.costs.length+' · '+(docked?'已结束航行':Math.max(0,14-b.position)+' 格后正常抵港')};
    boat.seats=ware.costs.map((cost,i)=>add('boat:'+b.ware+':'+i,'boat:'+b.ware,ware.name+'船 · 船员位 '+(i+1),cost,b.crew[i],!docked&&i===b.crew.length,{ware:b.ware,index:i}));
    return boat;
  });
  for(const area of ['port','shipyard'])['A','B','C'].forEach((letter,i)=>add(area+':'+letter,area+':'+letter,(area==='port'?'港口':'修船厂')+' '+letter,[4,3,2][i],room.placements[area][letter],!room.placements[area][letter],{x:area==='port'?3.3:4.62,z:laneZ[i]+.20,reward:[6,8,15][i],landed:room.docks[area][letter]}));
  add('pirate:captain','pirate','海盗船长',5,room.placements.pirates[0],room.placements.pirates.length===0,{x:-7.59,z:3.12});
  add('pirate:crew','pirate','海盗船员',5,room.placements.pirates[1],room.placements.pirates.length===1,{x:-6.12,z:3.12});
  for(const [kind,x,cost] of [['large',-2.75,5],['small',-1.30,2]])add('pilot:'+kind,'pilot:'+kind,kind==='large'?'大领航员':'小领航员',cost,room.placements.pilots[kind],!room.placements.pilots[kind],{x,z:3.12});
  add('insurance','insurance','保险员',0,room.placements.insurance,!room.placements.insurance,{x:3.35,z:3.12});
  const funds=self?self.cash+Object.keys(cargo).reduce((n,w)=>n+((self.shares?.[w]||0)-(self.mortgaged?.[w]||0))*12,0):0;
  const minCost=Math.min(...slots.filter(s=>s.available).map(s=>s.cost));
  for(const s of slots){
    s.canPlace=!!(active&&s.available&&(funds>=s.cost||funds<minCost));
    s.reason = s.owner ? s.owner.name+' 已占用此位置'
      : !s.available ? (s.ware&&boats.find(b=>b.ware===s.ware).status!=='sea'?'本船已结束航行，不能再派遣':'请按顺序选择下一个空位')
      : room.phase!=='placement' ? '当前不是派遣阶段'
      : room.currentPlayerId!==viewerId ? '当前轮到 '+(room.players.find(p=>p.id===room.currentPlayerId)?.nickname||'其他玩家')+' 派遣'
      : self?.stoppedPlacing ? '你已停止本航程后续放置，请等待下一航程'
      : !(self?.pawnsAvailable>0) ? '本航程已没有可用帮手'
      : !s.canPlace ? '此位费用 '+s.cost+'₱，现金与可贷款额度合计 '+funds+'₱'
      : '';
    s.detail=s.label+' · '+(s.owner?s.owner.name+' 已占用':s.cost?'费用 '+s.cost+'₱':'立即领取 10₱')+(s.reward?' · 回报 '+s.reward+'₱':'');
  }
  return {code:room.code,round:room.round,boats,slots,phase:room.phase};
}

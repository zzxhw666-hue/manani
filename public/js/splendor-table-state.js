const colors=['white','blue','green','red','black'];
export function toTableState(room, viewerId) {
  const seat=room.players.findIndex(p=>p.id===viewerId);
  if(seat<0)throw new RangeError('当前会话不属于这张桌子');
  const player=room.players[seat];
  const self={id:player.id,name:player.nickname,score:player.points,
    tokens:[...colors,'gold'].map(c=>Number(player.tokens[c]||0)),
    bonuses:colors.map(c=>Number(player.bonuses[c]||0)),
    reserved:structuredClone(player.reserved||[])};
  const opponents=Array.from({length:room.players.length-1},(_,i)=>{
    const p=room.players[(seat+i+1)%room.players.length];
    return {id:p.id,name:p.nickname,score:p.points,tokens:{...p.tokens},bonuses:{...p.bonuses},reservedCount:p.reservedCount,isBot:p.isBot};
  });
  return {self,opponents,bank:{...room.bank},tiers:structuredClone(room.tiers),deckCounts:{...room.deckCounts},nobles:structuredClone(room.nobles)};
}

export function buyPayment(player,card) {
  const payment={gold:0};
  for(const color of colors){
    const need=Math.max(0,(card.cost[color]||0)-(player.bonuses[color]||0));
    payment[color]=Math.min(need,player.tokens[color]||0);
    payment.gold+=need-payment[color];
  }
  return {payment,affordable:payment.gold<=(player.tokens.gold||0)};
}

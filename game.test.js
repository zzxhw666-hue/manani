'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createRoom,
  addPlayer,
  addBot,
  removeBot,
  dispatch,
  runBotTurn,
  runTimeoutTurn,
  MARKET_TRACK,
} = require('../lib/game');

function constant(value) { return () => value; }
function sequence(values) {
  let index = 0;
  return () => values[index++] ?? values[values.length - 1] ?? 0;
}

function makeRoom(count = 3) {
  const room = createRoom({ code: 'ABC234', name: '测试航运局', maxPlayers: count, host: { id: 'p1', nickname: '甲商人' } });
  for (let i = 2; i <= count; i += 1) addPlayer(room, { id: `p${i}`, nickname: `${'甲乙丙丁戊'[i - 1]}商人` });
  dispatch(room, 'p1', 'start-game', {}, constant(0.42));
  return room;
}

function winAuctionAndSetup(room, starts = { ginseng: 3, nutmeg: 3, jade: 3 }) {
  dispatch(room, 'p1', 'bid', { amount: 1 });
  while (room.phase === 'auction') dispatch(room, room.currentPlayerId, 'pass-auction');
  assert.equal(room.harborMasterId, 'p1');
  dispatch(room, 'p1', 'harbor-setup', { wares: ['ginseng', 'nutmeg', 'jade'], starts, buyWare: null });
}

function stopAllCurrentPlacements(room) {
  while (room.phase === 'placement') dispatch(room, room.currentPlayerId, 'pass-placement');
}

function rollAndMove(room, random, order = ['ginseng', 'nutmeg', 'jade']) {
  dispatch(room, 'p1', 'roll', {}, random);
  for (const ware of order) {
    if (room.phase === 'move' && room.pendingMoves.includes(ware)) dispatch(room, 'p1', 'move', { ware });
  }
}

function confirmCurrentSettlement(room) {
  assert.equal(room.phase, 'settlement_review');
  const confirmerId = room.settlement.confirmerId;
  dispatch(room, confirmerId, 'confirm-settlement');
}

test('3 人局使用 4 名帮手，并在第一次掷骰前完成两轮放置', () => {
  const room = makeRoom(3);
  for (const player of room.players) assert.equal(player.pawnsTotal, 4);
  winAuctionAndSetup(room);
  assert.equal(room.phase, 'placement');
  assert.equal(room.placementRound, 1);
  stopAllCurrentPlacements(room);
  assert.equal(room.phase, 'dice');
  assert.equal(room.movementRound, 1);
  assert.equal(room.placementRound, 2);
});

test('房主可手动增删人机，人机会自动完成竞拍、布船与自己的派遣回合', () => {
  const room = createRoom({ code: 'BOT234', name: '人机测试局', maxPlayers: 3, host: { id: 'p1', nickname: '真人房主' } });
  addBot(room, 'p1');
  addBot(room, 'p1');
  assert.equal(room.players.filter((player) => player.isBot).length, 2);

  const removedId = room.players.find((player) => player.isBot).id;
  removeBot(room, 'p1', removedId);
  assert.equal(room.players.length, 2);
  addBot(room, 'p1');

  dispatch(room, 'p1', 'start-game', {}, constant(0.42));
  dispatch(room, 'p1', 'pass-auction');
  let botSteps = 0;
  while (botSteps < 60) {
    room.lockedUntil = 0;
    const result = runBotTurn(room, constant(0.6));
    if (!result.acted) break;
    botSteps += 1;
  }
  assert.ok(botSteps > 2);
  assert.equal(room.phase, 'placement');
  assert.equal(room.currentPlayerId, 'p1');
  assert.equal(room.boats.length, 3);
});

test('决策超时后系统随机执行合法动作，并能连续推进到下一航程', () => {
  const room = createRoom({ code: 'TIME23', name: '限时决策局', maxPlayers: 3, decisionSeconds: 10, host: { id: 'p1', nickname: '甲商人' } });
  addPlayer(room, { id: 'p2', nickname: '乙商人' });
  addPlayer(room, { id: 'p3', nickname: '丙商人' });
  dispatch(room, 'p1', 'start-game', {}, constant(0.42));
  assert.equal(room.decisionSeconds, 10);

  let steps = 0;
  while (room.round < 2 && steps < 100) {
    room.lockedUntil = 0;
    const result = runTimeoutTurn(room, constant(0));
    assert.equal(result.acted, true, `超时动作应能处理阶段 ${room.phase}`);
    steps += 1;
  }

  assert.equal(room.round, 2);
  assert.equal(room.phase, 'auction');
  assert.ok(room.logs.some((entry) => /决策超时，系统已随机代为行动/.test(entry.text)));
});

test('港务长依次移船决定同轮抵港的 A/B/C 停靠顺序，抵港货物全部涨价', () => {
  const room = makeRoom(3);
  winAuctionAndSetup(room);
  stopAllCurrentPlacements(room);

  rollAndMove(room, constant(0.99), ['jade', 'nutmeg', 'ginseng']);
  assert.equal(room.phase, 'dice');
  assert.equal(room.movementRound, 2);
  rollAndMove(room, constant(0.99), ['jade', 'nutmeg', 'ginseng']);

  assert.equal(room.docks.port.A, 'jade');
  assert.equal(room.docks.port.B, 'nutmeg');
  assert.equal(room.docks.port.C, 'ginseng');
  rollAndMove(room, constant(0.99)); // 无在途船，完成第三次移动并结算
  assert.equal(room.round, 1);
  assert.equal(room.phase, 'settlement_review');
  assert.equal(MARKET_TRACK[room.market.jade], 5);
  assert.equal(MARKET_TRACK[room.market.nutmeg], 5);
  assert.equal(MARKET_TRACK[room.market.ginseng], 5);
  confirmCurrentSettlement(room);
  assert.equal(room.round, 2);
  assert.equal(room.phase, 'auction');
});

test('第二轮停在 13 的海盗可一人登船、一人留守；第三轮留守海盗抢船并决定去船厂', () => {
  const room = makeRoom(3);
  winAuctionAndSetup(room, { ginseng: 5, nutmeg: 4, jade: 0 });

  dispatch(room, 'p1', 'place', { location: 'pirate' });
  dispatch(room, 'p2', 'pass-placement');
  dispatch(room, 'p3', 'pass-placement');
  assert.equal(room.placementRound, 2);
  dispatch(room, 'p1', 'place', { location: 'pirate' });
  assert.equal(room.phase, 'dice');

  rollAndMove(room, sequence([0.2, 0.2, 0.99])); // +2, +2, +6 => 7,6,6
  dispatch(room, 'p1', 'place', { location: 'port:A' });
  rollAndMove(room, constant(0.99)); // +6 => 13,12,12
  assert.equal(room.phase, 'pirate_board');
  dispatch(room, 'p1', 'pirate-board', { ware: 'ginseng' });
  dispatch(room, 'p1', 'pirate-board', { ware: null });
  assert.equal(room.placements.pirates.length, 1);
  assert.equal(room.boats.find((b) => b.ware === 'ginseng').crew.length, 1);

  dispatch(room, 'p1', 'place', { location: 'port:B' });
  assert.equal(room.phase, 'dice');
  rollAndMove(room, sequence([0, 0, 0.2])); // 人参抵港；肉豆蔻停13；翡翠抵港
  assert.equal(room.phase, 'pirate_destination');
  assert.equal(room.plunderQueue[0], 'nutmeg');
  dispatch(room, 'p1', 'pirate-destination', { area: 'shipyard' });

  assert.equal(room.round, 1);
  assert.equal(room.phase, 'settlement_review');
  assert.equal(room.market.ginseng, 1);
  assert.equal(room.market.jade, 1);
  assert.equal(room.market.nutmeg, 0);
  assert.ok(room.players[0].cash >= 24, '海盗应获得肉豆蔻抢劫奖金');
  assert.ok(room.events.some((event) => event.type === 'pirate_board'));
  assert.ok(room.events.some((event) => event.type === 'pirate_plunder'));
  confirmCurrentSettlement(room);
  assert.equal(room.round, 2);
});

test('掷骰结果生成带统一揭晓时间的全员同步事件', () => {
  const room = makeRoom(3);
  winAuctionAndSetup(room);
  stopAllCurrentPlacements(room);
  dispatch(room, 'p1', 'roll', {}, sequence([0, 0.5, 0.99]));
  const event = room.events.at(-1);
  assert.equal(event.type, 'dice');
  assert.deepEqual(event.payload.results, { ginseng: 1, nutmeg: 4, jade: 6 });
  assert.ok(event.revealAt > event.at);
  assert.equal(room.lockedUntil, event.revealAt);
});

test('无海盗时第三轮恰好停在 13 的船按原版规则进入船厂', () => {
  const room = makeRoom(3);
  winAuctionAndSetup(room, { ginseng: 4, nutmeg: 5, jade: 0 });
  stopAllCurrentPlacements(room);
  rollAndMove(room, constant(0)); // 5,6,1
  rollAndMove(room, constant(0)); // 6,7,2
  rollAndMove(room, sequence([0.99, 0.99, 0.99])); // 12,13,8
  assert.equal(room.round, 1);
  assert.equal(room.phase, 'settlement_review');
  assert.equal(room.market.nutmeg, 0);
  assert.equal(room.market.ginseng, 0);
  assert.equal(room.market.jade, 0);
  confirmCurrentSettlement(room);
  assert.equal(room.round, 2);
});

test('航程结算页列出每位玩家收支，并保留到本轮领航员确认', () => {
  const room = makeRoom(3);
  winAuctionAndSetup(room);
  dispatch(room, 'p1', 'place', { location: 'pilot:large' });
  dispatch(room, 'p2', 'pass-placement');
  dispatch(room, 'p3', 'pass-placement');
  dispatch(room, 'p1', 'pass-placement');

  rollAndMove(room, constant(0.99));
  rollAndMove(room, constant(0.99));
  assert.equal(room.phase, 'pilot');
  dispatch(room, 'p1', 'pilot', { moves: [] });
  rollAndMove(room, constant(0.99));

  assert.equal(room.phase, 'settlement_review');
  assert.equal(room.currentPlayerId, 'p1');
  assert.equal(room.settlement.confirmerId, 'p1');
  assert.equal(room.settlement.confirmerRole, '大领航员');
  assert.equal(room.settlement.players.length, 3);
  const player = room.settlement.players.find((item) => item.pid === 'p1');
  assert.ok(player.entries.some((entry) => entry.label === '竞拍港务长' && entry.amount === -1));
  assert.ok(player.entries.some((entry) => entry.label === '派遣帮手到大领航员位' && entry.amount === -5));
  assert.equal(player.closingCash, player.openingCash + player.net);
  assert.throws(() => dispatch(room, 'p2', 'confirm-settlement'), /只有本轮大领航员/);
  assert.equal(room.phase, 'settlement_review');
  dispatch(room, 'p1', 'confirm-settlement');
  assert.equal(room.phase, 'auction');
  assert.equal(room.round, 2);
});

test('触发终局时先保留航程结算，确认后才显示最终排名', () => {
  const room = makeRoom(3);
  winAuctionAndSetup(room);
  room.market.ginseng = MARKET_TRACK.indexOf(20);
  stopAllCurrentPlacements(room);

  rollAndMove(room, constant(0.99));
  rollAndMove(room, constant(0.99));
  rollAndMove(room, constant(0.99));

  assert.equal(room.phase, 'settlement_review');
  assert.equal(room.status, 'playing');
  assert.equal(room.settlement.endsGame, true);
  assert.equal(MARKET_TRACK[room.market.ginseng], 30);
  confirmCurrentSettlement(room);
  assert.equal(room.phase, 'finished');
  assert.equal(room.status, 'finished');
  assert.equal(room.scores.length, 3);
});

test('保险员先得 10₱，失败船修理费由保险员承担且船厂下注者收到全额', () => {
  const room = makeRoom(3);
  winAuctionAndSetup(room, { ginseng: 0, nutmeg: 4, jade: 5 });
  stopAllCurrentPlacements(room);
  room.placements.insurance = { id: 'insurance-test', pid: 'p1' };
  room.placements.shipyard.A = { id: 'yard-test', pid: 'p2' };
  room.players[0].cash += 10;
  const insurerBefore = room.players[0].cash;
  const receiverBefore = room.players[1].cash;

  rollAndMove(room, constant(0));
  rollAndMove(room, constant(0));
  rollAndMove(room, constant(0));

  assert.equal(room.players[1].cash, receiverBefore + 6);
  assert.equal(room.players[0].cash, insurerBefore - 29); // A 6 + B 8 + C 15
});

test('抵押贷款得 12₱、赎回花 15₱，且股票身份仅对本人可见', () => {
  const room = makeRoom(3);
  const player = room.players[0];
  const ware = Object.keys(player.shares).find((id) => player.shares[id] > 0);
  const cash = player.cash;
  dispatch(room, 'p1', 'mortgage', { ware });
  assert.equal(player.cash, cash + 12);
  assert.equal(player.mortgaged[ware], 1);
  dispatch(room, 'p1', 'redeem', { ware });
  assert.equal(player.cash, cash - 3);
  assert.equal(player.mortgaged[ware], 0);

  const view = require('../lib/game').publicRoom(room, 'p2');
  assert.equal(view.players[0].shares, undefined);
  assert.ok(view.players[1].shares);
});

test('竞拍领先者不能通过赎回削弱支付额度，旧异常报价会自动废标重拍', () => {
  const room = makeRoom(3);
  const player = room.players[0];
  const ware = Object.keys(player.shares).find((id) => player.shares[id] > 0);
  dispatch(room, 'p1', 'mortgage', { ware });
  dispatch(room, 'p1', 'bid', { amount: 54 });
  assert.throws(() => dispatch(room, 'p1', 'redeem', { ware }), /可支付额度不足/);
  dispatch(room, 'p2', 'pass-auction');
  dispatch(room, 'p3', 'pass-auction');
  assert.equal(room.phase, 'harbor_setup');
  assert.equal(room.harborMasterId, 'p1');
  assert.equal(player.cash, 0);

  const legacyRoom = makeRoom(3);
  legacyRoom.auction.highBid = 999;
  legacyRoom.auction.leaderId = 'p1';
  legacyRoom.auction.passedIds = ['p2', 'p3'];
  legacyRoom.auction.currentPlayerId = 'p1';
  legacyRoom.currentPlayerId = 'p1';
  dispatch(legacyRoom, 'p1', 'pass-auction');
  assert.equal(legacyRoom.phase, 'auction');
  assert.equal(legacyRoom.auction.highBid, 0);
  assert.equal(legacyRoom.auction.leaderId, null);
  assert.deepEqual(legacyRoom.auction.passedIds, ['p1']);
  assert.equal(legacyRoom.currentPlayerId, 'p2');
  assert.match(legacyRoom.logs.at(-1).text, /报价作废/);
});

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createRoom,
  addPlayer,
  dispatch,
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
  assert.equal(room.round, 2);
  assert.equal(room.phase, 'auction');
  assert.equal(MARKET_TRACK[room.market.jade], 5);
  assert.equal(MARKET_TRACK[room.market.nutmeg], 5);
  assert.equal(MARKET_TRACK[room.market.ginseng], 5);
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

  assert.equal(room.round, 2);
  assert.equal(room.market.ginseng, 1);
  assert.equal(room.market.jade, 1);
  assert.equal(room.market.nutmeg, 0);
  assert.ok(room.players[0].cash >= 24, '海盗应获得肉豆蔻抢劫奖金');
});

test('无海盗时第三轮恰好停在 13 的船按原版规则进入船厂', () => {
  const room = makeRoom(3);
  winAuctionAndSetup(room, { ginseng: 4, nutmeg: 5, jade: 0 });
  stopAllCurrentPlacements(room);
  rollAndMove(room, constant(0)); // 5,6,1
  rollAndMove(room, constant(0)); // 6,7,2
  rollAndMove(room, sequence([0.99, 0.99, 0.99])); // 12,13,8
  assert.equal(room.round, 2);
  assert.equal(room.market.nutmeg, 0);
  assert.equal(room.market.ginseng, 0);
  assert.equal(room.market.jade, 0);
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

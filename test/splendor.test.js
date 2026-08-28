'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../lib/splendor');

function constant(value) { return () => value; }

function makeRoom(count = 2) {
  const room = S.createRoom({ code: 'GEM234', name: '测试珠宝行会', maxPlayers: count, host: { id: 'p1', nickname: '甲商人' } });
  for (let i = 2; i <= count; i += 1) S.addPlayer(room, { id: `p${i}`, nickname: `${'甲乙丙丁'[i - 1]}商人` });
  S.dispatch(room, 'p1', 'start-game', {}, constant(0.42));
  return room;
}

test('基础牌库、贵族与不同人数的筹码数量完整', () => {
  assert.deepEqual([S.CARD_POOL[1].length, S.CARD_POOL[2].length, S.CARD_POOL[3].length], [40, 30, 20]);
  assert.equal(S.NOBLE_POOL.length, 10);
  const two = makeRoom(2);
  assert.deepEqual(two.bank, { white: 4, blue: 4, green: 4, red: 4, black: 4, gold: 5 });
  assert.equal(two.nobles.length, 3);
  const four = makeRoom(4);
  assert.equal(four.bank.white, 7);
  assert.equal(four.nobles.length, 5);
});

test('拿不同色和同色宝石严格执行库存与回合限制', () => {
  const room = makeRoom(2);
  S.dispatch(room, 'p1', 'splendor-take-different', { colors: ['white', 'blue', 'green'], returns: {} });
  assert.deepEqual(room.players[0].tokens, { white: 1, blue: 1, green: 1, red: 0, black: 0, gold: 0 });
  room.bank.red = 3;
  assert.throws(() => S.dispatch(room, 'p2', 'splendor-take-same', { color: 'red', returns: {} }), /至少 4 枚/);
  room.bank.black = 4;
  S.dispatch(room, 'p2', 'splendor-take-same', { color: 'black', returns: {} });
  assert.equal(room.players[1].tokens.black, 2);
});

test('超过 10 枚时必须精确归还，失败动作不会提前改变筹码', () => {
  const room = makeRoom(2);
  const player = room.players[0];
  player.tokens = { white: 2, blue: 2, green: 2, red: 2, black: 1, gold: 0 };
  const before = JSON.stringify({ bank: room.bank, tokens: player.tokens, turn: room.currentPlayerId });
  assert.throws(() => S.dispatch(room, 'p1', 'splendor-take-different', { colors: ['white', 'blue', 'green'], returns: {} }), /归还 2 枚/);
  assert.equal(JSON.stringify({ bank: room.bank, tokens: player.tokens, turn: room.currentPlayerId }), before);
  S.dispatch(room, 'p1', 'splendor-take-different', { colors: ['white', 'blue', 'green'], returns: { white: 1, black: 1 } });
  assert.equal(Object.values(player.tokens).reduce((sum, value) => sum + value, 0), 10);
});

test('可预留明牌或盲抽并获得黄金，其他玩家看不到预留内容', () => {
  const room = makeRoom(2);
  const visible = room.tiers[2].visible[0];
  S.dispatch(room, 'p1', 'splendor-reserve', { cardId: visible.id, tier: 2, returns: {} });
  assert.equal(room.players[0].reserved[0].id, visible.id);
  assert.equal(room.players[0].tokens.gold, 1);
  const hidden = S.publicRoom(room, 'p2').players[0];
  assert.equal(hidden.reserved, undefined);
  assert.equal(hidden.reservedCount, 1);

  S.dispatch(room, 'p2', 'splendor-reserve', { tier: 3, returns: {} });
  assert.equal(room.players[1].reserved.length, 1);
  assert.equal(room.tiers[3].deck.length, 15);
});

test('购买时永久折扣优先抵费，黄金补齐差额并退回银行', () => {
  const room = makeRoom(2);
  const player = room.players[0];
  const card = { id: 'custom-buy', tier: 1, bonus: 'green', points: 2, cost: { white: 3, blue: 2, black: 1 } };
  room.tiers[1].visible[0] = card;
  player.bonuses.white = 2;
  player.tokens.white = 1; player.tokens.blue = 1; player.tokens.gold = 2;
  room.bank.white -= 1; room.bank.blue -= 1; room.bank.gold -= 2;
  const goldBefore = room.bank.gold;
  S.dispatch(room, 'p1', 'splendor-buy', { cardId: card.id });
  assert.equal(player.points, 2);
  assert.equal(player.bonuses.green, 1);
  assert.equal(player.tokens.gold, 0);
  assert.equal(room.bank.gold, goldBefore + 2);
});

test('同时满足多名贵族时必须选择且校验发生在资源变动前', () => {
  const room = makeRoom(2);
  const player = room.players[0];
  player.bonuses = { white: 4, blue: 4, green: 4, red: 4, black: 4 };
  room.nobles = S.NOBLE_POOL.slice(0, 2);
  const bankBefore = JSON.stringify(room.bank);
  assert.throws(() => S.dispatch(room, 'p1', 'splendor-take-different', { colors: ['white', 'blue', 'green'], returns: {} }), /选择本回合来访/);
  assert.equal(JSON.stringify(room.bank), bankBefore);
  S.dispatch(room, 'p1', 'splendor-take-different', { colors: ['white', 'blue', 'green'], returns: {}, nobleId: room.nobles[0].id });
  assert.equal(player.nobles.length, 1);
  assert.equal(player.points, 3);
});

test('达到 15 分后打完当前轮，并按声望和发展卡数量排名', () => {
  const room = makeRoom(3);
  room.nobles = [];
  S.dispatch(room, 'p1', 'splendor-take-different', { colors: ['white', 'blue', 'green'], returns: {} });
  const trigger = room.players[1];
  trigger.points = 14;
  const card = { id: 'winning-card', tier: 1, bonus: 'white', points: 1, cost: {} };
  room.tiers[1].visible[0] = card;
  S.dispatch(room, 'p2', 'splendor-buy', { cardId: card.id });
  assert.equal(room.status, 'playing');
  assert.equal(room.currentPlayerId, 'p3');
  room.players[2].points = 15;
  S.dispatch(room, 'p3', 'splendor-take-different', { colors: ['white', 'blue', 'green'], returns: {} });
  assert.equal(room.status, 'finished');
  assert.deepEqual(room.winners, ['p3']);
  assert.equal(room.scores[0].cards, 0);
});

test('璀璨宝石人机与超时托管都能执行合法行动并推进回合', () => {
  const room = S.createRoom({ code: 'BOTGEM', name: '人机珠宝局', maxPlayers: 2, host: { id: 'p1', nickname: '真人房主' } });
  S.addBot(room, 'p1');
  S.dispatch(room, 'p1', 'start-game', {}, constant(0.42));
  const timed = S.runTimeoutTurn(room, constant(0));
  assert.equal(timed.acted, true);
  assert.match(room.logs.at(-1).text, /决策超时/);
  const bot = S.runBotTurn(room, constant(0));
  assert.equal(bot.acted, true);
  assert.equal(room.currentPlayerId, 'p1');
});

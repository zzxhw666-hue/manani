'use strict';

const POOL = require('./splendor-data.json');

const COLORS = ['white', 'blue', 'green', 'red', 'black'];
const ALL_TOKENS = COLORS.concat('gold');
const PLAYER_COLORS = ['#d95d61', '#3b82c4', '#d6a632', '#54a36d'];
const COLOR_NAMES = { white: '钻石', blue: '蓝宝石', green: '祖母绿', red: '红宝石', black: '玛瑙', gold: '黄金' };

function clone(value) { return JSON.parse(JSON.stringify(value)); }

function shuffle(items, random = Math.random) {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.min(i, Math.floor(random() * (i + 1)));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function emptyTokens() { return Object.fromEntries(ALL_TOKENS.map((color) => [color, 0])); }
function emptyBonuses() { return Object.fromEntries(COLORS.map((color) => [color, 0])); }
function playerOf(room, pid) { return room.players.find((player) => player.id === pid); }
function tokenTotal(tokens) { return ALL_TOKENS.reduce((sum, color) => sum + Number(tokens[color] || 0), 0); }

function nowLog(room, text, type = 'info') {
  room.logs.push({ at: Date.now(), text, type });
  if (room.logs.length > 160) room.logs.splice(0, room.logs.length - 160);
}

function buildCards() {
  const tiers = {};
  [1, 2, 3].forEach((tier) => {
    tiers[tier] = [];
    const group = POOL[`level${tier}`];
    Object.entries(group).forEach(([bonus, entries]) => {
      entries.forEach((entry, index) => {
        const cost = {};
        COLORS.forEach((color) => { if (entry[color]) cost[color] = entry[color]; });
        tiers[tier].push({ id: `s${tier}-${bonus}-${index + 1}`, tier, bonus, points: entry.prestige, cost });
      });
    });
  });
  return tiers;
}

function buildNobles() {
  return POOL.nobles.map((entry, index) => {
    const requirement = {};
    COLORS.forEach((color) => { if (entry[color]) requirement[color] = entry[color]; });
    return { id: `noble-${index + 1}`, points: entry.prestige, requirement };
  });
}

const CARD_POOL = buildCards();
const NOBLE_POOL = buildNobles();

function createRoom({ code, name, maxPlayers, decisionSeconds, host }) {
  const seats = Math.max(2, Math.min(4, Number(maxPlayers) || 4));
  const seconds = [10, 20, 30].includes(Number(decisionSeconds)) ? Number(decisionSeconds) : 20;
  const room = {
    code,
    name: name || `${host.nickname}的珠宝行会`,
    gameMode: 'splendor',
    maxPlayers: seats,
    hostId: host.id,
    status: 'waiting',
    phase: 'waiting',
    version: 0,
    createdAt: Date.now(),
    players: [],
    chat: [],
    logs: [],
    botCounter: 0,
    decisionSeconds: seconds,
    decisionKey: null,
    decisionDeadlineAt: null,
    lockedUntil: 0,
    currentPlayerId: null,
    turnNumber: 0,
    bank: emptyTokens(),
    tiers: { 1: { deck: [], visible: [] }, 2: { deck: [], visible: [] }, 3: { deck: [], visible: [] } },
    nobles: [],
    finalRoundTriggeredBy: null,
    finalRoundTurn: null,
    winners: [],
    scores: [],
  };
  addPlayer(room, host);
  nowLog(room, `${host.nickname} 创建了《璀璨宝石》房间`);
  return room;
}

function addPlayer(room, identity) {
  if (room.status !== 'waiting') throw new Error('对局已经开始');
  if (room.players.some((player) => player.id === identity.id)) return room;
  if (room.players.length >= room.maxPlayers) throw new Error('房间已满');
  if (room.players.some((player) => player.nickname === identity.nickname)) throw new Error('房间内已有同名玩家；请使用原浏览器返回该席位，或更换昵称');
  room.players.push({
    id: identity.id,
    nickname: identity.nickname,
    color: PLAYER_COLORS.find((color) => !room.players.some((player) => player.color === color)) || PLAYER_COLORS[room.players.length],
    isBot: Boolean(identity.isBot),
    tokens: emptyTokens(),
    bonuses: emptyBonuses(),
    purchased: [],
    reserved: [],
    nobles: [],
    points: 0,
  });
  room.version += 1;
  nowLog(room, `${identity.nickname} 加入了房间`);
  return room;
}

function addBot(room, pid) {
  if (room.hostId !== pid) throw new Error('只有房主可以添加人机');
  if (room.status !== 'waiting') throw new Error('只能在开局前添加人机');
  if (room.players.length >= room.maxPlayers) throw new Error('房间已满');
  room.botCounter += 1;
  let nickname = `电脑珠宝商 ${room.botCounter}`;
  while (room.players.some((player) => player.nickname === nickname)) {
    room.botCounter += 1;
    nickname = `电脑珠宝商 ${room.botCounter}`;
  }
  return addPlayer(room, { id: `bot_${room.code}_${room.botCounter}`, nickname, isBot: true });
}

function removeBot(room, pid, botId) {
  if (room.hostId !== pid) throw new Error('只有房主可以移除人机');
  if (room.status !== 'waiting') throw new Error('只能在开局前移除人机');
  const bot = playerOf(room, botId);
  if (!bot?.isBot) throw new Error('该座位不是人机');
  room.players = room.players.filter((player) => player.id !== botId);
  room.version += 1;
  nowLog(room, `${bot.nickname} 离开了房间`);
}

function removeWaitingPlayer(room, pid) {
  if (room.status !== 'waiting') throw new Error('对局开始后不能退出座位，可关闭页面后用原昵称回来');
  const leaving = playerOf(room, pid);
  room.players = room.players.filter((player) => player.id !== pid);
  if (leaving) nowLog(room, `${leaving.nickname} 离开了房间`);
  if (room.hostId === pid && room.players.length) room.hostId = room.players[0].id;
  room.version += 1;
}

function startGame(room, pid, random = Math.random) {
  if (room.hostId !== pid) throw new Error('只有房主可以开始');
  if (room.status !== 'waiting') throw new Error('对局已经开始');
  if (room.players.length < 2 || room.players.length > 4) throw new Error('《璀璨宝石》需要 2–4 人');
  const ordinary = room.players.length === 2 ? 4 : room.players.length === 3 ? 5 : 7;
  room.bank = { ...Object.fromEntries(COLORS.map((color) => [color, ordinary])), gold: 5 };
  [1, 2, 3].forEach((tier) => {
    const deck = shuffle(CARD_POOL[tier], random);
    room.tiers[tier] = { deck: deck.slice(4), visible: deck.slice(0, 4) };
  });
  room.nobles = shuffle(NOBLE_POOL, random).slice(0, room.players.length + 1);
  room.players.forEach((player) => {
    player.tokens = emptyTokens(); player.bonuses = emptyBonuses(); player.purchased = []; player.reserved = []; player.nobles = []; player.points = 0;
  });
  room.status = 'playing'; room.phase = 'turn'; room.turnNumber = 1; room.currentPlayerId = room.players[0].id;
  room.finalRoundTriggeredBy = null; room.finalRoundTurn = null; room.winners = []; room.scores = [];
  nowLog(room, '对局开始：拿宝石、购买发展卡，率先达到 15 点声望', 'system');
  room.version += 1;
}

function ensureTurn(room, pid) {
  if (room.status !== 'playing' || room.phase !== 'turn') throw new Error('当前不能行动');
  if (room.currentPlayerId !== pid) throw new Error('还没轮到你');
  return playerOf(room, pid);
}

function eligibleNobles(room, bonuses) {
  return room.nobles.filter((noble) => COLORS.every((color) => (bonuses[color] || 0) >= (noble.requirement[color] || 0)));
}

function selectNoble(room, bonuses, nobleId) {
  const eligible = eligibleNobles(room, bonuses);
  if (!eligible.length) {
    if (nobleId) throw new Error('你尚未满足所选贵族的条件');
    return null;
  }
  if (eligible.length === 1) {
    if (nobleId && nobleId !== eligible[0].id) throw new Error('所选贵族不符合条件');
    return eligible[0];
  }
  const selected = eligible.find((noble) => noble.id === nobleId);
  if (!selected) throw new Error('你同时满足多名贵族，请选择本回合来访的一位');
  return selected;
}

function normalizeReturns(player, additions, returns) {
  const result = emptyTokens();
  const after = emptyTokens();
  ALL_TOKENS.forEach((color) => {
    after[color] = (player.tokens[color] || 0) + (additions[color] || 0);
    const amount = Number(returns?.[color] || 0);
    if (!Number.isInteger(amount) || amount < 0 || amount > after[color]) throw new Error('归还的筹码数量无效');
    result[color] = amount;
  });
  const required = Math.max(0, tokenTotal(after) - 10);
  if (tokenTotal(result) !== required) throw new Error(required ? `本回合必须归还 ${required} 枚筹码` : '无需归还筹码');
  return result;
}

function applyTokenChange(room, player, additions, returns) {
  ALL_TOKENS.forEach((color) => {
    player.tokens[color] += additions[color] || 0;
    room.bank[color] -= additions[color] || 0;
    player.tokens[color] -= returns[color] || 0;
    room.bank[color] += returns[color] || 0;
  });
}

function finishAction(room, player, noble) {
  if (noble) {
    room.nobles = room.nobles.filter((item) => item.id !== noble.id);
    player.nobles.push(noble);
    player.points += noble.points;
    nowLog(room, `${player.nickname} 获得一位贵族来访，声望 +${noble.points}`, 'noble');
  }
  if (player.points >= 15 && !room.finalRoundTriggeredBy) {
    room.finalRoundTriggeredBy = player.id;
    room.finalRoundTurn = room.turnNumber;
    nowLog(room, `${player.nickname} 达到 ${player.points} 点声望，本轮结束后结算`, 'system');
  }
  const index = room.players.findIndex((item) => item.id === player.id);
  if (room.finalRoundTriggeredBy && index === room.players.length - 1) {
    room.status = 'finished'; room.phase = 'finished'; room.currentPlayerId = null;
    room.scores = room.players.map((item) => ({ pid: item.id, nickname: item.nickname, points: item.points, cards: item.purchased.length }))
      .sort((a, b) => b.points - a.points || a.cards - b.cards);
    const best = room.scores[0];
    room.winners = room.scores.filter((score) => score.points === best.points && score.cards === best.cards).map((score) => score.pid);
    nowLog(room, `对局结束：${room.winners.map((id) => playerOf(room, id).nickname).join('、')} 获胜`, 'system');
    return;
  }
  room.turnNumber += 1;
  room.currentPlayerId = room.players[(index + 1) % room.players.length].id;
}

function takeDifferent(room, pid, colors, returns, nobleId) {
  const player = ensureTurn(room, pid);
  const available = COLORS.filter((color) => room.bank[color] > 0);
  const required = Math.min(3, available.length);
  const selected = Array.isArray(colors) ? colors : [];
  if (selected.length !== required || new Set(selected).size !== selected.length || selected.some((color) => !available.includes(color))) {
    throw new Error(`必须拿取 ${required} 种不同且有库存的宝石`);
  }
  const noble = selectNoble(room, player.bonuses, nobleId);
  const additions = Object.fromEntries(selected.map((color) => [color, 1]));
  const normalized = normalizeReturns(player, additions, returns);
  applyTokenChange(room, player, additions, normalized);
  nowLog(room, `${player.nickname} 拿取了 ${selected.map((color) => COLOR_NAMES[color]).join('、')}`);
  finishAction(room, player, noble);
}

function takeSame(room, pid, color, returns, nobleId) {
  const player = ensureTurn(room, pid);
  if (!COLORS.includes(color) || room.bank[color] < 4) throw new Error('只有库存至少 4 枚的普通宝石才能拿取 2 枚');
  const noble = selectNoble(room, player.bonuses, nobleId);
  const additions = { [color]: 2 };
  const normalized = normalizeReturns(player, additions, returns);
  applyTokenChange(room, player, additions, normalized);
  nowLog(room, `${player.nickname} 拿取了 2 枚${COLOR_NAMES[color]}`);
  finishAction(room, player, noble);
}

function findVisible(room, cardId) {
  for (const tier of [1, 2, 3]) {
    const index = room.tiers[tier].visible.findIndex((card) => card.id === cardId);
    if (index >= 0) return { tier, index, card: room.tiers[tier].visible[index] };
  }
  return null;
}

function reserve(room, pid, payload) {
  const player = ensureTurn(room, pid);
  if (player.reserved.length >= 3) throw new Error('每人最多预留 3 张发展卡');
  const tier = Number(payload.tier);
  let source = null;
  if (payload.cardId) source = findVisible(room, payload.cardId);
  else if ([1, 2, 3].includes(tier) && room.tiers[tier].deck.length) source = { tier, index: -1, card: room.tiers[tier].deck[0] };
  if (!source) throw new Error('这张发展卡已经不存在');
  const noble = selectNoble(room, player.bonuses, payload.nobleId);
  const additions = room.bank.gold > 0 ? { gold: 1 } : {};
  const normalized = normalizeReturns(player, additions, payload.returns);
  if (source.index >= 0) {
    room.tiers[source.tier].visible.splice(source.index, 1);
    if (room.tiers[source.tier].deck.length) room.tiers[source.tier].visible.push(room.tiers[source.tier].deck.shift());
  } else room.tiers[source.tier].deck.shift();
  player.reserved.push(source.card);
  applyTokenChange(room, player, additions, normalized);
  nowLog(room, `${player.nickname} 预留了一张 ${source.tier} 级发展卡${additions.gold ? '并获得黄金' : ''}`);
  finishAction(room, player, noble);
}

function paymentFor(player, card) {
  const payment = emptyTokens();
  let goldNeeded = 0;
  COLORS.forEach((color) => {
    const needed = Math.max(0, (card.cost[color] || 0) - player.bonuses[color]);
    payment[color] = Math.min(needed, player.tokens[color]);
    goldNeeded += needed - payment[color];
  });
  if (goldNeeded > player.tokens.gold) return null;
  payment.gold = goldNeeded;
  return payment;
}

function buy(room, pid, cardId, nobleId) {
  const player = ensureTurn(room, pid);
  let source = findVisible(room, cardId);
  let reservedIndex = -1;
  if (!source) {
    reservedIndex = player.reserved.findIndex((card) => card.id === cardId);
    if (reservedIndex >= 0) source = { tier: player.reserved[reservedIndex].tier, index: -1, card: player.reserved[reservedIndex] };
  }
  if (!source) throw new Error('你不能购买这张发展卡');
  const payment = paymentFor(player, source.card);
  if (!payment) throw new Error('宝石不足，无法购买这张卡');
  const projected = { ...player.bonuses, [source.card.bonus]: player.bonuses[source.card.bonus] + 1 };
  const noble = selectNoble(room, projected, nobleId);
  ALL_TOKENS.forEach((color) => { player.tokens[color] -= payment[color]; room.bank[color] += payment[color]; });
  if (reservedIndex >= 0) player.reserved.splice(reservedIndex, 1);
  else {
    room.tiers[source.tier].visible.splice(source.index, 1);
    if (room.tiers[source.tier].deck.length) room.tiers[source.tier].visible.push(room.tiers[source.tier].deck.shift());
  }
  player.purchased.push(source.card); player.bonuses[source.card.bonus] += 1; player.points += source.card.points;
  nowLog(room, `${player.nickname} 购买了 ${COLOR_NAMES[source.card.bonus]}发展卡${source.card.points ? `，声望 +${source.card.points}` : ''}`, 'purchase');
  finishAction(room, player, noble);
}

function chooseBotNoble(room, bonuses) { return eligibleNobles(room, bonuses)[0]?.id || null; }

function returnsFor(player, additions) {
  const after = { ...player.tokens };
  ALL_TOKENS.forEach((color) => { after[color] += additions[color] || 0; });
  let excess = Math.max(0, tokenTotal(after) - 10);
  const returns = emptyTokens();
  ALL_TOKENS.slice().reverse().forEach((color) => {
    const amount = Math.min(excess, after[color]); returns[color] = amount; excess -= amount;
  });
  return returns;
}

function automaticTurn(room, random = Math.random) {
  const player = playerOf(room, room.currentPlayerId);
  if (!player) return false;
  const options = room.tiers[1].visible.concat(room.tiers[2].visible, room.tiers[3].visible, player.reserved)
    .filter((card) => paymentFor(player, card))
    .sort((a, b) => b.points - a.points || b.tier - a.tier);
  if (options.length) {
    const card = options[0];
    const projected = { ...player.bonuses, [card.bonus]: player.bonuses[card.bonus] + 1 };
    buy(room, player.id, card.id, chooseBotNoble(room, projected));
    return true;
  }
  if (player.reserved.length < 3 && room.bank.gold > 0 && random() < 0.22) {
    const cards = room.tiers[3].visible.concat(room.tiers[2].visible, room.tiers[1].visible);
    const card = cards.sort((a, b) => b.points - a.points)[0];
    if (card) reserve(room, player.id, { cardId: card.id, returns: returnsFor(player, { gold: 1 }), nobleId: chooseBotNoble(room, player.bonuses) });
    return Boolean(card);
  }
  const needed = Object.fromEntries(COLORS.map((color) => [color, 0]));
  room.tiers[1].visible.concat(room.tiers[2].visible, room.tiers[3].visible).forEach((card) => COLORS.forEach((color) => {
    needed[color] += Math.max(0, (card.cost[color] || 0) - player.bonuses[color] - player.tokens[color]);
  }));
  const available = COLORS.filter((color) => room.bank[color] > 0).sort((a, b) => needed[b] - needed[a]);
  const same = available.find((color) => room.bank[color] >= 4 && needed[color] >= 2);
  if (same) takeSame(room, player.id, same, returnsFor(player, { [same]: 2 }), chooseBotNoble(room, player.bonuses));
  else {
    const colors = available.slice(0, Math.min(3, available.length));
    if (!colors.length) {
      if (player.reserved.length >= 3) return false;
      const tier = [3, 2, 1].find((level) => room.tiers[level].deck.length || room.tiers[level].visible.length);
      if (!tier) return false;
      reserve(room, player.id, {
        tier,
        ...(room.tiers[tier].deck.length ? {} : { cardId: room.tiers[tier].visible[0].id }),
        returns: returnsFor(player, room.bank.gold > 0 ? { gold: 1 } : {}),
        nobleId: chooseBotNoble(room, player.bonuses),
      });
      return true;
    }
    const additions = Object.fromEntries(colors.map((color) => [color, 1]));
    takeDifferent(room, player.id, colors, returnsFor(player, additions), chooseBotNoble(room, player.bonuses));
  }
  return true;
}

function runBotTurn(room, random = Math.random) {
  if (room.status !== 'playing') return { acted: false };
  const player = playerOf(room, room.currentPlayerId);
  if (!player?.isBot) return { acted: false };
  const id = player.id;
  if (!automaticTurn(room, random)) return { acted: false };
  room.version += 1;
  return { acted: true, botId: id, phase: room.phase };
}

function runTimeoutTurn(room, random = Math.random) {
  if (room.status !== 'playing') return { acted: false };
  const player = playerOf(room, room.currentPlayerId);
  if (!player) return { acted: false };
  const id = player.id;
  if (!automaticTurn(room, random)) return { acted: false };
  nowLog(room, `${player.nickname} 决策超时，系统已代为执行合法行动`, 'system');
  room.version += 1;
  return { acted: true, playerId: id, phase: room.phase };
}

function dispatch(room, pid, action, payload = {}, random = Math.random) {
  if (!playerOf(room, pid)) throw new Error('你不在这个房间');
  switch (action) {
    case 'add-bot': addBot(room, pid); break;
    case 'remove-bot': removeBot(room, pid, payload.botId); break;
    case 'start-game': startGame(room, pid, random); break;
    case 'splendor-take-different': takeDifferent(room, pid, payload.colors, payload.returns, payload.nobleId); break;
    case 'splendor-take-same': takeSame(room, pid, payload.color, payload.returns, payload.nobleId); break;
    case 'splendor-reserve': reserve(room, pid, payload); break;
    case 'splendor-buy': buy(room, pid, payload.cardId, payload.nobleId); break;
    default: throw new Error('未知动作');
  }
  room.version += 1;
  return room;
}

function publicRoom(room, viewerId) {
  const view = clone(room);
  view.deckCounts = { 1: room.tiers[1].deck.length, 2: room.tiers[2].deck.length, 3: room.tiers[3].deck.length };
  [1, 2, 3].forEach((tier) => { delete view.tiers[tier].deck; });
  view.players = room.players.map((player) => {
    const visible = clone(player);
    visible.reservedCount = player.reserved.length;
    if (viewerId !== player.id && room.status !== 'finished') delete visible.reserved;
    return visible;
  });
  return view;
}

module.exports = {
  COLORS, ALL_TOKENS, CARD_POOL, NOBLE_POOL, createRoom, addPlayer, addBot, removeBot,
  removeWaitingPlayer, startGame, dispatch, publicRoom, playerOf, paymentFor,
  eligibleNobles, runBotTurn, runTimeoutTurn, clone,
};

'use strict';

const WARES = {
  ginseng: { name: '人参', icon: '🌿', pool: 18, crewCosts: [1, 2, 3], color: '#d9c85d' },
  nutmeg: { name: '肉豆蔻', icon: '🟤', pool: 24, crewCosts: [2, 3, 4], color: '#9b603f' },
  silk: { name: '丝绸', icon: '🧵', pool: 30, crewCosts: [3, 4, 5], color: '#4f86c6' },
  jade: { name: '翡翠', icon: '🟢', pool: 36, crewCosts: [3, 4, 5, 5], color: '#3e9b73' },
};
const WARE_IDS = Object.keys(WARES);
const MARKET_TRACK = [0, 5, 10, 20, 30];
const SLOT_DATA = {
  port: { A: { cost: 4, reward: 6 }, B: { cost: 3, reward: 8 }, C: { cost: 2, reward: 15 } },
  shipyard: { A: { cost: 4, reward: 6 }, B: { cost: 3, reward: 8 }, C: { cost: 2, reward: 15 } },
  pirate: { captain: { cost: 5 }, crew: { cost: 5 } },
  pilot: { small: { cost: 2 }, large: { cost: 5 } },
};
const PLAYER_COLORS = ['#e35d6a', '#4f91dc', '#e7b84b', '#58aa76', '#9b6bd6'];
const DOCK_LETTERS = ['A', 'B', 'C'];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function shuffle(items, random = Math.random) {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function nowLog(room, text, type = 'info') {
  room.logs.push({ at: Date.now(), text, type });
  if (room.logs.length > 160) room.logs.splice(0, room.logs.length - 160);
}

function specialEvent(room, type, payload = {}, duration = 0) {
  room.eventCounter = (room.eventCounter || 0) + 1;
  if (!Array.isArray(room.events)) room.events = [];
  const at = Date.now();
  const event = {
    id: room.eventCounter,
    type,
    at,
    revealAt: duration ? at + duration : at,
    payload: clone(payload),
  };
  room.events.push(event);
  if (room.events.length > 24) room.events.splice(0, room.events.length - 24);
  if (duration) room.lockedUntil = Math.max(Number(room.lockedUntil) || 0, event.revealAt);
  return event;
}

function playerOf(room, pid) {
  return room.players.find((player) => player.id === pid);
}

function playerName(room, pid) {
  return playerOf(room, pid)?.nickname || '未知玩家';
}

function money(value) {
  return Math.round(Number(value) * 100) / 100;
}

function startVoyageLedger(room) {
  room.voyageLedger = {
    round: room.round,
    counter: 0,
    openingCash: Object.fromEntries(room.players.map((player) => [player.id, money(player.cash)])),
    entries: [],
  };
}

function recordCash(room, player, amount, label, category = 'income') {
  if (!amount) return;
  if (!room.voyageLedger || room.voyageLedger.round !== room.round) startVoyageLedger(room);
  room.voyageLedger.counter += 1;
  room.voyageLedger.entries.push({
    id: `cash_${room.round}_${room.voyageLedger.counter}`,
    pid: player.id,
    amount: money(amount),
    label,
    category,
  });
}

function nextPlayerId(room, pid, allowed) {
  const start = room.players.findIndex((player) => player.id === pid);
  for (let step = 1; step <= room.players.length; step += 1) {
    const candidate = room.players[(start + step) % room.players.length].id;
    if (!allowed || allowed.includes(candidate)) return candidate;
  }
  return null;
}

function emptyPlacements() {
  return {
    port: { A: null, B: null, C: null },
    shipyard: { A: null, B: null, C: null },
    pirates: [],
    pilots: { small: null, large: null },
    insurance: null,
  };
}

function emptyDocks() {
  return { port: { A: null, B: null, C: null }, shipyard: { A: null, B: null, C: null } };
}

function createRoom({ code, name, maxPlayers, decisionSeconds, host }) {
  const normalizedDecisionSeconds = [10, 20, 30].includes(Number(decisionSeconds)) ? Number(decisionSeconds) : 20;
  const room = {
    code,
    name: name || `${host.nickname}的航运局`,
    maxPlayers: Math.max(3, Math.min(5, Number(maxPlayers) || 5)),
    hostId: host.id,
    status: 'waiting',
    version: 0,
    createdAt: Date.now(),
    players: [],
    chat: [],
    logs: [],
    round: 0,
    phase: 'waiting',
    market: Object.fromEntries(WARE_IDS.map((id) => [id, 0])),
    stockSupply: Object.fromEntries(WARE_IDS.map((id) => [id, 5])),
    harborMasterId: null,
    previousHarborMasterId: null,
    auction: null,
    boats: [],
    placements: emptyPlacements(),
    docks: emptyDocks(),
    currentPlayerId: null,
    placementRound: 0,
    movementRound: 0,
    placementPending: [],
    pendingMoves: [],
    dice: null,
    pirateBoardQueue: [],
    pilotQueue: [],
    plunderQueue: [],
    plunderPirates: [],
    winners: [],
    scores: [],
    tokenCounter: 0,
    botCounter: 0,
    eventCounter: 0,
    events: [],
    lockedUntil: 0,
    decisionSeconds: normalizedDecisionSeconds,
    decisionKey: null,
    decisionDeadlineAt: null,
    voyageLedger: null,
    settlement: null,
  };
  addPlayer(room, host);
  nowLog(room, `${host.nickname} 创建了房间`);
  return room;
}

function addPlayer(room, identity) {
  if (room.status !== 'waiting') throw new Error('对局已经开始');
  if (room.players.some((player) => player.id === identity.id)) return room;
  if (room.players.length >= room.maxPlayers) throw new Error('房间已满');
  if (room.players.some((player) => player.nickname === identity.nickname)) {
    throw new Error('房间内已有同名玩家；请使用原浏览器返回该席位，或更换昵称');
  }
  room.players.push({
    id: identity.id,
    nickname: identity.nickname,
    color: PLAYER_COLORS.find((color) => !room.players.some((player) => player.color === color)) || PLAYER_COLORS[room.players.length],
    isBot: Boolean(identity.isBot),
    cash: 30,
    shares: Object.fromEntries(WARE_IDS.map((id) => [id, 0])),
    mortgaged: Object.fromEntries(WARE_IDS.map((id) => [id, 0])),
    pawnsTotal: 3,
    pawnsAvailable: 3,
    stoppedPlacing: false,
  });
  room.version += 1;
  nowLog(room, `${identity.nickname} 加入了房间`);
  return room;
}

function addBot(room, pid) {
  if (room.hostId !== pid) throw new Error('只有房主可以添加人机');
  if (room.status !== 'waiting') throw new Error('只能在开局前添加人机');
  if (room.players.length >= room.maxPlayers) throw new Error('房间已满');
  room.botCounter = (room.botCounter || 0) + 1;
  let nickname = `电脑商人 ${room.botCounter}`;
  while (room.players.some((player) => player.nickname === nickname)) {
    room.botCounter += 1;
    nickname = `电脑商人 ${room.botCounter}`;
  }
  return addPlayer(room, {
    id: `bot_${room.code}_${room.botCounter}`,
    nickname,
    isBot: true,
  });
}

function removeBot(room, pid, botId) {
  if (room.hostId !== pid) throw new Error('只有房主可以移除人机');
  if (room.status !== 'waiting') throw new Error('只能在开局前移除人机');
  const bot = playerOf(room, botId);
  if (!bot || !bot.isBot) throw new Error('该座位不是人机');
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

function unencumberedCount(player) {
  return WARE_IDS.reduce((sum, ware) => sum + player.shares[ware] - player.mortgaged[ware], 0);
}

function maxFunds(player) {
  return player.cash + unencumberedCount(player) * 12;
}

function mortgageOne(room, player, preferredWare) {
  let ware = preferredWare;
  if (!ware || player.shares[ware] - player.mortgaged[ware] <= 0) {
    ware = WARE_IDS
      .filter((id) => player.shares[id] - player.mortgaged[id] > 0)
      .sort((a, b) => MARKET_TRACK[room.market[a]] - MARKET_TRACK[room.market[b]])[0];
  }
  if (!ware) return false;
  player.mortgaged[ware] += 1;
  player.cash += 12;
  recordCash(room, player, 12, '抵押股票获得贷款', 'financing');
  nowLog(room, `${player.nickname} 抵押了 1 股${WARES[ware].name}，获得 12₱`, 'money');
  return true;
}

function ensureCash(room, player, amount) {
  while (player.cash < amount && mortgageOne(room, player)) {}
  return player.cash >= amount;
}

function pay(room, player, amount) {
  if (!ensureCash(room, player, amount)) return false;
  player.cash -= amount;
  return true;
}

function startGame(room, pid, random = Math.random) {
  if (room.hostId !== pid) throw new Error('只有房主可以开始');
  if (room.status !== 'waiting') throw new Error('对局已经开始');
  if (room.players.length < 3 || room.players.length > 5) throw new Error('《马尼拉》需要 3–5 人');

  const deck = shuffle(WARE_IDS.flatMap((ware) => Array(3).fill(ware)), random);
  for (const player of room.players) {
    player.cash = 30;
    player.pawnsTotal = room.players.length === 3 ? 4 : 3;
    player.pawnsAvailable = player.pawnsTotal;
    player.stoppedPlacing = false;
    for (let i = 0; i < 2; i += 1) {
      const ware = deck.pop();
      player.shares[ware] += 1;
      room.stockSupply[ware] -= 1;
    }
  }
  room.status = 'playing';
  nowLog(room, '对局开始：每人获得 30₱、2 张秘密股票和帮手', 'system');
  beginVoyage(room, room.hostId);
  room.version += 1;
}

function resetVoyageBoard(room) {
  room.boats = [];
  room.placements = emptyPlacements();
  room.docks = emptyDocks();
  room.currentPlayerId = null;
  room.placementRound = 0;
  room.movementRound = 0;
  room.placementPending = [];
  room.pendingMoves = [];
  room.dice = null;
  room.pirateBoardQueue = [];
  room.pilotQueue = [];
  room.plunderQueue = [];
  room.plunderPirates = [];
  room.lockedUntil = 0;
  for (const player of room.players) {
    player.pawnsAvailable = player.pawnsTotal;
    player.stoppedPlacing = false;
  }
}

function beginVoyage(room, starterId) {
  resetVoyageBoard(room);
  room.round += 1;
  room.settlement = null;
  startVoyageLedger(room);
  room.phase = 'auction';
  const starter = playerOf(room, starterId) ? starterId : room.players[0].id;
  room.auction = {
    starterId: starter,
    currentPlayerId: starter,
    leaderId: null,
    highBid: 0,
    passedIds: [],
  };
  room.currentPlayerId = starter;
  nowLog(room, `第 ${room.round} 次航程开始，竞拍港务长`, 'phase');
}

function resolveAuction(room) {
  let winnerId = room.auction.leaderId;
  let price = room.auction.highBid;
  if (!winnerId) {
    winnerId = room.previousHarborMasterId || room.auction.starterId;
    price = 0;
    nowLog(room, `无人出价，${playerName(room, winnerId)} 留任港务长`, 'auction');
  } else {
    const winner = playerOf(room, winnerId);
    // A winning bid is backed by cash plus the value of shares that can still
    // be mortgaged.  This guard also repairs rooms saved before that backing
    // amount was reserved while the player was the auction leader.
    if (!winner || maxFunds(winner) < price || !pay(room, winner, price)) {
      restartAuctionAfterDefault(room, winnerId, price);
      return;
    }
    recordCash(room, winner, -price, '竞拍港务长', 'expense');
    nowLog(room, `${winner.nickname} 以 ${price}₱ 成为港务长`, 'auction');
  }
  room.harborMasterId = winnerId;
  room.previousHarborMasterId = winnerId;
  room.phase = 'harbor_setup';
  room.currentPlayerId = winnerId;
}

function restartAuctionAfterDefault(room, defaultingId, price) {
  const remaining = room.players.map((player) => player.id).filter((id) => id !== defaultingId);
  room.auction.highBid = 0;
  room.auction.leaderId = null;
  room.auction.passedIds = [defaultingId];
  room.auction.currentPlayerId = nextPlayerId(room, defaultingId, remaining);
  room.currentPlayerId = room.auction.currentPlayerId;
  nowLog(room, `${playerName(room, defaultingId)} 的融资额度不足以支付 ${price}₱ 报价，报价作废；其余商人重新竞拍`, 'auction');
}

function bid(room, pid, amount) {
  if (room.phase !== 'auction') throw new Error('现在不是竞拍阶段');
  if (room.auction.currentPlayerId !== pid) throw new Error('还没轮到你出价');
  if (room.auction.passedIds.includes(pid)) throw new Error('你已退出本轮竞拍');
  amount = Number(amount);
  if (!Number.isInteger(amount) || amount <= room.auction.highBid || amount < 1) throw new Error('出价必须是高于当前价的整数');
  if (amount > maxFunds(playerOf(room, pid))) throw new Error('现金与可贷款额度不足');
  room.auction.highBid = amount;
  room.auction.leaderId = pid;
  nowLog(room, `${playerName(room, pid)} 出价 ${amount}₱`, 'auction');
  const active = room.players.map((p) => p.id).filter((id) => !room.auction.passedIds.includes(id));
  if (active.length === 1 && active[0] === pid) return resolveAuction(room);
  room.auction.currentPlayerId = nextPlayerId(room, pid, active);
  room.currentPlayerId = room.auction.currentPlayerId;
}

function passAuction(room, pid) {
  if (room.phase !== 'auction') throw new Error('现在不是竞拍阶段');
  if (room.auction.currentPlayerId !== pid) throw new Error('还没轮到你');
  if (!room.auction.passedIds.includes(pid)) room.auction.passedIds.push(pid);
  nowLog(room, `${playerName(room, pid)} 退出本轮竞拍`, 'auction');
  const active = room.players.map((p) => p.id).filter((id) => !room.auction.passedIds.includes(id));
  if (!active.length || (room.auction.leaderId && active.length === 1 && active[0] === room.auction.leaderId)) {
    return resolveAuction(room);
  }
  room.auction.currentPlayerId = nextPlayerId(room, pid, active);
  room.currentPlayerId = room.auction.currentPlayerId;
}

function harborSetup(room, pid, payload) {
  if (room.phase !== 'harbor_setup' || room.harborMasterId !== pid) throw new Error('只有本轮港务长可以布置货船');
  const selected = Array.isArray(payload.wares) ? payload.wares : [];
  if (selected.length !== 3 || new Set(selected).size !== 3 || selected.some((ware) => !WARES[ware])) {
    throw new Error('必须选择 3 种不同货物');
  }
  const starts = payload.starts || {};
  if (selected.some((ware) => !Number.isInteger(Number(starts[ware])) || Number(starts[ware]) < 0 || Number(starts[ware]) > 5)) {
    throw new Error('每艘船的起点必须在 0–5');
  }
  if (selected.reduce((sum, ware) => sum + Number(starts[ware]), 0) !== 9) throw new Error('三艘船的起点之和必须等于 9');

  const buyer = playerOf(room, pid);
  const buyWare = payload.buyWare || null;
  if (buyWare) {
    if (!WARES[buyWare] || room.stockSupply[buyWare] <= 0) throw new Error('该股票已经售罄');
    const price = Math.max(5, MARKET_TRACK[room.market[buyWare]]);
    if (!pay(room, buyer, price)) throw new Error('买股票的资金不足');
    recordCash(room, buyer, -price, `购买 1 股${WARES[buyWare].name}`, 'expense');
    buyer.shares[buyWare] += 1;
    room.stockSupply[buyWare] -= 1;
    nowLog(room, `${buyer.nickname} 以 ${price}₱ 买入 1 股${WARES[buyWare].name}`, 'money');
  }

  room.boats = selected.map((ware) => ({
    ware,
    position: Number(starts[ware]),
    status: 'sea',
    dock: null,
    crew: [],
    plundered: false,
    lastRoll: null,
  }));
  nowLog(room, `${buyer.nickname} 装载 ${selected.map((ware) => WARES[ware].name).join('、')}，起点为 ${selected.map((ware) => `${WARES[ware].name}${starts[ware]}`).join(' / ')}`, 'phase');
  room.placementRound = 1;
  startPlacementRound(room);
}

function startPlacementRound(room) {
  room.phase = 'placement';
  const order = [];
  let pid = room.harborMasterId;
  for (let i = 0; i < room.players.length; i += 1) {
    const player = playerOf(room, pid);
    if (!player.stoppedPlacing && player.pawnsAvailable > 0) order.push(pid);
    pid = nextPlayerId(room, pid);
  }
  room.placementPending = order;
  room.currentPlayerId = order[0] || null;
  nowLog(room, `第 ${room.placementRound} 轮放置帮手`, 'phase');
  if (!order.length) finishPlacementRound(room);
}

function finishPlacementRound(room) {
  const isThree = room.players.length === 3;
  const total = isThree ? 4 : 3;
  if (isThree && room.placementRound === 1) {
    room.placementRound += 1;
    return startPlacementRound(room);
  }
  if (room.placementRound >= total) return beginPilots(room);
  return beginDice(room, room.movementRound + 1);
}

function tokenFor(room, pid) {
  room.tokenCounter += 1;
  return { id: `t${room.tokenCounter}`, pid };
}

function legalLocations(room) {
  const locations = [];
  for (const boat of room.boats) {
    const costs = WARES[boat.ware].crewCosts;
    if (boat.status === 'sea' && boat.crew.length < costs.length) {
      locations.push({ id: `boat:${boat.ware}`, cost: costs[boat.crew.length], type: 'boat' });
    }
  }
  for (const area of ['port', 'shipyard']) {
    for (const letter of DOCK_LETTERS) {
      if (!room.placements[area][letter]) locations.push({ id: `${area}:${letter}`, cost: SLOT_DATA[area][letter].cost, type: area });
    }
  }
  if (room.placements.pirates.length < 2) locations.push({ id: 'pirate', cost: 5, type: 'pirate' });
  if (!room.placements.pilots.small) locations.push({ id: 'pilot:small', cost: 2, type: 'pilot' });
  if (!room.placements.pilots.large) locations.push({ id: 'pilot:large', cost: 5, type: 'pilot' });
  if (!room.placements.insurance) locations.push({ id: 'insurance', cost: 0, type: 'insurance' });
  return locations;
}

function finishPlacementTurn(room, pid) {
  if (room.placementPending[0] !== pid) throw new Error('放置顺序错误');
  room.placementPending.shift();
  room.currentPlayerId = room.placementPending[0] || null;
  if (!room.placementPending.length) finishPlacementRound(room);
}

function place(room, pid, locationId) {
  if (room.phase !== 'placement' || room.currentPlayerId !== pid) throw new Error('现在不能放置帮手');
  const player = playerOf(room, pid);
  if (player.stoppedPlacing || player.pawnsAvailable <= 0) throw new Error('你本轮已不能再放置');
  const locations = legalLocations(room);
  const location = locations.find((item) => item.id === locationId);
  if (!location) throw new Error('这个位置已被占用或不可用');

  const available = maxFunds(player);
  const minCost = locations.reduce((min, item) => Math.min(min, item.cost), Infinity);
  let blind = false;
  let paid = location.cost;
  if (location.type !== 'insurance' && available < location.cost) {
    if (available >= minCost) throw new Error('资金不足，请选择可负担的位置或先贷款');
    blind = true;
    paid = player.cash;
  }
  if (!blind && location.type !== 'insurance' && !pay(room, player, paid)) throw new Error('资金不足');
  if (blind) player.cash = 0;

  const token = tokenFor(room, pid);
  if (location.type === 'boat') {
    const ware = locationId.split(':')[1];
    room.boats.find((boat) => boat.ware === ware).crew.push(token);
  } else if (location.type === 'port' || location.type === 'shipyard') {
    const [area, letter] = locationId.split(':');
    room.placements[area][letter] = token;
  } else if (location.type === 'pirate') {
    room.placements.pirates.push(token);
  } else if (location.type === 'pilot') {
    room.placements.pilots[locationId.split(':')[1]] = token;
  } else if (location.type === 'insurance') {
    room.placements.insurance = token;
    player.cash += 10;
    recordCash(room, player, 10, '保险公司立即奖励', 'income');
  }
  player.pawnsAvailable -= 1;
  const label = locationLabel(room, locationId);
  if (location.type !== 'insurance' && paid > 0) recordCash(room, player, -paid, `派遣帮手到${label}`, 'expense');
  nowLog(room, `${player.nickname} ${blind ? '以偷渡客身份' : ''}派出帮手到${label}${location.type === 'insurance' ? '并领取 10₱' : `，支付 ${paid}₱`}`, 'placement');
  finishPlacementTurn(room, pid);
}

function passPlacement(room, pid) {
  if (room.phase !== 'placement' || room.currentPlayerId !== pid) throw new Error('现在不能跳过');
  const player = playerOf(room, pid);
  player.stoppedPlacing = true;
  nowLog(room, `${player.nickname} 停止本航程后续放置`, 'placement');
  finishPlacementTurn(room, pid);
}

function locationLabel(room, id) {
  if (id.startsWith('boat:')) return `${WARES[id.split(':')[1]].name}船`;
  if (id.startsWith('port:')) return `港口 ${id.split(':')[1]}`;
  if (id.startsWith('shipyard:')) return `船厂 ${id.split(':')[1]}`;
  if (id === 'pirate') return room.placements.pirates.length ? '海盗船' : '海盗船长位';
  if (id === 'pilot:small') return '小领航员位';
  if (id === 'pilot:large') return '大领航员位';
  if (id === 'insurance') return '保险公司';
  return id;
}

function beginDice(room, movementRound) {
  room.phase = 'dice';
  room.movementRound = movementRound;
  room.currentPlayerId = room.harborMasterId;
  room.pendingMoves = [];
  room.dice = null;
  nowLog(room, `等待港务长进行第 ${movementRound} 次掷骰`, 'phase');
}

function rollDice(room, pid, random = Math.random) {
  if (room.phase !== 'dice' || room.harborMasterId !== pid) throw new Error('只有港务长可以掷骰');
  room.dice = {};
  room.pendingMoves = [];
  for (const boat of room.boats) {
    if (boat.status !== 'sea') continue;
    const value = 1 + Math.floor(random() * 6);
    room.dice[boat.ware] = value;
    boat.lastRoll = value;
    room.pendingMoves.push(boat.ware);
  }
  nowLog(room, `第 ${room.movementRound} 次骰点：${Object.entries(room.dice).map(([ware, value]) => `${WARES[ware].name}${value}`).join(' / ')}`, 'dice');
  specialEvent(room, 'dice', {
    actorId: pid,
    movementRound: room.movementRound,
    results: room.dice,
  }, 2200);
  if (!room.pendingMoves.length) return finishMovement(room);
  room.phase = 'move';
  room.currentPlayerId = pid;
  room.moveSequence = [];
}

function nextVacantDock(room, area) {
  return DOCK_LETTERS.find((letter) => !room.docks[area][letter]) || null;
}

function assignDock(room, boat, area) {
  const letter = nextVacantDock(room, area);
  if (!letter) throw new Error(`${area === 'port' ? '港口' : '船厂'}没有空位`);
  room.docks[area][letter] = boat.ware;
  boat.status = area;
  boat.dock = letter;
  nowLog(room, `${WARES[boat.ware].name}船进入${area === 'port' ? '港口' : '船厂'} ${letter}`, area);
}

function moveBoat(room, pid, ware) {
  if (room.phase !== 'move' || room.harborMasterId !== pid) throw new Error('只有港务长可以决定移动顺序');
  if (!room.pendingMoves.includes(ware)) throw new Error('这艘船已经移动');
  const boat = room.boats.find((item) => item.ware === ware);
  const value = room.dice[ware];
  boat.position += value;
  room.moveSequence.push(ware);
  if (boat.position > 13) assignDock(room, boat, 'port');
  else nowLog(room, `${WARES[ware].name}船前进 ${value} 格，到达 ${boat.position}`, 'dice');
  room.pendingMoves = room.pendingMoves.filter((id) => id !== ware);
  if (!room.pendingMoves.length) finishMovement(room);
}

function finishMovement(room) {
  if (room.movementRound === 1) {
    room.placementRound += 1;
    return startPlacementRound(room);
  }
  if (room.movementRound === 2) {
    const targets = room.boats.filter((boat) => boat.status === 'sea' && boat.position === 13 && boat.crew.length < WARES[boat.ware].crewCosts.length);
    if (targets.length && room.placements.pirates.length) {
      room.pirateBoardQueue = room.placements.pirates.map((token) => clone(token));
      room.phase = 'pirate_board';
      room.currentPlayerId = room.pirateBoardQueue[0].pid;
      nowLog(room, '有船停在 13：海盗依次决定是否登船', 'pirate');
      return;
    }
    room.placementRound += 1;
    return startPlacementRound(room);
  }
  return finalizeVoyageMovement(room);
}

function pirateBoard(room, pid, ware) {
  if (room.phase !== 'pirate_board' || room.currentPlayerId !== pid) throw new Error('现在不是你的海盗决策');
  const queued = room.pirateBoardQueue[0];
  const liveIndex = room.placements.pirates.findIndex((token) => token.id === queued.id);
  if (liveIndex < 0) throw new Error('海盗已经离开海盗船');
  if (ware) {
    const boat = room.boats.find((item) => item.ware === ware);
    if (!boat || boat.status !== 'sea' || boat.position !== 13 || boat.crew.length >= WARES[ware].crewCosts.length) throw new Error('不能登上这艘船');
    const [token] = room.placements.pirates.splice(liveIndex, 1);
    boat.crew.push(token);
    nowLog(room, `${playerName(room, pid)} 的海盗登上${WARES[ware].name}船`, 'pirate');
    specialEvent(room, 'pirate_board', { pid, ware }, 1100);
  } else {
    nowLog(room, `${playerName(room, pid)} 的海盗留在海盗船等待抢劫`, 'pirate');
  }
  room.pirateBoardQueue.shift();
  if (room.pirateBoardQueue.length) room.currentPlayerId = room.pirateBoardQueue[0].pid;
  else {
    room.placementRound += 1;
    startPlacementRound(room);
  }
}

function beginPilots(room) {
  room.pilotQueue = [];
  if (room.placements.pilots.small) room.pilotQueue.push({ kind: 'small', token: clone(room.placements.pilots.small) });
  if (room.placements.pilots.large) room.pilotQueue.push({ kind: 'large', token: clone(room.placements.pilots.large) });
  if (!room.pilotQueue.length) return beginDice(room, 3);
  room.phase = 'pilot';
  room.currentPlayerId = room.pilotQueue[0].token.pid;
  nowLog(room, '第三次掷骰前，领航员开始行动', 'phase');
}

function pilotMove(room, pid, moves) {
  if (room.phase !== 'pilot' || room.currentPlayerId !== pid) throw new Error('现在不是你的领航行动');
  const job = room.pilotQueue[0];
  moves = Array.isArray(moves) ? moves.filter((move) => move && move.ware && Number(move.delta)) : [];
  if (job.kind === 'small') {
    if (moves.length > 1 || (moves.length === 1 && Math.abs(Number(moves[0].delta)) !== 1)) throw new Error('小领航员只能移动一艘船 1 格');
  } else if (moves.length === 1) {
    if (![1, 2].includes(Math.abs(Number(moves[0].delta)))) throw new Error('大领航员最多移动 2 格');
  } else if (moves.length === 2) {
    if (moves[0].ware === moves[1].ware || moves.some((move) => Math.abs(Number(move.delta)) !== 1)) throw new Error('移动两艘船时，每艘只能 1 格');
  } else if (moves.length > 2) {
    throw new Error('移动数量超过大领航员能力');
  }

  for (const move of moves) {
    const boat = room.boats.find((item) => item.ware === move.ware);
    if (!boat || boat.status !== 'sea') throw new Error('只能影响尚未抵港的船');
    const delta = Number(move.delta);
    if (!Number.isInteger(delta) || boat.position + delta < 0) throw new Error('船不能退到 0 之前');
    boat.position += delta;
    nowLog(room, `${job.kind === 'small' ? '小' : '大'}领航员令${WARES[boat.ware].name}船${delta > 0 ? '前进' : '后退'} ${Math.abs(delta)} 格`, 'pilot');
    if (boat.position > 13) assignDock(room, boat, 'port');
  }
  if (!moves.length) nowLog(room, `${job.kind === 'small' ? '小' : '大'}领航员放弃行动`, 'pilot');
  room.pilotQueue.shift();
  if (room.pilotQueue.length) room.currentPlayerId = room.pilotQueue[0].token.pid;
  else beginDice(room, 3);
}

function finalizeVoyageMovement(room) {
  const pirates = room.placements.pirates.slice();
  const plundered = room.boats.filter((boat) => boat.status === 'sea' && boat.position === 13 && pirates.length > 0);
  const regularFailures = room.boats.filter((boat) => boat.status === 'sea' && !plundered.includes(boat));
  const order = room.moveSequence || [];
  regularFailures.sort((a, b) => order.indexOf(a.ware) - order.indexOf(b.ware));
  regularFailures.forEach((boat) => assignDock(room, boat, 'shipyard'));

  if (plundered.length) {
    for (const boat of plundered) {
      boat.plundered = true;
      boat.crew = [];
    }
    room.plunderPirates = pirates.map((token) => clone(token));
    room.plunderQueue = plundered.map((boat) => boat.ware);
    room.phase = 'pirate_destination';
    room.currentPlayerId = pirates[0].pid;
    nowLog(room, `海盗抢下 ${plundered.map((boat) => WARES[boat.ware].name).join('、')}船，船长决定去向`, 'pirate');
    specialEvent(room, 'pirate_plunder', {
      captainId: pirates[0].pid,
      pirateIds: pirates.map((token) => token.pid),
      wares: plundered.map((boat) => boat.ware),
    }, 1700);
    return;
  }
  settleVoyage(room);
}

function pirateDestination(room, pid, area) {
  if (room.phase !== 'pirate_destination' || room.currentPlayerId !== pid) throw new Error('只有海盗船长可以决定');
  if (!['port', 'shipyard'].includes(area)) throw new Error('请选择港口或船厂');
  const ware = room.plunderQueue[0];
  const boat = room.boats.find((item) => item.ware === ware);
  assignDock(room, boat, area);
  boat.plundered = true;
  room.plunderQueue.shift();
  if (!room.plunderQueue.length) settleVoyage(room);
}

function credit(room, player, amount, label, category = 'income') {
  player.cash += amount;
  recordCash(room, player, amount, label, category);
}

function settleVoyage(room) {
  room.phase = 'settle';
  room.currentPlayerId = null;

  const plunderTotal = room.boats.filter((boat) => boat.plundered).reduce((sum, boat) => sum + WARES[boat.ware].pool, 0);
  if (plunderTotal && room.plunderPirates.length) {
    const each = plunderTotal / room.plunderPirates.length;
    for (const token of room.plunderPirates) credit(room, playerOf(room, token.pid), each, '海盗抢劫分红');
    nowLog(room, `海盗瓜分 ${plunderTotal}₱，每名海盗获得 ${each}₱`, 'money');
  }

  for (const boat of room.boats.filter((item) => item.status === 'port' && !item.plundered)) {
    if (!boat.crew.length) continue;
    const each = WARES[boat.ware].pool / boat.crew.length;
    for (const token of boat.crew) credit(room, playerOf(room, token.pid), each, `${WARES[boat.ware].name}船船员分红`);
    nowLog(room, `${WARES[boat.ware].name}船员瓜分 ${WARES[boat.ware].pool}₱，每名帮手获得 ${each}₱`, 'money');
  }

  for (const letter of DOCK_LETTERS) {
    if (room.docks.port[letter] && room.placements.port[letter]) {
      const reward = SLOT_DATA.port[letter].reward;
      const receiver = playerOf(room, room.placements.port[letter].pid);
      credit(room, receiver, reward, `港口 ${letter} 押注命中`);
      nowLog(room, `${receiver.nickname} 的港口 ${letter} 下注命中，获得 ${reward}₱`, 'money');
    }
  }

  const insurerToken = room.placements.insurance;
  const insurer = insurerToken ? playerOf(room, insurerToken.pid) : null;
  for (const letter of DOCK_LETTERS) {
    if (!room.docks.shipyard[letter]) continue;
    const repair = SLOT_DATA.shipyard[letter].reward;
    const betToken = room.placements.shipyard[letter];
    const receiver = betToken ? playerOf(room, betToken.pid) : null;
    if (!insurer) {
      if (receiver) {
        credit(room, receiver, repair, `船厂 ${letter} 押注命中`);
        nowLog(room, `${receiver.nickname} 的船厂 ${letter} 下注命中，银行支付 ${repair}₱`, 'money');
      }
      continue;
    }
    if (receiver && receiver.id === insurer.id) {
      nowLog(room, `${insurer.nickname} 自己承保了船厂 ${letter}，收支相抵`, 'money');
      continue;
    }
    while (insurer.cash < repair && mortgageOne(room, insurer)) {}
    const paid = Math.min(insurer.cash, repair);
    insurer.cash -= paid;
    recordCash(room, insurer, -paid, `承担船厂 ${letter} 修理费`, 'expense');
    if (receiver) credit(room, receiver, repair, `船厂 ${letter} 押注命中`);
    nowLog(room, `${insurer.nickname} 为船厂 ${letter} 支付 ${paid}₱${paid < repair ? `，银行补足 ${repair - paid}₱` : ''}${receiver ? `给 ${receiver.nickname}` : '给银行'}`, 'money');
  }

  const delivered = [];
  for (const boat of room.boats.filter((item) => item.status === 'port')) {
    room.market[boat.ware] = Math.min(MARKET_TRACK.length - 1, room.market[boat.ware] + 1);
    delivered.push(`${WARES[boat.ware].name}→${MARKET_TRACK[room.market[boat.ware]]}₱`);
  }
  if (delivered.length) nowLog(room, `黑市涨价：${delivered.join(' / ')}`, 'market');
  else nowLog(room, '本航程没有货物抵港，黑市价格不变', 'market');
  if (delivered.length) specialEvent(room, 'market_rise', {
    delivered: room.boats.filter((item) => item.status === 'port').map((boat) => ({ ware: boat.ware, price: MARKET_TRACK[room.market[boat.ware]] })),
  });

  openSettlementReview(room, WARE_IDS.some((ware) => MARKET_TRACK[room.market[ware]] >= 30));
}

function settlementConfirmation(room) {
  if (room.placements.pilots.large) return { pid: room.placements.pilots.large.pid, role: '大领航员' };
  if (room.placements.pilots.small) return { pid: room.placements.pilots.small.pid, role: '小领航员' };
  return { pid: room.harborMasterId, role: '港务长（本轮无领航员）' };
}

function openSettlementReview(room, endsGame) {
  const confirmer = settlementConfirmation(room);
  const ledger = room.voyageLedger || {
    openingCash: Object.fromEntries(room.players.map((player) => [player.id, player.cash])),
    entries: [],
  };
  const players = room.players.map((player) => {
    const openingCash = money(ledger.openingCash[player.id] ?? player.cash);
    const entries = ledger.entries.filter((entry) => entry.pid === player.id).map((entry) => clone(entry));
    const totalIncome = money(entries.filter((entry) => entry.amount > 0).reduce((sum, entry) => sum + entry.amount, 0));
    const totalExpense = money(-entries.filter((entry) => entry.amount < 0).reduce((sum, entry) => sum + entry.amount, 0));
    return {
      pid: player.id,
      nickname: player.nickname,
      color: player.color,
      isBot: player.isBot,
      openingCash,
      entries,
      totalIncome,
      totalExpense,
      net: money(player.cash - openingCash),
      closingCash: money(player.cash),
    };
  });
  const openedAt = Date.now();
  room.settlement = {
    round: room.round,
    openedAt,
    readyAt: openedAt + 5000,
    confirmerId: confirmer.pid,
    confirmerRole: confirmer.role,
    endsGame: Boolean(endsGame),
    players,
  };
  room.phase = 'settlement_review';
  room.currentPlayerId = confirmer.pid;
  nowLog(room, `第 ${room.round} 次航程结算完成，等待${confirmer.role}${playerName(room, confirmer.pid)}确认`, 'phase');
}

function confirmSettlement(room, pid) {
  if (room.phase !== 'settlement_review' || !room.settlement) throw new Error('现在没有待确认的航程结算');
  if (room.settlement.confirmerId !== pid) throw new Error(`只有本轮${room.settlement.confirmerRole}可以确认结算`);
  const endsGame = room.settlement.endsGame;
  nowLog(room, `${playerName(room, pid)} 已确认第 ${room.round} 次航程结算`, 'phase');
  room.settlement = null;
  if (endsGame) finishGame(room);
  else beginVoyage(room, room.previousHarborMasterId);
}

function finishGame(room) {
  room.status = 'finished';
  room.phase = 'finished';
  room.currentPlayerId = null;
  room.scores = room.players.map((player) => {
    const stockValue = WARE_IDS.reduce((sum, ware) => sum + player.shares[ware] * MARKET_TRACK[room.market[ware]], 0);
    const debt = WARE_IDS.reduce((sum, ware) => sum + player.mortgaged[ware] * 15, 0);
    return { pid: player.id, nickname: player.nickname, cash: player.cash, stockValue, debt, total: player.cash + stockValue - debt };
  }).sort((a, b) => b.total - a.total);
  const top = room.scores[0].total;
  room.winners = room.scores.filter((score) => score.total === top).map((score) => score.pid);
  nowLog(room, `游戏结束：${room.winners.map((pid) => playerName(room, pid)).join('、')} 获胜`, 'system');
  specialEvent(room, 'game_end', { winnerIds: room.winners, top });
}

function totalShares(player) {
  return WARE_IDS.reduce((sum, ware) => sum + player.shares[ware], 0);
}

function botAuction(room, bot, random) {
  const personality = bot.id.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0) % 4;
  const cap = Math.min(maxFunds(bot), 4 + room.round * 2 + personality + Math.min(3, totalShares(bot)));
  const nextBid = room.auction.highBid + 1;
  if (nextBid <= cap && (!room.auction.leaderId || random() > 0.18)) bid(room, bot.id, nextBid);
  else passAuction(room, bot.id);
}

function botHarborSetup(room, bot) {
  const ranked = WARE_IDS.slice().sort((a, b) => {
    const score = (ware) => bot.shares[ware] * 8 + room.market[ware] * 3 + WARES[ware].pool / 12 + room.stockSupply[ware];
    return score(b) - score(a);
  });
  const wares = ranked.slice(0, 3);
  const starts = { [wares[0]]: 4, [wares[1]]: 3, [wares[2]]: 2 };
  const buyWare = ranked.find((ware) => {
    const price = Math.max(5, MARKET_TRACK[room.market[ware]]);
    return room.stockSupply[ware] > 0 && bot.cash - price >= 10;
  }) || null;
  harborSetup(room, bot.id, { wares, starts, buyWare });
}

function botLocationScore(room, bot, location) {
  if (location.type === 'boat') {
    const ware = location.id.split(':')[1];
    const boat = room.boats.find((item) => item.ware === ware);
    const shareInterest = bot.shares[ware] * 2.5;
    const payout = WARES[ware].pool / (boat.crew.length + 1);
    return boat.position * 0.65 + payout / 5 + shareInterest - location.cost * 0.65;
  }
  if (location.type === 'port') return 4.5 + room.movementRound * 1.5 - location.cost * 0.45;
  if (location.type === 'shipyard') return 5.5 - room.movementRound * 0.7 - location.cost * 0.4;
  if (location.type === 'pirate') return room.placements.pirates.length ? 8.2 : 7.3;
  if (location.id === 'pilot:large') return 6.4;
  if (location.id === 'pilot:small') return 5.6;
  if (location.type === 'insurance') return bot.cash < 16 ? 6 : 2.5;
  return 0;
}

function botPlacement(room, bot, random) {
  const locations = legalLocations(room);
  if (!locations.length || bot.pawnsAvailable <= 0) return passPlacement(room, bot.id);
  const ranked = locations
    .map((location) => ({ location, score: botLocationScore(room, bot, location) + random() * 1.4 }))
    .sort((a, b) => b.score - a.score);
  place(room, bot.id, ranked[0].location.id);
}

function botMoveBoat(room, bot) {
  const ware = room.pendingMoves.slice().sort((a, b) => {
    const boatA = room.boats.find((boat) => boat.ware === a);
    const boatB = room.boats.find((boat) => boat.ware === b);
    const score = (id, boat) => (boat.position + room.dice[id] > 13 ? 100 : 0) + bot.shares[id] * 6 + WARES[id].pool / 12;
    return score(b, boatB) - score(a, boatA);
  })[0];
  moveBoat(room, bot.id, ware);
}

function botPirateBoard(room, bot) {
  const targets = room.boats
    .filter((boat) => boat.status === 'sea' && boat.position === 13 && boat.crew.length < WARES[boat.ware].crewCosts.length)
    .sort((a, b) => (WARES[b.ware].pool / (b.crew.length + 1)) - (WARES[a.ware].pool / (a.crew.length + 1)));
  // Two pirates work well as a team: the first boards, while the final pirate
  // stays behind to preserve the third-round plunder threat.
  const ware = targets.length && room.placements.pirates.length > 1 ? targets[0].ware : null;
  pirateBoard(room, bot.id, ware);
}

function botPilot(room, bot) {
  const job = room.pilotQueue[0];
  const targets = room.boats.filter((boat) => boat.status === 'sea' && boat.position <= 13);
  if (!targets.length) return pilotMove(room, bot.id, []);
  targets.sort((a, b) => {
    const interest = (boat) => bot.shares[boat.ware] * 7 + boat.crew.filter((token) => token.pid === bot.id).length * 8 + boat.position;
    return interest(b) - interest(a);
  });
  pilotMove(room, bot.id, [{ ware: targets[0].ware, delta: job.kind === 'large' ? 2 : 1 }]);
}

function botPirateDestination(room, bot) {
  const ware = room.plunderQueue[0];
  const ownsPortBet = DOCK_LETTERS.some((letter) => room.placements.port[letter]?.pid === bot.id);
  const ownsYardBet = DOCK_LETTERS.some((letter) => room.placements.shipyard[letter]?.pid === bot.id);
  const area = bot.shares[ware] > 0 || ownsPortBet || !ownsYardBet ? 'port' : 'shipyard';
  pirateDestination(room, bot.id, area);
}

function randomItem(items, random) {
  if (!items.length) return null;
  return items[Math.min(items.length - 1, Math.floor(random() * items.length))];
}

function shuffled(items, random) {
  const result = items.slice();
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.min(index, Math.floor(random() * (index + 1)));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function randomHarborSetup(room, player, random) {
  const wares = shuffled(WARE_IDS, random).slice(0, 3);
  const startOptions = [];
  for (let first = 0; first <= 5; first += 1) {
    for (let second = 0; second <= 5; second += 1) {
      const third = 9 - first - second;
      if (third >= 0 && third <= 5) startOptions.push([first, second, third]);
    }
  }
  const selectedStarts = randomItem(startOptions, random);
  const starts = Object.fromEntries(wares.map((ware, index) => [ware, selectedStarts[index]]));
  const affordableShares = WARE_IDS.filter((ware) => {
    const price = Math.max(5, MARKET_TRACK[room.market[ware]]);
    return room.stockSupply[ware] > 0 && maxFunds(player) >= price;
  });
  const buyWare = affordableShares.length && random() >= 0.6 ? randomItem(affordableShares, random) : null;
  harborSetup(room, player.id, { wares, starts, buyWare });
}

function randomPlacement(room, player, random) {
  const locations = legalLocations(room);
  if (!locations.length || player.pawnsAvailable <= 0) return passPlacement(room, player.id);
  const available = maxFunds(player);
  const minCost = locations.reduce((minimum, location) => Math.min(minimum, location.cost), Infinity);
  const affordable = available < minCost
    ? locations
    : locations.filter((location) => location.type === 'insurance' || location.cost <= available);
  if (!affordable.length || random() < 0.18) return passPlacement(room, player.id);
  place(room, player.id, randomItem(affordable, random).id);
}

function randomPirateBoard(room, player, random) {
  const targets = room.boats
    .filter((boat) => boat.status === 'sea' && boat.position === 13 && boat.crew.length < WARES[boat.ware].crewCosts.length)
    .map((boat) => boat.ware);
  pirateBoard(room, player.id, randomItem(targets.concat([null]), random));
}

function randomPilotMove(room, player, random) {
  const job = room.pilotQueue[0];
  const targets = room.boats.filter((boat) => boat.status === 'sea');
  if (!targets.length || random() < 0.25) return pilotMove(room, player.id, []);
  const boat = randomItem(targets, random);
  const maximum = job.kind === 'large' ? 2 : 1;
  const deltas = [];
  for (let delta = -maximum; delta <= maximum; delta += 1) {
    if (delta && boat.position + delta >= 0) deltas.push(delta);
  }
  pilotMove(room, player.id, [{ ware: boat.ware, delta: randomItem(deltas, random) }]);
}

function runTimeoutTurn(room, random = Math.random) {
  if (room.status !== 'playing') return { acted: false };
  const wait = (Number(room.lockedUntil) || 0) - Date.now();
  if (wait > 0) return { acted: false, wait };
  const player = playerOf(room, room.currentPlayerId);
  if (!player) return { acted: false };

  switch (room.phase) {
    case 'auction': {
      const nextBid = room.auction.highBid + 1;
      if (nextBid <= maxFunds(player) && random() >= 0.5) bid(room, player.id, nextBid);
      else passAuction(room, player.id);
      break;
    }
    case 'harbor_setup': randomHarborSetup(room, player, random); break;
    case 'placement': randomPlacement(room, player, random); break;
    case 'dice': rollDice(room, player.id, random); break;
    case 'move': moveBoat(room, player.id, randomItem(room.pendingMoves, random)); break;
    case 'pirate_board': randomPirateBoard(room, player, random); break;
    case 'pilot': randomPilotMove(room, player, random); break;
    case 'pirate_destination': pirateDestination(room, player.id, random() < 0.5 ? 'port' : 'shipyard'); break;
    case 'settlement_review': confirmSettlement(room, player.id); break;
    default: return { acted: false };
  }
  nowLog(room, `${player.nickname} 决策超时，系统已随机代为行动`, 'system');
  room.version += 1;
  return { acted: true, playerId: player.id, phase: room.phase };
}

function runBotTurn(room, random = Math.random) {
  if (room.status !== 'playing') return { acted: false };
  const wait = (Number(room.lockedUntil) || 0) - Date.now();
  if (wait > 0) return { acted: false, wait };
  const bot = playerOf(room, room.currentPlayerId);
  if (!bot?.isBot) return { acted: false };
  if (room.phase === 'settlement_review' && room.settlement?.readyAt > Date.now()) {
    return { acted: false, wait: room.settlement.readyAt - Date.now() };
  }
  switch (room.phase) {
    case 'auction': botAuction(room, bot, random); break;
    case 'harbor_setup': botHarborSetup(room, bot); break;
    case 'placement': botPlacement(room, bot, random); break;
    case 'dice': rollDice(room, bot.id, random); break;
    case 'move': botMoveBoat(room, bot); break;
    case 'pirate_board': botPirateBoard(room, bot); break;
    case 'pilot': botPilot(room, bot); break;
    case 'pirate_destination': botPirateDestination(room, bot); break;
    case 'settlement_review': confirmSettlement(room, bot.id); break;
    default: return { acted: false };
  }
  room.version += 1;
  return { acted: true, botId: bot.id, phase: room.phase };
}

function mortgage(room, pid, ware) {
  if (room.phase === 'settlement_review') throw new Error('结算确认前不能变更现金');
  const player = playerOf(room, pid);
  if (!WARES[ware]) throw new Error('未知股票');
  if (!mortgageOne(room, player, ware)) throw new Error('没有可抵押的这类股票');
}

function redeem(room, pid, ware) {
  if (room.phase === 'settlement_review') throw new Error('结算确认前不能变更现金');
  const player = playerOf(room, pid);
  if (!WARES[ware] || player.mortgaged[ware] <= 0) throw new Error('没有这类已抵押股票');
  if (player.cash < 15) throw new Error('赎回需要 15₱ 现金');
  const isLeadingBidder = room.phase === 'auction' && room.auction && room.auction.leaderId === pid;
  const fundsAfterRedeem = player.cash - 15 + (unencumberedCount(player) + 1) * 12;
  if (isLeadingBidder && fundsAfterRedeem < room.auction.highBid) {
    throw new Error(`你正以 ${room.auction.highBid}₱ 领先竞拍，赎回会使可支付额度不足`);
  }
  player.cash -= 15;
  recordCash(room, player, -15, '赎回抵押股票', 'expense');
  player.mortgaged[ware] -= 1;
  nowLog(room, `${player.nickname} 支付 15₱ 赎回 1 股${WARES[ware].name}`, 'money');
}

function dispatch(room, pid, action, payload = {}, random = Math.random) {
  if (!playerOf(room, pid)) throw new Error('你不在这个房间');
  switch (action) {
    case 'add-bot': addBot(room, pid); break;
    case 'remove-bot': removeBot(room, pid, payload.botId); break;
    case 'start-game': startGame(room, pid, random); break;
    case 'bid': bid(room, pid, payload.amount); break;
    case 'pass-auction': passAuction(room, pid); break;
    case 'harbor-setup': harborSetup(room, pid, payload); break;
    case 'place': place(room, pid, payload.location); break;
    case 'pass-placement': passPlacement(room, pid); break;
    case 'roll': rollDice(room, pid, random); break;
    case 'move': moveBoat(room, pid, payload.ware); break;
    case 'pirate-board': pirateBoard(room, pid, payload.ware || null); break;
    case 'pilot': pilotMove(room, pid, payload.moves || []); break;
    case 'pirate-destination': pirateDestination(room, pid, payload.area); break;
    case 'confirm-settlement': confirmSettlement(room, pid); break;
    case 'mortgage': mortgage(room, pid, payload.ware); break;
    case 'redeem': redeem(room, pid, payload.ware); break;
    default: throw new Error('未知动作');
  }
  room.version += 1;
  return room;
}

function publicRoom(room, viewerId) {
  const view = clone(room);
  view.players = room.players.map((player) => {
    const visible = clone(player);
    visible.shareCount = WARE_IDS.reduce((sum, ware) => sum + player.shares[ware], 0);
    visible.mortgagedCount = WARE_IDS.reduce((sum, ware) => sum + player.mortgaged[ware], 0);
    if (viewerId !== player.id && room.status !== 'finished') {
      delete visible.shares;
      delete visible.mortgaged;
    }
    return visible;
  });
  return view;
}

module.exports = {
  WARES,
  WARE_IDS,
  MARKET_TRACK,
  SLOT_DATA,
  createRoom,
  addPlayer,
  addBot,
  removeBot,
  removeWaitingPlayer,
  startGame,
  dispatch,
  publicRoom,
  playerOf,
  legalLocations,
  maxFunds,
  runBotTurn,
  runTimeoutTurn,
  specialEvent,
  clone,
};

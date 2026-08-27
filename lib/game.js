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

function playerOf(room, pid) {
  return room.players.find((player) => player.id === pid);
}

function playerName(room, pid) {
  return playerOf(room, pid)?.nickname || '未知玩家';
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

function createRoom({ code, name, maxPlayers, host }) {
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
  };
  addPlayer(room, host);
  nowLog(room, `${host.nickname} 创建了房间`);
  return room;
}

function addPlayer(room, identity) {
  if (room.status !== 'waiting') throw new Error('对局已经开始');
  if (room.players.some((player) => player.id === identity.id)) return room;
  if (room.players.length >= room.maxPlayers) throw new Error('房间已满');
  if (room.players.some((player) => player.nickname === identity.nickname)) throw new Error('房间内已有同名玩家');
  room.players.push({
    id: identity.id,
    nickname: identity.nickname,
    color: PLAYER_COLORS[room.players.length],
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
  for (const player of room.players) {
    player.pawnsAvailable = player.pawnsTotal;
    player.stoppedPlacing = false;
  }
}

function beginVoyage(room, starterId) {
  resetVoyageBoard(room);
  room.round += 1;
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
    if (!pay(room, winner, price)) throw new Error('竞拍款无法支付');
    nowLog(room, `${winner.nickname} 以 ${price}₱ 成为港务长`, 'auction');
  }
  room.harborMasterId = winnerId;
  room.previousHarborMasterId = winnerId;
  room.phase = 'harbor_setup';
  room.currentPlayerId = winnerId;
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
  }
  player.pawnsAvailable -= 1;
  const label = locationLabel(room, locationId);
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

function credit(player, amount) {
  player.cash += amount;
}

function settleVoyage(room) {
  room.phase = 'settle';
  room.currentPlayerId = null;

  const plunderTotal = room.boats.filter((boat) => boat.plundered).reduce((sum, boat) => sum + WARES[boat.ware].pool, 0);
  if (plunderTotal && room.plunderPirates.length) {
    const each = plunderTotal / room.plunderPirates.length;
    for (const token of room.plunderPirates) credit(playerOf(room, token.pid), each);
    nowLog(room, `海盗瓜分 ${plunderTotal}₱，每名海盗获得 ${each}₱`, 'money');
  }

  for (const boat of room.boats.filter((item) => item.status === 'port' && !item.plundered)) {
    if (!boat.crew.length) continue;
    const each = WARES[boat.ware].pool / boat.crew.length;
    for (const token of boat.crew) credit(playerOf(room, token.pid), each);
    nowLog(room, `${WARES[boat.ware].name}船员瓜分 ${WARES[boat.ware].pool}₱，每名帮手获得 ${each}₱`, 'money');
  }

  for (const letter of DOCK_LETTERS) {
    if (room.docks.port[letter] && room.placements.port[letter]) {
      const reward = SLOT_DATA.port[letter].reward;
      const receiver = playerOf(room, room.placements.port[letter].pid);
      credit(receiver, reward);
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
        credit(receiver, repair);
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
    if (receiver) credit(receiver, repair);
    nowLog(room, `${insurer.nickname} 为船厂 ${letter} 支付 ${paid}₱${paid < repair ? `，银行补足 ${repair - paid}₱` : ''}${receiver ? `给 ${receiver.nickname}` : '给银行'}`, 'money');
  }

  const delivered = [];
  for (const boat of room.boats.filter((item) => item.status === 'port')) {
    room.market[boat.ware] = Math.min(MARKET_TRACK.length - 1, room.market[boat.ware] + 1);
    delivered.push(`${WARES[boat.ware].name}→${MARKET_TRACK[room.market[boat.ware]]}₱`);
  }
  if (delivered.length) nowLog(room, `黑市涨价：${delivered.join(' / ')}`, 'market');
  else nowLog(room, '本航程没有货物抵港，黑市价格不变', 'market');

  if (WARE_IDS.some((ware) => MARKET_TRACK[room.market[ware]] >= 30)) return finishGame(room);
  beginVoyage(room, room.previousHarborMasterId);
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
}

function mortgage(room, pid, ware) {
  const player = playerOf(room, pid);
  if (!WARES[ware]) throw new Error('未知股票');
  if (!mortgageOne(room, player, ware)) throw new Error('没有可抵押的这类股票');
}

function redeem(room, pid, ware) {
  const player = playerOf(room, pid);
  if (!WARES[ware] || player.mortgaged[ware] <= 0) throw new Error('没有这类已抵押股票');
  if (player.cash < 15) throw new Error('赎回需要 15₱ 现金');
  player.cash -= 15;
  player.mortgaged[ware] -= 1;
  nowLog(room, `${player.nickname} 支付 15₱ 赎回 1 股${WARES[ware].name}`, 'money');
}

function dispatch(room, pid, action, payload = {}, random = Math.random) {
  if (!playerOf(room, pid)) throw new Error('你不在这个房间');
  switch (action) {
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
  removeWaitingPlayer,
  startGame,
  dispatch,
  publicRoom,
  playerOf,
  legalLocations,
  maxFunds,
  clone,
};

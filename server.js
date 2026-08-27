'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {
  createRoom,
  addPlayer,
  dispatch,
  publicRoom,
  runBotTurn,
} = require('./lib/game');

const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, '.data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');

// Browser clients keep one lightweight event stream open. Mutations only send a
// small "change" signal; each client then fetches the room view personalized for
// that player. This avoids repeatedly downloading the whole table on a timer.
const eventClients = new Set();
const botTimers = new Map();

let state = { sessions: {}, rooms: {} };
try {
  state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
} catch (_) {
  state = { sessions: {}, rooms: {} };
}

let saveTimer = null;
function saveSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const temp = `${STATE_FILE}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(state));
    fs.renameSync(temp, STATE_FILE);
  }, 80);
}

function notifyClients(scope) {
  const payload = `event: change\ndata: ${JSON.stringify({ scope: scope || 'lobby', at: Date.now() })}\n\n`;
  for (const client of eventClients) {
    try { client.res.write(payload); }
    catch (_) { eventClients.delete(client); }
  }
}

function scheduleBot(roomCode, requestedDelay) {
  const previous = botTimers.get(roomCode);
  if (previous) clearTimeout(previous);
  botTimers.delete(roomCode);
  const room = state.rooms[roomCode];
  if (!room || room.status !== 'playing') return;
  const current = room.players.find((player) => player.id === room.currentPlayerId);
  if (!current?.isBot) return;
  const lockedFor = Math.max(0, (Number(room.lockedUntil) || 0) - Date.now());
  const delay = Math.max(Number(requestedDelay) || 0, lockedFor ? lockedFor + 60 : 520);
  const timer = setTimeout(() => {
    botTimers.delete(roomCode);
    const liveRoom = state.rooms[roomCode];
    if (!liveRoom) return;
    try {
      const result = runBotTurn(liveRoom);
      if (result.acted) changed(roomCode);
      else if (result.wait > 0) scheduleBot(roomCode, result.wait + 60);
    } catch (error) {
      console.error(`人机回合执行失败 [${roomCode}]:`, error.message);
      scheduleBot(roomCode, 1200);
    }
  }, delay);
  timer.unref?.();
  botTimers.set(roomCode, timer);
}

function changed(scope) {
  saveSoon();
  notifyClients(scope);
  if (scope) scheduleBot(scope);
}

function dissolveRoom(room, leavingSession) {
  const message = `${leavingSession.nickname} 退出了房间，本局已解散`;
  const timer = botTimers.get(room.code);
  if (timer) clearTimeout(timer);
  botTimers.delete(room.code);
  delete state.rooms[room.code];
  for (const session of Object.values(state.sessions)) {
    if (session.roomCode !== room.code) continue;
    session.roomCode = null;
    session.notice = message;
  }
  delete leavingSession.notice;
  return message;
}

function json(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(data),
    'Cache-Control': 'no-store',
  });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) reject(new Error('请求内容过大'));
    });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch (_) { reject(new Error('JSON 格式错误')); }
    });
    req.on('error', reject);
  });
}

function safeNickname(value) {
  const nickname = String(value || '').trim().replace(/[<>]/g, '');
  if (nickname.length < 2 || nickname.length > 16) throw new Error('昵称需要 2–16 个字符');
  return nickname;
}

function token() {
  return crypto.randomBytes(24).toString('base64url');
}

function playerId() {
  return `p_${crypto.randomBytes(8).toString('hex')}`;
}

function roomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  do {
    code = Array.from({ length: 6 }, () => alphabet[crypto.randomInt(alphabet.length)]).join('');
  } while (state.rooms[code]);
  return code;
}

function sessionFrom(body) {
  const session = state.sessions[body.sessionToken];
  if (!session) throw new Error('会话失效，请重新输入昵称');
  session.lastSeen = Date.now();
  return session;
}

function currentRoom(session) {
  return session.roomCode ? state.rooms[session.roomCode] : null;
}

async function api(req, res, pathname) {
  const body = await readBody(req);

  if (pathname === '/api/session') {
    const nickname = safeNickname(body.nickname);
    const requested = body.resumeToken && state.sessions[body.resumeToken];
    if (requested && requested.nickname === nickname) {
      requested.lastSeen = Date.now();
      saveSoon();
      return json(res, 200, { success: true, sessionToken: body.resumeToken, playerId: requested.playerId, nickname });
    }
    const sessionToken = token();
    const id = playerId();
    state.sessions[sessionToken] = { playerId: id, nickname, roomCode: null, lastSeen: Date.now() };
    saveSoon();
    return json(res, 200, { success: true, sessionToken, playerId: id, nickname });
  }

  const session = sessionFrom(body);

  if (pathname === '/api/rooms/list') {
    const rooms = Object.values(state.rooms)
      .filter((room) => room.status === 'waiting')
      .map((room) => ({ code: room.code, name: room.name, count: room.players.length, maxPlayers: room.maxPlayers, host: room.players.find((p) => p.id === room.hostId)?.nickname || '—' }))
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
    return json(res, 200, { success: true, rooms });
  }

  if (pathname === '/api/rooms/create') {
    if (currentRoom(session)) throw new Error('请先离开当前房间');
    const code = roomCode();
    const room = createRoom({
      code,
      name: String(body.name || '').trim().slice(0, 24),
      maxPlayers: Number(body.maxPlayers),
      host: { id: session.playerId, nickname: session.nickname },
    });
    state.rooms[code] = room;
    session.roomCode = code;
    delete session.notice;
    changed(code);
    return json(res, 200, { success: true, code, room: publicRoom(room, session.playerId) });
  }

  if (pathname === '/api/rooms/join') {
    const code = String(body.code || '').trim().toUpperCase();
    const room = state.rooms[code];
    if (!room) throw new Error('房间不存在');
    if (currentRoom(session) && session.roomCode !== code) throw new Error('请先离开当前房间');
    addPlayer(room, { id: session.playerId, nickname: session.nickname });
    session.roomCode = code;
    delete session.notice;
    changed(code);
    return json(res, 200, { success: true, room: publicRoom(room, session.playerId) });
  }

  if (pathname === '/api/rooms/leave') {
    const room = currentRoom(session);
    const message = room ? dissolveRoom(room, session) : '已离开房间';
    session.roomCode = null;
    changed(room?.code);
    return json(res, 200, { success: true, dissolved: Boolean(room), message });
  }

  if (pathname === '/api/rooms/state') {
    const room = currentRoom(session);
    if (!room) {
      const notice = session.notice || null;
      delete session.notice;
      if (notice) saveSoon();
      return json(res, 200, { success: true, noRoom: true, notice });
    }
    return json(res, 200, { success: true, room: publicRoom(room, session.playerId) });
  }

  if (pathname === '/api/action') {
    const room = currentRoom(session);
    if (!room) throw new Error('你还没有加入房间');
    if (!['mortgage', 'redeem'].includes(body.action) && (Number(room.lockedUntil) || 0) > Date.now()) {
      throw new Error('特殊事件动效尚未揭晓，请稍候');
    }
    if (body.version !== undefined && Number(body.version) !== room.version) {
      return json(res, 409, { success: false, conflict: true, error: '桌面状态已更新，请重试', room: publicRoom(room, session.playerId) });
    }
    dispatch(room, session.playerId, body.action, body.payload || {});
    changed(room.code);
    return json(res, 200, { success: true, room: publicRoom(room, session.playerId) });
  }

  if (pathname === '/api/chat') {
    const room = currentRoom(session);
    if (!room) throw new Error('你还没有加入房间');
    const text = String(body.text || '').trim().slice(0, 200);
    if (!text) throw new Error('消息不能为空');
    room.chat.push({ at: Date.now(), pid: session.playerId, nickname: session.nickname, text });
    if (room.chat.length > 80) room.chat.shift();
    room.version += 1;
    changed(room.code);
    return json(res, 200, { success: true });
  }

  return json(res, 404, { success: false, error: '接口不存在' });
}

function eventStream(req, res, url) {
  const sessionToken = url.searchParams.get('sessionToken') || '';
  const session = state.sessions[sessionToken];
  if (!session) {
    return json(res, 401, { success: false, error: '会话失效，请重新输入昵称' });
  }

  session.lastSeen = Date.now();
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 1500\nevent: ready\ndata: {}\n\n');

  const client = { res, session };
  eventClients.add(client);
  const heartbeat = setInterval(() => {
    try { res.write(': keepalive\n\n'); }
    catch (_) { clearInterval(heartbeat); eventClients.delete(client); }
  }, 20_000);

  req.on('close', () => {
    clearInterval(heartbeat);
    eventClients.delete(client);
  });
  return undefined;
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function staticFile(req, res, pathname) {
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const file = path.resolve(PUBLIC_DIR, relative);
  if (!file.startsWith(`${PUBLIC_DIR}${path.sep}`) && file !== path.join(PUBLIC_DIR, 'index.html')) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  fs.readFile(file, (error, data) => {
    if (error) {
      fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (fallbackError, fallback) => {
        if (fallbackError) { res.writeHead(404); res.end('Not found'); return; }
        res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-cache' });
        res.end(fallback);
      });
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'GET' && url.pathname === '/healthz') {
    return json(res, 200, { ok: true, rooms: Object.keys(state.rooms).length });
  }
  if (req.method === 'GET' && url.pathname === '/api/events') {
    return eventStream(req, res, url);
  }
  if (req.method === 'POST' && url.pathname.startsWith('/api/')) {
    api(req, res, url.pathname).catch((error) => json(res, 400, { success: false, error: error.message || '请求失败' }));
    return;
  }
  if (req.method === 'GET') return staticFile(req, res, decodeURIComponent(url.pathname));
  res.writeHead(405); res.end('Method not allowed');
});

if (require.main === module) {
  server.listen(PORT, HOST, () => {
    console.log(`马尼拉联机桌已启动：http://localhost:${PORT}`);
  });
}

server.on('listening', () => {
  for (const room of Object.values(state.rooms)) scheduleBot(room.code);
});

module.exports = { server, state };

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manila-events-'));
process.env.DATA_DIR = testDataDir;

const { server, state } = require('../server');

test('健康检查与 SSE 在房间变化时即时推送', async (t) => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const base = `http://127.0.0.1:${address.port}`;
  const abort = new AbortController();

  t.after(async () => {
    abort.abort();
    await new Promise((resolve) => server.close(resolve));
    await new Promise((resolve) => setTimeout(resolve, 120));
    fs.rmSync(testDataDir, { recursive: true, force: true });
  });

  const post = async (endpoint, body) => {
    const response = await fetch(`${base}/api/${endpoint}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return response.json();
  };

  const health = await fetch(`${base}/healthz`).then((response) => response.json());
  assert.deepEqual(health, { ok: true, rooms: 0 });

  const session = await post('session', { nickname: '推送测试' });
  const stream = await fetch(
    `${base}/api/events?sessionToken=${encodeURIComponent(session.sessionToken)}`,
    { signal: abort.signal },
  );
  assert.equal(stream.status, 200);

  const reader = stream.body.getReader();
  const decoder = new TextDecoder();
  const ready = decoder.decode((await reader.read()).value);
  assert.match(ready, /event: ready/);

  const created = await post('rooms/create', {
    sessionToken: session.sessionToken,
    name: '即时同步房',
    maxPlayers: 3,
  });
  const change = decoder.decode((await reader.read()).value);
  assert.match(change, /event: change/);

  state.sessions[session.sessionToken].roomCode = null; // 模拟旧数据中会话房间码丢失
  const repeatedByHost = await post('rooms/create', {
    sessionToken: session.sessionToken,
    name: '房主的第二间房',
    maxPlayers: 3,
  });
  assert.equal(repeatedByHost.success, false);
  assert.match(repeatedByHost.error, /已在房间中/);
  assert.equal(state.sessions[session.sessionToken].roomCode, created.code);

  const guest = await post('session', { nickname: '退出测试' });
  const repeatedName = await post('rooms/create', {
    sessionToken: guest.sessionToken,
    name: '　即时同步房　',
    maxPlayers: 5,
  });
  assert.equal(repeatedName.success, false);
  assert.match(repeatedName.error, /房间名称已被使用/);

  const listing = await post('rooms/list', { sessionToken: guest.sessionToken });
  assert.equal(listing.rooms.filter((room) => room.name === '即时同步房').length, 1);

  const sameNameGuest = await post('session', { nickname: '推送测试' });
  const sameNameJoin = await post('rooms/join', { sessionToken: sameNameGuest.sessionToken, code: created.code });
  assert.equal(sameNameJoin.success, false);
  assert.match(sameNameJoin.error, /使用原浏览器.*更换昵称/);

  await post('rooms/join', { sessionToken: guest.sessionToken, code: created.code });
  const leave = await post('rooms/leave', { sessionToken: guest.sessionToken });
  assert.equal(leave.dissolved, true);
  const formerHostState = await post('rooms/state', { sessionToken: session.sessionToken });
  assert.equal(formerHostState.noRoom, true);
  assert.match(formerHostState.notice, /本局已解散/);
  await reader.cancel();
});

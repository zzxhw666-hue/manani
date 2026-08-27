(function () {
  'use strict';
  var API = window.MANILA_API;
  var UI = window.MANILA_UI;
  var room = null;
  var eventSource = null;
  var fallbackTimer = null;
  var busy = false;

  function me() { return { id: API.playerId(), nickname: API.nickname() }; }

  function stopUpdates() {
    clearInterval(fallbackTimer);
    fallbackTimer = null;
    if (eventSource) eventSource.close();
    eventSource = null;
  }

  function startFallbackPolling() {
    if (fallbackTimer) return;
    fallbackTimer = setInterval(refresh, 5000);
  }

  function startUpdates() {
    stopUpdates();
    if (!window.EventSource) {
      startFallbackPolling();
      return;
    }
    eventSource = API.events();
    eventSource.addEventListener('ready', refresh);
    eventSource.addEventListener('change', refresh);
    eventSource.onopen = function () {
      clearInterval(fallbackTimer);
      fallbackTimer = null;
    };
    eventSource.onerror = startFallbackPolling;
  }

  async function login(name) {
    try {
      await API.login(name);
      document.getElementById('nickname').value = API.nickname();
      UI.show('lobby');
      await refresh();
      startUpdates();
    } catch (error) { UI.toast(error.message, false); }
  }

  async function refresh() {
    if (!API.hasSession() || busy) return;
    try {
      var previousRoom = room;
      var result = await API.state();
      room = result.noRoom ? null : result.room;
      if (!room && previousRoom && result.notice) UI.toast(result.notice, false);
      if (room && (room.status === 'playing' || room.status === 'finished')) {
        UI.renderGame(room, me(), handlers);
      } else {
        var listing = await API.listRooms();
        UI.renderLobby(me(), listing.rooms || [], room, handlers);
      }
    } catch (error) {
      if (/会话失效/.test(error.message)) {
        stopUpdates(); API.logout(); room = null; UI.show('auth'); UI.toast('会话已失效，请重新进入', false);
      }
    }
  }

  async function act(action, payload) {
    if (busy || !room) return;
    busy = true;
    try {
      var result = await API.action(action, payload || {}, room.version);
      if (!result.success) {
        if (result.room) room = result.room;
        UI.toast(result.error || '动作失败', false);
      } else {
        room = result.room;
      }
      if (room.status === 'playing' || room.status === 'finished') UI.renderGame(room, me(), handlers);
      else await refresh();
    } catch (error) { UI.toast(error.message, false); }
    finally { busy = false; setTimeout(refresh, 120); }
  }

  async function join(code) {
    try {
      var result = await API.joinRoom(String(code || '').trim().toUpperCase());
      room = result.room;
      UI.toast('已加入航运局', true);
      await refresh();
    } catch (error) { UI.toast(error.message, false); }
  }

  async function leave() {
    try { var result = await API.leaveRoom(); room = null; UI.toast(result.message || '已离开房间', true); await refresh(); }
    catch (error) { UI.toast(error.message, false); }
  }

  var handlers = {
    act: act,
    join: join,
    leave: leave,
    start: function () { act('start-game'); },
    chat: async function (text) { try { await API.chat(text); await refresh(); } catch (error) { UI.toast(error.message, false); } }
  };

  document.getElementById('auth-form').addEventListener('submit', function (event) {
    event.preventDefault(); login(document.getElementById('nickname').value.trim());
  });
  document.getElementById('create-room').addEventListener('click', async function () {
    try {
      var result = await API.createRoom(document.getElementById('room-name').value.trim(), Number(document.getElementById('room-max').value));
      room = result.room; document.getElementById('room-code').value = result.code; UI.toast('房间已创建：' + result.code, true); await refresh();
    } catch (error) { UI.toast(error.message, false); }
  });
  document.getElementById('join-room').addEventListener('click', function () { join(document.getElementById('room-code').value); });
  document.getElementById('room-code').addEventListener('keydown', function (event) { if (event.key === 'Enter') join(event.target.value); });
  document.getElementById('refresh-lobby').addEventListener('click', refresh);
  document.getElementById('logout').addEventListener('click', function () { stopUpdates(); API.logout(); room = null; UI.show('auth'); });

  if (API.hasSession()) {
    document.getElementById('nickname').value = API.nickname();
    UI.show('lobby'); refresh(); startUpdates();
  } else UI.show('auth');
})();

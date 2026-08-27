(function () {
  'use strict';
  var API = window.MANILA_API;
  var UI = window.MANILA_UI;
  var room = null;
  var eventSource = null;
  var fallbackTimer = null;
  var busy = false;
  var observedRoomCode = '';
  var observedTurnOwnerId = null;

  function me() { return { id: API.playerId(), nickname: API.nickname() }; }

  function observeTurn(nextRoom) {
    if (!nextRoom || nextRoom.status !== 'playing') {
      observedRoomCode = '';
      observedTurnOwnerId = null;
      return;
    }
    var changedRoom = observedRoomCode !== nextRoom.code;
    var previousOwnerId = changedRoom ? null : observedTurnOwnerId;
    observedRoomCode = nextRoom.code;
    observedTurnOwnerId = nextRoom.currentPlayerId || null;
    if (observedTurnOwnerId === API.playerId() && previousOwnerId !== observedTurnOwnerId) UI.alertTurn();
  }

  function setLobbySubmitting(submitting) {
    document.querySelectorAll('#create-room, #join-room, [data-join]').forEach(function (button) {
      button.disabled = submitting || Boolean(room);
    });
  }

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
      observeTurn(room);
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
      observeTurn(room);
      if (room.status === 'playing' || room.status === 'finished') UI.renderGame(room, me(), handlers);
      else await refresh();
    } catch (error) { UI.toast(error.message, false); }
    finally { busy = false; setTimeout(refresh, 120); }
  }

  async function join(code) {
    if (busy) return;
    if (room) { UI.toast('请先退出当前房间，再加入其他房间', false); return; }
    var joined = false;
    busy = true;
    setLobbySubmitting(true);
    try {
      var result = await API.joinRoom(String(code || '').trim().toUpperCase());
      room = result.room;
      joined = true;
      UI.toast('已加入航运局', true);
    } catch (error) { UI.toast(error.message, false); }
    finally { busy = false; setLobbySubmitting(false); }
    if (joined) await refresh();
  }

  async function leave() {
    try { var result = await API.leaveRoom(); room = null; observeTurn(null); UI.toast(result.message || '已离开房间', true); await refresh(); }
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
    if (busy) return;
    if (room) { UI.toast('请先退出当前房间，再创建新房间', false); return; }
    var created = false;
    busy = true;
    setLobbySubmitting(true);
    try {
      var result = await API.createRoom(document.getElementById('room-name').value.trim(), Number(document.getElementById('room-max').value));
      room = result.room; created = true; document.getElementById('room-code').value = result.code; UI.toast('房间已创建：' + result.code, true);
    } catch (error) { UI.toast(error.message, false); }
    finally { busy = false; setLobbySubmitting(false); }
    if (created) await refresh();
  });
  document.getElementById('join-room').addEventListener('click', function () { join(document.getElementById('room-code').value); });
  document.getElementById('room-code').addEventListener('keydown', function (event) { if (event.key === 'Enter') join(event.target.value); });
  document.getElementById('refresh-lobby').addEventListener('click', refresh);
  document.getElementById('logout').addEventListener('click', function () { stopUpdates(); API.logout(); room = null; observeTurn(null); UI.show('auth'); });

  if (API.hasSession()) {
    document.getElementById('nickname').value = API.nickname();
    UI.show('lobby'); refresh(); startUpdates();
  } else UI.show('auth');
})();

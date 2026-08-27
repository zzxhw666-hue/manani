window.MANILA_API = (function () {
  var sessionToken = localStorage.getItem('manila_session') || '';
  var nickname = localStorage.getItem('manila_nickname') || '';
  var playerId = localStorage.getItem('manila_player_id') || '';

  async function post(path, body) {
    var response = await fetch('/api/' + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ sessionToken: sessionToken }, body || {}))
    });
    var data;
    try { data = await response.json(); } catch (_) { throw new Error('服务器响应无法解析'); }
    if (!response.ok && !data.conflict) throw new Error(data.error || '请求失败');
    return data;
  }

  async function login(name) {
    var result = await post('session', { nickname: name, resumeToken: sessionToken });
    if (result.success) {
      sessionToken = result.sessionToken;
      nickname = result.nickname;
      playerId = result.playerId;
      localStorage.setItem('manila_session', sessionToken);
      localStorage.setItem('manila_nickname', nickname);
      localStorage.setItem('manila_player_id', playerId);
    }
    return result;
  }

  function logout() {
    sessionToken = ''; nickname = ''; playerId = '';
    localStorage.removeItem('manila_session');
    localStorage.removeItem('manila_nickname');
    localStorage.removeItem('manila_player_id');
  }

  function events() {
    return new EventSource('/api/events?sessionToken=' + encodeURIComponent(sessionToken));
  }

  return {
    login: login, logout: logout, events: events,
    hasSession: function () { return !!sessionToken; },
    nickname: function () { return nickname; },
    playerId: function () { return playerId; },
    listRooms: function () { return post('rooms/list'); },
    createRoom: function (name, maxPlayers) { return post('rooms/create', { name: name, maxPlayers: maxPlayers }); },
    joinRoom: function (code) { return post('rooms/join', { code: code }); },
    leaveRoom: function () { return post('rooms/leave'); },
    state: function () { return post('rooms/state'); },
    action: function (action, payload, version) { return post('action', { action: action, payload: payload || {}, version: version }); },
    chat: function (text) { return post('chat', { text: text }); }
  };
})();

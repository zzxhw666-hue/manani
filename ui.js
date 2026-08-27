window.MANILA_UI = (function () {
  var D = window.MANILA_DATA;
  var currentScreen = '';

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
    });
  }

  function show(name) {
    currentScreen = name;
    ['auth', 'lobby', 'game'].forEach(function (screen) {
      document.getElementById('screen-' + screen).classList.toggle('hidden', screen !== name);
    });
  }

  function toast(message, ok) {
    var root = document.getElementById('toast-root');
    var node = document.createElement('div');
    node.className = 'toast ' + (ok ? 'ok' : 'error');
    node.textContent = message;
    root.appendChild(node);
    setTimeout(function () { node.classList.add('leaving'); setTimeout(function () { node.remove(); }, 300); }, 2600);
  }

  function modal(title, body, onConfirm, confirmLabel) {
    var root = document.getElementById('modal-root');
    var mask = document.createElement('div');
    mask.className = 'modal-mask';
    mask.innerHTML = '<div class="modal paper-card"><button class="modal-x" type="button" aria-label="关闭">×</button><span class="top-kicker">MANILA PORT</span><h2>' + esc(title) + '</h2><div class="modal-body">' + body + '</div><div class="modal-actions"><button class="btn ghost modal-cancel" type="button">取消</button>' + (onConfirm ? '<button class="btn primary modal-confirm" type="button">' + esc(confirmLabel || '确认') + '</button>' : '') + '</div></div>';
    function close() { mask.remove(); }
    mask.querySelector('.modal-x').onclick = close;
    mask.querySelector('.modal-cancel').onclick = close;
    mask.onclick = function (event) { if (event.target === mask) close(); };
    if (onConfirm) mask.querySelector('.modal-confirm').onclick = function () { if (onConfirm(mask) !== false) close(); };
    root.appendChild(mask);
    return mask;
  }

  function nickname(room, pid) {
    var player = (room.players || []).find(function (item) { return item.id === pid; });
    return player ? player.nickname : '—';
  }

  function playerColor(room, pid) {
    var player = (room.players || []).find(function (item) { return item.id === pid; });
    return player ? player.color : '#999';
  }

  function token(room, item, label) {
    if (!item) return '<span class="vacant">空位</span>';
    return '<span class="pawn" style="--player:' + playerColor(room, item.pid) + '" title="' + esc(nickname(room, item.pid)) + '"></span><span class="token-name">' + esc(label || nickname(room, item.pid)) + '</span>';
  }

  function time(ts) {
    var date = new Date(ts);
    return String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0');
  }

  function renderLobby(me, rooms, room, handlers) {
    show('lobby');
    document.getElementById('lobby-me').textContent = '商人 · ' + me.nickname;
    var list = document.getElementById('room-list');
    list.innerHTML = rooms.length ? rooms.map(function (item) {
      return '<article class="room-row"><div><strong>' + esc(item.name) + '</strong><span class="room-code">' + esc(item.code) + '</span><small>房主 ' + esc(item.host) + ' · ' + item.count + '/' + item.maxPlayers + ' 人</small></div><button class="btn secondary small" data-join="' + esc(item.code) + '" type="button">加入</button></article>';
    }).join('') : '<div class="empty-state"><span>⚓</span><p>港口暂时没有公开房间</p></div>';
    list.querySelectorAll('[data-join]').forEach(function (button) { button.onclick = function () { handlers.join(button.dataset.join); }; });

    var panel = document.getElementById('current-room');
    if (!room) { panel.classList.add('hidden'); panel.innerHTML = ''; return; }
    panel.classList.remove('hidden');
    panel.innerHTML = '<div class="panel-number">03</div><div class="room-ticket"><span>你的房间码</span><strong>' + esc(room.code) + '</strong><button class="btn ghost small" data-copy type="button">复制</button></div><h2>' + esc(room.name) + '</h2><div class="waiting-players">' + room.players.map(function (player, index) {
      return '<div class="waiting-player"><span class="seat-no">' + String(index + 1).padStart(2, '0') + '</span><span class="player-dot" style="--player:' + player.color + '"></span><strong>' + esc(player.nickname) + '</strong>' + (player.id === room.hostId ? '<em>房主</em>' : '') + '</div>';
    }).join('') + Array.from({ length: Math.max(0, room.maxPlayers - room.players.length) }, function (_, index) {
      return '<div class="waiting-player open"><span class="seat-no">' + String(room.players.length + index + 1).padStart(2, '0') + '</span><span class="player-dot"></span><span>等待商人加入</span></div>';
    }).join('') + '</div><p class="lobby-note">凑齐 3–5 人即可开局。3 人局每人使用 4 名帮手。</p><div class="panel-actions">' + (room.hostId === me.id ? '<button class="btn primary" data-start type="button" ' + (room.players.length < 3 ? 'disabled' : '') + '>开始航程</button>' : '<span class="waiting-copy">等待房主开局…</span>') + '<button class="btn danger" data-leave type="button">离开房间</button></div>';
    var copy = panel.querySelector('[data-copy]');
    copy.onclick = function () { navigator.clipboard.writeText(room.code).then(function () { toast('房间码已复制', true); }); };
    var start = panel.querySelector('[data-start]');
    if (start) start.onclick = handlers.start;
    panel.querySelector('[data-leave]').onclick = handlers.leave;
  }

  function renderHeader(room, me, handlers) {
    var header = document.getElementById('game-header');
    header.innerHTML = '<div class="game-brand"><span class="top-kicker">THE MERCHANTS OF</span><strong>马尼拉</strong></div><div class="header-divider"></div><div class="voyage-meta"><span>航程</span><strong>' + room.round + '</strong></div><div class="phase-pill"><i></i>' + esc(D.phaseNames[room.phase] || room.phase) + '</div><div class="harbor-chip"><span>港务长</span><b>' + esc(nickname(room, room.harborMasterId)) + '</b></div><div class="header-spacer"></div><span class="code-chip">房间 ' + esc(room.code) + '</span><button class="btn ghost small" data-rules type="button">规则</button>';
    header.querySelector('[data-rules]').onclick = function () { showRules(); };
  }

  function marketHtml(room) {
    return '<section class="market box"><div class="section-heading"><div><span class="section-no">01</span><h2>黑市行情</h2></div><small>任一货物达到 30₱，游戏结束</small></div><div class="market-grid">' + D.wareIds.map(function (ware) {
      var data = D.wares[ware];
      var level = room.market[ware];
      return '<article class="market-card" style="--ware:' + data.color + ';--ink:' + data.ink + '"><div class="market-icon">' + data.icon + '</div><div><span>' + data.en + '</span><strong>' + data.name + '</strong></div><b>' + D.marketTrack[level] + '<small>₱</small></b><div class="market-track">' + D.marketTrack.map(function (price, index) { return '<i class="' + (index <= level ? 'filled' : '') + '" title="' + price + '"></i>'; }).join('') + '</div><em>库存 ' + room.stockSupply[ware] + '</em></article>';
    }).join('') + '</div></section>';
  }

  function boatHtml(room, boat, activePlacement) {
    var data = D.wares[boat.ware];
    var cells = Array.from({ length: 14 }, function (_, position) {
      var boatHere = boat.status === 'sea' && boat.position === position;
      return '<span class="route-cell ' + (position === 13 ? 'danger-cell' : '') + '" data-pos="' + position + '">' + (boatHere ? '<i class="boat-marker" style="--ware:' + data.color + '">⛵</i>' : '') + '<small>' + position + '</small></span>';
    }).join('');
    var crew = data.crewCosts.map(function (cost, index) {
      var item = boat.crew[index];
      return '<span class="crew-slot ' + (!item && activePlacement && boat.status === 'sea' && index === boat.crew.length ? 'clickable' : '') + '" ' + (!item && activePlacement && index === boat.crew.length ? 'data-place="boat:' + boat.ware + '"' : '') + '>' + (item ? token(room, item) : '<b>' + cost + '₱</b>') + '</span>';
    }).join('');
    var destination = boat.status === 'sea' ? '<span class="at-sea">航道 ' + boat.position + '</span>' : '<span class="docked ' + boat.status + '">' + (boat.status === 'port' ? '港口' : '船厂') + ' ' + boat.dock + (boat.plundered ? ' · 已劫掠' : '') + '</span>';
    return '<article class="boat-lane" style="--ware:' + data.color + '"><div class="boat-info"><span class="cargo-symbol">' + data.icon + '</span><div><small>' + data.en + '</small><strong>' + data.name + '船</strong></div><b>奖池 ' + data.pool + '₱</b></div><div class="route"><span class="route-label">外海</span>' + cells + '<span class="route-label port-label">马尼拉港</span></div><div class="boat-bottom"><div class="crew-row"><span class="micro-label">船员位</span>' + crew + '</div>' + destination + '</div></article>';
  }

  function dockZone(room, area, activePlacement) {
    var title = area === 'port' ? '港口停靠点' : '修船厂';
    var desc = area === 'port' ? '赌至少有几艘船成功抵港' : '赌至少有几艘船航程失败';
    return '<section class="dock-zone ' + area + '"><div class="dock-title"><span>' + (area === 'port' ? '⚓' : '🔧') + '</span><div><h3>' + title + '</h3><small>' + desc + '</small></div></div><div class="dock-slots">' + ['A', 'B', 'C'].map(function (letter) {
      var placed = room.placements[area][letter];
      var landed = room.docks[area][letter];
      var data = D.dock[letter];
      return '<article class="dock-slot ' + (activePlacement && !placed ? 'clickable' : '') + ' ' + (landed ? 'landed' : '') + '" ' + (activePlacement && !placed ? 'data-place="' + area + ':' + letter + '"' : '') + '><div class="dock-letter">' + letter + '</div><div class="dock-condition">' + (letter === 'A' ? '≥ 1 艘' : letter === 'B' ? '≥ 2 艘' : '= 3 艘') + '</div><div class="dock-money"><span>费用 ' + data.cost + '₱</span><b>回报 ' + data.reward + '₱</b></div><div class="dock-owner">' + token(room, placed) + '</div>' + (landed ? '<div class="arrived-cargo" style="--ware:' + D.wares[landed].color + '">' + D.wares[landed].icon + ' ' + D.wares[landed].name + '</div>' : '') + '</article>';
    }).join('') + '</div></section>';
  }

  function specialZones(room, activePlacement) {
    var pirates = room.placements.pirates;
    var pilots = room.placements.pilots;
    return '<div class="special-grid"><article class="special-card pirate-card ' + (activePlacement && pirates.length < 2 ? 'clickable' : '') + '" ' + (activePlacement && pirates.length < 2 ? 'data-place="pirate"' : '') + '><div class="special-art">☠</div><div><small>费用 5₱ / 位</small><h3>海盗船</h3><p>第二轮登船，第三轮在 13 抢劫</p></div><div class="special-slots"><span>' + token(room, pirates[0], '船长') + '</span><span>' + token(room, pirates[1], '海盗') + '</span></div></article><article class="special-card pilot-card"><div class="special-art">🧭</div><div><small>第三次掷骰前</small><h3>领航岛</h3><p>前推或后拉尚未抵港的船</p></div><div class="special-slots"><span class="' + (activePlacement && !pilots.small ? 'clickable' : '') + '" ' + (activePlacement && !pilots.small ? 'data-place="pilot:small"' : '') + '>' + (pilots.small ? token(room, pilots.small, '小领航') : '<b>小 · 2₱</b>') + '</span><span class="' + (activePlacement && !pilots.large ? 'clickable' : '') + '" ' + (activePlacement && !pilots.large ? 'data-place="pilot:large"' : '') + '>' + (pilots.large ? token(room, pilots.large, '大领航') : '<b>大 · 5₱</b>') + '</span></div></article><article class="special-card insurance-card ' + (activePlacement && !room.placements.insurance ? 'clickable' : '') + '" ' + (activePlacement && !room.placements.insurance ? 'data-place="insurance"' : '') + '><div class="special-art">▣</div><div><small>立即领取 10₱</small><h3>保险公司</h3><p>承担所有失败船的修理费用</p></div><div class="insurance-owner">' + token(room, room.placements.insurance) + '</div></article></div>';
  }

  function boardHtml(room, me) {
    var activePlacement = room.phase === 'placement' && room.currentPlayerId === me.id;
    return '<section class="board box"><div class="section-heading"><div><span class="section-no">02</span><h2>帕西格河航道</h2></div><small>船必须越过 13 才会正常抵港</small></div><div class="boat-stack">' + room.boats.map(function (boat) { return boatHtml(room, boat, activePlacement); }).join('') + '</div><div class="dock-grid">' + dockZone(room, 'port', activePlacement) + dockZone(room, 'shipyard', activePlacement) + '</div>' + specialZones(room, activePlacement) + '</section>';
  }

  function currentActionHtml(room, me) {
    var mine = room.currentPlayerId === me.id;
    var phase = room.phase;
    var html = '<section class="action-card box"><div class="section-heading compact"><div><span class="section-no">03</span><h2>当前行动</h2></div><span class="turn-owner">' + (room.currentPlayerId ? '轮到 ' + esc(nickname(room, room.currentPlayerId)) : '系统结算中') + '</span></div>';
    if (phase === 'auction') {
      html += '<div class="action-copy"><b>竞拍港务长</b><p>当前最高价 <strong>' + room.auction.highBid + '₱</strong>' + (room.auction.leaderId ? ' · ' + esc(nickname(room, room.auction.leaderId)) : '') + '</p></div>';
      if (mine) html += '<div class="bid-row"><input id="bid-value" type="number" min="' + (room.auction.highBid + 1) + '" value="' + (room.auction.highBid + 1) + '"><button class="btn primary" data-bid type="button">出价</button><button class="btn ghost" data-pass-auction type="button">不跟</button></div>';
    } else if (phase === 'harbor_setup') {
      html += '<div class="action-copy"><b>港务长行使职权</b><p>可买 1 股，然后选择 3 种货物并分配总和为 9 的起点。</p></div>' + (mine ? '<button class="btn primary block" data-setup type="button">选择股票、货物与起点</button>' : '<div class="waiting-wave">等待港务长布船</div>');
    } else if (phase === 'placement') {
      html += '<div class="action-copy"><b>第 ' + room.placementRound + ' 轮派遣帮手</b><p>' + (mine ? '点击棋盘上发光的空位进行放置；一旦停止，本航程不能再放。' : '商人们正在依次选择船只、停靠点与特殊职位。') + '</p></div>' + (mine ? '<button class="btn ghost block" data-pass-placement type="button">停止本航程后续放置</button>' : '<div class="waiting-wave">观察桌面，等待你的回合</div>');
    } else if (phase === 'dice') {
      html += '<div class="action-copy"><b>第 ' + room.movementRound + ' 次移动</b><p>三种货物各掷一颗六面骰。</p></div>' + (mine ? '<button class="btn primary block dice-button" data-roll type="button">掷出三颗货物骰</button>' : '<div class="waiting-wave">等待港务长掷骰</div>');
    } else if (phase === 'move') {
      html += '<div class="dice-results">' + Object.keys(room.dice || {}).map(function (ware) { return '<span style="--ware:' + D.wares[ware].color + '"><i>' + D.wares[ware].icon + '</i><b>' + room.dice[ware] + '</b></span>'; }).join('') + '</div><div class="action-copy"><b>港务长决定移船顺序</b><p>逐艘移动；先越过 13 的船会先占港口。</p></div>';
      if (mine) html += '<div class="move-buttons">' + room.pendingMoves.map(function (ware) { return '<button class="btn secondary" data-move="' + ware + '" type="button">移动' + D.wares[ware].name + '船 +' + room.dice[ware] + '</button>'; }).join('') + '</div>';
    } else if (phase === 'pirate_board') {
      var targets = room.boats.filter(function (boat) { return boat.status === 'sea' && boat.position === 13 && boat.crew.length < D.wares[boat.ware].crewCosts.length; });
      html += '<div class="action-copy"><b>海盗登船时机</b><p>可占目标船的空船员位，或留在海盗船等待第三轮抢劫。</p></div>';
      if (mine) html += '<div class="move-buttons">' + targets.map(function (boat) { return '<button class="btn secondary" data-board="' + boat.ware + '" type="button">登上' + D.wares[boat.ware].name + '船</button>'; }).join('') + '<button class="btn ghost" data-board="" type="button">留在海盗船</button></div>';
    } else if (phase === 'pilot') {
      html += '<div class="action-copy"><b>' + (room.pilotQueue[0] && room.pilotQueue[0].kind === 'small' ? '小' : '大') + '领航员行动</b><p>可影响尚未抵达马尼拉的船；推到 13 不触发海盗。</p></div>' + (mine ? '<button class="btn primary block" data-pilot type="button">规划领航移动</button>' : '<div class="waiting-wave">等待领航员决定</div>');
    } else if (phase === 'pirate_destination') {
      var nextWare = room.plunderQueue[0];
      html += '<div class="action-copy"><b>处置' + D.wares[nextWare].name + '船</b><p>海盗奖金不受去向影响；送港会让股票涨价。</p></div>' + (mine ? '<div class="move-buttons"><button class="btn primary" data-destination="port" type="button">送往港口</button><button class="btn danger" data-destination="shipyard" type="button">送往船厂</button></div>' : '<div class="waiting-wave">等待海盗船长决定</div>');
    } else if (phase === 'finished') {
      html += '<div class="winner-mini">🏆 ' + room.winners.map(function (pid) { return esc(nickname(room, pid)); }).join('、') + ' 获胜</div>';
    } else {
      html += '<div class="waiting-wave">正在处理航程结算</div>';
    }
    return html + '</section>';
  }

  function assetsHtml(room, me) {
    var shareRows = D.wareIds.map(function (ware) {
      var count = me.shares ? me.shares[ware] : 0;
      var mortgaged = me.mortgaged ? me.mortgaged[ware] : 0;
      var free = count - mortgaged;
      return '<div class="share-row" style="--ware:' + D.wares[ware].color + '"><span class="share-gem">' + D.wares[ware].icon + '</span><div><strong>' + D.wares[ware].name + '</strong><small>' + count + ' 股 · 市值 ' + (count * D.marketTrack[room.market[ware]]) + '₱' + (mortgaged ? ' · 抵押 ' + mortgaged : '') + '</small></div><div class="share-actions">' + (free > 0 && room.status === 'playing' ? '<button data-mortgage="' + ware + '" title="抵押得 12₱">借</button>' : '') + (mortgaged > 0 && me.cash >= 15 && room.status === 'playing' ? '<button data-redeem="' + ware + '" title="支付 15₱ 赎回">赎</button>' : '') + '</div></div>';
    }).join('');
    var stockValue = D.wareIds.reduce(function (sum, ware) { return sum + (me.shares ? me.shares[ware] : 0) * D.marketTrack[room.market[ware]]; }, 0);
    return '<section class="assets box"><div class="asset-head"><div><span>我的现金</span><strong>' + me.cash + '<small>₱</small></strong></div><div><span>股票市值</span><strong>' + stockValue + '<small>₱</small></strong></div><div><span>可用帮手</span><strong>' + me.pawnsAvailable + '<small>/' + me.pawnsTotal + '</small></strong></div></div><div class="share-list">' + shareRows + '</div><p class="loan-note">抵押 1 股获得 12₱；支付 15₱ 可赎回。</p></section>';
  }

  function playersHtml(room, me) {
    return '<section class="players box"><div class="section-heading compact"><div><span class="section-no">04</span><h2>商人席位</h2></div></div><div class="player-list">' + room.players.map(function (player) {
      var active = room.currentPlayerId === player.id;
      return '<article class="player-line ' + (player.id === me.id ? 'me' : '') + ' ' + (active ? 'active' : '') + '"><span class="player-dot" style="--player:' + player.color + '"></span><div><strong>' + esc(player.nickname) + (player.id === me.id ? ' · 你' : '') + '</strong><small>' + (player.id === room.harborMasterId ? '港务长 · ' : '') + player.shareCount + ' 股股票' + (player.mortgagedCount ? ' · ' + player.mortgagedCount + ' 股抵押' : '') + '</small></div><b>' + player.cash + '₱</b><span class="pawn-count">' + player.pawnsAvailable + ' 帮手</span></article>';
    }).join('') + '</div></section>';
  }

  function logChatHtml(room) {
    return '<section class="chronicle box"><div class="log-tabs"><button class="active" data-log-tab="log">航海记录</button><button data-log-tab="chat">商会密谈 <i>' + room.chat.length + '</i></button></div><div class="log-pane" data-pane="log">' + (room.logs || []).slice(-40).reverse().map(function (item) { return '<div class="log-line ' + esc(item.type) + '"><time>' + time(item.at) + '</time><p>' + esc(item.text) + '</p></div>'; }).join('') + '</div><div class="log-pane hidden" data-pane="chat">' + (room.chat || []).slice(-40).map(function (item) { return '<div class="chat-line"><b style="color:' + playerColor(room, item.pid) + '">' + esc(item.nickname) + '</b><p>' + esc(item.text) + '</p></div>'; }).join('') + '<form class="chat-form"><input maxlength="200" placeholder="谈判、结盟，或虚张声势…"><button class="btn secondary small" type="submit">发送</button></form></div></section>';
  }

  function scoreHtml(room) {
    if (room.status !== 'finished') return '';
    return '<section class="score-overlay box"><span class="trophy">🏆</span><div><span class="top-kicker">FINAL FORTUNE</span><h2>最终财富</h2><p>' + room.winners.map(function (pid) { return esc(nickname(room, pid)); }).join('、') + ' 成为马尼拉最成功的商人</p></div><div class="score-table">' + room.scores.map(function (score, index) { return '<div class="score-row ' + (index === 0 ? 'winner' : '') + '"><b>' + (index + 1) + '</b><strong>' + esc(score.nickname) + '</strong><span>现金 ' + score.cash + '</span><span>股票 ' + score.stockValue + '</span><span>债务 −' + score.debt + '</span><em>' + score.total + '₱</em></div>'; }).join('') + '</div></section>';
  }

  function bindGame(root, room, me, handlers) {
    root.querySelectorAll('[data-place]').forEach(function (node) { node.onclick = function () { handlers.act('place', { location: node.dataset.place }); }; });
    var bid = root.querySelector('[data-bid]'); if (bid) bid.onclick = function () { handlers.act('bid', { amount: Number(root.querySelector('#bid-value').value) }); };
    var passAuction = root.querySelector('[data-pass-auction]'); if (passAuction) passAuction.onclick = function () { handlers.act('pass-auction'); };
    var setup = root.querySelector('[data-setup]'); if (setup) setup.onclick = function () { setupModal(room, handlers); };
    var passPlacement = root.querySelector('[data-pass-placement]'); if (passPlacement) passPlacement.onclick = function () { handlers.act('pass-placement'); };
    var roll = root.querySelector('[data-roll]'); if (roll) roll.onclick = function () { handlers.act('roll'); };
    root.querySelectorAll('[data-move]').forEach(function (button) { button.onclick = function () { handlers.act('move', { ware: button.dataset.move }); }; });
    root.querySelectorAll('[data-board]').forEach(function (button) { button.onclick = function () { handlers.act('pirate-board', { ware: button.dataset.board || null }); }; });
    var pilot = root.querySelector('[data-pilot]'); if (pilot) pilot.onclick = function () { pilotModal(room, handlers); };
    root.querySelectorAll('[data-destination]').forEach(function (button) { button.onclick = function () { handlers.act('pirate-destination', { area: button.dataset.destination }); }; });
    root.querySelectorAll('[data-mortgage]').forEach(function (button) { button.onclick = function () { handlers.act('mortgage', { ware: button.dataset.mortgage }); }; });
    root.querySelectorAll('[data-redeem]').forEach(function (button) { button.onclick = function () { handlers.act('redeem', { ware: button.dataset.redeem }); }; });
    root.querySelectorAll('[data-log-tab]').forEach(function (button) {
      button.onclick = function () {
        root.querySelectorAll('[data-log-tab]').forEach(function (item) { item.classList.toggle('active', item === button); });
        root.querySelectorAll('[data-pane]').forEach(function (pane) { pane.classList.toggle('hidden', pane.dataset.pane !== button.dataset.logTab); });
      };
    });
    var chat = root.querySelector('.chat-form');
    if (chat) chat.onsubmit = function (event) { event.preventDefault(); var input = chat.querySelector('input'); if (input.value.trim()) { handlers.chat(input.value.trim()); input.value = ''; } };
  }

  function renderGame(room, me, handlers) {
    show('game');
    var self = room.players.find(function (player) { return player.id === me.id; }) || me;
    renderHeader(room, self, handlers);
    var root = document.getElementById('game-root');
    root.innerHTML = scoreHtml(room) + '<div class="game-layout"><main class="game-main">' + marketHtml(room) + (room.boats.length ? boardHtml(room, self) : '') + '</main><aside class="game-side">' + currentActionHtml(room, self) + assetsHtml(room, self) + playersHtml(room, self) + logChatHtml(room) + '</aside></div>';
    bindGame(root, room, self, handlers);
  }

  function setupModal(room, handlers) {
    var optionHtml = D.wareIds.map(function (ware) { return '<option value="' + ware + '">' + D.wares[ware].name + '</option>'; }).join('');
    var buyHtml = '<option value="">本轮不买股票</option>' + D.wareIds.filter(function (ware) { return room.stockSupply[ware] > 0; }).map(function (ware) { return '<option value="' + ware + '">' + D.wares[ware].name + ' · ' + Math.max(5, D.marketTrack[room.market[ware]]) + '₱ · 剩 ' + room.stockSupply[ware] + '</option>'; }).join('');
    var body = '<label>港务长专属购股（可选）</label><select id="setup-buy">' + buyHtml + '</select><div class="setup-help">从 4 种货物中选择 3 种。每艘起点 0–5，三者之和必须为 9。</div><div class="setup-boats">' + [0, 1, 2].map(function (index) { return '<div><span>货船 ' + (index + 1) + '</span><select data-setup-ware>' + optionHtml + '</select><label>起点 <input data-setup-start type="number" min="0" max="5" value="' + (index + 2) + '"></label></div>'; }).join('') + '</div><div id="setup-sum">起点合计：9 / 9</div>';
    var mask = modal('布置本轮货船', body, function (node) {
      var wares = Array.from(node.querySelectorAll('[data-setup-ware]')).map(function (select) { return select.value; });
      var starts = {};
      Array.from(node.querySelectorAll('[data-setup-start]')).forEach(function (input, index) { starts[wares[index]] = Number(input.value); });
      if (new Set(wares).size !== 3) { toast('三艘船必须装载不同货物', false); return false; }
      if (Object.values(starts).reduce(function (sum, value) { return sum + value; }, 0) !== 9) { toast('三个起点之和必须等于 9', false); return false; }
      handlers.act('harbor-setup', { buyWare: node.querySelector('#setup-buy').value || null, wares: wares, starts: starts });
    }, '确认装船');
    var selects = mask.querySelectorAll('[data-setup-ware]');
    selects[0].value = 'ginseng'; selects[1].value = 'nutmeg'; selects[2].value = 'jade';
    mask.querySelectorAll('[data-setup-start]').forEach(function (input) { input.oninput = function () { var sum = Array.from(mask.querySelectorAll('[data-setup-start]')).reduce(function (total, item) { return total + Number(item.value || 0); }, 0); mask.querySelector('#setup-sum').textContent = '起点合计：' + sum + ' / 9'; }; });
  }

  function pilotModal(room, handlers) {
    var job = room.pilotQueue[0].kind;
    var options = '<option value="">不移动</option>' + room.boats.filter(function (boat) { return boat.status === 'sea'; }).map(function (boat) { return '<option value="' + boat.ware + '">' + D.wares[boat.ware].name + '船（位置 ' + boat.position + '）</option>'; }).join('');
    var deltas = job === 'small' ? '<option value="1">前进 1</option><option value="-1">后退 1</option>' : '<option value="1">前进 1</option><option value="2">前进 2</option><option value="-1">后退 1</option><option value="-2">后退 2</option>';
    var second = job === 'large' ? '<div class="pilot-row"><select data-pilot-ware="2">' + options + '</select><select data-pilot-delta="2"><option value="1">前进 1</option><option value="-1">后退 1</option></select></div><p class="modal-note">若移动两艘船，两艘都只能移动 1 格且不可重复。</p>' : '';
    var body = '<p class="setup-help">' + (job === 'small' ? '小领航员可令一艘船前进或后退 1 格，也可放弃。' : '大领航员可移动一艘船最多 2 格，或两艘船各 1 格。') + '</p><div class="pilot-row"><select data-pilot-ware="1">' + options + '</select><select data-pilot-delta="1">' + deltas + '</select></div>' + second;
    modal((job === 'small' ? '小' : '大') + '领航员行动', body, function (node) {
      var moves = [];
      [1, 2].forEach(function (index) { var ware = node.querySelector('[data-pilot-ware="' + index + '"]'); var delta = node.querySelector('[data-pilot-delta="' + index + '"]'); if (ware && ware.value) moves.push({ ware: ware.value, delta: Number(delta.value) }); });
      handlers.act('pilot', { moves: moves });
    }, '执行领航');
  }

  function showRules() {
    var body = '<div class="rules"><h3>每次航程</h3><ol><li>竞拍港务长；港务长可买 1 股、选择 3 种货物，并把船放在总和为 9 的起点。</li><li>派遣帮手与掷骰交替进行，共 3 次移动。3 人局第一次移动前多放一轮。</li><li>越过 13 的船进入港口；第三次移动后未越过的船进入船厂。</li><li>第二次移动停在 13 时海盗可登船；第三次移动停在 13 时，留守海盗抢船并决定去向。</li><li>抵港货物股票涨一档。任一货物达到 30₱ 后结算最终财富。</li></ol><h3>帮手位置</h3><p><b>货船</b>瓜分抵港奖金；<b>港口/船厂</b>押成功或失败数量；<b>领航员</b>微调船位；<b>保险</b>先拿 10₱ 但承担修理费。</p><h3>贷款</h3><p>抵押一股得 12₱，赎回花 15₱。终局每笔未还贷款扣 15₱。</p></div>';
    modal('规则速查', body, null);
  }

  return { show: show, toast: toast, renderLobby: renderLobby, renderGame: renderGame, currentScreen: function () { return currentScreen; } };
})();

window.SPLENDOR_UI = (function () {
  'use strict';

  var COLORS = ['white', 'blue', 'green', 'red', 'black'];
  var TOKENS = COLORS.concat('gold');
  var META = {
    white: { name: '钻石', short: '白', icon: '◇' }, blue: { name: '蓝宝石', short: '蓝', icon: '◆' },
    green: { name: '祖母绿', short: '绿', icon: '⬟' }, red: { name: '红宝石', short: '红', icon: '♦' },
    black: { name: '玛瑙', short: '黑', icon: '●' }, gold: { name: '黄金', short: '金', icon: '★' }
  };
  var clockTimer = null;

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
    });
  }

  function total(tokens) { return TOKENS.reduce(function (sum, color) { return sum + Number(tokens[color] || 0); }, 0); }
  function nickname(room, pid) { var p = room.players.find(function (item) { return item.id === pid; }); return p ? p.nickname : '—'; }
  function time(ts) { var d = new Date(ts); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
  function gemImage(kind, color, className) {
    return '<img class="' + esc(className || '') + '" src="assets/table-club/gems/' + kind + '-' + color + '.png" alt="' + esc(META[color].name) + '" draggable="false">';
  }

  function tokenPips(values, className) {
    if (className === 'held') {
      return TOKENS.filter(function (color) { return values && values[color]; }).map(function (color) {
        return '<span class="spl-held-token ' + color + '" title="' + META[color].name + ' ' + values[color] + ' 枚">' + gemImage('stack', color, 'spl-held-token-image') + '<b>' + values[color] + '</b></span>';
      }).join('') || '<span class="spl-none">—</span>';
    }
    return TOKENS.filter(function (color) { return values && values[color]; }).map(function (color) {
      return '<span class="spl-pip ' + color + ' ' + (className || '') + '" title="' + META[color].name + '">' + META[color].icon + '<b>' + values[color] + '</b></span>';
    }).join('') || '<span class="spl-none">—</span>';
  }

  function modal(title, body) {
    var root = document.getElementById('modal-root');
    var mask = document.createElement('div');
    mask.className = 'modal-mask spl-modal-mask';
    mask.innerHTML = '<div class="modal paper-card spl-modal"><button class="modal-x" type="button">×</button><span class="top-kicker">SPLENDOR GUILD</span><h2>' + esc(title) + '</h2><div class="modal-body">' + body + '</div><div class="modal-actions"><button class="btn ghost" data-cancel type="button">取消</button><button class="btn primary" data-confirm type="button">确认</button></div></div>';
    function close() { mask.remove(); }
    mask.querySelector('.modal-x').onclick = close;
    mask.querySelector('[data-cancel]').onclick = close;
    mask.onclick = function (event) { if (event.target === mask) close(); };
    root.appendChild(mask);
    return { node: mask, close: close };
  }

  function eligibleNobles(room, bonuses) {
    return room.nobles.filter(function (noble) {
      return COLORS.every(function (color) { return Number(bonuses[color] || 0) >= Number(noble.requirement[color] || 0); });
    });
  }

  function chooseNoble(room, bonuses, callback) {
    var eligible = eligibleNobles(room, bonuses);
    if (eligible.length <= 1) { callback(eligible[0] ? eligible[0].id : null); return; }
    var popup = modal('选择来访贵族', '<p class="spl-modal-note">本回合同时满足多名贵族，但最多只能获得一位。</p><div class="spl-noble-choice">' + eligible.map(function (noble, index) {
      return '<label><input type="radio" name="noble" value="' + esc(noble.id) + '" ' + (!index ? 'checked' : '') + '><span><b>+3 声望</b>' + tokenPips(noble.requirement, 'requirement') + '</span></label>';
    }).join('') + '</div>');
    popup.node.querySelector('[data-confirm]').onclick = function () {
      var checked = popup.node.querySelector('input[name="noble"]:checked');
      if (!checked) return;
      var value = checked.value; popup.close(); callback(value);
    };
  }

  function chooseReturns(self, additions, toast, callback) {
    var after = {};
    TOKENS.forEach(function (color) { after[color] = Number(self.tokens[color] || 0) + Number(additions[color] || 0); });
    var excess = Math.max(0, total(after) - 10);
    if (!excess) { callback({}); return; }
    var popup = modal('归还 ' + excess + ' 枚筹码', '<p class="spl-modal-note">行动完成时最多保留 10 枚实体筹码。请选择要放回银行的筹码。</p><div class="spl-return-grid">' + TOKENS.filter(function (color) { return after[color] > 0; }).map(function (color) {
      return '<label><span class="spl-pip ' + color + '">' + META[color].icon + '</span><b>' + META[color].name + ' · 持有 ' + after[color] + '</b><input data-return="' + color + '" type="number" min="0" max="' + after[color] + '" value="0"></label>';
    }).join('') + '</div><p class="spl-return-total">已选 <b>0</b> / ' + excess + '</p>');
    function update() {
      var selected = Array.from(popup.node.querySelectorAll('[data-return]')).reduce(function (sum, input) { return sum + Number(input.value || 0); }, 0);
      popup.node.querySelector('.spl-return-total b').textContent = selected;
    }
    popup.node.querySelectorAll('[data-return]').forEach(function (input) { input.oninput = update; });
    popup.node.querySelector('[data-confirm]').onclick = function () {
      var returns = {}; var count = 0; var valid = true;
      popup.node.querySelectorAll('[data-return]').forEach(function (input) {
        var value = Number(input.value || 0); if (value < 0 || value > Number(input.max)) valid = false;
        if (value) returns[input.dataset.return] = value; count += value;
      });
      if (!valid || count !== excess) { toast('需要恰好归还 ' + excess + ' 枚筹码', false); return; }
      popup.close(); callback(returns);
    };
  }

  function perform(room, self, handlers, tools, action, payload, additions, bonuses) {
    chooseNoble(room, bonuses || self.bonuses, function (nobleId) {
      chooseReturns(self, additions || {}, tools.toast, function (returns) {
        handlers.act(action, Object.assign({}, payload || {}, { nobleId: nobleId, returns: returns }));
      });
    });
  }

  function nobleHtml(noble) {
    return '<article class="spl-noble"><div><span>NOBLE</span><strong>3</strong></div><div class="spl-costs">' + tokenPips(noble.requirement, 'requirement') + '</div></article>';
  }

  function canBuy(player, card) {
    var goldNeeded = 0;
    COLORS.forEach(function (color) {
      goldNeeded += Math.max(0, Number(card.cost[color] || 0) - Number(player.bonuses[color] || 0) - Number(player.tokens[color] || 0));
    });
    return goldNeeded <= Number(player.tokens.gold || 0);
  }

  function cardHtml(card, active, reserved, self) {
    var cost = tokenPips(card.cost, 'cost');
    var affordable = self && canBuy(self, card);
    var canReserve = self && self.reservedCount < 3;
    return '<article class="spl-card bonus-' + card.bonus + '" data-card-tier="' + card.tier + '"><header><span class="spl-card-points">' + (card.points || '') + '</span><span class="spl-card-gem" title="永久提供 1 点' + META[card.bonus].name + '折扣">' + gemImage('gem', card.bonus, 'spl-card-gem-image') + '</span></header><div class="spl-card-art"><i></i><i></i><i></i></div><div class="spl-card-cost">' + cost + '</div>' + (active ? '<footer><button class="spl-card-action buy" data-buy="' + esc(card.id) + '" type="button" ' + (affordable ? '' : 'disabled title="宝石不足"') + '>购买</button>' + (!reserved && canReserve ? '<button class="spl-card-action reserve" data-reserve="' + esc(card.id) + '" data-tier="' + card.tier + '" type="button">预留</button>' : '') + '</footer>' : '') + '</article>';
  }

  function bankHtml(room, self, active) {
    var availableCount = COLORS.filter(function (color) { return room.bank[color] > 0; }).length;
    return '<section class="spl-bank spl-panel"><div class="spl-section-title"><div><span>01</span><h2>宝石银行</h2></div><small>选择 ' + Math.min(3, availableCount) + ' 种不同宝石，或拿 2 枚同色</small></div><div class="spl-bank-row">' + TOKENS.map(function (color) {
      var ordinary = color !== 'gold';
      return '<article class="spl-bank-stack ' + color + ' ' + (active && ordinary && room.bank[color] > 0 ? 'selectable' : '') + '" ' + (active && ordinary && room.bank[color] > 0 ? 'data-gem="' + color + '"' : '') + '>' + gemImage('stack', color, 'spl-token-stack') + '<span>' + META[color].name + '</span><strong>' + room.bank[color] + '</strong>' + (active && ordinary && room.bank[color] >= 4 ? '<button data-take-same="' + color + '" type="button">拿 2 枚</button>' : '') + '</article>';
    }).join('') + '</div>' + (active ? '<div class="spl-bank-controls"><span>已选 <b data-selected-count>0</b> / ' + Math.min(3, availableCount) + '</span><button class="btn primary small" data-take-different disabled type="button">拿取选中宝石</button></div>' : '') + '</section>';
  }

  function marketHtml(room, self, active) {
    return '<section class="spl-market spl-panel"><div class="spl-section-title"><div><span>02</span><h2>发展卡市场</h2></div><small>买下后永久提供 1 点对应颜色折扣</small></div>' + [3, 2, 1].map(function (tier) {
      return '<div class="spl-tier"><div class="spl-deck"><b>' + ['I', 'II', 'III'][tier - 1] + '</b><span>余 ' + room.deckCounts[tier] + '</span>' + (active && self.reservedCount < 3 && room.deckCounts[tier] > 0 ? '<button data-blind-reserve="' + tier + '" type="button">盲预留</button>' : '') + '</div><div class="spl-card-row">' + room.tiers[tier].visible.map(function (card) { return cardHtml(card, active, false, self); }).join('') + '</div></div>';
    }).join('') + '</section>';
  }

  function selfHtml(self, active) {
    return '<section class="spl-self spl-side-card"><div class="spl-side-heading"><span>你的珠宝行</span><strong>' + self.points + '<small> 声望</small></strong></div><h3>永久折扣</h3><div class="spl-summary-pips">' + tokenPips(self.bonuses, 'bonus') + '</div><h3>实体筹码 <small>' + total(self.tokens) + ' / 10</small></h3><div class="spl-summary-pips spl-held-tokens">' + tokenPips(self.tokens, 'held') + '</div><h3>预留发展卡 <small>' + self.reservedCount + ' / 3</small></h3><div class="spl-reserved">' + ((self.reserved || []).length ? self.reserved.map(function (card) { return cardHtml(card, active, true, self); }).join('') : '<p>暂无预留卡</p>') + '</div></section>';
  }

  function playersHtml(room, self) {
    return '<section class="spl-players spl-side-card"><h2>珠宝商排名</h2>' + room.players.slice().sort(function (a, b) { return b.points - a.points; }).map(function (player) {
      return '<article class="spl-player ' + (player.id === self.id ? 'me' : '') + ' ' + (room.currentPlayerId === player.id ? 'active' : '') + '" style="--player:' + player.color + '"><i></i><div><strong>' + esc(player.nickname) + (player.isBot ? ' <em>人机</em>' : '') + '</strong><small>' + player.purchased.length + ' 张卡 · ' + total(player.tokens) + ' 枚筹码 · 预留 ' + player.reservedCount + '</small><div>' + tokenPips(player.bonuses, 'mini') + '</div></div><b>' + player.points + '</b></article>';
    }).join('') + '</section>';
  }

  function historyHtml(room) {
    return '<section class="spl-history spl-side-card"><h2>行会记录</h2><div class="spl-log">' + room.logs.slice(-35).reverse().map(function (entry) { return '<div class="' + esc(entry.type || '') + '"><time>' + time(entry.at) + '</time><p>' + esc(entry.text) + '</p></div>'; }).join('') + '</div><form class="spl-chat"><input maxlength="200" placeholder="发消息给同桌玩家"><button class="btn secondary small" type="submit">发送</button></form></section>';
  }

  function scoreHtml(room) {
    if (room.status !== 'finished') return '';
    return '<section class="spl-finish"><div class="spl-crown">♛</div><div><span>FINAL PRESTIGE</span><h1>' + esc(room.scores.filter(function (score) { return room.winners.includes(score.pid); }).map(function (score) { return score.nickname; }).join('、')) + ' 获胜</h1><p>同分时，购买发展卡更少者优先。</p></div><div class="spl-score-list">' + room.scores.map(function (score, index) { return '<article class="' + (room.winners.includes(score.pid) ? 'winner' : '') + '"><span>' + (index + 1) + '</span><strong>' + esc(score.nickname) + '</strong><b>' + score.points + ' 分</b><small>' + score.cards + ' 张发展卡</small></article>'; }).join('') + '</div></section>';
  }

  function rulesModal() {
    var popup = modal('《璀璨宝石》规则速查', '<div class="rules"><h3>目标</h3><p>有人达到至少 15 点声望后打完当前轮，最高分获胜；同分则购买发展卡更少者获胜。</p><h3>每回合四选一</h3><ol><li>拿 3 种不同颜色的普通宝石；不足 3 种时拿完所有现存颜色。</li><li>拿 2 枚同色普通宝石，拿取前该色库存必须至少有 4 枚。</li><li>预留一张明牌或牌堆顶卡，并在有库存时获得 1 枚黄金；最多预留 3 张。</li><li>购买一张明牌或自己的预留卡。发展卡提供永久折扣，黄金可补任意不足费用。</li></ol><h3>限制与贵族</h3><p>回合结束最多保留 10 枚实体筹码。永久折扣满足贵族条件时，自动获得 3 分；同时满足多个时选择一个。</p></div>');
    popup.node.querySelector('[data-confirm]').textContent = '知道了';
    popup.node.querySelector('[data-confirm]').onclick = popup.close;
  }

  function startClock(room) {
    clearInterval(clockTimer);
    var clock = document.getElementById('decision-clock');
    if (!clock) return;
    function tick() {
      var remaining = room.decisionDeadlineAt ? Math.max(0, Math.ceil((Number(room.decisionDeadlineAt) - Date.now()) / 1000)) : '—';
      clock.querySelector('strong').textContent = remaining;
      clock.classList.toggle('urgent', Number(remaining) <= 5);
    }
    tick(); clockTimer = setInterval(tick, 250);
  }

  function bind(root, room, self, active, handlers, tools) {
    var maxDifferent = Math.min(3, COLORS.filter(function (color) { return room.bank[color] > 0; }).length);
    root.querySelectorAll('[data-gem]').forEach(function (gem) {
      gem.onclick = function (event) {
        if (event.target.closest('[data-take-same]')) return;
        if (!gem.classList.contains('selected') && root.querySelectorAll('[data-gem].selected').length >= maxDifferent) return;
        gem.classList.toggle('selected');
        var count = root.querySelectorAll('[data-gem].selected').length;
        var label = root.querySelector('[data-selected-count]'); if (label) label.textContent = count;
        var button = root.querySelector('[data-take-different]'); if (button) button.disabled = count !== maxDifferent;
      };
    });
    var take = root.querySelector('[data-take-different]');
    if (take) take.onclick = function () {
      var colors = Array.from(root.querySelectorAll('[data-gem].selected')).map(function (node) { return node.dataset.gem; });
      var additions = {}; colors.forEach(function (color) { additions[color] = 1; });
      perform(room, self, handlers, tools, 'splendor-take-different', { colors: colors }, additions, self.bonuses);
    };
    root.querySelectorAll('[data-take-same]').forEach(function (button) { button.onclick = function (event) { event.stopPropagation(); var color = button.dataset.takeSame; perform(room, self, handlers, tools, 'splendor-take-same', { color: color }, Object.fromEntries([[color, 2]]), self.bonuses); }; });
    root.querySelectorAll('[data-reserve]').forEach(function (button) { button.onclick = function () { perform(room, self, handlers, tools, 'splendor-reserve', { cardId: button.dataset.reserve, tier: Number(button.dataset.tier) }, room.bank.gold > 0 ? { gold: 1 } : {}, self.bonuses); }; });
    root.querySelectorAll('[data-blind-reserve]').forEach(function (button) { button.onclick = function () { perform(room, self, handlers, tools, 'splendor-reserve', { tier: Number(button.dataset.blindReserve) }, room.bank.gold > 0 ? { gold: 1 } : {}, self.bonuses); }; });
    root.querySelectorAll('[data-buy]').forEach(function (button) { button.onclick = function () {
      var cardId = button.dataset.buy; var card = null;
      [1, 2, 3].some(function (tier) { card = room.tiers[tier].visible.find(function (item) { return item.id === cardId; }); return Boolean(card); });
      if (!card) card = (self.reserved || []).find(function (item) { return item.id === cardId; });
      var projected = Object.assign({}, self.bonuses); if (card) projected[card.bonus] += 1;
      chooseNoble(room, projected, function (nobleId) { handlers.act('splendor-buy', { cardId: cardId, nobleId: nobleId }); });
    }; });
    var chat = root.querySelector('.spl-chat');
    if (chat) chat.onsubmit = function (event) { event.preventDefault(); var input = chat.querySelector('input'); if (input.value.trim()) { handlers.chat(input.value.trim()); input.value = ''; } };
  }

  function renderGame(room, me, handlers, tools) {
    tools.show('game');
    var self = room.players.find(function (player) { return player.id === me.id; }) || me;
    var active = room.status === 'playing' && room.currentPlayerId === self.id && !self.isBot;
    var header = document.getElementById('game-header');
    header.className = 'game-header spl-header';
    header.innerHTML = '<div class="game-brand"><span class="top-kicker">TABLE CLUB · SPLENDOR</span><strong>璀璨宝石</strong></div><div class="header-divider"></div><div class="voyage-meta"><span>回合</span><strong>' + room.turnNumber + '</strong></div><div class="phase-pill"><i></i>' + (room.status === 'finished' ? '最终结算' : '轮到 ' + esc(nickname(room, room.currentPlayerId))) + '</div><div id="decision-clock" class="decision-clock"><span>决策</span><strong>—</strong><small>s</small></div><div class="header-spacer"></div><span class="code-chip">房间 ' + esc(room.code) + '</span><button class="btn ghost small" data-rules type="button">规则</button><button class="btn danger small" data-leave type="button">退出房间</button>';
    header.querySelector('[data-rules]').onclick = rulesModal;
    header.querySelector('[data-leave]').onclick = function () { if (window.confirm('任意真人玩家退出会解散整个房间，确认退出吗？')) handlers.leave(); };
    startClock(room);
    var root = document.getElementById('game-root');
    root.innerHTML = '<div class="splendor-table">' + scoreHtml(room) + '<div class="spl-opponents">' + playersHtml(room, self) + '</div><section class="spl-nobles spl-panel"><div class="spl-section-title"><div><span>贵族</span><h2>来访者</h2></div><small>只计算已购买发展卡的永久折扣</small></div><div>' + room.nobles.map(nobleHtml).join('') + '</div></section><div class="spl-main-layout"><main class="spl-board-surface">' + marketHtml(room, self, active) + '</main><aside class="spl-bank-rail">' + bankHtml(room, self, active) + selfHtml(self, active) + historyHtml(room) + '</aside></div></div>';
    bind(root, room, self, active, handlers, tools);
  }

  return { renderGame: renderGame };
})();

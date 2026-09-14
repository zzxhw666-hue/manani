import {createTable3D} from './splendor-table3d.js';
import {toTableState,buyPayment} from './splendor-table-state.js';
import './splendor-art.js';

const colors=['white','blue','green','red','black'],tokens=[...colors,'gold'];
const names={white:'钻石',blue:'蓝宝石',green:'祖母绿',red:'红宝石',black:'玛瑙',gold:'黄金'};
const {cardArt}=globalThis.SPLENDOR_ART;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function artStyle(id){const a=cardArt(id);return `background-image:url('${a.src}');background-size:${a.columns*100}% ${a.rows*100}%;background-position:${a.column/(a.columns-1)*100}% ${a.row/(a.rows-1)*100}%`;}
function pips(values){return tokens.filter(c=>values[c]).map(c=>`<span class="live-pip"><img src="assets/table-club/gems/${c==='gold'?'stack':'gem'}-${c}.png" alt="${names[c]}"><b>${values[c]}</b></span>`).join('')||'<span>—</span>';}

export function createLiveUI(helpers,onFallback){
  const root=document.getElementById('game-root'),header=document.getElementById('game-header');
  document.body.classList.add('splendor-3d-active');
  root.className='spl-live-root';
  root.innerHTML=`<div class="live-scene" aria-label="璀璨宝石三维桌面"></div><div class="live-opponents"></div><section class="live-actions" aria-label="回合操作"><span data-turn></span><div data-selected aria-live="polite"></div><button data-take type="button">拿取选中宝石</button><button data-double type="button" hidden>拿两枚同色</button><button data-clear type="button" hidden>取消选择</button></section><button class="live-own-details" type="button">我的卡牌与筹码</button><button class="live-accessible-actions" type="button">操作列表</button><p class="live-hint">点击宝石选择 · 点击卡牌购买／预留 · 拖动微调视角</p><div class="live-loading" role="status">正在布置你的桌面…</div>`;
  header.className='game-header spl-live-header';
  header.innerHTML=`<button data-leave type="button">← 退出房间</button><div class="live-brand"><strong>璀璨宝石</strong><small>S P L E N D O R</small></div><div class="live-header-tools"><span data-room></span><span id="decision-clock"><strong>—</strong> 秒</span><button data-records type="button">记录</button><button data-rules type="button">规则</button><button data-reset type="button">归位</button><button data-flat type="button">兼容视图</button></div>`;
  const mount=root.querySelector('.live-scene');
  let context=null,table=null,disposed=false,sending=false,selected=[],actionStamp='',endShown=false;
  const turnKey=r=>[r.code,r.status,r.turnNumber,r.currentPlayerId].join('|');
  const isActive=()=>context?.room.status==='playing'&&context.room.currentPlayerId===context.me.id&&!context.self.isBot;
  function freshHandlers(){
    const stamp=turnKey(context.room),handlers=context.handlers,tools=context.tools;
    return {act:async(action,payload)=>{
      if(disposed||!isActive()||stamp!==turnKey(context.room)){tools.toast('回合已变化，请重新选择操作',false);return;}
      if(sending)return;sending=true;paintActions();
      try{await handlers.act(action,payload);}finally{sending=false;selected=[];if(!disposed)paintActions();}
    }};
  }
  function perform(action,payload,additions,bonuses){
    if(!isActive()||sending)return;
    helpers.perform(context.room,context.self,freshHandlers(),context.tools,action,payload,additions,bonuses);
  }
  function available(){return Math.min(3,colors.filter(c=>context.room.bank[c]>0).length);}
  function paintActions(){
    if(!context||disposed)return;
    const active=isActive()&&!sending,n=available();
    const r=context.room,owner=r.players.find(p=>p.id===r.currentPlayerId);
    root.querySelector('[data-turn]').textContent=r.status==='finished'?'对局已结束':sending?'正在提交…':active?'轮到你了':`等待 ${owner?.nickname||'其他玩家'}`;
    root.querySelector('[data-selected]').textContent=selected.length?selected.map(c=>names[c]).join(' · ')+` (${selected.length}/${n})`:r.finalRoundTriggeredBy?'最后一轮 · 本轮结束后结算':`选择 ${n} 种不同宝石`;
    const take=root.querySelector('[data-take]');take.disabled=!active||selected.length!==n;take.textContent=n?'拿取选中宝石':'无普通宝石 · 结束回合';
    const double=root.querySelector('[data-double]');double.hidden=selected.length!==1;double.disabled=!active||r.bank[selected[0]]<4;double.textContent=selected.length===1?'拿 2 枚'+names[selected[0]]:'';
    root.querySelector('[data-clear]').hidden=!selected.length;
    table?.select(selected.map(c=>'gem:'+c));
  }
  function findCard(id){return [1,2,3].flatMap(t=>context.room.tiers[t].visible).concat(context.self.reserved||[]).find(c=>c.id===id);}
  function showCard(id){
    const c=findCard(id);if(!c)return;
    const a=cardArt(c.id),payment=buyPayment(context.self,c),reserved=(context.self.reserved||[]).some(x=>x.id===id);
    const pop=helpers.modal(a.title,`<div class="live-card-detail"><div class="live-detail-art" style="${artStyle(c.id)}"></div><div><p>等级 ${c.tier} · ${c.points} 声望</p><p>永久折扣：${names[c.bonus]} +1</p><h3>购买费用</h3><div class="live-pips">${pips(c.cost)}</div><h3>折扣后支付</h3><div class="live-pips">${pips(payment.payment)}</div><p>${payment.affordable?'你的筹码足够购买':'筹码不足，暂时无法购买'}</p></div></div>`);
    const actions=pop.node.querySelector('.modal-actions');
    actions.innerHTML=`<button data-close type="button">关闭</button><button data-live-reserve type="button" ${!isActive()||reserved||context.self.reservedCount>=3?'disabled':''}>预留${context.room.bank.gold?' + 黄金':''}</button><button data-live-buy type="button" ${!isActive()||!payment.affordable?'disabled':''}>购买</button>`;
    actions.querySelector('[data-close]').onclick=pop.close;
    actions.querySelector('[data-live-reserve]').onclick=()=>{pop.close();perform('splendor-reserve',{cardId:c.id,tier:c.tier},context.room.bank.gold?{gold:1}:{},context.self.bonuses);};
    actions.querySelector('[data-live-buy]').onclick=()=>{
      const handlers=freshHandlers(),projected={...context.self.bonuses};projected[c.bonus]++;
      pop.close();helpers.chooseNoble(context.room,projected,nobleId=>handlers.act('splendor-buy',{cardId:c.id,nobleId}));
    };
  }
  function pick(item){
    if(!context||disposed)return;
    if(item.kind==='card'){showCard(item.cardId);return;}
    if(item.kind==='noble'){
      const n=context.room.nobles.find(n=>n.id===item.nobleId);if(!n)return;
      const pop=helpers.modal(cardArt(n.id).title,`<div class="live-noble-portrait" style="${artStyle(n.id)}"></div><p>满足以下永久折扣后获得 3 声望：</p><div class="live-pips">${pips(n.requirement)}</div>`);
      pop.node.querySelector('[data-confirm]').onclick=pop.close;return;
    }
    if(!isActive()||sending){context.tools.toast('现在不是你的回合',false);return;}
    if(item.kind==='bank'){
      const c=item.name;
      if(c==='gold'){context.tools.toast('黄金通过预留卡牌获得，不能直接拿取',false);return;}
      if(!context.room.bank[c]){context.tools.toast('该宝石库存已空',false);return;}
      if(selected.includes(c))selected=selected.filter(v=>v!==c);
      else if(selected.length<available())selected.push(c);
      paintActions();return;
    }
    if(item.kind==='deck'){
      if(context.self.reservedCount>=3||!context.room.deckCounts[item.tier]){context.tools.toast('预留位已满或牌堆已空',false);return;}
      const pop=helpers.modal('盲预留等级 '+item.tier+' 发展卡','<p>从牌堆顶部预留一张未知发展卡。只有你能看到牌面。</p>');
      pop.node.querySelector('[data-confirm]').onclick=()=>{pop.close();perform('splendor-reserve',{tier:item.tier},context.room.bank.gold?{gold:1}:{},context.self.bonuses);};
    }
  }
  function details(pid){
    const p=context.room.players.find(p=>p.id===pid);if(!p)return;
    const own=pid===context.me.id;
    const mini=c=>`<button class="live-mini-card" data-inspect-card="${esc(c.id)}" title="${esc(cardArt(c.id).title)}" style="${artStyle(c.id)}"><b>${c.points||0}</b></button>`;
    const pop=helpers.modal(p.nickname+' · 珠宝行',`<p>${p.points} 声望 · ${p.purchased.length} 张发展卡</p><h3>实体筹码</h3><div class="live-pips">${pips(p.tokens)}</div><h3>永久折扣</h3><div class="live-pips">${pips(p.bonuses)}</div><h3>已购买发展卡</h3><div class="live-collection">${p.purchased.map(mini).join('')||'暂无'}</div><h3>来访贵族</h3><div class="live-collection">${p.nobles.map(mini).join('')||'暂无'}</div><h3>预留 ${p.reservedCount} 张</h3>${own?`<div class="live-collection">${(p.reserved||[]).map(mini).join('')||'暂无'}</div>`:'<p>其他玩家的预留牌正面不可见</p>'}`);
    pop.node.querySelector('[data-confirm]').onclick=pop.close;
    pop.node.querySelectorAll('[data-inspect-card]').forEach(b=>b.onclick=()=>{
      const id=b.dataset.inspectCard;
      if(own&&(p.reserved||[]).some(c=>c.id===id)){pop.close();showCard(id);return;}
      const c=p.purchased.concat(p.nobles).find(c=>c.id===id);if(!c)return;
      pop.close();const info=helpers.modal(cardArt(id).title,`<div class="live-noble-portrait" style="${artStyle(id)}"></div><p>${c.points} 声望</p><div class="live-pips">${pips(c.cost||c.requirement)}</div>`);info.node.querySelector('[data-confirm]').onclick=info.close;
    });
  }
  function records(){
    const r=context.room,pop=helpers.modal('同桌记录',`<div class="live-log">${r.logs.slice(-40).map(l=>`<p>${esc(l.text)}</p>`).join('')}<hr>${(r.chat||[]).slice(-30).map(c=>`<p><b>${esc(c.nickname)}：</b>${esc(c.text)}</p>`).join('')}</div><form class="live-chat"><input maxlength="200" placeholder="与同桌玩家说句话" aria-label="聊天内容"><button type="submit">发送</button></form>`);
    pop.node.querySelector('[data-confirm]').onclick=pop.close;
    pop.node.querySelector('form').onsubmit=async e=>{e.preventDefault();const input=e.target.querySelector('input'),text=input.value.trim();if(text){input.value='';await context.handlers.chat(text);pop.close();if(!disposed)records();}};
  }
  function actionList(){
    const pop=helpers.modal('桌面操作列表',`<h3>宝石银行</h3><div class="live-list-buttons">${tokens.map(c=>`<button data-list-gem="${c}">${names[c]} ${context.room.bank[c]}</button>`).join('')}</div>${[3,2,1].map(t=>`<h3>等级 ${t}</h3><div class="live-list-buttons">${context.room.tiers[t].visible.map(c=>`<button data-list-card="${c.id}">${cardArt(c.id).title} · ${c.points} 分</button>`).join('')}<button data-list-deck="${t}">盲预留 · 余 ${context.room.deckCounts[t]}</button></div>`).join('')}<h3>自己的预留牌</h3><div class="live-list-buttons">${(context.self.reserved||[]).map(c=>`<button data-list-card="${c.id}">${cardArt(c.id).title}</button>`).join('')||'暂无'}</div>`);
    pop.node.querySelector('[data-confirm]').onclick=pop.close;
    pop.node.querySelectorAll('[data-list-gem]').forEach(b=>b.onclick=()=>{pick({kind:'bank',name:b.dataset.listGem});pop.close();});
    pop.node.querySelectorAll('[data-list-card]').forEach(b=>b.onclick=()=>{pop.close();showCard(b.dataset.listCard);});
    pop.node.querySelectorAll('[data-list-deck]').forEach(b=>b.onclick=()=>{pop.close();pick({kind:'deck',tier:Number(b.dataset.listDeck)});});
  }
  root.querySelector('[data-take]').onclick=()=>perform('splendor-take-different',{colors:[...selected]},Object.fromEntries(selected.map(c=>[c,1])),context.self.bonuses);
  root.querySelector('[data-double]').onclick=()=>{const c=selected[0];if(c&&context.room.bank[c]>=4)perform('splendor-take-same',{color:c},{[c]:2},context.self.bonuses);};
  root.querySelector('[data-clear]').onclick=()=>{selected=[];paintActions();};
  root.querySelector('.live-own-details').onclick=()=>details(context.me.id);
  root.querySelector('.live-accessible-actions').onclick=actionList;
  header.querySelector('[data-leave]').onclick=()=>{if(confirm('退出会解散整个房间，确定退出吗？'))context.handlers.leave();};
  header.querySelector('[data-rules]').onclick=helpers.rulesModal;
  header.querySelector('[data-reset]').onclick=()=>table?.reset();
  header.querySelector('[data-records]').onclick=records;
  header.querySelector('[data-flat]').onclick=()=>onFallback();
  function update(room,me,handlers,tools){
    if(disposed)return;
    const state=toTableState(room,me.id),self=room.players.find(p=>p.id===me.id);
    context={room,me,handlers,tools,self};
    const stamp=turnKey(room);
    if(actionStamp&&actionStamp!==stamp){selected=[];document.querySelectorAll('.spl-modal-mask').forEach(n=>n.remove());}
    actionStamp=stamp;
    root.dataset.viewerId=me.id;root.dataset.turnOwner=room.currentPlayerId||'';root.dataset.version=room.version;
    header.querySelector('[data-room]').textContent=room.code+' · 回合 '+room.turnNumber;
    helpers.startClock(room);
    const opponents=root.querySelector('.live-opponents');opponents.style.setProperty('--opponent-count',state.opponents.length);
    opponents.innerHTML=state.opponents.map(p=>`<button class="live-opponent ${room.currentPlayerId===p.id?'active':''}" data-player="${esc(p.id)}"><span class="live-avatar">${esc(p.name.slice(-1))}</span><span><strong>${esc(p.name)}${p.isBot?' · 人机':''}</strong><span class="live-opponent-pips">${pips(p.tokens)}</span><small>预留 ${p.reservedCount} 张 · 折扣 ${colors.map(c=>p.bonuses[c]||0).join(' / ')}</small></span><b>${p.score}</b></button>`).join('');
    opponents.querySelectorAll('[data-player]').forEach(b=>b.onclick=()=>details(b.dataset.player));
    table?.update(state);paintActions();
    if(room.status==='finished'&&!endShown){endShown=true;const pop=helpers.modal('最终结算',helpers.scoreHtml(room));pop.node.querySelector('[data-confirm]').textContent='留在桌面';pop.node.querySelector('[data-confirm]').onclick=pop.close;}
  }
  createTable3D(mount,pick,()=>onFallback('图形上下文已丢失，已切换兼容视图')).then(view=>{
    if(disposed){view.destroy();return;}table=view;
    if(context)table.update(toTableState(context.room,context.me.id));
    root.querySelector('.live-loading').remove();root.dataset.ready='true';paintActions();
  }).catch(error=>{if(!disposed)onFallback('3D 资源未能加载，已切换兼容视图：'+error.message);});
  return {update,inspect:()=>({viewer:context?.me.id,selected:[...selected],scene:table?.snapshot(),targets:table?.targets()}),destroy:()=>{
    if(disposed)return;disposed=true;table?.destroy();document.querySelectorAll('.spl-modal-mask').forEach(n=>n.remove());document.body.classList.remove('splendor-3d-active');root.className='';delete root.dataset.ready;
  }};
}

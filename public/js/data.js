window.MANILA_DATA = (function () {
  var wares = {
    ginseng: { name: '人参', en: 'GINSENG', icon: '🌿', pool: 18, crewCosts: [1, 2, 3], color: '#d8c75e', ink: '#655a17' },
    nutmeg: { name: '肉豆蔻', en: 'NUTMEG', icon: '●', pool: 24, crewCosts: [2, 3, 4], color: '#a46140', ink: '#5b2c1c' },
    silk: { name: '丝绸', en: 'SILK', icon: '〰', pool: 30, crewCosts: [3, 4, 5], color: '#5d91c9', ink: '#234c75' },
    jade: { name: '翡翠', en: 'JADE', icon: '◆', pool: 36, crewCosts: [3, 4, 5, 5], color: '#439674', ink: '#174f3b' }
  };
  return {
    wares: wares,
    wareIds: Object.keys(wares),
    marketTrack: [0, 5, 10, 20, 30],
    dock: { A: { cost: 4, reward: 6 }, B: { cost: 3, reward: 8 }, C: { cost: 2, reward: 15 } },
    phaseNames: {
      waiting: '等待开局', auction: '竞拍港务长', harbor_setup: '港务长布船', placement: '派遣帮手',
      dice: '等待掷骰', move: '决定移船顺序', pirate_board: '海盗登船', pilot: '领航员行动',
      pirate_destination: '海盗决定去向', settle: '航程结算', settlement_review: '本轮收支结算', finished: '游戏结束'
    }
  };
})();

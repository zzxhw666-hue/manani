const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

// Import the browser module without changing the CommonJS server package.
const source = fs.readFileSync(path.join(__dirname, '../public/js/splendor-demo-state.js'), 'utf8');
const state = import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

test('每个座位都以自己为主视角，其他三位保持相对座次', async () => {
  const { perspective } = await state;
  const expected = { lin: ['zhou', 'kai', 'an'], zhou: ['kai', 'an', 'lin'], kai: ['an', 'lin', 'zhou'], an: ['lin', 'zhou', 'kai'] };
  for (const [id, opponents] of Object.entries(expected)) {
    const view = perspective(id);
    assert.equal(view.self.id, id);
    assert.deepEqual(view.opponents.map(p => p.id), opponents);
    assert.equal(new Set([id, ...view.opponents.map(p => p.id)]).size, 4);
  }
});

test('自己的筹码、折扣与预留牌随座位一起切换', async () => {
  const { perspective } = await state;
  const zhou = perspective('zhou').self;
  assert.equal(zhou.name, '老周');
  assert.equal(zhou.score, 6);
  assert.deepEqual(zhou.tokens, [1, 2, 0, 2, 1, 0]);
  assert.deepEqual(zhou.bonuses, [1, 2, 0, 2, 1]);
  assert.deepEqual(zhou.reserved.map(c => c.color), ['blue', 'white']);
  assert.deepEqual(perspective('kai').self.reserved, []);
  assert.deepEqual(perspective('an').self.reserved.map(c => c.color), ['red']);
});

test('对手视图只包含预留数量，不包含预留牌正面', async () => {
  const { perspective } = await state;
  const opponents = perspective('kai').opponents;
  assert.deepEqual(opponents.map(p => [p.id, p.reservedCount]), [['an', 1], ['lin', 1], ['zhou', 2]]);
  for (const p of opponents) assert.equal(Object.hasOwn(p, 'reserved'), false);
});

test('切换观看座位不会改变实际轮到的玩家', async () => {
  const { perspective } = await state;
  assert.equal(perspective('lin').isMyTurn, true);
  for (const id of ['zhou', 'kai', 'an']) assert.equal(perspective(id).isMyTurn, false);
});

test('视图数据互相隔离，修改一份视图不污染后续座位', async () => {
  const { perspective } = await state;
  const original = perspective('lin');
  const changed = perspective('lin');
  changed.self.tokens[0] = 99;
  changed.self.reserved[0].color = 'black';
  changed.opponents[0].tokens[0] = 99;
  assert.deepEqual(perspective('lin'), original);
  assert.equal(perspective('zhou').self.tokens[0], 1);
});

test('未知座位不能静默变成另一位玩家的数据', async () => {
  const { perspective } = await state;
  for (const id of ['', 'missing', undefined]) assert.throws(() => perspective(id), RangeError);
});

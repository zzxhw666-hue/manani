const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const projectRoot = path.resolve(__dirname, '..');
const uiSource = fs.readFileSync(path.join(projectRoot, 'public/js/ui.js'), 'utf8');
const tableCss = fs.readFileSync(path.join(projectRoot, 'public/css/table-club.css'), 'utf8');

test('马尼拉棋盘以实时货物类型绑定独立素材，不再覆盖整张示意背景', () => {
  assert.match(uiSource, /market-card ware-/);
  assert.match(uiSource, /boat-lane ware-/);
  assert.match(uiSource, /share-row ware-/);
  assert.doesNotMatch(tableCss, /manila-board\.jpg/);

  [
    'cargo-ginseng.png', 'cargo-nutmeg.png', 'cargo-silk.png', 'cargo-jade.png',
    'ship-ginseng-empty.png', 'ship-silk-empty.png', 'ship-jade-empty.png',
    'special-pirate.png', 'special-pilot.png', 'special-insurance.png',
    'share-ginseng.png', 'share-nutmeg.png', 'share-silk.png', 'share-jade.png'
  ].forEach((filename) => {
    const assetPath = path.join(projectRoot, 'public/assets/manila-ui', filename);
    assert.ok(fs.statSync(assetPath).size > 1000, filename + ' 应为有效的透明图片素材');
    assert.match(tableCss, new RegExp(filename.replace('.', '\\.')));
  });
  assert.match(uiSource, /class="ship-crew"/);
  assert.match(uiSource, /playerColor\(room, item\.pid\)/);
  ['ginseng', 'silk', 'jade'].forEach((ware) => {
    const png = fs.readFileSync(path.join(projectRoot, 'public/assets/manila-ui', 'ship-' + ware + '-empty.png'));
    assert.equal(png[25], 6, ware + ' 空船素材必须保留 RGBA 透明通道');
  });
});

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const projectRoot = path.resolve(__dirname, '..');
const uiSource = fs.readFileSync(path.join(projectRoot, 'public/js/splendor-ui.js'), 'utf8');
const tableCss = fs.readFileSync(path.join(projectRoot, 'public/css/table-club.css'), 'utf8');

test('璀璨宝石的卡面奖励、银行和个人筹码均使用独立 3D 图片素材', () => {
  assert.match(uiSource, /gemImage\('gem', card\.bonus, 'spl-card-gem-image'\)/);
  assert.match(uiSource, /gemImage\('stack', color, 'spl-token-stack'\)/);
  assert.match(uiSource, /gemImage\('stack', color, 'spl-held-token-image'\)/);
  assert.doesNotMatch(uiSource, /class="spl-chip"/);
  assert.doesNotMatch(tableCss, /\.spl-chip/);

  [
    'gem-white.png', 'gem-blue.png', 'gem-green.png', 'gem-red.png', 'gem-black.png',
    'stack-white.png', 'stack-blue.png', 'stack-green.png', 'stack-red.png',
    'stack-black.png', 'stack-gold.png'
  ].forEach((filename) => {
    const assetPath = path.join(projectRoot, 'public/assets/table-club/gems', filename);
    assert.ok(fs.statSync(assetPath).size > 10000, filename + ' 应为有效的透明 3D 图片素材');
    assert.match(uiSource, /assets\/table-club\/gems\//);
  });
});

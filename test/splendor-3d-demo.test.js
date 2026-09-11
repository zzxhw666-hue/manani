const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public/splendor-3d-demo.html'), 'utf8');
const source = fs.readFileSync(path.join(root, 'public/js/splendor-3d-demo.js'), 'utf8');

test('璀璨宝石 3D Demo 使用本地 WebGL 引擎和真实场景几何体', () => {
  assert.match(html, /id="scene"/);
  assert.match(html, /type="module" src="js\/splendor-3d-demo\.js"/);
  assert.doesNotMatch(html + source, /https?:\/\//);
  assert.match(source, /new THREE\.WebGLRenderer/);
  assert.match(source, /new THREE\.PerspectiveCamera/);
  assert.match(source, /new THREE\.MeshPhysicalMaterial/);
  assert.match(source, /new THREE\.CylinderGeometry/);
  assert.match(source, /new THREE\.BoxGeometry/);
  assert.match(source, /new THREE\.Raycaster/);
  assert.ok(fs.statSync(path.join(root, 'public/vendor/three.module.js')).size > 500000);
  assert.ok(fs.statSync(path.join(root, 'public/vendor/three.core.js')).size > 1000000);
});

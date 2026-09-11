import * as THREE from '../vendor/three.module.js';

const mount = document.getElementById('scene');
const loading = document.getElementById('loading');
const selectionCopy = document.getElementById('selection-copy');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.24;
renderer.outputColorSpace = THREE.SRGBColorSpace;
mount.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x130c08);
scene.fog = new THREE.FogExp2(0x130c08, 0.026);

const camera = new THREE.PerspectiveCamera(39, window.innerWidth / window.innerHeight, 0.1, 80);
const cameraBase = new THREE.Vector3(0, 10.9, 14.3);
camera.position.copy(cameraBase);
camera.lookAt(0, -0.2, 0);

const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2(0, 0);
const interactive = [];
let hovered = null;
let selected = null;
let dragStart = null;
let orbitYaw = 0;
let orbitPitch = 0;

function canvasTexture(width, height, painter) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  painter(context, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return texture;
}

function noiseTexture(base, grain, streaks) {
  return canvasTexture(512, 512, (ctx, width, height) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, width, height);
    for (let i = 0; i < grain; i += 1) {
      const alpha = Math.random() * 0.08;
      ctx.fillStyle = `rgba(255,225,180,${alpha})`;
      ctx.fillRect(Math.random() * width, Math.random() * height, Math.random() * 3 + 1, Math.random() * 2 + 0.5);
    }
    for (let i = 0; i < streaks; i += 1) {
      ctx.strokeStyle = `rgba(${Math.random() > .5 ? '255,212,150' : '35,15,8'},${Math.random() * .12 + .025})`;
      ctx.lineWidth = Math.random() * 4 + 1;
      ctx.beginPath();
      const y = Math.random() * height;
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(width * .25, y + Math.random() * 35 - 18, width * .75, y + Math.random() * 30 - 15, width, y + Math.random() * 24 - 12);
      ctx.stroke();
    }
  });
}

const woodTexture = noiseTexture('#56301d', 9500, 54);
woodTexture.wrapS = woodTexture.wrapT = THREE.RepeatWrapping;
woodTexture.repeat.set(2.6, 1.8);
const feltTexture = noiseTexture('#0c4538', 18000, 0);
feltTexture.wrapS = feltTexture.wrapT = THREE.RepeatWrapping;
feltTexture.repeat.set(3, 2);

const wood = new THREE.MeshStandardMaterial({ map: woodTexture, color: 0x6d3d25, roughness: .58, metalness: .02 });
const darkWood = new THREE.MeshStandardMaterial({ map: woodTexture, color: 0x31190f, roughness: .64, metalness: .01 });
const brass = new THREE.MeshStandardMaterial({ color: 0xb98a47, roughness: .26, metalness: .72 });
const felt = new THREE.MeshStandardMaterial({ map: feltTexture, color: 0x0d5a49, roughness: .88, metalness: 0 });
const parchment = new THREE.MeshStandardMaterial({ color: 0xd8c7a3, roughness: .77 });

function box(width, height, depth, material, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

// The physical table and inset board are real geometry, including raised brass and timber rails.
box(24, .7, 16.5, darkWood, 0, -1.02, 0);
box(21.5, .32, 14.4, wood, 0, -.62, 0);
box(17.9, .12, 11.5, felt, -.75, -.39, 0);
box(18.45, .45, .34, wood, -.75, -.23, -5.95);
box(18.45, .45, .34, wood, -.75, -.23, 5.95);
box(.34, .45, 12.2, wood, -9.81, -.23, 0);
box(.34, .45, 12.2, wood, 8.31, -.23, 0);
box(.08, .49, 11.8, brass, -9.58, -.2, 0);
box(.08, .49, 11.8, brass, 8.08, -.2, 0);
box(3.42, .28, 10.25, darkWood, 6.55, -.24, 0);
box(.07, .34, 10.1, brass, 4.88, -.06, 0);
box(.07, .34, 10.1, brass, 8.22, -.06, 0);
box(3.4, .34, .07, brass, 6.55, -.06, -5.03);
box(3.4, .34, .07, brass, 6.55, -.06, 5.03);

// Surrounding room props keep the board embedded in a believable tabletop environment.
box(31, .45, 25, new THREE.MeshStandardMaterial({ color: 0x2d170e, roughness: .72 }), 0, -1.55, 0);
for (let i = 0; i < 3; i += 1) box(2.9 - i * .08, .42, 3.8, new THREE.MeshStandardMaterial({ color: [0x45291d,0x1d3a31,0x6d4b2c][i], roughness: .8 }), -11.2, -.85 + i * .43, 3.4 - i * .08);

const lampBase = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.28, .22, 48), brass);
lampBase.position.set(-11, -.68, -4.3); lampBase.castShadow = true; scene.add(lampBase);
const lampStem = new THREE.Mesh(new THREE.CylinderGeometry(.11, .16, 4.8, 24), brass);
lampStem.position.set(-11, 1.65, -4.3); lampStem.castShadow = true; scene.add(lampStem);
const shade = new THREE.Mesh(new THREE.ConeGeometry(1.45, 1.5, 48, 1, true), new THREE.MeshStandardMaterial({ color: 0xe6cfa7, roughness: .88, side: THREE.DoubleSide }));
shade.position.set(-11, 4.05, -4.3); shade.rotation.z = .08; shade.castShadow = true; scene.add(shade);

const hemi = new THREE.HemisphereLight(0xd8d1c1, 0x251008, 1.2); scene.add(hemi);
const key = new THREE.SpotLight(0xffd59b, 215, 38, Math.PI / 4.2, .48, 1.25);
key.position.set(-8.5, 12, 7); key.target.position.set(-1, 0, 0); key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -.00015; scene.add(key, key.target);
const fill = new THREE.SpotLight(0x8cb6c6, 62, 30, Math.PI / 3.5, .65, 1.5);
fill.position.set(9, 8, -6); fill.target.position.set(1, 0, 0); scene.add(fill, fill.target);
const lampGlow = new THREE.PointLight(0xffb960, 74, 15, 1.7); lampGlow.position.set(-10.8, 3.55, -3.8); lampGlow.castShadow = true; scene.add(lampGlow);

const COLORS = {
  white: { hex: 0xf3eee3, label: '钻石', image: 'gem-white.png' },
  blue: { hex: 0x0878d2, label: '蓝宝石', image: 'gem-blue.png' },
  green: { hex: 0x079363, label: '祖母绿', image: 'gem-green.png' },
  red: { hex: 0xd32636, label: '红宝石', image: 'gem-red.png' },
  black: { hex: 0x161a22, label: '玛瑙', image: 'gem-black.png' },
  gold: { hex: 0xd6a62f, label: '黄金', image: 'stack-gold.png' }
};

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function gemGeometry(color, size = .28) {
  let geometry;
  if (color === 'white') geometry = new THREE.OctahedronGeometry(size, 1);
  else if (color === 'blue') geometry = new THREE.DodecahedronGeometry(size, 1);
  else if (color === 'green') geometry = new THREE.BoxGeometry(size * 1.5, size * .62, size * 1.08, 2, 1, 2);
  else if (color === 'red') geometry = new THREE.OctahedronGeometry(size, 2);
  else geometry = new THREE.DodecahedronGeometry(size, 0);
  return geometry;
}

function gemMaterial(color, transparent = true) {
  const value = COLORS[color].hex;
  return new THREE.MeshPhysicalMaterial({
    color: value,
    emissive: color === 'black' ? 0x030305 : new THREE.Color(value).multiplyScalar(.035),
    roughness: color === 'gold' ? .22 : .08,
    metalness: color === 'gold' ? .76 : .08,
    transmission: transparent && color !== 'black' && color !== 'gold' ? .26 : 0,
    thickness: .7,
    ior: 1.72,
    clearcoat: 1,
    clearcoatRoughness: .08
  });
}

function makeGem(color, size) {
  const group = new THREE.Group();
  const gem = new THREE.Mesh(gemGeometry(color, size), gemMaterial(color));
  gem.castShadow = true;
  gem.receiveShadow = true;
  gem.rotation.y = .35;
  if (color === 'green') gem.rotation.y = Math.PI / 4;
  group.add(gem);
  const glint = new THREE.Mesh(new THREE.SphereGeometry(size * .08, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  glint.position.set(-size * .28, size * .25, size * .35);
  group.add(glint);
  return group;
}

function makeChipStack(color, x, z, count) {
  const group = new THREE.Group();
  group.position.set(x, -.04, z);
  group.userData = { kind: 'bank', color, label: `${COLORS[color].label} · ${count} 枚`, baseY: -.04, hoverY: .18 };
  const chipMaterial = gemMaterial(color, color !== 'gold');
  const edgeMaterial = color === 'gold' ? brass : new THREE.MeshPhysicalMaterial({ color: COLORS[color].hex, roughness: .17, metalness: .22, clearcoat: .9, transmission: color === 'black' ? 0 : .12 });
  for (let i = 0; i < 4; i += 1) {
    const chip = new THREE.Mesh(new THREE.CylinderGeometry(.55, .55, .14, 48, 1, false), i === 3 ? chipMaterial : edgeMaterial);
    chip.position.y = .11 + i * .13;
    chip.rotation.y = i * .16;
    chip.castShadow = true;
    chip.receiveShadow = true;
    chip.userData.interactiveRoot = group;
    group.add(chip); interactive.push(chip);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(.44, .035, 10, 48), brass);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = .185 + i * .13;
    rim.userData.interactiveRoot = group;
    group.add(rim); interactive.push(rim);
  }
  const crown = makeGem(color, .28);
  crown.position.y = .72;
  crown.scale.y = .62;
  crown.traverse(child => { if (child.isMesh) { child.userData.interactiveRoot = group; interactive.push(child); } });
  group.add(crown);
  scene.add(group);
  const label = makeLabel(`${COLORS[color].label}   ${count}`, 390, 82, color);
  label.position.set(x + 1.22, .38, z);
  scene.add(label);
  return group;
}

function makeLabel(text, width, height, color = 'gold') {
  const texture = canvasTexture(width, height, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    const gradient = ctx.createLinearGradient(0, 0, w, 0);
    gradient.addColorStop(0, 'rgba(30,20,15,.92)'); gradient.addColorStop(1, 'rgba(15,12,10,.78)');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = color === 'gold' ? '#9f7442' : `#${COLORS[color].hex.toString(16).padStart(6,'0')}`;
    ctx.lineWidth = 3; ctx.strokeRect(2, 2, w - 4, h - 4);
    ctx.fillStyle = '#eadcc4'; ctx.font = '600 27px serif'; ctx.textBaseline = 'middle'; ctx.fillText(text, 24, h / 2 + 1);
  });
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(width / 180, height / 180, 1);
  return sprite;
}

function makeCardTexture(atlas, gemImage, color, points, seed) {
  return canvasTexture(512, 680, (ctx, width, height) => {
    ctx.fillStyle = '#eee2c9'; ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#ded0af'; ctx.fillRect(0, 0, width, 150);
    ctx.strokeStyle = '#a78b61'; ctx.lineWidth = 10; ctx.strokeRect(5, 5, width - 10, height - 10);
    ctx.fillStyle = '#241b15'; ctx.font = '700 67px Georgia'; ctx.fillText(points || '', 30, 88);
    const tileWidth = atlas.width / 5;
    const sourceX = ['white','blue','green','red','black'].indexOf(color) * tileWidth;
    ctx.drawImage(atlas, sourceX, 0, tileWidth, atlas.height, 18, 150, width - 36, 430);
    const shade = ctx.createLinearGradient(0, 420, 0, 620); shade.addColorStop(0, 'rgba(20,12,8,0)'); shade.addColorStop(1, 'rgba(24,14,9,.5)');
    ctx.fillStyle = shade; ctx.fillRect(18, 150, width - 36, 430);
    ctx.drawImage(gemImage, width - 118, 18, 88, 88);
    const costs = [
      [color === 'red' ? 'blue' : 'red', 2 + seed % 4],
      [color === 'green' ? 'black' : 'green', 1 + (seed * 2) % 5],
      [color === 'white' ? 'blue' : 'white', 1 + (seed * 3) % 4]
    ];
    costs.forEach((cost, index) => {
      const y = 608 - index * 53;
      ctx.beginPath(); ctx.arc(52, y, 22, 0, Math.PI * 2); ctx.fillStyle = `#${COLORS[cost[0]].hex.toString(16).padStart(6,'0')}`; ctx.fill();
      ctx.lineWidth = 4; ctx.strokeStyle = '#f3e8d4'; ctx.stroke();
      ctx.fillStyle = cost[0] === 'white' ? '#211a15' : '#fff'; ctx.font = '700 23px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(String(cost[1]), 52, y + 8); ctx.textAlign = 'left';
    });
  });
}

function makeCard(atlas, gemImages, tier, column, color, points, seed) {
  const texture = makeCardTexture(atlas, gemImages[color], color, points, seed);
  const face = new THREE.MeshStandardMaterial({ map: texture, roughness: .58, metalness: .01 });
  const edge = new THREE.MeshStandardMaterial({ color: 0xb8a586, roughness: .75 });
  const bottom = new THREE.MeshStandardMaterial({ color: 0x3a2419, roughness: .82 });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2.05, .12, 2.72), [edge, edge, face, bottom, edge, edge]);
  const xs = [-4.15, -1.65, .85, 3.35];
  const zs = [-2.68, .22, 3.12];
  mesh.position.set(xs[column], -.22, zs[tier]);
  mesh.rotation.y = (column - 1.5) * .008;
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.userData = { kind: 'card', label: `${points ? points + ' 分 · ' : ''}${COLORS[color].label}发展卡`, baseY: -.22, hoverY: .18, targetTilt: 0 };
  interactive.push(mesh); scene.add(mesh);
  const gem = makeGem(color, .19);
  gem.position.set(.72, .16, -.93);
  gem.scale.y = .55;
  mesh.add(gem);
  return mesh;
}

function makeDeck(tier, color) {
  const group = new THREE.Group();
  const zs = [-2.68, .22, 3.12];
  for (let i = 0; i < 8; i += 1) {
    const layer = new THREE.Mesh(new THREE.BoxGeometry(1.75, .05, 2.45), new THREE.MeshStandardMaterial({ color, roughness: .58, metalness: .03 }));
    layer.position.set(-7.32 + (i % 2) * .012, -.32 + i * .035, zs[tier]);
    layer.rotation.y = (i - 3.5) * .003;
    layer.castShadow = true; group.add(layer);
  }
  const numeral = makeLabel(['III · 余 16','II · 余 24','I · 余 36'][tier], 260, 100, 'gold');
  numeral.position.set(-7.32, .24, zs[tier]); numeral.scale.set(1.35,.52,1); group.add(numeral);
  scene.add(group);
}

function makeNoble(atlas, index, x) {
  const texture = canvasTexture(560, 220, (ctx,w,h) => {
    ctx.fillStyle = '#d9c49d'; ctx.fillRect(0,0,w,h);
    ctx.drawImage(atlas, index * atlas.width / 5, 0, atlas.width / 5, atlas.height, 0, 0, w, h);
    ctx.fillStyle = 'rgba(25,14,9,.28)'; ctx.fillRect(0,0,w,h);
    ctx.strokeStyle = '#b89257'; ctx.lineWidth = 10; ctx.strokeRect(5,5,w-10,h-10);
    ctx.fillStyle = '#f1d78e'; ctx.font = '700 72px Georgia'; ctx.fillText('3', 32, 88);
  });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2.8,.1,1.12), [parchment,parchment,new THREE.MeshStandardMaterial({map:texture,roughness:.64}),parchment,parchment,parchment]);
  mesh.position.set(x,-.23,-4.7); mesh.castShadow=true; mesh.receiveShadow=true; scene.add(mesh);
}

async function buildGame() {
  const names = ['white','blue','green','red','black'];
  const [atlas, ...loaded] = await Promise.all([
    loadImage('assets/table-club/splendor-card-atlas.jpg'),
    ...names.map(name => loadImage(`assets/table-club/gems/${COLORS[name].image}`))
  ]);
  const gemImages = Object.fromEntries(names.map((name,index) => [name,loaded[index]]));
  makeDeck(0,0x173c58); makeDeck(1,0x8a672f); makeDeck(2,0x245441);
  const sequence = ['green','white','black','blue','white','red','green','black','blue','red','green','black'];
  const points = [4,3,3,4,2,1,2,2,1,1,0,1];
  sequence.forEach((color,index) => makeCard(atlas,gemImages,Math.floor(index/4),index%4,color,points[index],index+2));
  [-4.5,-1.45,1.6,4.65].forEach((x,index)=>makeNoble(atlas,index,x));
  const bankColors=['white','blue','green','red','black','gold'];
  bankColors.forEach((color,index)=>makeChipStack(color,6.72,-3.7+index*1.46,color==='gold'?5:7));
  loading.classList.add('hidden');
}

function resolveRoot(object) { return object?.userData?.interactiveRoot || object; }
function updateHover() {
  raycaster.setFromCamera(pointer,camera);
  const hit=raycaster.intersectObjects(interactive,false)[0];
  const next=resolveRoot(hit?.object || null);
  if(next!==hovered){
    hovered=next;
    if(!selected) selectionCopy.textContent=hovered?.userData?.label || '悬停卡牌或宝石查看实体反馈';
    renderer.domElement.style.cursor=hovered?'pointer':'grab';
  }
}

function animate() {
  requestAnimationFrame(animate);
  const elapsed=clock.getElapsedTime();
  interactive.forEach(object=>{
    if(object.userData.interactiveRoot)return;
    const active=object===hovered||object===selected;
    const targetY=active?object.userData.hoverY:object.userData.baseY;
    object.position.y=THREE.MathUtils.lerp(object.position.y,targetY,.1);
    if(object.userData.kind==='card'){
      object.rotation.x=THREE.MathUtils.lerp(object.rotation.x,active?-.035:0,.1);
      object.rotation.z=THREE.MathUtils.lerp(object.rotation.z,active?(object.position.x>0?-.022:.022):0,.1);
    }
    if(object.userData.kind==='bank'&&active)object.rotation.y=Math.sin(elapsed*1.5)*.06;
    else if(object.userData.kind==='bank')object.rotation.y=THREE.MathUtils.lerp(object.rotation.y,0,.08);
  });
  const desiredX=Math.sin(orbitYaw)*14.3+pointer.x*.22;
  const desiredZ=Math.cos(orbitYaw)*14.3+pointer.y*.2;
  camera.position.x=THREE.MathUtils.lerp(camera.position.x,desiredX,.035);
  camera.position.z=THREE.MathUtils.lerp(camera.position.z,desiredZ,.035);
  camera.position.y=THREE.MathUtils.lerp(camera.position.y,10.9+orbitPitch,.035);
  camera.lookAt(0,-.2,0);
  updateHover();
  renderer.render(scene,camera);
}

renderer.domElement.addEventListener('pointermove',event=>{
  pointer.x=event.clientX/window.innerWidth*2-1;
  pointer.y=-(event.clientY/window.innerHeight*2-1);
  if(dragStart){
    orbitYaw=THREE.MathUtils.clamp(dragStart.yaw-(event.clientX-dragStart.x)*.0018,-.22,.22);
    orbitPitch=THREE.MathUtils.clamp(dragStart.pitch+(event.clientY-dragStart.y)*.012,-.8,1.1);
    mount.classList.add('is-dragging');
  }
});
renderer.domElement.addEventListener('pointerdown',event=>{dragStart={x:event.clientX,y:event.clientY,yaw:orbitYaw,pitch:orbitPitch};});
window.addEventListener('pointerup',event=>{
  if(dragStart&&Math.abs(event.clientX-dragStart.x)<5&&Math.abs(event.clientY-dragStart.y)<5&&hovered){
    selected=selected===hovered?null:hovered;
    selectionCopy.textContent=selected?`已选择：${selected.userData.label}`:'悬停卡牌或宝石查看实体反馈';
  }
  dragStart=null; mount.classList.remove('is-dragging');
});
document.getElementById('reset-camera').addEventListener('click',()=>{orbitYaw=0;orbitPitch=0;pointer.set(0,0);selected=null;selectionCopy.textContent='视角已重置';});
document.getElementById('confirm-demo').addEventListener('click',()=>{selectionCopy.textContent=selected?`Demo 反馈：${selected.userData.label} 已响应`:'请先选择一张卡牌或一组宝石';});
window.addEventListener('resize',()=>{camera.aspect=window.innerWidth/window.innerHeight;camera.updateProjectionMatrix();renderer.setSize(window.innerWidth,window.innerHeight);});

buildGame().catch(error=>{console.error(error);loading.querySelector('p').textContent='3D 场景加载失败，请刷新重试';});
animate();

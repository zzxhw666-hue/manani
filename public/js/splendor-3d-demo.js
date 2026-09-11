import * as THREE from '../vendor/three.module.js';
import { seats, gemNames, perspective } from './splendor-demo-state.js';

const mount = document.getElementById('scene');
const status = document.getElementById('selection-copy');
const loading = document.getElementById('loading');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = .92;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
mount.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#1c1713');
scene.fog = new THREE.Fog('#1c1713', 37, 65);
const camera = new THREE.PerspectiveCamera(39, 1, .1, 90);
const target = new THREE.Vector3(-.7, 0, 1.35);
const ray = new THREE.Raycaster();
const pointer = new THREE.Vector2(9, 9);
const objects = [];
const selfGroup = new THREE.Group();
scene.add(selfGroup);
const requestedSeat = new URLSearchParams(location.search).get('seat');
let current = perspective(seats.some(p=>p.id===requestedSeat) ? requestedSeat : 'lin');
let hovered = null, selected = null, drag = null, yaw = 0, pitch = 0, flight = null;
let atlas, assets = {}, reservedObjects = [];
const color = {white:'#f1f4fb',blue:'#075ee5',green:'#009d63',red:'#c91031',black:'#141721',gold:'#d7a13d'};
const label = {white:'钻石',blue:'蓝宝石',green:'祖母绿',red:'红宝石',black:'玛瑙',gold:'黄金'};
const textureCache = new Map();
let rng = 811;
function random() { rng = (rng * 1664525 + 1013904223) >>> 0; return rng / 4294967296; }

function texture(w, h, draw, srgb = true) {
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
  draw(canvas.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return t;
}
function material(c, roughness=.5, metalness=0) {
  return new THREE.MeshStandardMaterial({color:c,roughness,metalness});
}
// Softboxes in a high-dynamic-range cubemap: their reflections change across each physical facet.
const studio = new THREE.Scene();
studio.background = new THREE.Color(.12,.14,.13);
const enclosure = new THREE.Mesh(new THREE.BoxGeometry(30,25,30), new THREE.MeshBasicMaterial({color:0x35312b,side:THREE.BackSide}));
studio.add(enclosure);
for (const [position,size,power,tint] of [
  [[-5,8,5],[5,3],10,[1,.88,.68]], [[7,4,2],[2,7],7,[.75,.86,1]],
  [[-3,5,-7],[4,3],8,[1,1,1]], [[1,11,0],[3,3],5,[1,.95,.85]]
]) {
  const m = new THREE.MeshBasicMaterial({color:new THREE.Color(...tint).multiplyScalar(power),side:THREE.DoubleSide});
  const softbox = new THREE.Mesh(new THREE.PlaneGeometry(...size),m);
  softbox.position.set(...position);softbox.lookAt(0,0,0);studio.add(softbox);
}
const pmrem = new THREE.PMREMGenerator(renderer);
const environment = pmrem.fromScene(studio,.03,.1,50);
scene.environment = environment.texture;
scene.environmentIntensity = .45;
pmrem.dispose();
studio.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});

const woodMap = await new THREE.TextureLoader().loadAsync('assets/table-club/walnut-albedo-v2.png');
woodMap.colorSpace=THREE.SRGBColorSpace;woodMap.anisotropy=8;
woodMap.wrapS=woodMap.wrapT=THREE.RepeatWrapping;
const feltMap = texture(512,512,(ctx,w,h)=>{
  ctx.fillStyle='#12392c';ctx.fillRect(0,0,w,h);
  for(let i=0;i<80000;i++){ctx.fillStyle=random()>.5?'#afc0a914':'#00090016';const x=random()*w,y=random()*h;ctx.fillRect(x,y,.8,1.6);}
});
feltMap.wrapS=feltMap.wrapT=THREE.RepeatWrapping;feltMap.repeat.set(8,8);
const walnut = new THREE.MeshPhysicalMaterial({map:woodMap,roughness:.58,clearcoat:.22,clearcoatRoughness:.45,bumpMap:woodMap,bumpScale:.016});
const darkWood = new THREE.MeshPhysicalMaterial({map:woodMap,color:'#9a7055',roughness:.4,clearcoat:.34});
const felt = new THREE.MeshPhysicalMaterial({map:feltMap,bumpMap:feltMap,bumpScale:.019,roughness:.96,sheen:.6,sheenColor:new THREE.Color('#508973'),sheenRoughness:.92});
const leather = new THREE.MeshStandardMaterial({color:'#0c0b0a',roughness:.85,bumpMap:feltMap,bumpScale:.009});
const brass = material('#c09657',.27,.8);
const paper = material('#d9cdb6',.81);
const textMaterials = new Map();

function roundedShape(w,d,r) {
  const s=new THREE.Shape(),x=-w/2,y=-d/2;
  s.moveTo(x+r,y);s.lineTo(x+w-r,y);s.quadraticCurveTo(x+w,y,x+w,y+r);
  s.lineTo(x+w,y+d-r);s.quadraticCurveTo(x+w,y+d,x+w-r,y+d);
  s.lineTo(x+r,y+d);s.quadraticCurveTo(x,y+d,x,y+d-r);
  s.lineTo(x,y+r);s.quadraticCurveTo(x,y,x+r,y);return s;
}
function slab(w,d,h,mat,x=0,y=0,z=0,parent=scene,r=.08) {
  const bevel=Math.min(h*.22,.035);
  const geometry=new THREE.ExtrudeGeometry(roundedShape(w,d,r),{depth:h,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:bevel,bevelThickness:bevel,curveSegments:6});
  geometry.rotateX(-Math.PI/2);
  const positions=geometry.getAttribute('position'),uv=geometry.getAttribute('uv');
  for(let i=0;i<uv.count;i++)uv.setXY(i,(positions.getX(i)+w/2)/w,(positions.getZ(i)+d/2)/d);
  const mesh=new THREE.Mesh(geometry,mat);mesh.position.set(x,y,z);
  mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
}
function face(w,d,map,x,y,z,parent=scene,r=.06) {
  const g=new THREE.ShapeGeometry(roundedShape(w,d,r),6);
  const pos=g.getAttribute('position'),uv=g.getAttribute('uv');
  for(let i=0;i<pos.count;i++)uv.setXY(i,(pos.getX(i)+w/2)/w,(pos.getY(i)+d/2)/d);
  g.rotateX(-Math.PI/2);
  const mesh=new THREE.Mesh(g,new THREE.MeshStandardMaterial({map,roughness:.78,polygonOffset:true,polygonOffsetFactor:-1}));
  mesh.position.set(x,y,z);mesh.receiveShadow=true;parent.add(mesh);return mesh;
}
function writing(text,w,d,x,y,z,parent=scene,ink='#eadcc2',size=38) {
  const key=[text,w,d,ink,size].join('|');
  let mat=textMaterials.get(key);
  if(!mat){
    const t=texture(Math.ceil(w*256),Math.ceil(d*256),(ctx,tw,th)=>{
      let fontSize=th*.78;
      ctx.font='500 '+fontSize+'px "Songti SC",serif';
      fontSize*=Math.min(1,(tw-12)/ctx.measureText(text).width);
      ctx.fillStyle=ink;ctx.font='500 '+fontSize+'px "Songti SC",serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,tw/2,th/2);
    });
    mat=new THREE.MeshBasicMaterial({map:t,transparent:true,depthWrite:false,toneMapped:false});
    textMaterials.set(key,mat);
  }
  const m=new THREE.Mesh(new THREE.PlaneGeometry(w,d),mat);m.rotation.x=-Math.PI/2;m.position.set(x,y,z);parent.add(m);return m;
}
function tray(w,d,x,z,parent=scene,y=-.12,inside=leather) {
  slab(w,d,.17,walnut,x,y,z,parent,.14);
  slab(w-.2,d-.2,.045,brass,x,y+.17,z,parent,.12);
  slab(w-.25,d-.25,.035,inside,x,y+.21,z,parent,.1);
}
slab(26,21,.75,darkWood,0,-1.0,0,scene,.4);
slab(24,19,.24,walnut,0,-.3,0,scene,.32);
tray(13.7,10.2,-2.2,-.45,scene,-.04,felt);
tray(3.25,10.2,6.5,-.45);
for(const [w,x] of [[13.7,-2.2],[3.25,6.5]]){
  for(const z of [-5.49,4.59])slab(w,.18,.17,walnut,x,.16,z,scene,.05);
  for(const edge of [x-w/2+.08,x+w/2-.08])slab(.16,10.0,.17,walnut,edge,.16,-.45,scene,.045);
}
for(let i=0;i<7;i++)slab(2.95,.065,.16,walnut,6.5,.12,-4.86+i*1.56);
tray(18.3,2.25,-.25,6.15,scene,-.04);
writing('宝 石 银 行',2.4,.4,6.5,.35,-5.23);
writing('S P L E N D O R',4,.35,-2.2,.24,-5.24,scene,'#a68e57',27);

// Model a pavilion, girdle, crown and table. Every facet has its own normal.
function cutGeometry(kind,radius) {
  const n=kind==='green'||kind==='red'||kind==='black'?8:16;
  const outline=[];
  for(let i=0;i<n;i++){
    const a=i/n*Math.PI*2;
    let x=Math.cos(a),z=Math.sin(a);
    if(n===8){const oct=[[1,.55],[.55,1],[-.55,1],[-1,.55],[-1,-.55],[-.55,-1],[.55,-1],[1,-.55]][i];[x,z]=oct;}
    outline.push([x*(kind==='blue'?1.13:kind==='green'?1.12:1),z*(kind==='green'?.78:1)]);
  }
  const rings=[[.02,-.37],[.96,-.025],[1,.025],[.62,.31]];
  const verts=rings.map(([scale,y])=>outline.map(([x,z])=>[x*scale*radius,y*radius,z*scale*radius]));
  const positions=[];
  function tri(a,b,c){
    const ab=b.map((v,i)=>v-a[i]),ac=c.map((v,i)=>v-a[i]);
    const normal=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]];
    const centroid=a.map((v,i)=>(v+b[i]+c[i])/3);
    if(normal.reduce((sum,v,i)=>sum+v*centroid[i],0)<0)[b,c]=[c,b];
    positions.push(...a,...b,...c);
  }
  for(let r=0;r<rings.length-1;r++)for(let i=0;i<n;i++){
    const j=(i+1)%n;tri(verts[r][i],verts[r+1][i],verts[r+1][j]);tri(verts[r][i],verts[r+1][j],verts[r][j]);
  }
  for(let i=0;i<n;i++){tri([0,.31*radius,0],verts[3][i],verts[3][(i+1)%n]);tri([0,-.37*radius,0],verts[0][(i+1)%n],verts[0][i]);}
  const uv=[];for(let i=0;i<positions.length;i+=3)uv.push(.5+positions[i]/radius*.32,.5-positions[i+2]/radius*.30);
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.computeVertexNormals();return g;
}
const gemMats={},chipMats={},rimMats={};
for(const name of gemNames){
  gemMats[name]=new THREE.MeshPhysicalMaterial({
    color:color[name],roughness:.13,metalness:name==='gold'?.85:.12,
    transmission:name==='gold'?0:.08,thickness:.12,
    ior:1.9,dispersion:.08,clearcoat:.8,clearcoatRoughness:.06,
    attenuationColor:new THREE.Color(color[name]),attenuationDistance:3,
    envMapIntensity:1.2
  });
  chipMats[name]=new THREE.MeshPhysicalMaterial({color:color[name],roughness:.18,metalness:name==='gold'?.8:.25,clearcoat:1,envMapIntensity:1.1});
  rimMats[name]=material(new THREE.Color(color[name]).lerp(new THREE.Color('white'),.3),.2,name==='gold'?.82:.55);
}
const chipProfile=[[0,0],[.455,0],[.493,.018],[.5,.038],[.5,.075],[.475,.099],[.44,.11],[0,.11]].map(([x,y])=>new THREE.Vector2(x,y));
const chipGeometry=new THREE.LatheGeometry(chipProfile,64);
const ringGeometry=new THREE.TorusGeometry(.448,.012,6,64);
const sharedMaterials=new Set([walnut,darkWood,felt,leather,brass,paper,...Object.values(gemMats),...Object.values(chipMats),...Object.values(rimMats)]);
function disposeTransient(group){
  const retained=new Set([...sharedMaterials,...textMaterials.values()]);
  group.traverse(o=>{
    if(o.geometry&&o.geometry!==chipGeometry&&o.geometry!==ringGeometry)o.geometry.dispose();
    if(o.material&&!retained.has(o.material))o.material.dispose();
  });
  group.removeFromParent();
}
function gem(name,size,parent,x=0,y=0,z=0){
  const m=new THREE.Mesh(cutGeometry(name,size),gemMats[name]);m.position.set(x,y,z);m.rotation.y=.19;m.castShadow=true;parent.add(m);
  return m;
}
function coin(parent,y){
  const s=new THREE.Shape();
  for(let i=0;i<10;i++){const a=i*Math.PI/5+Math.PI/2,r=i%2?.13:.29;const x=Math.cos(a)*r,z=Math.sin(a)*r;if(i===0)s.moveTo(x,z);else s.lineTo(x,z);}
  s.closePath();
  const g=new THREE.ExtrudeGeometry(s,{depth:.018,bevelEnabled:true,bevelSize:.008,bevelThickness:.006,bevelSegments:1});
  g.rotateX(-Math.PI/2);const m=new THREE.Mesh(g,brass);m.position.y=y;parent.add(m);
}
function stack(name,count,x,y,z,parent=scene,scale=1){
  const group=new THREE.Group();group.position.set(x,y,z);group.scale.setScalar(scale);parent.add(group);
  for(let i=0;i<count;i++){
    const m=new THREE.Mesh(chipGeometry,chipMats[name]);m.position.set(Math.sin(i*7)*.012,i*.134,0);m.castShadow=true;m.receiveShadow=true;group.add(m);
    for(const dy of [.025,.093]){const rim=new THREE.Mesh(ringGeometry,rimMats[name]);rim.rotation.x=Math.PI/2;rim.position.y=i*.134+dy;group.add(rim);}
  }
  if(count){if(name==='gold')coin(group,(count-1)*.134+.12);else gem(name,.405,group,0,(count-1)*.134+.12,0);}
  return group;
}
const bank=[];
for(let i=0;i<6;i++){
  const name=gemNames[i],z=-4.10+i*1.56;
  const g=stack(name,5,5.72,.145,z,scene,.9);
  g.userData={kind:'bank',name,label:label[name],baseY:.145};
  objects.push(g);bank.push(g);
  writing(label[name],1.12,.42,6.85,.255,z+.08);
  writing(name==='gold'?'5':'7',.45,.55,7.51,.255,z,scene,'#f5e8ce',60);
}

// Rounded, printed paper cards; only the narrow paper edge has volume.
function cardTexture(name,points,seed,back=false){
  const key=[name,points,seed,back].join('|');
  if(textureCache.has(key))return textureCache.get(key);
  const t=texture(512,660,(ctx,w,h)=>{
    ctx.fillStyle=back?['#174367','#846133','#235645'][seed%3]:'#eae2cd';ctx.fillRect(0,0,w,h);
    const tile=gemNames.indexOf(name)%5,sw=atlas.width/5;
    ctx.save();ctx.globalAlpha=back?.22:1;
    ctx.drawImage(atlas,sw*tile,0,sw,atlas.height,8,back?8:83,w-16,back?h-16:h-91);
    ctx.restore();
    ctx.strokeStyle=back?'#c9ab68':'#bda77c';ctx.lineWidth=3;ctx.strokeRect(10,10,w-20,h-20);
    if(back){
      ctx.strokeRect(24,24,w-48,h-48);ctx.textAlign='center';ctx.fillStyle='#ead3a0';ctx.font='85px Georgia';ctx.fillText(['III','II','I'][seed%3],w/2,355);
      ctx.font='17px Georgia';ctx.fillText('S P L E N D O R',w/2,405);return;
    }
    ctx.fillStyle='#251e18';ctx.font='bold 58px Georgia';ctx.fillText(points||'',24,61);
    const gemImage=assets[name];if(gemImage)ctx.drawImage(gemImage,403,0,94,80);
    for(let i=0;i<3;i++){
      const c=gemNames[(seed+i*2)%5],py=h-48-i*53;
      ctx.beginPath();ctx.arc(43,py,24,0,Math.PI*2);ctx.fillStyle=color[c];ctx.fill();ctx.strokeStyle='#f8f0dc';ctx.lineWidth=3;ctx.stroke();
      ctx.fillStyle=c==='white'?'#302923':'#fff';ctx.font='26px Georgia';ctx.textAlign='center';ctx.fillText((seed+i)%4+1,43,py+9);
    }
  });textureCache.set(key,t);return t;
}
function card(name,points,seed,x,z,parent=scene,scale=1){
  const group=new THREE.Group();group.position.set(x,.248,z);group.scale.setScalar(scale);parent.add(group);
  slab(1.96,2.52,.016,paper,0,0,0,group,.075);
  face(1.94,2.5,cardTexture(name,points,seed),0,.021,0,group,.065);
  group.userData={kind:'card',label:(points?points+' 声望 · ':'')+label[name]+'发展卡',baseY:.248};
  return group;
}
function deck(tier,z){
  const group=new THREE.Group();group.position.set(-7.18,.245,z);scene.add(group);
  for(let i=0;i<15;i++)slab(1.87,2.44,.012,paper,Math.sin(i)*.009,i*.021,0,group,.07);
  face(1.86,2.43,cardTexture(gemNames[tier+1],0,tier,true),0,.322,0,group);
}
function disposeSelf(){
  for(const child of [...selfGroup.children])disposeTransient(child);
  selfGroup.clear();
  for(const item of reservedObjects){const i=objects.indexOf(item);if(i>=0)objects.splice(i,1);}
  reservedObjects=[];
}
function drawSelf(){
  disposeSelf();
  const p=current.self;
  writing(p.name+' · 我的珠宝行',2.5,.47,-7.15,.27,5.79,selfGroup,'#eadcc2',38);
  writing(p.score+'  声望',2.3,.76,-7.15,.27,6.38,selfGroup,'#f5cd70',65);
  slab(.022,1.43,.01,brass,-5.65,.267,6.17,selfGroup,.007);
  for(let i=0;i<6;i++){
    const x=-4.82+i*.93,n=p.tokens[i],name=gemNames[i];
    stack(name,Math.min(n,5),x,.225,6.06,selfGroup,.77);
    if(!n){const ring=new THREE.Mesh(ringGeometry,rimMats[name]);ring.rotation.x=-Math.PI/2;ring.scale.setScalar(.7);ring.position.set(x,.28,6.06);selfGroup.add(ring);}
    writing(String(n),.48,.36,x,.29,6.83,selfGroup,'#f5e8d4',56);
  }
  slab(.022,1.43,.01,brass,.57,.267,6.17,selfGroup,.007);
  writing('永久折扣',2.5,.34,2.12,.29,5.63,selfGroup,'#cdbb97',32);
  for(let i=0;i<5;i++){const x=1.02+i*.53;gem(gemNames[i],.18,selfGroup,x,.36,6.12);writing(String(p.bonuses[i]),.38,.33,x,.28,6.7,selfGroup,'#e7d6b5',47);}
  slab(.022,1.43,.01,brass,3.71,.267,6.17,selfGroup,.007);
  writing('预留牌 · '+p.reserved.length,2.2,.35,5.07,.3,5.5,selfGroup,'#dac8a6',31);
  p.reserved.forEach((c,i)=>{
    const m=card(c.color,c.points,c.seed,4.5+i*.64,6.24,selfGroup,.48);
    m.position.y=.31+i*.025;m.rotation.y=(i-.4)*.17;m.userData.baseY=m.position.y;
    objects.push(m);reservedObjects.push(m);
  });
  if(!p.reserved.length)writing('暂无预留',2,.48,5.1,.28,6.25,selfGroup,'#b09d7c',36);
  const section=document.getElementById('self-accessible');
  section.dataset.playerId=p.id;
  section.textContent=p.name+'，我的珠宝行，'+p.score+' 声望；'+gemNames.map((n,i)=>label[n]+p.tokens[i]).join('，')+'；永久折扣 '+p.bonuses.join('，')+'；预留牌 '+p.reserved.length;
}
function renderSeat(id){
  current=perspective(id);hovered=null;selected=null;
  if(flight){disposeTransient(flight.object);flight=null;}
  document.getElementById('opponents').innerHTML=current.opponents.map(p=>'<article data-player-id="'+p.id+'"><span class="portrait">'+p.name.slice(-1)+'</span><div><h2>'+p.name+'</h2><div class="opponent-tokens">'+gemNames.slice(0,5).map((n,i)=>'<span><img src="assets/table-club/gems/gem-'+n+'.png" alt="'+label[n]+'">'+p.tokens[i]+'</span>').join('')+'</div><small>预留 '+p.reservedCount+' 张</small></div><b>'+p.score+'</b></article>').join('');
  document.getElementById('turn-copy').textContent=current.isMyTurn?'轮到你了 · 林小雨':'等待林小雨行动';
  status.textContent='当前主视角：'+current.self.name+' · 可体验模型交互';
  document.getElementById('seat-select').value=id;
  if(atlas)drawSelf();
}
// Turned brass lamp and stacked books, outside the playing field.
function lathe(points,mat,x,y,z){
  const m=new THREE.Mesh(new THREE.LatheGeometry(points.map(p=>new THREE.Vector2(...p)),64),mat);
  m.position.set(x,y,z);m.castShadow=true;scene.add(m);return m;
}
lathe([[0,0],[.75,0],[.83,.08],[.76,.16],[.52,.2],[.26,.34],[.12,.5],[.075,2.9]],brass,-10.4,.03,-4.3);
lathe([[1.15,0],[1.12,.04],[.62,1.55],[.59,1.58]],new THREE.MeshPhysicalMaterial({color:'#d7b987',roughness:.9,side:THREE.DoubleSide,emissive:'#80602e',emissiveIntensity:.24}),-10.4,2.6,-4.3);
for(let i=0;i<3;i++){const b=slab(2.1,3,.27,i%2?leather:darkWood,-10.5,.04+i*.33,3.5,scene,.1);b.rotation.y=.08-i*.08;}
const hemi=new THREE.HemisphereLight('#fff0d5','#241d16',.48);scene.add(hemi);
const key=new THREE.DirectionalLight('#ffead0',1.7);key.position.set(-5,12,6);key.castShadow=true;
key.shadow.mapSize.set(2048,2048);Object.assign(key.shadow.camera,{left:-15,right:15,top:13,bottom:-13,near:.5,far:40});key.shadow.normalBias=.025;key.shadow.bias=-.0001;key.shadow.radius=3;scene.add(key);
const fill=new THREE.DirectionalLight('#d7e6ff',.55);fill.position.set(8,7,-4);scene.add(fill);
const lamp=new THREE.PointLight('#ffd08a',48,12,2);lamp.position.set(-10.4,2.5,-4.3);scene.add(lamp);

async function load(src){return new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('Asset failed: '+src));image.src=src;});}
const images=await Promise.all([load('assets/table-club/splendor-card-atlas.jpg'),...gemNames.slice(0,5).map(n=>load('assets/table-club/gems/gem-'+n+'.png'))]);
atlas=images[0];assets=Object.fromEntries(gemNames.slice(0,5).map((n,i)=>[n,images[i+1]]));
// Existing generated gemstone art supplies optical facet detail, while the crown,
// pavilion, silhouettes, shadows and view-dependent reflection remain 3D meshes.
for(const name of gemNames.slice(0,5)){
  const t=new THREE.Texture(assets[name]);t.colorSpace=THREE.SRGBColorSpace;t.needsUpdate=true;
  gemMats[name].map=t;gemMats[name].color.set('white');gemMats[name].needsUpdate=true;
}
for(let t=0;t<3;t++){
  const z=-2.83+t*2.72;deck(t,z);
  for(let c=0;c<4;c++){const i=t*4+c,name=['white','blue','green','black','green','red','white','blue','white','blue','red','black'][i];const m=card(name,[5,4,4,3,3,3,2,2,1,1,1,0][i],i+2,-4.74+c*2.27,z);objects.push(m);}
}
for(let i=0;i<3;i++){
  const x=-4.3+i*3.05;
  slab(2.78,1.02,.023,paper,x,.245,-4.77,scene,.09);
  const t=texture(660,250,(ctx,w,h)=>{
    ctx.fillStyle='#dccaa8';ctx.fillRect(0,0,w,h);
    ctx.drawImage(atlas,i*atlas.width/5,0,atlas.width/5,atlas.height,0,0,w*.65,h);
    ctx.fillStyle='#3e3023';ctx.font='60px Georgia';ctx.fillText('3',w*.83,100);
    ctx.font='24px "Songti SC",serif';ctx.fillText(['美第奇家族','索福尔家族','贡扎加家族'][i],w*.49,211);
  });face(2.77,1.01,t,x,.274,-4.77);
}
document.getElementById('seat-select').innerHTML=seats.map(p=>'<option value="'+p.id+'">'+p.name+'</option>').join('');
renderSeat(current.self.id);
document.getElementById('seat-select').addEventListener('change',e=>renderSeat(e.target.value));
document.getElementById('reset-camera').addEventListener('click',()=>{yaw=0;pitch=0;selected=null;pointer.set(9,9);});
document.getElementById('confirm-demo').addEventListener('click',()=>{
  if(flight)return;
  if(selected?.userData.kind!=='bank'){status.textContent='请先点击右侧的一组宝石';return;}
  const source=selected, index=gemNames.indexOf(source.userData.name);
  const obj=stack(source.userData.name,1,source.position.x,source.position.y+.8,source.position.z);
  flight={object:obj,from:obj.position.clone(),to:new THREE.Vector3(-4.82+index*.93,.58,6.06),start:performance.now()};
  status.textContent='正在拿取'+source.userData.label+'（演示动画）';
});
function resize(){
  const w=mount.clientWidth,h=mount.clientHeight;
  renderer.setSize(w,h);camera.aspect=w/h;camera.fov=w/h<1.4?52:37;camera.updateProjectionMatrix();
  // Keep the rear edge below the fixed opponent HUD on shorter desktop windows.
  camera.setViewOffset(w,h,0,-Math.max(0,165-h*.148),w,h);
}
window.addEventListener('resize',resize);resize();
const canvas=renderer.domElement;
canvas.addEventListener('pointermove',e=>{
  const r=canvas.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,1-(e.clientY-r.top)/r.height*2);
  if(drag){yaw=THREE.MathUtils.clamp(drag.yaw-(e.clientX-drag.x)*.001,-.12,.12);pitch=THREE.MathUtils.clamp(drag.pitch+(e.clientY-drag.y)*.008,-.7,.7);}
});
canvas.addEventListener('pointerleave',()=>{if(!drag)pointer.set(9,9);});
canvas.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY,yaw,pitch};canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointerup',e=>{
  if(drag&&Math.hypot(e.clientX-drag.x,e.clientY-drag.y)<5){
    const r=canvas.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,1-(e.clientY-r.top)/r.height*2);
    ray.setFromCamera(pointer,camera);
    let hit=ray.intersectObjects(objects,true)[0]?.object;
    while(hit&&!objects.includes(hit))hit=hit.parent;
    if(hit){selected=selected===hit?null:hit;status.textContent=selected?'已选择：'+selected.userData.label:'选择已取消';}
  }
  drag=null;canvas.releasePointerCapture(e.pointerId);
});
canvas.addEventListener('pointercancel',()=>{drag=null;});
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
function animate(now){
  const aspect=camera.aspect, distance=aspect<1.4?1.28:1;
  camera.position.lerp(new THREE.Vector3(-.7+Math.sin(yaw)*16, (18.8+pitch)*distance, 1.35+Math.cos(yaw)*11.5*distance),.15);
  camera.lookAt(target);camera.updateMatrixWorld();
  ray.setFromCamera(pointer,camera);
  const hit=ray.intersectObjects(objects,true)[0];
  let next=hit?.object;
  while(next&&!objects.includes(next))next=next.parent;
  hovered=next||null;
  for(const item of objects){
    const raised=item===hovered||item===selected;
    item.position.y=THREE.MathUtils.lerp(item.position.y,item.userData.baseY+(raised?.22:0),reduced?1:.14);
    item.rotation.x=THREE.MathUtils.lerp(item.rotation.x,item.userData.kind==='card'&&raised?-.035:0,.14);
  }
  if(flight){
    const t=Math.min(1,(now-flight.start)/(reduced?1:1050)),s=t*t*(3-2*t);
    flight.object.position.lerpVectors(flight.from,flight.to,s);flight.object.position.y+=Math.sin(t*Math.PI)*2;
    flight.object.rotation.y=t*Math.PI*2;
    if(t===1){disposeTransient(flight.object);flight=null;status.textContent='拿取动画完成 · Demo 不改变真实对局';}
  }
  canvas.style.cursor=drag?'grabbing':hovered?'pointer':'grab';
  renderer.render(scene,camera);
  requestAnimationFrame(animate);
}
camera.position.set(-.7,17,15.65);camera.lookAt(target);
loading.classList.add('hidden');
requestAnimationFrame(animate);
// Read-only diagnostic projection used by browser acceptance checks.
window.splendorDemo = {
  snapshot:()=>({self:current.self.id,opponents:current.opponents.map(p=>p.id),reserved:current.self.reserved.map(p=>p.color),selected:selected?.userData.label||null,triangles:renderer.info.render.triangles}),
  targets:()=>objects.map(o=>{const p=o.getWorldPosition(new THREE.Vector3()).project(camera);return {kind:o.userData.kind,name:o.userData.name,label:o.userData.label,x:(p.x+1)*mount.clientWidth/2,y:(1-p.y)*mount.clientHeight/2};})
};

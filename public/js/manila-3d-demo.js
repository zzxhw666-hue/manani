import * as THREE from '../vendor/three.module.js';

// This is an isolated, client-only art-direction demo; no room API is called.
const mount = document.querySelector('#scene');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.8));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = .96;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.shadowMap.autoUpdate = false;
renderer.shadowMap.needsUpdate = true;
mount.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#20130c');
const camera = new THREE.PerspectiveCamera(37, 1, .1, 100);
const target = new THREE.Vector3(0, 0, .65);
const loader = new THREE.TextureLoader();
const colors = ['#b82836', '#2261ad', '#d8a829', '#2c774d'];
const players = ['你', '张船长', '艾琳', '老亨利'];
let yaw = 0, pitch = 0, overhead = false, drag = null, turn = 2, roll = null, tooltipTimer;
const boats = [], dice = [], interactives = [];
const mat = (color, roughness=.5, metalness=0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
const gold = mat('#bd8a3d', .26, .73), dark = mat('#1d120d', .74), paper = mat('#ead3a6', .89);
const redWood = mat('#633216', .51), ropeMat = mat('#b48c52', .94);
const texture = (w,h,paint) => {
  const c=document.createElement('canvas'); c.width=w;c.height=h;paint(c.getContext('2d'),w,h);
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=8;return t;
};
async function load(url) { const t=await loader.loadAsync(url);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=8;return t; }
const [wood,map,...icons] = await Promise.all([
  load('assets/table-club/walnut-albedo-v2.png'),load('assets/table-club/manila-board.jpg'),
  ...['cargo-ginseng','cargo-silk','cargo-jade','cargo-nutmeg','share-ginseng','share-jade','special-insurance'].map(n=>load('assets/manila-ui/'+n+'.png'))
]);
const portraitAtlas=await load('assets/manila-ui/portraits-atlas.png');
const portraits=[[100,460,68],[578,460,68],[1056,460,68],[172,720,124]].map(([x,y,r])=>texture(256,256,(c)=>{c.save();c.beginPath();c.arc(128,128,125,0,Math.PI*2);c.clip();c.drawImage(portraitAtlas.image,x-r,y-r,r*2,r*2,0,0,256,256);c.restore();}));
const parchment=texture(512,256,(c,w,h)=>{c.fillStyle='#cbb389';c.fillRect(0,0,w,h);const g=c.createRadialGradient(w*.45,h*.48,30,w*.5,h*.5,w*.56);g.addColorStop(0,'#f3dfb2');g.addColorStop(1,'#9b7746');c.fillStyle=g;c.fillRect(0,0,w,h);for(let i=0;i<18000;i++){c.fillStyle=i%2?'#77592e0b':'#fff2c40c';c.fillRect((i*137.51)%w,(i*83.17)%h,2,1);}c.strokeStyle='#83623c';c.lineWidth=2;c.strokeRect(8,8,w-16,h-16);c.lineWidth=1;c.strokeRect(12,12,w-24,h-24);});
paper.map=parchment;paper.color.set('#ffffff');
const studio=new THREE.Scene();studio.background=new THREE.Color('#393027');
for(const [x,y,z,w,h,power] of [[-5,8,4,6,3,4],[6,6,-4,3,5,3]]){const soft=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({color:new THREE.Color('#ffe4bb').multiplyScalar(power),side:THREE.DoubleSide}));soft.position.set(x,y,z);soft.lookAt(0,0,0);studio.add(soft);}
const pmrem=new THREE.PMREMGenerator(renderer),env=pmrem.fromScene(studio,.04,.1,40);scene.environment=env.texture;scene.environmentIntensity=.38;pmrem.dispose();studio.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});
wood.wrapS=wood.wrapT=THREE.RepeatWrapping; wood.repeat.set(2,2);
const walnut = new THREE.MeshPhysicalMaterial({map:wood,roughness:.48,clearcoat:.27,clearcoatRoughness:.4,bumpMap:wood,bumpScale:.015});
const marketWood = new THREE.MeshStandardMaterial({map:wood,color:'#61472d',roughness:.76});
const hullWood = new THREE.MeshPhysicalMaterial({map:wood,color:'#b48449',roughness:.48,clearcoat:.3});
scene.add(new THREE.HemisphereLight('#d5e6ea','#342018',2.0));
const key=new THREE.DirectionalLight('#ffdfaa',3.6); key.position.set(-10,15,4);key.castShadow=true;
key.shadow.mapSize.set(2048,2048);Object.assign(key.shadow.camera,{left:-15,right:15,top:14,bottom:-14,near:1,far:42});key.shadow.bias=-.0004;key.shadow.normalBias=.025;key.shadow.radius=3;scene.add(key);
const fill=new THREE.DirectionalLight('#b4d5ef',1.25);fill.position.set(5,10,-8);scene.add(fill);
const warm=new THREE.PointLight('#ffad43',28,15,2);warm.position.set(-11,3,2);scene.add(warm);

function mesh(geometry,material,parent=scene,x=0,y=0,z=0) { const o=new THREE.Mesh(geometry,material);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o; }
function box(w,h,d,material,x,y,z,parent=scene) { return mesh(new THREE.BoxGeometry(w,h,d),material,parent,x,y,z); }
function slab(w,d,h,material,x,y,z,parent=scene) {
  const s=new THREE.Shape(),r=Math.min(.08,w/6,d/6),a=-w/2,b=-d/2;
  s.moveTo(a+r,b);s.lineTo(a+w-r,b);s.quadraticCurveTo(a+w,b,a+w,b+r);s.lineTo(a+w,b+d-r);s.quadraticCurveTo(a+w,b+d,a+w-r,b+d);s.lineTo(a+r,b+d);s.quadraticCurveTo(a,b+d,a,b+d-r);s.lineTo(a,b+r);s.quadraticCurveTo(a,b,a+r,b);
  const g=new THREE.ExtrudeGeometry(s,{depth:h,bevelEnabled:true,bevelThickness:.025,bevelSize:.025,bevelSegments:2,curveSegments:4});g.rotateX(-Math.PI/2);
  const p=g.attributes.position,u=g.attributes.uv;for(let i=0;i<u.count;i++)u.setXY(i,(p.getX(i)+w/2)/w,(p.getZ(i)+d/2)/d);
  return mesh(g,material,parent,x,y,z);
}
function face(w,d,t,x,y,z,parent=scene,transparent=false) { const o=mesh(new THREE.PlaneGeometry(w,d),new THREE.MeshStandardMaterial({map:t,roughness:.88,transparent,alphaTest:transparent?.03:0,side:THREE.DoubleSide}),parent,x,y,z);o.rotation.x=-Math.PI/2;o.castShadow=false;return o; }
function writing(text,w,d,x,y,z,parent=scene,ink='#ecdcbd',font='600') {
  const t=texture(Math.ceil(w*180),Math.ceil(d*210),(c,cw,ch)=>{ let size=ch*.72;c.font=font+' '+size+'px "Songti SC",serif';size*=Math.min(1,(cw-10)/c.measureText(text).width);c.font=font+' '+size+'px "Songti SC",serif';c.fillStyle=ink;c.textAlign='center';c.textBaseline='middle';c.fillText(text,cw/2,ch/2); });
  const o=face(w,d,t,x,y,z,parent,true);o.material=new THREE.MeshBasicMaterial({map:t,transparent:true,depthWrite:false,toneMapped:false});return o;
}
function rod(a,b,r,material,parent=scene) { const va=new THREE.Vector3(...a),vb=new THREE.Vector3(...b),o=mesh(new THREE.CylinderGeometry(r,r,va.distanceTo(vb),8),material,parent);o.position.copy(va).add(vb).multiplyScalar(.5);o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),vb.sub(va).normalize());return o; }
function ring(r,t,x,y,z,parent=scene,material=gold) { const o=mesh(new THREE.TorusGeometry(r,t,8,64),material,parent,x,y,z);o.rotation.x=-Math.PI/2;return o; }
function disc(r,h,material,x,y,z,parent=scene) {return mesh(new THREE.CylinderGeometry(r,r,h,40),material,parent,x,y,z);}
function plaque(text,w,d,x,y,z,parent=scene) {slab(w,d,.04,gold,x,y,z,parent);slab(w-.055,d-.055,.025,paper,x,y+.05,z,parent);writing(text,w-.1,d*.72,x,y+.11,z,parent,'#392617');}
function pawn(color,x,y,z,parent=scene,scale=1) {
  const group=new THREE.Group();parent.add(group);group.position.set(x,y,z);group.scale.setScalar(scale);
  const m=new THREE.MeshPhysicalMaterial({color,roughness:.26,clearcoat:.72,clearcoatRoughness:.18});
  const points=[[.19,0],[.22,.05],[.2,.11],[.14,.19],[.11,.31],[.09,.39],[.12,.44]].map(p=>new THREE.Vector2(...p));
  mesh(new THREE.LatheGeometry(points,24),m,group);mesh(new THREE.SphereGeometry(.145,24,16),m,group,0,.54,0);disc(.23,.045,m,0,.025,0,group);return group;
}
// The table, board and trays have real thickness and receive shadows independently.
slab(29,23,.8,walnut,0,-1.1,0);slab(25,18,.24,walnut,0,-.35,0);
for(let x=-12;x<13;x+=3.15)box(.018,.009,18,dark,x,-.09,0);
slab(16.1,10.6,.23,redWood,-2.65,-.03,-.7);slab(15.96,10.46,.035,gold,-2.65,.21,-.7);
slab(15.84,10.34,.055,walnut,-2.65,.25,-.7);const seaBoard=face(15.7,10.2,map,-2.65,.337,-.7);seaBoard.material.color.set('#c3c0aa');
for(const x of [-10.5,5.2])for(const z of [-5.8,4.4])disc(.06,.025,gold,x,.34,z);
slab(4.35,6.0,.25,walnut,7.65,.02,-2.9);slab(4.08,5.72,.055,dark,7.65,.29,-2.9);
plaque('黑 市 行 情',2.8,.56,7.65,.36,-5.43);
const wares=[['人参',0,0],['肉豆蔻',3,1],['丝绸',1,2],['翡翠',2,3]];
wares.forEach(([name,icon,level],i)=>{
  const z=-4.48+i*1.08;
  slab(3.94,.97,.03,marketWood,7.65,.37,z);
  face(.6,.67,icons[icon],6.04,.447,z,scene,true);writing(name,.83,.34,6.74,.447,z-.16);
  [0,5,10,20,30].forEach((v,j)=>{const x=7.05+j*.51;writing(String(v),.38,.27,x,.43,z+.08);rod([x-.2,.424,z+.34],[x+.2,.424,z+.34],.007,gold);});
  mesh(new THREE.SphereGeometry(.13,24,16),new THREE.MeshPhysicalMaterial({color:colors[i],roughness:.22,clearcoat:1}),scene,7.05+level*.51,.58,z-.18);
});
const laneZ=[-3.95,-1.27,1.41];
laneZ.forEach((z,lane)=>{
  const names=['人参 · 18₱','丝绸 · 30₱','翡翠 · 36₱'];
  face(1.15,1.1,icons[lane],-9.25,.39,z-.12,scene,true);plaque(names[lane],1.7,.43,-9.12,.35,z+.63);
  for(let i=0;i<14;i++){
    const x=-7.75+i*.78;
    disc(.23,.026,paper,x,.346,z);writing(String(i),.35,.29,x,.367,z,scene,'#45331d');
    if(i<13)rod([x+.29,.349,z],[x+.49,.349,z],.008,gold);
  }
  plaque('港口 '+['A','B','C'][lane],1.42,.48,3.68,.36,z-.12);writing(['6₱','8₱','15₱'][lane],1.05,.41,3.68,.454,z+.43,scene,'#362211');
});

function ship(sailColor,x,z,crew,name,scale=1) {
  const g=new THREE.Group();scene.add(g);g.position.set(x,.38,z);g.scale.setScalar(scale);
  const outline=[[-1.05,0],[-.86,-.38],[-.46,-.5],[.35,-.45],[.8,-.28],[1.04,0],[.8,.28],[.35,.45],[-.46,.5],[-.86,.38]];
  const verts=[],indices=[],levels=[[.63,0],[.87,.14],[1,.42]];
  for(const [s,y] of levels)outline.forEach(([a,b])=>verts.push(a*s,y,b*s));
  for(let l=0;l<2;l++)for(let i=0;i<10;i++){const a=l*10+i,b=l*10+(i+1)%10,c=a+10,d=b+10;indices.push(a,c,b,b,c,d);}
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(verts.flatMap((_,i)=>i%3===0?[(verts[i]+1.1)/2.2,verts[i+1]*2]:[]),2));geo.setIndex(indices);geo.computeVertexNormals();
  mesh(geo,hullWood,g);const s=new THREE.Shape();outline.forEach(([a,b],i)=>i?s.lineTo(a,b):s.moveTo(a,b));s.closePath();const deckGeo=new THREE.ShapeGeometry(s);deckGeo.rotateX(-Math.PI/2);mesh(deckGeo,hullWood,g,0,.33,0);
  for(let i=0;i<10;i++){const a=outline[i],b=outline[(i+1)%10];rod([a[0],.44,a[1]],[b[0],.44,b[1]],.035,gold,g);for(const [scale,h] of [[.91,.22],[.83,.10]])rod([a[0]*scale,h,a[1]*scale],[b[0]*scale,h,b[1]*scale],.016,ropeMat,g);}
  for(let i=0;i<7;i++)box(.016,.008,.69,dark,-.67+i*.23,.338,0,g);
  for(let i=0;i<10;i++){const [x,z]=outline[i];rod([x,.35,z],[x,.57,z],.02,redWood,g);}
  rod([-.24,.35,-.14],[-.24,2.12,-.14],.045,redWood,g);rod([-.83,1.98,-.14],[.52,1.75,-.14],.032,gold,g);
  const sailTex=texture(512,512,(c,w,h)=>{c.fillStyle=sailColor;c.fillRect(0,0,w,h);let seed=44;for(let i=0;i<16000;i++){seed=(seed*1664525+1013904223)>>>0;const x=seed%512;seed=(seed*1664525+1013904223)>>>0;c.fillStyle=i%2?'#ffebc410':'#37200c10';c.fillRect(x,seed%512,1,3);}c.strokeStyle='#49321f66';c.lineWidth=2;for(let i=0;i<6;i++){c.beginPath();c.moveTo(0,i*100);c.lineTo(w,i*100);c.stroke();}for(let i=0;i<4;i++){c.beginPath();c.moveTo(i*170,0);c.lineTo(i*170,h);c.stroke();}});
  const sailGeo=new THREE.PlaneGeometry(1.23,1.18,16,12),pos=sailGeo.attributes.position;
  for(let i=0;i<pos.count;i++){const u=(pos.getX(i)+.615)/1.23,v=(pos.getY(i)+.59)/1.18;pos.setXYZ(i,pos.getX(i)*(1-.13*v),pos.getY(i)-u*.13,Math.sin(u*Math.PI)*Math.sin(v*Math.PI)*.28);}sailGeo.computeVertexNormals();
  const sail=mesh(sailGeo,new THREE.MeshStandardMaterial({map:sailTex,roughness:.89,side:THREE.DoubleSide}),g,-.18,1.36,-.19);
  rod([-.9,.45,.32],[-.24,2.1,-.14],.012,ropeMat,g);rod([.88,.45,.1],[-.24,2.1,-.14],.012,ropeMat,g);
  rod([-.77,.78,-.2],[.48,.63,-.2],.026,redWood,g);
  crew.forEach((p,i)=>pawn(colors[p],-.51+i*.37,.36,.17,g,.6));
  g.userData={label:name+'船 · '+crew.map(p=>players[p]).join('、'),start:x,position:Math.round((x+7.75)/.78),crew};
  g.traverse(o=>{if(o.isMesh){o.userData.ship=g;interactives.push(o);}});boats.push(g);return g;
}
ship('#d6bc83',-7.75+7*.78,laneZ[0],[0,1],'人参');
ship('#23569a',-7.75+4*.78,laneZ[1],[2,1],'丝绸');
ship('#267958',-7.75+9*.78,laneZ[2],[3,0,3],'翡翠');
// Special sites lie on separate parchment sheets along the edge of the board.
for(const x of [-7.7,-2.85,2.0]) {slab(4.5,1.64,.018,paper,x,.35,3.39);ring(.052,.012,x-2.06,.392,2.7);ring(.052,.012,x+2.06,.392,4.08);}
const pirate=ship('#242423',-7.7,3.25,[],'海盗',.72);boats.pop();pirate.userData.label='海盗船 · 第二轮登船 / 第三轮劫掠';
const skull=texture(128,128,(c)=>{c.fillStyle='#eee0c6';c.font='76px serif';c.textAlign='center';c.fillText('☠',64,93);});
const skullPlane=mesh(new THREE.PlaneGeometry(.58,.58),new THREE.MeshBasicMaterial({map:skull,transparent:true,side:THREE.DoubleSide}),pirate,-.18,1.4,.025);skullPlane.castShadow=false;
plaque('海 盗 船',1.7,.38,-7.7,.4,4.04);
disc(.69,.13,gold,-2.85,.46,3.26);disc(.61,.05,paper,-2.85,.55,3.26);ring(.57,.028,-2.85,.61,3.26);
for(let i=0;i<16;i++){const a=i*Math.PI/8;rod([-2.85+Math.sin(a)*.49,.61,3.26+Math.cos(a)*.49],[-2.85+Math.sin(a)*.55,.61,3.26+Math.cos(a)*.55],.008,dark);}
const needle=mesh(new THREE.ConeGeometry(.11,.9,4),gold,scene,-2.85,.66,3.26);needle.rotation.x=Math.PI/2;needle.rotation.z=.6;pawn(colors[1],-1.63,.39,3.25,scene,.77);plaque('领 航 岛',1.7,.38,-2.85,.4,4.04);
const insurance=new THREE.Group();insurance.position.set(1.52,.42,3.26);insurance.rotation.y=-.12;scene.add(insurance);for(let i=0;i<3;i++)slab(1.7,1.18,.025,paper,i*.03,i*.04,0,insurance);face(1.72,1.2,icons[6],0,.13,0,insurance,true);plaque('保 险 公 司',2,.38,2.0,.4,4.04);

function coin(x,y,z,parent=scene,r=.19) {disc(r,.055,gold,x,y,z,parent);ring(r*.85,.012,x,y+.033,z,parent);writing('₱',r*.9,r*.9,x,y+.043,z,parent,'#644616');}
for(let i=0;i<5;i++)for(let j=0;j<2+i%3;j++)coin(2.73+i*.21,.43+j*.06,3.15+(i%2)*.29);
// Actual volumetric dice with independent faces and a recessed leather tray.
slab(4.35,3.0,.19,walnut,7.65,.02,1.81);slab(4.03,2.7,.07,dark,7.65,.22,1.81);
let moveLegend=writing('第 2 次移动',3.2,.43,7.65,.34,.65);
function updateMoveLegend(text){scene.remove(moveLegend);moveLegend.geometry.dispose();moveLegend.material.map.dispose();moveLegend.material.dispose();moveLegend=writing(text,3.2,.43,7.65,.34,.65);}
const pipPositions=[[],[[.5,.5]],[[.27,.27],[.73,.73]],[[.25,.25],[.5,.5],[.75,.75]],[[.27,.27],[.73,.27],[.27,.73],[.73,.73]],[[.27,.27],[.73,.27],[.5,.5],[.27,.73],[.73,.73]],[[.27,.23],[.73,.23],[.27,.5],[.73,.5],[.27,.77],[.73,.77]]];
function diceMat(n) {return new THREE.MeshPhysicalMaterial({map:texture(256,256,(c,w,h)=>{const g=c.createRadialGradient(w*.4,h*.3,10,w*.5,h*.5,w*.75);g.addColorStop(0,'#fff6df');g.addColorStop(1,'#cbbb9d');c.fillStyle=g;c.fillRect(0,0,w,h);c.strokeStyle='#aa967670';c.lineWidth=5;c.strokeRect(4,4,w-8,h-8);for(const [x,y] of pipPositions[n]){c.fillStyle='#29221d';c.beginPath();c.arc(x*w,y*h,17,0,Math.PI*2);c.fill();c.fillStyle='#564b3a';c.beginPath();c.arc(x*w-3,y*h-4,11,0,Math.PI*2);c.fill();}}),roughness:.3,clearcoat:.4});}
const diceMaterials=[1,2,3,4,5,6].map(diceMat),initialDice=[3,5,4];
for(let i=0;i<3;i++){const d=mesh(new THREE.BoxGeometry(.78,.78,.78),[1,6,initialDice[i],4,2,5].map(n=>diceMaterials[n-1]),scene,6.57+i*1.06,.79,1.83);d.rotation.y=.15-i*.17;dice.push(d);}
writing('人参         丝绸         翡翠',3.3,.29,7.65,.36,2.61);
slab(4.35,1.48,.1,walnut,7.65,.02,4.37);writing('航 运 记 录',3.4,.32,7.65,.16,3.99);writing('港口已就绪，等待骰点揭晓',3.9,.3,7.65,.16,4.51,scene,'#c7b58d','400');

// Opposing nameplates, brass medallions and spare pawns.
[-6.6,-1.1,4.35].forEach((x,i)=>{
  slab(4.9,1.0,.12,gold,x,.01,-6.66);slab(4.81,.91,.07,dark,x,.14,-6.66);
  disc(.44,.05,gold,x-1.86,.26,-6.65);face(.82,.82,portraits[i],x-1.86,.301,-6.65,scene,true);ring(.44,.025,x-1.86,.32,-6.65);
  writing(players[i+1],1.65,.3,x-.62,.24,-6.85);writing([42,36,28][i]+' ₱',1.65,.4,x-.62,.24,-6.44,scene,'#f0ca69');
  for(let p=0;p<3;p++)pawn(p===2?'#615a4c':colors[i+1],x+.74+p*.42,.22,-6.56,scene,.48);
});
// Player edge: a low plaque, real red pawns and loose stock cards.
slab(4.7,1.75,.1,dark,-7.14,.02,6.07);ring(.66,.048,-8.65,.2,6.06);face(1.23,1.23,portraits[3],-8.65,.206,6.06,scene,true);
writing('我的商会',2.4,.43,-6.4,.16,5.66);writing('48 ₱',2.6,.71,-6.4,.17,6.27,scene,'#f0c65b');
for(let i=0;i<3;i++)pawn(colors[0],-3.8+i*.77,.05,6.18,scene,1.03);writing('可 用 帮 手',2.8,.31,-3.05,.08,6.95);
for(let i=0;i<2;i++){const g=new THREE.Group();scene.add(g);g.position.set(.1+i*1.67,.10,6.02);g.rotation.y=i?.14:-.19;slab(1.82,1.4,.035,paper,0,0,0,g);face(1.91,1.49,icons[4+i],0,.087,0,g,true);}writing('秘 密 股 票',3.4,.31,.96,.09,6.99);
slab(3.15,.83,.07,gold,5.0,.08,6.2);slab(3.07,.75,.04,dark,5.0,.16,6.2);writing('⌛  轮到你了',2.8,.39,5.0,.237,6.2);
for(let i=0;i<12;i++)coin(8.1+Math.sin(i*4.7)*.73,.04+(i%4)*.06,6.1+Math.cos(i*2.4)*.64,scene,.26);
// Lantern and cup are physical props, with a warm local light.
disc(.67,.17,gold,-11.52,.0,-3.6);disc(.52,.10,dark,-11.52,.14,-3.6);disc(.48,.07,gold,-11.52,1.52,-3.6);
mesh(new THREE.CylinderGeometry(.29,.40,1.1,32),new THREE.MeshPhysicalMaterial({color:'#ffad35',transparent:true,opacity:.38,roughness:.14,emissive:'#ff8a13',emissiveIntensity:.5,depthWrite:false}),scene,-11.52,.83,-3.6);
mesh(new THREE.SphereGeometry(.16,20,12),new THREE.MeshBasicMaterial({color:'#ffe098'}),scene,-11.52,.68,-3.6);
for(let i=0;i<4;i++){const a=i*Math.PI/2;rod([-11.52+Math.sin(a)*.38,.2,-3.6+Math.cos(a)*.38],[-11.52+Math.sin(a)*.38,1.52,-3.6+Math.cos(a)*.38],.032,gold);}
const lamp=new THREE.PointLight('#ffac45',15,9,2);lamp.position.set(-11.5,1.3,-3.6);scene.add(lamp);
disc(.42,.75,gold,10.18,.39,6.22);disc(.35,.018,dark,10.18,.779,6.22);ring(.42,.04,10.18,.8,6.22);const handle=ring(.26,.06,10.69,.44,6.22);handle.rotation.x=0;

function toast(text) { const el=document.querySelector('#inspection');el.textContent=text;el.classList.add('visible');clearTimeout(tooltipTimer);tooltipTimer=setTimeout(()=>el.classList.remove('visible'),3200); }
const baseRotations=dice.map(d=>d.rotation.clone());
document.querySelector('#roll').onclick=()=>{
  if(roll)return;
  const values=boats.map(()=>1+Math.floor(Math.random()*6));
  roll={start:performance.now(),values,from:boats.map(b=>b.position.x)};
  document.querySelector('#roll').disabled=true;document.querySelector('#phase').textContent='命运正在转动';document.querySelector('#status').textContent='三艘货船，等待同一阵风';
};
document.querySelector('#reset').onclick=()=>{
  roll=null;turn=2;boats.forEach(b=>b.position.x=b.userData.start);dice.forEach((d,i)=>{d.position.y=.79;d.rotation.copy(baseRotations[i]);d.material[2]=diceMaterials[initialDice[i]-1];});updateMoveLegend('第 2 次移动');
  document.querySelector('#roll').disabled=false;document.querySelector('#phase').textContent='第 2 次航行';document.querySelector('#status').textContent='港务长 · 你';toast('桌面已重新布置');
  renderer.shadowMap.needsUpdate=true;
};
document.querySelector('#camera').onclick=()=>{overhead=!overhead;document.querySelector('#camera').textContent=overhead?'回到座位':'俯瞰桌面';};
const ray=new THREE.Raycaster(),pointer=new THREE.Vector2();
renderer.domElement.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY,yaw,pitch};renderer.domElement.setPointerCapture(e.pointerId);});
renderer.domElement.addEventListener('pointermove',e=>{if(!drag)return;yaw=THREE.MathUtils.clamp(drag.yaw+(e.clientX-drag.x)*.0008,-.13,.13);pitch=THREE.MathUtils.clamp(drag.pitch+(e.clientY-drag.y)*.0007,-.1,.1);});
renderer.domElement.addEventListener('pointerup',e=>{if(drag&&Math.hypot(e.clientX-drag.x,e.clientY-drag.y)<6){pointer.set(e.clientX/innerWidth*2-1,1-e.clientY/innerHeight*2);ray.setFromCamera(pointer,camera);const hits=ray.intersectObjects(interactives,false);if(hits.length)toast(hits[0].object.userData.ship.userData.label);}drag=null;});
renderer.domElement.addEventListener('pointercancel',()=>{drag=null;});
function resize(){renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();}
addEventListener('resize',resize);resize();
let last=performance.now();
function animate(now){
  const dt=Math.min((now-last)/1000,.05);last=now;
  const factor=Math.max(1,1.65/camera.aspect),radius=(overhead?23.3:22.1)*factor;
  const angle=(overhead?1.24:1.02)+pitch;
  const desired=new THREE.Vector3(Math.sin(yaw)*radius,Math.sin(angle)*radius,Math.cos(angle)*radius+.3);
  target.z=THREE.MathUtils.lerp(target.z,overhead?-.25:.65,1-Math.exp(-dt*7));
  camera.position.lerp(desired,1-Math.exp(-dt*7));camera.lookAt(target);
  if(roll){
    renderer.shadowMap.needsUpdate=true;
    const t=(now-roll.start)/1000;
    dice.forEach((d,i)=>{if(t<1.65){d.rotation.set(t*11+i,t*8,t*6+i);d.position.y=.9+Math.abs(Math.sin(t*9+i))*.55;}else{d.position.y=.79;d.rotation.set(0,baseRotations[i].y,0);d.material[2]=diceMaterials[roll.values[i]-1];}});
    if(t>1.65){const u=Math.min(1,(t-1.65)/1.3),ease=u*u*(3-2*u);boats.forEach((b,i)=>{const end=Math.min(3.62,roll.from[i]+roll.values[i]*.78);b.position.x=THREE.MathUtils.lerp(roll.from[i],end,ease);});document.querySelector('#phase').textContent='骰点已揭晓';document.querySelector('#status').textContent=['人参','丝绸','翡翠'].map((n,i)=>n+' '+roll.values[i]).join(' · ');}
    if(t>3.0){turn++;roll=null;updateMoveLegend('第 '+turn+' 次移动');document.querySelector('#roll').disabled=false;document.querySelector('#phase').textContent='第 '+turn+' 次航行';toast('点击「重新布桌」可再次体验起始局面');}
  }
  if(innerWidth>760){const a=new THREE.Vector3(5.5,.1,3.4).project(camera),b=new THREE.Vector3(9.85,.1,3.4).project(camera);const panel=document.querySelector('.action-panel');panel.style.left=(a.x+1)*innerWidth/2+'px';panel.style.right='auto';panel.style.top=(1-a.y)*innerHeight/2+'px';panel.style.width=(b.x-a.x)*innerWidth/2+'px';}
  else {const panel=document.querySelector('.action-panel');panel.style.left='';panel.style.right='';panel.style.top='';panel.style.width='';}
  renderer.render(scene,camera);requestAnimationFrame(animate);
}
camera.position.set(0,19,15);document.querySelector('#loading').remove();requestAnimationFrame(animate);

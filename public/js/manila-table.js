import * as THREE from '../vendor/three.module.js';
import { cargo, laneZ, shipScale } from './manila-table-state.mjs';

// Persistent production board. All public state and actions come from the room.
export async function createManilaTable(mount,{onPick,onHover,onFailure}={}) {
const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.96;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;
mount.appendChild(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color('#23160e');
let buildRoot=scene,disposed=false,raf=0,state=null,drag=null,yaw=0,pitch=0,overhead=false,needsDraw=true;
let width=1,height=1,dynamic=null,interactives=[],moving=[],last=performance.now(),dynamicResources=null;
const camera=new THREE.PerspectiveCamera(37,1,.1,70);
const target=new THREE.Vector3(-2.65,0,-.5),loader=new THREE.TextureLoader();
function collect(root){const r={textures:new Set(),materials:new Set(),geometries:new Set()};root.traverse(o=>{if(o.geometry)r.geometries.add(o.geometry);for(const m of (Array.isArray(o.material)?o.material:[o.material]).filter(Boolean)){r.materials.add(m);if(m.map)r.textures.add(m.map);}});return r;}
function release(r,keep){for(const k of Object.keys(r))for(const item of r[k])if(!keep?.[k].has(item))item.dispose();}
try {
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


function mesh(geometry,material,parent=buildRoot,x=0,y=0,z=0) { const o=new THREE.Mesh(geometry,material);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o; }
function box(w,h,d,material,x,y,z,parent=buildRoot) { return mesh(new THREE.BoxGeometry(w,h,d),material,parent,x,y,z); }
function slab(w,d,h,material,x,y,z,parent=buildRoot,bevel=.025) {
  const s=new THREE.Shape(),r=Math.min(.08,w/6,d/6),a=-w/2,b=-d/2;
  s.moveTo(a+r,b);s.lineTo(a+w-r,b);s.quadraticCurveTo(a+w,b,a+w,b+r);s.lineTo(a+w,b+d-r);s.quadraticCurveTo(a+w,b+d,a+w-r,b+d);s.lineTo(a+r,b+d);s.quadraticCurveTo(a,b+d,a,b+d-r);s.lineTo(a,b+r);s.quadraticCurveTo(a,b,a+r,b);
  const g=new THREE.ExtrudeGeometry(s,{depth:h,bevelEnabled:true,bevelThickness:bevel,bevelSize:bevel,bevelSegments:2,curveSegments:4});g.rotateX(-Math.PI/2);
  const p=g.attributes.position,u=g.attributes.uv;for(let i=0;i<u.count;i++)u.setXY(i,(p.getX(i)+w/2)/w,(p.getZ(i)+d/2)/d);
  return mesh(g,material,parent,x,y,z);
}
function face(w,d,t,x,y,z,parent=buildRoot,transparent=false) { const o=mesh(new THREE.PlaneGeometry(w,d),new THREE.MeshStandardMaterial({map:t,roughness:.88,transparent,alphaTest:transparent?.03:0,side:THREE.DoubleSide}),parent,x,y,z);o.rotation.x=-Math.PI/2;o.castShadow=false;return o; }
function writing(text,w,d,x,y,z,parent=buildRoot,ink='#ecdcbd',font='600') {
  const t=texture(Math.ceil(w*180),Math.ceil(d*210),(c,cw,ch)=>{ let size=ch*.72;c.font=font+' '+size+'px "Songti SC",serif';size*=Math.min(1,(cw-10)/c.measureText(text).width);c.font=font+' '+size+'px "Songti SC",serif';c.fillStyle=ink;c.textAlign='center';c.textBaseline='middle';c.fillText(text,cw/2,ch/2); });
  const o=face(w,d,t,x,y,z,parent,true);o.material.dispose();o.material=new THREE.MeshBasicMaterial({map:t,transparent:true,depthWrite:false,toneMapped:false});return o;
}
function rod(a,b,r,material,parent=buildRoot) { const va=new THREE.Vector3(...a),vb=new THREE.Vector3(...b),o=mesh(new THREE.CylinderGeometry(r,r,va.distanceTo(vb),8),material,parent);o.position.copy(va).add(vb).multiplyScalar(.5);o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),vb.sub(va).normalize());return o; }
function ring(r,t,x,y,z,parent=buildRoot,material=gold) { const o=mesh(new THREE.TorusGeometry(r,t,8,64),material,parent,x,y,z);o.rotation.x=-Math.PI/2;return o; }
function disc(r,h,material,x,y,z,parent=buildRoot) {return mesh(new THREE.CylinderGeometry(r,r,h,40),material,parent,x,y,z);}
function plaque(text,w,d,x,y,z,parent=buildRoot) {slab(w,d,.04,gold,x,y,z,parent);slab(w-.055,d-.055,.025,paper,x,y+.05,z,parent);writing(text,w-.1,d*.72,x,y+.11,z,parent,'#392617');}
function pawn(color,x,y,z,parent=buildRoot,scale=1) {
  const group=new THREE.Group();parent.add(group);group.position.set(x,y,z);group.scale.setScalar(scale);
  const m=new THREE.MeshPhysicalMaterial({color,roughness:.26,clearcoat:.72,clearcoatRoughness:.18});
  const points=[[.19,0],[.22,.05],[.2,.11],[.14,.19],[.11,.31],[.09,.39],[.12,.44]].map(p=>new THREE.Vector2(...p));
  mesh(new THREE.LatheGeometry(points,24),m,group);mesh(new THREE.SphereGeometry(.145,24,16),m,group,0,.54,0);disc(.23,.045,m,0,.025,0,group);return group;
}
// Dark, brass-rimmed recesses are pawn seats; ivory discs are navigation steps.
function seat(x,y,z,{parent=buildRoot,r=.27,occupant=null,label='',detail='',scale=.78}={}) {
  disc(r,.024,dark,x,y,z,parent);ring(r,.022,x,y+.019,z,parent);
  if(occupant!==null)pawn(occupant.color,x,y+.032,z,parent,scale);
  else writing('＋',r*1.25,r*1.25,x,y+.016,z,parent,'#d7b875','400');
  if(label)writing(label,1.3,.30,x,y+.04,z+.44,parent,'#382719');
  if(detail)writing(detail,1.3,.22,x,y+.04,z+.74,parent,'#664c2c','400');
}

function ship(sailColor,x,z,crew,name,scale=1,capacity=3) {
  const g=new THREE.Group();buildRoot.add(g);g.position.set(x,.38,z);g.scale.setScalar(scale);
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
  for(let i=0;i<capacity;i++)seat((i-(capacity-1)/2)*.39,.365,.20,{parent:g,r:.174,occupant:crew[i]??null,scale:.58});

  return g;
}

// Raised board and real wooden rim. Surface decorations never share a depth plane.
slab(22,16,.5,walnut,-2.65,-.65,-.7);
slab(16.1,10.6,.23,redWood,-2.65,-.03,-.7);slab(15.96,10.46,.035,gold,-2.65,.21,-.7);
slab(15.84,10.34,.055,walnut,-2.65,.25,-.7);
const seaBoard=face(15.7,10.2,map,-2.65,.337,-.7);seaBoard.material.color.set('#c3c0aa');
for(const x of [-10.5,5.2])for(const z of [-5.8,4.4])disc(.06,.025,gold,x,.34,z);
laneZ.forEach((z,lane)=>{
  for(let i=0;i<14;i++){
    const x=-7.75+i*.78;disc(.23,.026,paper,x,.346,z);
    writing(String(i),.35,.29,x,.367,z,scene,i===13?'#9d352d':'#45331d');
    if(i<13)rod([x+.29,.349,z],[x+.49,.349,z],.008,gold);
  }
  for(const [col,x] of [3.3,4.62].entries()){
    slab(1.18,1.66,.022,paper,x,.36,z+.37,scene,.008);
    writing((col?'修船厂 ':'港口 ')+['A','B','C'][lane],1.13,.3,x,.407,z-.26,scene,'#382719');
    writing('费用 '+[4,3,2][lane]+'₱',1.05,.22,x,.407,z+.76,scene,'#664c2c');
    writing('回报 '+[6,8,15][lane]+'₱',1.05,.22,x,.407,z+1.0,scene,'#664c2c');
  }
});
for(const x of [-7.7,-2.85,2])slab(4.5,1.64,.018,paper,x,.35,3.39);
const pirate=ship('#242423',-9.02,3.17,[],'海盗',.54,0);
const skull=texture(128,128,c=>{c.fillStyle='#eee0c6';c.font='76px serif';c.textAlign='center';c.fillText('☠',64,93);});
const skullPlane=mesh(new THREE.PlaneGeometry(.58,.58),new THREE.MeshBasicMaterial({map:skull,transparent:true,side:THREE.DoubleSide}),pirate,-.18,1.4,.025);skullPlane.castShadow=false;
writing('海盗船 · 2 位',1.65,.3,-9.02,.44,4,scene,'#382719');
disc(.49,.13,gold,-4.2,.46,3.26);disc(.43,.05,paper,-4.2,.55,3.26);ring(.40,.022,-4.2,.61,3.26);
for(let i=0;i<16;i++){const a=i*Math.PI/8;rod([-4.2+Math.sin(a)*.34,.61,3.26+Math.cos(a)*.34],[-4.2+Math.sin(a)*.39,.61,3.26+Math.cos(a)*.39],.008,dark);}
const needle=mesh(new THREE.ConeGeometry(.08,.66,4),gold,scene,-4.2,.66,3.26);needle.rotation.x=Math.PI/2;needle.rotation.z=.6;
writing('领航岛 · 2 位',1.65,.3,-4.2,.44,4,scene,'#382719');
const insurance=new THREE.Group();insurance.position.set(1,.42,3.25);insurance.rotation.y=-.12;scene.add(insurance);
for(let i=0;i<3;i++)slab(1.6,1.02,.026,paper,i*.03,i*.055,0,insurance,.004);
face(1.6,1.02,icons[6],.06,.17,0,insurance,true);
writing('保险公司 · 1 位',2,.30,1,.44,4,scene,'#382719');
for(let i=0;i<3;i++)for(let j=0;j<2+i;j++){disc(.15,.055,gold,1.68+i*.20,.43+j*.06,3.35+(i%2)*.23);ring(.127,.012,1.68+i*.20,.463+j*.06,3.35+(i%2)*.23);}
const shared=collect(scene);for(const t of [wood,map,...icons,parchment,env.texture])shared.textures.add(t);
for(const m of [gold,dark,paper,redWood,ropeMat,walnut,marketWood,hullWood])shared.materials.add(m);
function hitMesh(o,item){o.userData.item=item;interactives.push(o);}
function marker(s,x,y,z,parent=dynamic,r=.27){
  const group=new THREE.Group();parent.add(group);group.position.set(x,y,z);
  disc(r,.024,dark,0,0,0,group);
  ring(r,.023,0,.02,0,group,s.canPlace?new THREE.MeshStandardMaterial({color:'#ffe59d',emissive:'#e1aa40',emissiveIntensity:.7,roughness:.3,metalness:.4}):gold);
  if(s.owner)pawn(s.owner.color,0,.032,0,group,r<.2?.58:.78);
  else writing(s.canPlace?'＋':'·',r*1.25,r*1.25,0,.016,0,group,'#e1c38a','400');
  group.traverse(o=>{if(o.isMesh)hitMesh(o,{kind:'slot',key:s.key});});
}
function update(next){
  if(disposed)return;
  const previous=new Map(moving.map(m=>[m.ware,{x:m.object.position.x,z:m.object.position.z}]));
  const sameVoyage=state?.code===next.code&&state?.round===next.round;
  state=next;interactives=[];moving=[];
  if(dynamic){scene.remove(dynamic);release(dynamicResources,shared);}
  dynamic=new THREE.Group();scene.add(dynamic);buildRoot=dynamic;
  next.boats.forEach(b=>{
    const ware=cargo[b.ware],icon=icons[['ginseng','silk','jade','nutmeg'].indexOf(b.ware)];
    face(1.1,1.0,icon,-9.25,.39,laneZ[b.lane]-.12,dynamic,true);
    plaque(ware.name+' · '+ware.pool+'₱',1.7,.43,-9.12,.35,laneZ[b.lane]+.63,dynamic);
    const g=ship(ware.sail,b.x,b.z,[],b.name,shipScale,0);
    b.seats.forEach((s,i)=>marker(s,(i-(b.capacity-1)/2)*.39,.365,.20,g,.174));
    g.traverse(o=>{if(o.isMesh&&!o.userData.item)hitMesh(o,{kind:'boat',ware:b.ware});});
    const before=sameVoyage?previous.get(b.ware):null;
    if(before)g.position.set(before.x,.38,before.z);
    moving.push({ware:b.ware,object:g,x:b.x,z:b.z});
    // The precise route label stays clear of the model and remains readable.
    const tagX=b.status==='sea'?b.x:1.15;
    slab(2.55,.44,.015,paper,tagX,.374,laneZ[b.lane]+.95,dynamic,.004);
    writing(b.name+' · '+b.text,2.42,.31,tagX,.4,laneZ[b.lane]+.95,dynamic,'#382719');
    if(b.status==='sea'){
      ring(.26,.025,b.x,.384,laneZ[b.lane],dynamic);
      rod([b.x,.388,laneZ[b.lane]+.30],[b.x,.388,laneZ[b.lane]+.68],.012,gold,dynamic);
    }
  });
  if(!next.boats.length)plaque('等待港务长布置本轮货船',7,.7,-2.65,.38,-.8,dynamic);
  next.slots.filter(s=>!s.ware).forEach(s=>{
    marker(s,s.x,.43,s.z);
    if(s.key.startsWith('port:')||s.key.startsWith('shipyard:')){
      writing(s.owner?s.owner.name:'1 位',1.05,.25,s.x,.48,s.z+.33,dynamic,'#382719');
      if(s.landed)writing(cargo[s.landed].name+' 已到',1.05,.23,s.x,.48,s.z-.03,dynamic,'#603d1f');
    }else{
      writing(s.label,1.3,.30,s.x,.47,s.z+.44,dynamic,'#382719');
      writing(s.owner?s.owner.name:(s.cost?'1 位 · '+s.cost+'₱':'+10₱ · 1 位'),1.3,.22,s.x,.47,s.z+.74,dynamic,'#664c2c');
    }
  });
  buildRoot=scene;dynamicResources=collect(dynamic);renderer.shadowMap.needsUpdate=true;needsDraw=true;
}
const ray=new THREE.Raycaster(),pointer=new THREE.Vector2();
function pick(e){
  const r=renderer.domElement.getBoundingClientRect();
  pointer.set((e.clientX-r.left)/r.width*2-1,1-(e.clientY-r.top)/r.height*2);
  ray.setFromCamera(pointer,camera);return ray.intersectObjects(interactives,false)[0]?.object.userData.item;
}
function down(e){drag={x:e.clientX,y:e.clientY,yaw,pitch};renderer.domElement.setPointerCapture(e.pointerId);}
function move(e){if(drag){yaw=THREE.MathUtils.clamp(drag.yaw+(e.clientX-drag.x)*.001,-.12,.12);pitch=THREE.MathUtils.clamp(drag.pitch+(e.clientY-drag.y)*.001,-.1,.1);needsDraw=true;}else{const item=pick(e);renderer.domElement.style.cursor=item?'pointer':'grab';onHover?.(item);}}
function up(e){if(drag&&Math.hypot(e.clientX-drag.x,e.clientY-drag.y)<6)onPick?.(pick(e));drag=null;}
function cancel(){drag=null;onHover?.(null);}
function lost(e){e.preventDefault();onFailure?.('3D 渲染中断，已切换兼容棋盘');}
renderer.domElement.addEventListener('pointerdown',down);renderer.domElement.addEventListener('pointermove',move);
renderer.domElement.addEventListener('pointerup',up);renderer.domElement.addEventListener('pointercancel',cancel);
renderer.domElement.addEventListener('pointerleave',()=>onHover?.(null));renderer.domElement.addEventListener('webglcontextlost',lost);
function resize(){width=Math.max(1,mount.clientWidth);height=Math.max(1,mount.clientHeight);renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();needsDraw=true;}
const observer=new ResizeObserver(resize);observer.observe(mount);resize();
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
function animate(now){
  if(disposed)return;
  const dt=Math.min((now-last)/1000,.05);last=now;
  if(!document.hidden&&mount.isConnected&&mount.clientWidth){
    const radius=17.7*Math.max(1,1.60/camera.aspect),angle=(overhead?1.42:1.15)+pitch;
    camera.position.set(target.x+Math.sin(yaw)*radius,Math.sin(angle)*radius,target.z+Math.cos(angle)*radius);camera.lookAt(target);
    for(const m of moving){const k=reduced.matches?1:1-Math.exp(-dt*9);if(Math.abs(m.object.position.x-m.x)+Math.abs(m.object.position.z-m.z)>.002){m.object.position.x=THREE.MathUtils.lerp(m.object.position.x,m.x,k);m.object.position.z=THREE.MathUtils.lerp(m.object.position.z,m.z,k);renderer.shadowMap.needsUpdate=true;needsDraw=true;}}
    if(needsDraw){renderer.render(scene,camera);needsDraw=false;}
  }
  raf=requestAnimationFrame(animate);
}
raf=requestAnimationFrame(animate);
return {
 update,
 toggleCamera(){overhead=!overhead;needsDraw=true;return overhead;},
 reset(){yaw=0;pitch=0;overhead=false;needsDraw=true;},
 dispose(){if(disposed)return;disposed=true;cancelAnimationFrame(raf);observer.disconnect();renderer.domElement.removeEventListener('webglcontextlost',lost);const all=collect(scene);for(const k of Object.keys(shared))for(const v of shared[k])all[k].add(v);release(all);env.dispose();renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();}
};
} catch(error){disposed=true;cancelAnimationFrame(raf);release(collect(scene));renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();throw error;}
}

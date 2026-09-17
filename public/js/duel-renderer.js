'use strict';
// Procedural artwork and joint animation; no third-party character assets.
(function (root) {
  const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
  const mix=(a,b,t)=>a+(b-a)*t;
  const smooth=t=>{t=clamp(t);return t*t*(3-2*t);};
  const lerpPose=(a,b,t)=>a.map((p,i)=>p.map((v,j)=>mix(v,b[i][j],t)));
  // head, neck, hip, front elbow/hand, back elbow/hand, front knee/foot, back knee/foot
  const standing=[[0,-107],[0,-81],[0,-47],[22,-64],[32,-46],[-20,-65],[-28,-79],[14,-25],[25,-3],[-13,-24],[-22,-3]];
  const fallen=[[65,-22],[43,-17],[7,-13],[41,-7],[62,-4],[23,-5],[46,-3],[-14,-10],[-37,-4],[-3,-21],[-26,-5]];
  const crouch=[[11,-68],[7,-43],[-6,-27],[28,-34],[43,-8],[-21,-40],[-30,-21],[15,-19],[32,-3],[-24,-15],[-40,-3]];
  function pose(f,t) {
    let p=standing.map(a=>a.slice());
    const breath=Math.sin(t*3)*1.8;
    p[0][1]+=breath;p[1][1]+=breath;p[3][1]+=breath;p[4][1]+=breath;
    if(f.action==='run') {
      const s=Math.sin(t*16),c=Math.cos(t*16);
      p=[[12,-105+Math.abs(s)*3],[9,-79],[0,-47],[13-s*21,-66],[26-s*32,-77],[-12+s*22,-65],[-26+s*31,-78],[s*21,-25],[s*32,-3-Math.max(0,c)*12],[-s*21,-25],[-s*32,-3-Math.max(0,-c)*12]];
    }
    if(f.y>1&&!f.down) p=[[4,-108],[2,-82],[0,-49],[24,-78],[33,-98],[-19,-75],[-28,-92],[24,-39],[37,-18],[-22,-28],[-14,-6]];
    if(f.action==='block')p=[[0,-103],[0,-77],[-8,-43],[27,-83],[19,-113],[17,-64],[33,-90],[10,-24],[31,-3],[-25,-21],[-38,-3]];
    if(f.stun>0 && f.action==='hit')p=[[-21,-101],[-14,-76],[2,-44],[15,-57],[30,-64],[-34,-65],[-48,-82],[19,-24],[40,-3],[-16,-21],[-31,-3]];
    if(f.attack) {
      const a=f.attack, phase=clamp(a.age/a.duration), wind=clamp(a.active/a.duration), strike=wind+.13;
      let prep, hit;
      if(a.key==='light') {
        prep=[[ -9,-106],[-5,-80],[-4,-46],[0,-62],[-22,-77],[-25,-67],[-30,-84],[10,-25],[27,-3],[-20,-23],[-32,-3]];
        hit=f.chain===3?[[14,-104],[8,-77],[0,-43],[34,-93],[41,-137],[-13,-59],[-30,-48],[26,-33],[52,-16],[-18,-21],[-30,-3]]:
          [[19,-103],[13,-77],[1,-44],[51,-80],[83,-81],[-14,-64],[-25,-83],[25,-23],[43,-3],[-15,-22],[-33,-3]];
        if(f.chain===2) {hit[3]=[46,-59];hit[4]=[77,-51];hit[5]=[22,-86];hit[6]=[51,-98];}
      } else if(a.key==='skill') {
        prep=crouch;hit=[[4,-95],[-1,-70],[-12,-43],[17,-69],[29,-86],[-28,-68],[-42,-48],[30,-57],[83,-65],[-27,-23],[-44,-3]];
      } else if(a.key==='special') {
        prep=crouch;hit=[[16,-114],[10,-88],[2,-50],[29,-118],[35,-156],[-9,-64],[-27,-46],[27,-46],[36,-23],[-12,-21],[-29,-3]];
      } else {
        prep=[[0,-106],[0,-80],[-4,-43],[25,-83],[39,-102],[-23,-82],[-37,-103],[17,-22],[34,-3],[-24,-23],[-39,-3]];
        hit=[[23,-106],[17,-80],[3,-47],[59,-74],[99,-77],[36,-66],[85,-69],[30,-24],[50,-3],[-22,-24],[-43,-3]];
      }
      p=phase<wind?lerpPose(p,prep,smooth(phase/wind)):phase<strike?lerpPose(prep,hit,smooth((phase-wind)/.13)):lerpPose(hit,p,smooth((phase-strike)/(1-strike)));
    }
    if(f.down==='air')p=[[-22,-100],[-13,-76],[0,-42],[13,-52],[27,-68],[-34,-67],[-46,-46],[24,-25],[43,-15],[-23,-23],[-44,-10]];
    if(f.down==='floor'||(f.action==='ko'&&!f.y))p=fallen;
    if(f.down==='rise') {const v=1-clamp(f.downTime/.38);p=v<.55?lerpPose(fallen,crouch,smooth(v/.55)):lerpPose(crouch,p,smooth((v-.55)/.45));}
    return p;
  }
  class Renderer {
    constructor(canvas,onImpact) {
      this.canvas=canvas;this.c=canvas.getContext('2d');this.onImpact=onImpact;
      this.visual=[];this.particles=[];this.seen=new Set();this.last=0;this.clock=0;this.shake=0;this.previous=null;this.packetAt=0;
      this.reduced=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
      this.back=document.createElement('canvas');this.back.width=1200;this.back.height=560;
      const original=this.c;this.c=this.back.getContext('2d');this.landscape();this.c=original;
    }
    line(points,w=3,color='#303b34') {const c=this.c;c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.lineWidth=w;c.strokeStyle=color;c.lineCap='round';c.lineJoin='round';c.stroke();}
    poly(points,color){const c=this.c;c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.fillStyle=color;c.fill();}
    ellipse(x,y,rx,ry,color,stroke=0){const c=this.c;c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2);if(stroke){c.lineWidth=stroke;c.strokeStyle=color;c.stroke();}else{c.fillStyle=color;c.fill();}}
    text(s,x,y,size=16,color='#303a31',align='left'){const c=this.c;c.font=`${size>24?'bold ':''}${size}px Georgia,"Songti SC",serif`;c.textAlign=align;c.fillStyle=color;c.fillText(s,x,y);}
    noise(i){return (Math.sin(i*127.1+311.7)*43758.5453)%1;}
    landscape(){
      const c=this.c,g=c.createLinearGradient(0,0,0,560);g.addColorStop(0,'#eee7d7');g.addColorStop(.7,'#d9ddcf');g.addColorStop(1,'#c1c8b5');c.fillStyle=g;c.fillRect(0,0,1200,560);
      this.ellipse(901,165,61,61,'#cfcebb');this.ellipse(887,157,49,51,'#dddac6');
      // Uneven, ink-washed mountain ridges with exposed rock lines.
      for(let l=0;l<4;l++) {const points=[[0,440]];for(let x=0;x<=1240;x+=24)points.push([x,293+l*29-Math.sin(x*.008+l*2)*33-Math.abs(Math.sin(x*.023+l))*37]);points.push([1200,445]);this.poly(points,['#c9d0c3','#b8c4b4','#a9b9a5','#94a88f'][l]);for(let j=0;j<14;j++){const x=j*94+l*17;this.line([[x,343+l*14],[x+24,322+l*14],[x+11,373+l*13]],1,['#c0c8b8','#adbaa6','#99ad92','#8a9f81'][l]);}}
      // Distant roofs and broken watchtowers.
      for(let i=0;i<14;i++){const x=230+i*57,h=25+Math.abs(this.noise(i+1))*85,y=369-h;const col=i%2?'#879b82':'#92a58b';this.poly([[x,390],[x,y],[x+12,y-4],[x+18,y+3],[x+32,y-6],[x+32,390]],col);this.line([[x-5,y],[x+38,y-3]],3,col);c.fillStyle='#bfcbba';c.fillRect(x+11,y+18,6,15);}
      // Monumental ruined gate with a real arched opening.
      c.fillStyle='#7d927a';c.beginPath();c.rect(824,206,145,223);c.moveTo(863,430);c.lineTo(863,298);c.bezierCurveTo(863,252,931,252,931,298);c.lineTo(931,430);c.closePath();c.fill('evenodd');
      this.poly([[814,206],[827,190],[851,195],[861,181],[879,189],[889,176],[905,190],[925,183],[937,197],[972,190],[977,213]],'#6d846c');
      for(let y=220;y<420;y+=23){this.line([[825,y],[855,y+2]],1,'#a7b59c');this.line([[938,y],[968,y-2]],1,'#a7b59c');}this.line([[846,216],[853,242],[843,261],[850,292]],2,'#506e55');this.line([[951,235],[945,257],[960,279],[949,304]],2,'#506e55');
      this.poly([[816,430],[816,211],[800,218],[801,333],[791,347],[795,430]],'#526e56');
      // Terrace balustrade and collapsed stairs.
      this.line([[125,386],[1130,386]],6,'#6c8367');this.line([[125,397],[1130,397]],3,'#8fa184');
      for(let x=145;x<1140;x+=74){this.poly([[x,414],[x,378],[x-3,374],[x+10,374],[x+7,414]],'#687e61');this.ellipse(x+3,370,6,5,'#71876b');}
      for(let i=0;i<5;i++)this.poly([[768-i*14,415+i*5],[825,415+i*5],[825,421+i*5],[760-i*14,421+i*5]],i%2?'#788f70':'#8fa283');
      // Foreground stone pillars, fractured caps, block joints, calligraphic scars.
      for(const [x,y,w,h]of [[126,209,48,233],[1050,252,42,190]]){
        this.poly([[x,y],[x+w,y+4],[x+w-5,y+h],[x-3,y+h]],'#536b53');this.poly([[x+7,y+6],[x+31,y+9],[x+27,y+h],[x+4,y+h]],'#7b8e6c');this.poly([[x-11,y],[x-9,y-13],[x+10,y-16],[x+17,y-9],[x+38,y-19],[x+w+9,y-8],[x+w+10,y+4]],'#435e48');
        for(let j=1;j<8;j++){this.line([[x+2,y+j*27],[x+w-3,y+j*27-2]],2,'#4f634b');this.line([[x+11,y+j*27-17],[x+13,y+j*27-4]],1,'#b1bca0');}this.line([[x+31,y+30],[x+21,y+54],[x+29,y+76],[x+13,y+105],[x+18,y+137]],2,'#334e3a');
      }
      // The platform is made of individual irregular flagstones, not a single line.
      this.poly([[0,438],[1200,438],[1200,500],[1083,496],[1035,506],[812,499],[710,510],[586,500],[483,509],[297,497],[163,505],[0,490]],'#354e3e');
      for(let i=0;i<19;i++){const x=i*67,y=438+(i%3);this.poly([[x+2,y],[x+63,y-2],[x+68,y+9],[x+58,y+15],[x+4,y+14]],i%3===0?'#98a488':'#adb69a');this.line([[x+7,y+3],[x+45,y+2],[x+61,y+6]],1,'#d8d9b9');this.poly([[x+5,y+18],[x+61,y+18],[x+60,y+45+(i%2)*6],[x+7,y+41]],i%2?'#52664c':'#647654');this.line([[x+37,y+20],[x+28,y+31],[x+34,y+41]],1,'#344d36');}
      this.line([[0,455],[180,457],[350,453],[586,458],[832,453],[1200,457]],2,'#283e31');
      for(let i=0;i<88;i++){const x=Math.abs(this.noise(i+98))*1200,y=465+Math.abs(this.noise(i+66))*36;this.ellipse(x,y,2+(i%4),1,'#9aab7b');}
      // Edge rubble and dry grasses keep the central fighting area readable.
      for(const x of [13,39,84,1120,1155,1180]){this.poly([[x-12,439],[x-7,422],[x+4,417],[x+17,432],[x+12,441]],'#5c7053');this.line([[x-6,425],[x+4,420],[x+12,432]],2,'#a6b08d');for(let j=0;j<4;j++)this.line([[x,441],[x+(j-1)*7,420-j*4]],1,'#3e5942');}
      // Paper grain and ink flecks are rasterized once.
      for(let i=0;i<4200;i++){const x=Math.abs(this.noise(i+523))*1200,y=Math.abs(this.noise(i+843))*560;c.fillStyle=i%2?'#59624d0b':'#ffffff19';c.fillRect(x,y,1+(i%2),1);}
      const vignette=c.createRadialGradient(600,270,180,600,270,740);vignette.addColorStop(0,'#334a3600');vignette.addColorStop(1,'#4b574620');c.fillStyle=vignette;c.fillRect(0,0,1200,560);
    }
    ambient(t){const c=this.c;
      // Wind-driven torn standards, ground mist and drifting leaves.
      for(const [x,y,len]of [[74,221,94],[1106,262,70]]){this.line([[x,441],[x,y-18]],4,'#3e5641');const pts=[[x+2,y]];for(let i=1;i<=8;i++)pts.push([x+i*9,y+Math.sin(t*2-i*.65)*5+i*.9]);for(let i=8;i>=0;i--)pts.push([x+i*9,y+len-i*3+Math.sin(t*2-i*.65)*8-(i%3===0?10:0)]);this.poly(pts,'#526c50');this.line([[x+7,y+8],[x+12,y+len-15]],2,'#9eac86');}
      for(let i=0;i<10;i++){const x=(i*143+t*18)%1260-30,y=190+(i*37)%225+Math.sin(t+i)*12;c.save();c.translate(x,y);c.rotate(t*.4+i);this.ellipse(0,0,4,1.3,'#586b4666');c.restore();}
      c.save();c.globalAlpha=.09;for(let i=0;i<4;i++)this.ellipse((t*10+i*360)%1550-150,399+i*8,200,9,'#fff5db');c.restore();
    }
    jointBody(f,p,t,alpha=1){const c=this.c,ink=f.stun>0&&f.action==='hit'?'#723e2b':'#26362c';c.save();c.globalAlpha*=alpha;
      if(f.type==='stick'){
        this.line([p[1],p[2]],8,ink);this.line([p[2],p[7],p[8]],8,ink);this.line([p[2],p[9],p[10]],8,ink);
        this.line([p[1],p[5],p[6]],6,ink);this.line([p[1],p[3],p[4]],7,ink);this.ellipse(...p[4],5,5,ink);this.ellipse(...p[6],4.5,4.5,ink);
        const n=p[1],wind=f.action==='run'||f.attack?.key==='skill'?1.8:1;
        this.poly([[n[0]-3,n[1]-3],[n[0]-29,n[1]-12+Math.sin(t*7)*3],[n[0]-65*wind,n[1]-6+Math.sin(t*7-1)*7],[n[0]-48*wind,n[1]+4+Math.sin(t*7-2)*6],[n[0]-25,n[1]-5],[n[0]+1,n[1]+3]],'#52674f');
        this.line([[n[0]-4,n[1]], [n[0]-30,n[1]+5],[n[0]-52,n[1]+19+Math.sin(t*8)*5]],3,'#7f8c6b');
        this.ellipse(...p[0],19,19,'#e8e4d2');this.ellipse(...p[0],19,19,ink,6);
      }else{
        const a=f.attack,pr=a?clamp(a.age/a.duration):0,wind=a?smooth(pr/(a.active/a.duration)):0;
        let squash=(f.down==='floor'||(f.action==='ko'&&!f.y)) ? .53 : 1;
        if(f.down==='rise')squash=mix(.53,1,smooth(1-f.downTime/.38));
        if(f.visualSquash!==undefined)squash=f.visualSquash;
        const bounce=f.action==='run'?Math.abs(Math.sin(t*14))*5:Math.sin(t*3)*1.5;
        const active=a?Math.sin(Math.PI*clamp((pr-.12)/.7)):0;
        const offset=a?.key==='special'?active*-22:0;
        c.save();c.translate(0,-48*squash-bounce+offset);
        c.rotate(f.visualRotation||0);
        c.scale(1+(1-squash)*.35+(a?.key==='special'?active*.1:0),squash);
        this.ellipse(0,0,43,43,'#e8e4d2');this.ellipse(0,0,43,43,ink,6);
        this.line([[-18,-20],[18,19]],11,ink);this.line([[19,-20],[-19,19]],11,ink);c.restore();
        const stride=f.action==='run'?Math.sin(t*14)*12:0;
        this.line([[-26,-16*squash],[-34-stride,-3]],10,ink);this.line([[26,-16*squash],[36+stride,-3]],10,ink);
        const punch=a?.key==='light'?active*35:0,lift=a?.key==='special'||a?.key==='ultimate'?wind*35:0;
        this.line([[-39,-57*squash],[-55,-37*squash-lift],[-49,-26*squash-lift]],7,ink);
        this.line([[39,-57*squash],[54+punch*.7,-40*squash-lift],[51+punch,-28*squash-lift-punch*.65]],8,ink);
        this.ellipse(51+punch,-28*squash-lift-punch*.65,7,7,ink);this.ellipse(-49,-26*squash-lift,6,6,ink);
      }c.restore();
    }
    skillFX(f){const c=this.c,a=f.attack;if(!a)return;const p=clamp(a.age/a.duration),active=clamp(a.age/a.active),fade=Math.sin(p*Math.PI),cross=f.type==='cross';c.save();c.translate(f.x,442-f.y);c.scale(f.face,1);c.globalAlpha=fade;
      if(a.key==='light') {c.strokeStyle='#d1bb7d';c.lineWidth=5;c.beginPath();c.ellipse(29,-71,62,35,f.chain===3?-.9:.15,-1.4,.9);c.stroke();this.line([[42,-77],[88,-79]],2,'#f9edc2');}
      if(a.key==='skill') {
        if(cross){for(let i=0;i<3;i++){c.strokeStyle=i?'#d0b978':'#3c5141';c.lineWidth=3-i*.5;c.beginPath();c.arc(0,-48,49+i*9,a.age*19+i,a.age*19+i+4.4);c.stroke();}for(let i=0;i<7;i++)this.line([[-25-i*13,-10-i*11],[-75-i*17,-10-i*11]],2,'#b9ac77');}
        else {this.poly([[-110,-30],[-68,-60],[78,-70],[29,-43]],'#d6ca8e66');for(let i=0;i<5;i++)this.line([[-30-i*17,-37-i*12],[60-i*8,-56-i*4]],i===2?5:2,i===2?'#f9edba':'#9ca780');}
      }
      if(a.key==='special') {
        if(cross){const r=25+active*150;for(let i=0;i<3;i++)this.ellipse(0,-3,r-i*20,10+i*6,i===0?'#e9d9a1':'#6e7851',2);for(let i=0;i<8;i++){const x=(i-3.5)*33,h=Math.sin(p*Math.PI)*30;this.poly([[x-7,-2],[x-2,-h-(i%3)*8],[x+8,-8]],'#687550');}}
        else {for(let i=0;i<3;i++){c.strokeStyle=i?'#e6d4a0':'#b7c598';c.lineWidth=8-i*2;c.beginPath();c.ellipse(8,-78,54+i*9,95+i*6,-.3,-.2-p*2,1.4-p*2);c.stroke();}this.line([[35,-40],[44,-142],[32,-172]],3,'#fff1be');}
      }
      if(a.key==='ultimate') {
        if(a.age<a.active){for(let i=0;i<3;i++)this.ellipse(0,-60,90-active*34+i*7,90-active*34+i*7,i?'#d5b778':'#9d523d',2);}
        else if(cross){const r=80+smooth((a.age-a.active)/(a.duration-a.active))*185;this.ellipse(0,-7,r,34,'#d7bb77',7);this.ellipse(0,-7,r-15,25,'#f6e3ad',3);for(let i=0;i<9;i++){const x=(i-4)*47;this.poly([[x-13,-2],[x,-35-(i%3)*25],[x+12,-4]],'#5b6244');}this.line([[-210,0],[-160,-11],[-120,-2],[-58,-10],[0,-3],[60,-12],[122,-2],[200,-8]],3,'#c39857');}
        else {this.poly([[-25,-96],[240,-76],[215,-48],[-25,-39]],'#d0b57988');for(let i=0;i<6;i++)this.line([[0,-98+i*12],[235-(i%3)*15,-72+i*4]],i===3?7:2,i===3?'#fff3c0':'#9f613d');this.ellipse(210,-67,27,57,'#dfc38a',3);}
      }c.restore();
    }
    packet(state,now){
      if(state===this.previous)return;
      if(!state||!this.previous||state.tick<this.previous.tick||state.code!==this.previous.code){this.visual=[];this.seen.clear();this.particles=[];}
      this.previous=state;this.packetAt=now;
      for(const e of state?.effects||[])if(!this.seen.has(e.id)){
        this.seen.add(e.id);const hit=e.kind!=='land';if(hit){this.onImpact?.();if(!this.reduced)this.shake=e.heavy?7:3;}
        for(let i=0;i<(hit?18:12);i++){const a=i*2.399,sp=hit?80+(i%5)*39:25+(i%4)*26;this.particles.push({x:e.x,y:442-e.y,vx:Math.cos(a)*sp,vy:hit?Math.sin(a)*sp:-30-(i%5)*19,age:0,life:hit?.32:.48,size:hit?2+i%3:3+i%4,color:hit?(e.blocked?'#94ad89':i%3?'#b37b42':'#ffedb8'):'#8b977c',dust:!hit});}
      }
      if(this.seen.size>1000)this.seen.clear();
    }
    render(now,state,index,stale=false){
      const dt=Math.min(.04,(now-(this.last||now))/1000);this.last=now;this.packet(state,now);
      const frozen=!!state?.paused||stale||state?.hitstop>0;
      if(!frozen)this.clock+=dt;const t=this.clock,c=this.c;
      c.clearRect(0,0,1200,560);c.save();this.shake*=Math.exp(-20*dt);if(this.shake>.2)c.translate(Math.sin(now*.19)*this.shake,Math.cos(now*.23)*this.shake*.45);
      c.drawImage(this.back,0,0);this.ambient(this.reduced?0:now/1000);
      const fighters=state?.fighters.length===2?state.fighters:[{type:'stick',x:370,y:0,face:1,action:'idle',hp:100,energy:0},{type:'cross',x:830,y:0,face:-1,action:'idle',hp:100,energy:0}];
      fighters.forEach((f,i)=>{
        let v=this.visual[i];if(!v)v=this.visual[i]={x:f.x,y:f.y,pose:pose(f,t),trail:[]};
        const blend=1-Math.exp(-38*dt);v.x=mix(v.x,f.x,blend);v.y=mix(v.y,f.y,blend);
        const draw={...f,x:v.x,y:v.y};if(draw.attack)draw.attack={...draw.attack,age:Math.min(draw.attack.duration,draw.attack.age+(frozen?0:Math.min(.034,(now-this.packetAt)/1000)))};
        const squashTarget=(f.down==='floor'||(f.action==='ko'&&!f.y)) ? .53 : f.down==='rise'?mix(.53,1,smooth(1-f.downTime/.38)):1;
        v.squash=mix(v.squash??1,squashTarget,1-Math.exp(-22*dt));draw.visualSquash=v.squash;
        const rotationTarget=f.attack?.key==='skill'?draw.attack.age*22:f.down==='air'?t*7:f.action==='hit'?-.25:0;
        let angleDelta=Math.atan2(Math.sin(rotationTarget-(v.rotation||0)),Math.cos(rotationTarget-(v.rotation||0)));
        v.rotation=(v.rotation||0)+angleDelta*(1-Math.exp(-30*dt));draw.visualRotation=v.rotation;
        v.pose=lerpPose(v.pose,pose(draw,t),frozen?0:1-Math.exp(-32*dt));
        this.ellipse(v.x,444,Math.max(15,40-f.y*.06),5,'#263d332a');
        if(!this.reduced&&(f.dash||f.attack?.key==='skill'||f.attack?.key==='ultimate')){v.trail.push({x:v.x,y:v.y,pose:v.pose.map(p=>p.slice()),face:f.face});if(v.trail.length>5)v.trail.shift();}else v.trail.shift();
        v.trail.forEach((ghost,j)=>{c.save();c.translate(ghost.x,442-ghost.y);c.scale(ghost.face,1);this.jointBody(draw,ghost.pose,t,(j+1)*.028);c.restore();});
        c.save();c.translate(v.x,442-v.y);c.scale(f.face,1);
        if(f.down==='air'&&f.type==='stick'){c.translate(0,-50);c.rotate(-.8);c.translate(0,50);}
        this.jointBody(draw,v.pose,t);c.restore();this.skillFX(draw);
        this.text(i===index?'▼ YOU':state?.players[i]?.dummy?'测试假人':'',v.x,442-v.y-(f.down==='floor'?53:147),11,'#975139','center');
      });
      this.particles=this.particles.filter(p=>p.age<p.life);for(const p of this.particles){p.age+=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=p.dust?55*dt:360*dt;c.save();c.globalAlpha=Math.max(0,1-p.age/p.life);if(p.dust)this.ellipse(p.x,p.y,p.size*(1+p.age*3),p.size*.6,p.color);else this.line([[p.x,p.y],[p.x-p.vx*.035,p.y-p.vy*.035]],p.size/2,p.color);c.restore();}
      c.restore();
      // HUD remains fixed while the arena reacts to a hit.
      c.fillStyle='#eee8d9dc';c.fillRect(25,16,435,87);c.fillRect(740,16,435,87);
      fighters.forEach((f,i)=>{const x=i?758:42;c.fillStyle='#c4c8b7';c.fillRect(x,55,400,13);c.fillStyle='#40573f';c.fillRect(i?x+400*(1-f.hp/100):x,55,400*f.hp/100,13);c.fillStyle='#aaa997';c.fillRect(x,77,400,3);c.fillStyle=f.energy>=100?'#b78b43':'#a34d35';c.fillRect(x,77,400*f.energy/100,3);this.text(f.type==='stick'?'火柴人 / 疾风':'叉叉怪 / 磐石',x,40,18);this.text(Math.ceil(f.hp)+' HP',x+400,40,13,'#67715e','right');this.text(f.energy>=100?'气满 · O 释放奥义':Math.floor(f.energy)+' 气',x+400,97,11,'#8b5541','right');if(f.combo>1)this.text(f.combo+' 连击',i?1020:100,169,29,'#a34d35');if(f.down)this.text(f.hp<=0?'倒地 · K.O.':f.down==='rise'?'起身保护':f.down==='floor'?'倒地':'浮空',i?1040:120,126,13,'#8b5541');});
      this.text(state?Math.ceil(state.time):99,600,72,40,'#30392d','center');this.text('ROUND 01',600,96,10,'#737c69','center');
      let title='',sub='';if(!state){title='以墨为形 · 以气为锋';sub='创建房间 / 邀请好友 / 或添加测试假人';}else if(state.paused||stale){title='等待重连';sub='对局已暂停，请保持页面开启';}else if(state.phase==='waiting'){title='等待挑战者';sub='房间 '+state.code+' · 准备后开战';}else if(state.phase==='countdown'){title=String(Math.ceil(state.countdown));sub='准备交锋';}else if(state.phase==='over'){title=state.winner===-1?'平局':(state.fighters[state.winner].type==='stick'?'火柴人':'叉叉怪')+' 获胜';sub='点击「准备再战」开启下一局';}
      if(title){c.fillStyle='#ece6d8d9';c.fillRect(330,157,540,103);this.text(title,600,204,33,'#2e382a','center');this.text(sub,600,235,13,'#717965','center');}
      this.text('荒原遗迹  /  风起，墨落。',600,534,12,'#596d51','center');
    }
  }
  root.InkDuelRenderer=Renderer;
  if(typeof module!=='undefined')module.exports={pose,lerpPose};
})(typeof window==='undefined'?globalThis:window);

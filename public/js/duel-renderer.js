'use strict';
// Procedural artwork and joint animation; no third-party character assets.
(function (root) {
  const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
  const mix=(a,b,t)=>a+(b-a)*t;
  const unitProgress=(t,d)=>clamp(t/d);
  const smooth=t=>{t=clamp(t);return t*t*(3-2*t);};
  const lerpPose=(a,b,t)=>a.map((p,i)=>p.map((v,j)=>mix(v,b[i][j],t)));
  // head, neck, hip, front elbow/hand, back elbow/hand, front knee/foot, back knee/foot
  const standing=[[0,-107],[0,-81],[0,-47],[22,-64],[32,-46],[-20,-65],[-28,-79],[14,-25],[25,-3],[-13,-24],[-22,-3]];
  const fallen=[[65,-22],[43,-17],[7,-13],[41,-7],[62,-4],[23,-5],[46,-3],[-14,-10],[-37,-4],[-3,-21],[-26,-5]];
  const crouch=[[11,-68],[7,-43],[-6,-27],[28,-34],[43,-8],[-21,-40],[-30,-21],[15,-19],[32,-3],[-24,-15],[-40,-3]];
  function powerPose(f,base){
    const a=f.attack,t=a.age;
    const seal=[[0,-102],[0,-77],[-4,-43],[21,-75],[5,-83],[-20,-77],[-2,-84],[17,-23],[34,-3],[-24,-23],[-38,-3]];
    const kick=[[13,-93],[2,-68],[-12,-43],[20,-64],[39,-82],[-25,-70],[-47,-82],[33,-65],[93,-87],[-25,-26],[-45,-6]];
    const reverse=[[8,-100],[0,-73],[-10,-43],[21,-89],[33,-115],[-31,-63],[-48,-43],[7,-24],[19,-4],[27,-63],[91,-48]];
    const blade=[[14,-115],[5,-88],[-9,-51],[32,-119],[53,-161],[-23,-72],[-44,-42],[20,-49],[43,-23],[-28,-31],[-48,-12]];
    const float=[[0,-105],[0,-80],[0,-49],[30,-96],[51,-127],[-30,-96],[-51,-127],[24,-42],[32,-16],[-24,-42],[-32,-16]];
    const smash=[[22,-62],[10,-42],[-10,-27],[39,-31],[49,-2],[20,-29],[37,-3],[17,-16],[39,-3],[-30,-15],[-47,-3]];
    if(a.motion==='gale'){
      if(t<.17)return lerpPose(base,crouch,smooth(t/.17));
      if(t<.31)return lerpPose(crouch,kick,smooth((t-.17)/.14));
      if(t<.49)return lerpPose(kick,reverse,smooth((t-.31)/.18));
      return lerpPose(reverse,base,smooth((t-.49)/(a.duration-.49)));
    }
    if(a.motion==='thunder'){
      if(t<.15)return lerpPose(base,seal,smooth(t/.15));
      if(t<.34)return lerpPose(seal,blade,smooth((t-.15)/.19));
      return lerpPose(blade,base,smooth((t-.55)/(a.duration-.55)));
    }
    if(a.motion==='storm'){
      if(t<.35)return lerpPose(base,seal,smooth(t/.25));
      if(t<.68)return lerpPose(seal,float,smooth((t-.35)/.33));
      if(t<1.60){const q=(t-.68)% .30;return lerpPose(float,blade,Math.sin(clamp(q/.30)*Math.PI)*.8);}
      if(t<1.86)return lerpPose(float,smash,smooth((t-1.60)/.26));
      return lerpPose(smash,base,smooth((t-2.05)/(a.duration-2.05)));
    }
    return base;
  }
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
        const stage=a.chain||f.chain||1;
        hit=[[19,-103],[13,-77],[1,-44],[51,-80],[83,-81],[-14,-64],[-25,-83],[25,-23],[43,-3],[-15,-22],[-33,-3]];
        if(stage===2){
          prep=crouch;
          hit=[[31,-87],[20,-65],[-4,-41],[55,-66],[89,-71],[-18,-58],[-49,-44],[21,-23],[40,-3],[-31,-22],[-59,-3]];
        } else if(stage===3){
          prep=[[0,-99],[-7,-75],[-16,-43],[4,-100],[-14,-121],[-34,-67],[-46,-88],[8,-40],[21,-14],[-38,-25],[-52,-7]];
          hit=[[8,-105],[2,-80],[-11,-46],[38,-85],[72,-91],[-31,-73],[-55,-54],[18,-34],[37,-13],[-32,-30],[-24,-9]];
        } else if(stage===4){
          prep=[[4,-96],[2,-71],[-6,-43],[23,-95],[24,-124],[-20,-94],[-19,-126],[21,-41],[34,-18],[-27,-29],[-40,-12]];
          hit=[[24,-61],[10,-43],[-9,-30],[41,-31],[53,-4],[27,-33],[44,-4],[21,-17],[40,-3],[-29,-15],[-46,-3]];
        }
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
    if(f.type==='stick'&&f.attack?.key!=='light'&&f.attack?.motion)p=powerPose(f,standing.map(p=>p.slice()));
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
        const a=f.attack;
        if(a?.motion==='meteor'){const expand=1+.55*Math.sin(Math.PI*clamp(a.age/2.10));c.scale(expand,expand);}
        const pr=a?clamp(a.age/a.duration):0,wind=a?smooth(pr/(a.active/a.duration)):0;
        let squash=(f.down==='floor'||(f.action==='ko'&&!f.y)) ? .53 : 1;
        if(f.down==='rise')squash=mix(.53,1,smooth(1-f.downTime/.38));
        if(f.visualSquash!==undefined)squash=f.visualSquash;
        const bounce=f.action==='run'?Math.abs(Math.sin(t*14))*5:Math.sin(t*3)*1.5;
        const active=a?Math.sin(Math.PI*clamp((pr-.12)/.7)):0;
        const offset=a?.key==='special'?active*-22:0;
        c.save();c.translate(0,-48*squash-bounce+offset);
        c.rotate(f.visualRotation||0);
        const charge=['quake','crystal','meteor'].includes(a?.motion)&&a.age<Math.min(a.active,.6)?Math.sin(Math.PI*a.age/Math.min(a.active,.6))*.24:0;
        c.scale(1+(1-squash)*.35+charge+(a?.key==='special'?active*.1:0),squash-charge);
        this.ellipse(0,0,43,43,'#e8e4d2');this.ellipse(0,0,43,43,ink,6);
        this.line([[-18,-20],[18,19]],11,ink);this.line([[19,-20],[-19,19]],11,ink);c.restore();
        const tucked=a?.motion==='roll'||a?.motion==='bounce'||a?.key==='skill'||(a?.motion==='meteor'&&a.age>.6&&a.age<1.8);
        if(tucked){
          this.ellipse(-31,-50,7,7,ink);this.ellipse(32,-30,7,7,ink);
          this.line([[-20,-20],[-13,-14]],8,ink);this.line([[19,-19],[25,-15]],8,ink);
        }else{
          const stride=f.action==='run'?Math.sin(t*14)*12:0;
          this.line([[-26,-16*squash],[-34-stride,-3]],10,ink);this.line([[26,-16*squash],[36+stride,-3]],10,ink);
          const stage=a?.key==='light'?a.chain:0;
          const punch=stage===1?active*41:stage===3?active*16:0;
          const lift=a?.motion==='crystal'?(a.age<.25?50*smooth(a.age/.25):50-75*smooth((a.age-.25)/.13)):a?.motion==='meteor'?60*smooth(a.age/.4):a?.motion==='quake'?(a.age<a.active?wind*53:53*(1-clamp((a.age-a.active)/.12))):a?.key==='special'||a?.key==='ultimate'?wind*35:0;
          const backHand=[-49+(stage===1?active*113:0),-26*squash-lift-(stage===1?active*37:0)];
          this.line([[-39,-57*squash],[-55+(stage===1?active*60:0),-37*squash-lift],backHand],7,ink);
          this.line([[39,-57*squash],[54+punch*.7,-40*squash-lift],[51+punch,-28*squash-lift-punch*.65]],8,ink);
          this.ellipse(51+punch,-28*squash-lift-punch*.65,7,7,ink);this.ellipse(...backHand,6,6,ink);
        }
      }c.restore();
    }
    skillFX(f){const c=this.c,a=f.attack;if(!a)return;if(a.key!=='light'){this.powerFX(f);return;}const p=clamp(a.age/a.duration),active=clamp(a.age/a.active),fade=Math.sin(p*Math.PI),cross=f.type==='cross';c.save();c.translate(f.x,442-f.y);c.scale(f.face,1);c.globalAlpha=fade;
      if(a.key==='light') {
        const stage=a.chain||1;
        if(stage===1){
          for(let i=0;i<3;i++)this.line([[36,-92+i*15],[83+active*12,-92+i*15]],i===1?5:2,'#d1bb7d');
          this.ellipse(83,-77,9+active*10,25,'#f7e7b4',2);
        } else if(stage===2){
          if(cross){for(let i=0;i<3;i++){c.strokeStyle=i?'#d4bf83':'#899777';c.lineWidth=3;c.beginPath();c.arc(0,-48,49+i*8,a.age*22+i,a.age*22+i+4.7);c.stroke();}}
          else this.poly([[-105,-41],[-35,-81],[89,-78],[28,-49]],'#d9c28c77');
          for(let i=0;i<5;i++)this.line([[-28,-25-i*15],[-105-i*9,-22-i*15]],2,'#d3bd85');
        } else if(stage===3){
          if(cross){for(let i=0;i<3;i++){c.strokeStyle='#d1bb7d';c.lineWidth=3;c.beginPath();c.ellipse(0,-50,53+i*9,58+i*8,-a.age*9,-1.8,1.8);c.stroke();}}
          else {this.line([[-18,-89],[-50,-102],[-64,-90]],2,'#9cac88');if(a.age<a.active)this.shuriken(18,-119,a.age*22,9);this.line([[39,-89],[80,-94]],3,'#e6d2a0');}
        } else if(cross){
          if(a.age<a.active){this.ellipse(0,-8,35+active*36,10,'#d2b77f',3);this.line([[-27,-91],[27,-37]],3,'#b79760');this.line([[27,-91],[-27,-37]],3,'#b79760');}
          else {const r=45+unitProgress(a.age-a.active,a.duration-a.active)*120;this.ellipse(0,-3,r,15,'#e3ca8d',5);this.line([[-r,-3],[-r*.5,-16],[0,-5],[r*.4,-17],[r,0]],3,'#9c7542');}
        } else {
          if(a.age<.38){this.ellipse(0,-60,38,55,'#d3b87d',2);}
          else if(a.age<a.active){this.poly([[-28,-170],[24,-160],[48,-1],[-10,-8]],'#e4d09a77');for(let i=0;i<4;i++)this.line([[-18+i*20,-148],[0+i*15,-15]],3,'#ead9ad');}
          else {const r=25+unitProgress(a.age-a.active,a.duration-a.active)*110;this.ellipse(0,-3,r,16,'#e3ca8d',5);for(let i=0;i<6;i++){const x=(i-2.5)*25;this.poly([[x-5,-2],[x,-22-(i%2)*13],[x+7,0]],'#718065');}}
        }
      }
      c.restore();
    }
    powerFX(f){
      const c=this.c,a=f.attack,t=a.age,color=a.color||'#b2ecff';
      c.save();c.translate(f.x,442-f.y);c.scale(a.face,1);
      c.globalAlpha=Math.min(1,t*7,(a.duration-t)*5);c.shadowColor=color;c.shadowBlur=this.reduced||this.lowEffects?0:14;
      // Every active skill carries a colored poise halo; normal attacks keep ink/gold effects.
      this.ellipse(0,-52,49,59,color+'70',2);
      if(a.motion==='gale'){
        // Two foot-led crescents and a wind tunnel, not a generic glow around the body.
        const kick=clamp((t-.12)/.48);
        for(let j=0;j<(this.lowEffects?1:3);j++){c.save();c.translate(-j*34,0);c.globalAlpha*=.22*(1-j*.23);this.jointBody(f,powerPose({...f,attack:{...a,age:Math.max(0,t-j*.06)}},standing),t);c.restore();}
        for(let j=0;j<2;j++){const phase=clamp((t-(j?.34:.16))/.28),x=32+phase*105;
          c.save();c.globalAlpha*=Math.sin(phase*Math.PI);c.translate(x,-(j?95:44));c.rotate(j?-.55:.45);
          this.poly([[-50,-42],[16,-32],[43,0],[10,36],[-53,47],[-14,19],[6,0],[-15,-18]],color+'88');
          this.line([[-42,-36],[14,-23],[29,0],[5,26],[-43,40]],4,'#f1ffff');c.restore();}
        this.ellipse(-55,-58,35+kick*50,23+kick*16,color+'80',2);
        const turn=t<.36?-t*8:t*9;
        for(let j=0;j<3;j++){c.strokeStyle=j?'#e4feff':color;c.lineWidth=8-j*2;c.beginPath();c.ellipse(18,-65,78+j*11,45+j*9,turn,-1.6,1.9);c.stroke();}
        for(let j=0;j<7;j++)this.line([[-35-j*15,-20-j*13],[-110-j*17,-10-j*13]],2,color+'b0');
        this.poly([[52,-85],[117,-66],[53,-45],[73,-66]],'#ddffff');
      }else if(a.motion==='thunder'){
        const blade=clamp((t-.10)/.22),length=115+blade*85;
        c.save();c.translate(22,-82);c.rotate(-1.7+clamp(t/.6)*2.5);
        this.poly([[0,8],[length,-6],[length+30,-18],[length-5,-26],[0,-4]],'#ad84ffaa');
        this.line([[0,0],[length,-16],[length+30,-18]],3,'#fff6ff');
        for(let j=0;j<3;j++)this.line([[38+j*39,-8],[47+j*39,-27],[39+j*39,-38],[59+j*39,-56]],2,color);c.restore();
        c.save();c.rotate(-.3+t*1.2);for(let j=0;j<3;j++){c.strokeStyle=j?'#e9d8ff':color;c.lineWidth=12-j*3;c.beginPath();c.ellipse(15,-70,56+j*15,110+j*10,0,-2.4,.6);c.stroke();}c.restore();
        this.line([[26,-27],[48,-89],[32,-111],[71,-178]],5,color);this.line([[26,-27],[48,-89],[32,-111],[71,-178]],2,'#fdf4ff');
      }else if(a.motion==='magma'){
        for(let j=0;j<10;j++){const theta=j*.63+t*14;this.poly([[Math.cos(theta)*48,-48+Math.sin(theta)*48],[Math.cos(theta-.22)*(76+j%3*10),-48+Math.sin(theta-.22)*76],[Math.cos(theta+.17)*50,-48+Math.sin(theta+.17)*50]],j%2?'#ffc35c':'#ff663d');}
        this.ellipse(0,-48,48,48,'#fff2c4',4);
        this.poly([[-30,-82],[-151,-102],[-109,-69],[-175,-40],[-108,-36],[-145,-8],[-28,-17]],'#ff7b3655');
      }else if(a.motion==='crystal'){
        const charge=clamp(t/.38);this.ellipse(0,-4,58,13,color,3);
        for(const x of [-49,51]){this.ellipse(x,-21,12+charge*5,12+charge*5,'#a2ffcf',3);this.line([[x,-17],[x*.8,0],[x*1.2,4]],3,color);}
      }else if(a.motion==='storm'){
        for(let j=0;j<3;j++){c.strokeStyle=j?'#fff1b9':color;c.lineWidth=3;c.beginPath();c.ellipse(0,-65,55+j*17,60+j*15,t*(j%2?1:-1),-.8,4.1);c.stroke();}
        if(t>.65&&t<1.6)for(let j=0;j<3;j++){c.save();c.translate((j-1)*75,-20+Math.sin(t*8+j)*20);c.globalAlpha*=.22;this.jointBody({...f,attack:null},standing,t);c.restore();}
        if(t>1.6&&t<1.9)this.poly([[-43,-220],[40,-220],[27,5],[-15,5]],'#e4caff99');
      }else if(a.motion==='meteor'){
        const size=60+35*Math.sin(Math.PI*clamp(t/2));
        for(let j=0;j<12;j++){const theta=j*Math.PI/6+t*2;this.poly([[Math.cos(theta)*size,-54+Math.sin(theta)*size],[Math.cos(theta-.15)*(size+37),-54+Math.sin(theta-.15)*(size+37)],[Math.cos(theta+.22)*size,-54+Math.sin(theta+.22)*size]],j%2?'#ffca6877':'#ff4b4766');}
        this.ellipse(0,-54,size,size,'#ffb34a',5);this.ellipse(0,-54,size+9,size+9,'#ffeec4',2);
        if(t>1.4&&t<1.8)this.poly([[-55,-240],[55,-240],[90,-65],[0,17],[-90,-65]],'#ff925066');
      }
      c.restore();
    }
    worldPowerFX(f){
      const a=f.attack;if(!a||a.key==='light')return;const c=this.c,t=a.age;
      c.save();c.shadowColor=a.color;c.shadowBlur=this.reduced||this.lowEffects?0:12;
      if(a.key==='ultimate'){
        c.globalAlpha=.45;this.ellipse(a.targetX,441,a.motion==='meteor'?235:180,19,a.color,2);
        this.line([[a.targetX-25,434],[a.targetX+25,448]],2,a.color);this.line([[a.targetX+25,434],[a.targetX-25,448]],2,a.color);
        if(t<a.active){const radius=(a.motion==='meteor'?260:200)*(1-.5*clamp(t/a.active));this.ellipse(a.targetX,441,radius,25,a.color,2);}
      }
      if(a.motion==='thunder'){
        const grow=Math.sin(Math.PI*clamp(t/.9));c.globalAlpha=.65*grow;
        this.ellipse(a.originX,440,90*grow,18,a.color,3);
        for(let j=0;j<3;j++){const x=a.originX+(j-1)*40;this.line([[x,441],[x-12,391],[x+10,354],[x-6,305-j*21]],3,a.color);}
      }
      if(a.motion==='storm'){
        const charge=clamp(t/.65),fade=t<1.85?1:1-clamp((t-1.85)/.65),x=a.targetX;
        c.globalAlpha=.6*fade;this.ellipse(x,439,180*charge,30*charge,'#b8a1ff',3);
        // Rotating six-point seal and three independently timed shadow strikes.
        const points=[];for(let j=0;j<6;j++){const angle=j*Math.PI/3+t*.55;points.push([x+Math.cos(angle)*160*charge,439+Math.sin(angle)*25*charge]);}
        this.line([points[0],points[2],points[4],points[0]],2,'#ffefae');this.line([points[1],points[3],points[5],points[1]],2,a.color);
        for(let j=0;j<3;j++){
          const u=clamp((t-(.48+j*.30))/.30);if(u===0||u===1)continue;
          const fromX=x+(j%2?-190:190),fromY=190+j*25,px=mix(fromX,x,u),py=mix(fromY,370,u);
          c.save();c.translate(px,py);c.scale(j%2?1:-1,1);c.globalAlpha=.6*Math.sin(u*Math.PI);
          this.jointBody({...f,attack:null},powerPose({...f,attack:{...a,motion:'gale',age:.29}},standing),t);
          this.line([[-110,-75],[0,-40],[65,-5]],5,'#e5d5ff');c.restore();
        }
        if(t>1.6&&t<2.3){const u=clamp((t-1.6)/.7);c.globalAlpha=(1-u)*.75;
          this.poly([[x-45,135],[x+45,135],[x+20,438],[x-20,438]],'#ddd0ff55');
          for(let j=0;j<6;j++){const angle=j*Math.PI/3;this.line([[x,432],[x+Math.cos(angle)*u*230,432+Math.sin(angle)*u*38]],3,'#f7e8b3');}
        }
      }
      if(a.motion==='crystal')for(const strike of a.strikes){
        const age=t-strike.at;if(age<-.2||age>.45)continue;
        const x=Math.max(60,Math.min(1140,a.originX+a.face*strike.offset));c.globalAlpha=age<0?.30:1-clamp(age/.45);
        this.ellipse(x,442,70,11,a.color,2);
        if(age>=0){const h=115*Math.sin(Math.PI*clamp((age+.025)/.475));
          this.poly([[x-35,443],[x-19,397-h*.35],[x-3,442-h],[x+13,394-h*.25],[x+38,443]],'#218a79');
          this.poly([[x-3,442-h],[x+13,394-h*.25],[x+38,443],[x+3,425]],'#62f6b5');this.line([[x-3,442-h],[x+3,425]],3,'#e0ffe9');
        }
      }
      c.restore();
    }
    impactFX(e){
      const c=this.c,p=1-e.life/e.maxLife,color=e.color||'#c5a66b';c.save();c.globalAlpha=1-p;c.shadowColor=color;c.shadowBlur=this.reduced||this.lowEffects?0:16;
      if(e.kind==='cancel'||e.kind==='escape'){this.ellipse(e.x,442-e.y,30+p*75,45+p*45,color,3);this.text(e.kind==='cancel'?'追击':'连击保护',e.x,410-e.y-p*30,15,color,'center');}
      if(e.armored){this.ellipse(e.x,442-e.y,56+p*20,62,'#ffdd85',3);this.text('霸体',e.x,360-e.y,15,'#d3a635','center');}
      if(e.kind==='storm'){
        const top=e.final?113:180,width=e.final?30:9;
        const pts=[[e.x-20,top],[e.x+17,top+65],[e.x-15,top+118],[e.x+23,top+183],[e.x,440]];
        this.line(pts,width,color);this.line(pts,Math.max(2,width*.32),'#fff4cd');
        this.ellipse(e.x,440,30+p*(e.final?210:85),12+p*14,color,e.final?7:3);
      }else if(e.kind==='meteor'){
        this.ellipse(e.x,438,35+p*300,20+p*40,'#ffb85e',10*(1-p)+2);
        this.ellipse(e.x,438,20+p*220,15+p*25,'#fff0b8',4);
        for(let j=0;j<13;j++){const angle=Math.PI+j*Math.PI/12;const x=e.x+Math.cos(angle)*p*260,y=435+Math.sin(angle)*p*190;this.poly([[x-9,y],[x,y-24],[x+12,y+4]],j%2?'#fd7a43':'#ffd18b');}
        this.line([[e.x-205,442],[e.x-125,427],[e.x-80,449],[e.x,428],[e.x+90,448],[e.x+153,425],[e.x+220,441]],4,color);
      }else if(e.kind==='slam'){this.ellipse(e.x,440,20+p*135,9+p*13,color,4);}
      c.restore();
    }
    shuriken(x,y,angle,size=13){
      const c=this.c;c.save();c.translate(x,y);c.rotate(angle);
      const points=[];for(let i=0;i<8;i++){const r=i%2?size*.30:size;points.push([Math.cos(i*Math.PI/4)*r,Math.sin(i*Math.PI/4)*r]);}
      this.poly(points,'#30473d');this.line([...points,points[0]],1.5,'#e4ce91');this.ellipse(0,0,2,2,'#e8dec0');c.restore();
    }
    projectileFX(f,t){
      const c=this.c;
      if(f.mark&&f.chainTime>0){c.save();c.globalAlpha=Math.min(.8,f.mark.life/25);this.ellipse(f.mark.x,441,26+Math.sin(t*8)*3,6,'#bc8c52',2);this.shuriken(f.mark.x,435,t*.8,9);c.restore();}
      const p=f.projectile;if(!p)return;
      const x=p.x,y=442-p.y;
      for(let i=1;i<4;i++){c.save();c.globalAlpha=.22/i;this.shuriken(x-p.face*i*13,y-i*3,p.age*35-i*.4,12);c.restore();}
      this.shuriken(x,y,p.age*35,15);
    }
    packet(state,now){
      if(state===this.previous)return;
      if(!state||!this.previous||state.round!==this.previous.round||state.tick<this.previous.tick||state.code!==this.previous.code){this.visual=[];this.seen.clear();this.particles=[];}
      this.previous=state;this.packetAt=now;
      for(const e of state?.effects||[])if(!this.seen.has(e.id)){
        this.seen.add(e.id);const hit=!['land','cast','cancel','escape'].includes(e.kind);if(hit&&!e.armored){this.onImpact?.(e);if(!this.reduced)this.shake=e.final?12:e.heavy?6:2;}
        for(let i=0;i<(this.lowEffects?(hit?7:4):(hit?18:12));i++){const a=i*2.399,sp=hit?80+(i%5)*39:25+(i%4)*26;this.particles.push({x:e.x,y:442-e.y,vx:Math.cos(a)*sp,vy:hit?Math.sin(a)*sp:-30-(i%5)*19,age:0,life:hit?.32:.48,size:hit?2+i%3:3+i%4,color:hit?(e.armored?'#ffe39c':e.blocked?'#94ad89':i%3?(e.color||'#b37b42'):'#fff7df'):'#8b977c',dust:!hit});}
      }
      if(this.seen.size>1000)this.seen.clear();
    }
    render(now,state,index,stale=false){
      const dt=Math.min(.04,(now-(this.last||now))/1000);this.last=now;this.packet(state,now);
      const frozen=!!state?.paused||stale||state?.hitstop>0;
      if(!frozen)this.clock+=dt;const t=this.clock,c=this.c;
      c.clearRect(0,0,1200,560);c.save();this.shake*=Math.exp(-20*dt);if(this.shake>.2)c.translate(Math.sin(now*.19)*this.shake,Math.cos(now*.23)*this.shake*.45);
      c.drawImage(this.back,0,0);if(!this.lowEffects)this.ambient(this.reduced?0:now/1000);
      const fighters=state?.fighters.length===2?state.fighters:[{type:'stick',x:370,y:0,face:1,action:'idle',hp:100,energy:0},{type:'cross',x:830,y:0,face:-1,action:'idle',hp:100,energy:0}];
      const ultimate=fighters.find(f=>f.attack?.key==='ultimate');
      if(ultimate){c.save();c.globalAlpha=this.reduced?.12:.38*Math.sin(Math.PI*clamp(ultimate.attack.age/ultimate.attack.duration));c.fillStyle=ultimate.type==='stick'?'#171335':'#361321';c.fillRect(0,0,1200,510);c.restore();}
      fighters.forEach(f=>{this.worldPowerFX(f);this.projectileFX(f,t);});
      fighters.forEach((f,i)=>{
        let v=this.visual[i];if(!v)v=this.visual[i]={x:f.x,y:f.y,pose:pose(f,t),trail:[]};
        const blend=i===index?1:1-Math.exp(-60*dt);v.x=mix(v.x,f.x,blend);v.y=mix(v.y,f.y,blend);
        const draw={...f,x:v.x,y:v.y};if(draw.attack)draw.attack={...draw.attack,age:Math.min(draw.attack.duration,draw.attack.age+(frozen?0:Math.min(.034,(now-this.packetAt)/1000)))};
        const squashTarget=(f.down==='floor'||(f.action==='ko'&&!f.y)) ? .53 : f.down==='rise'?mix(.53,1,smooth(1-f.downTime/.38)):1;
        v.squash=mix(v.squash??1,squashTarget,1-Math.exp(-22*dt));draw.visualSquash=v.squash;
        const rotationTarget=f.attack?.motion==='roll'?draw.attack.age*23:f.attack?.motion==='bounce'?draw.attack.age*12:f.attack?.motion==='meteor'&&f.attack.age>.6&&f.attack.age<1.8?draw.attack.age*12:f.attack?.key==='skill'?draw.attack.age*22:f.down==='air'?t*7:f.action==='hit'?-.25:0;
        let angleDelta=Math.atan2(Math.sin(rotationTarget-(v.rotation||0)),Math.cos(rotationTarget-(v.rotation||0)));
        v.rotation=(v.rotation||0)+angleDelta*(1-Math.exp(-30*dt));draw.visualRotation=v.rotation;
        v.pose=lerpPose(v.pose,pose(draw,t),frozen?0:1-Math.exp(-32*dt));
        this.ellipse(v.x,444,Math.max(15,40-f.y*.06),5,'#263d332a');
        if(!this.reduced&&!this.lowEffects&&(f.dash||f.attack?.key==='skill'||f.attack?.key==='ultimate'||['rush','retreat','dive','roll','bounce'].includes(f.attack?.motion))){v.trail.push({x:v.x,y:v.y,pose:v.pose.map(p=>p.slice()),face:f.face});if(v.trail.length>5)v.trail.shift();}else v.trail.shift();
        v.trail.forEach((ghost,j)=>{c.save();c.translate(ghost.x,442-ghost.y);c.scale(ghost.face,1);this.jointBody(draw,ghost.pose,t,(j+1)*.028);c.restore();});
        c.save();c.translate(v.x,442-v.y);c.scale(f.face,1);
        if(f.down==='air'&&f.type==='stick'){c.translate(0,-50);c.rotate(-.8);c.translate(0,50);}
        if(f.wakeInv||f.juggleProtected||['floor','rise'].includes(f.down)){c.save();c.globalAlpha=.65;this.ellipse(0,-51,55,68,'#82d5c6',2);c.restore();c.globalAlpha=.65;}
        this.jointBody(draw,v.pose,t);c.restore();this.skillFX(draw);
        if(f.attack?.key==='light')this.text(`${f.attack.chain}/4 · ${f.attack.name}`,v.x,442-v.y-(f.down==='floor'?70:168),12,'#80563c','center');
        this.text(i===index?'▼ YOU':state?.players[i]?.dummy?'测试假人':'',v.x,442-v.y-(f.down==='floor'?53:147),11,'#975139','center');
      });
      for(const e of state?.effects||[])this.impactFX(e);
      this.particles=this.particles.filter(p=>p.age<p.life);for(const p of this.particles){p.age+=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=p.dust?55*dt:360*dt;c.save();c.globalAlpha=Math.max(0,1-p.age/p.life);if(p.dust)this.ellipse(p.x,p.y,p.size*(1+p.age*3),p.size*.6,p.color);else this.line([[p.x,p.y],[p.x-p.vx*.035,p.y-p.vy*.035]],p.size/2,p.color);c.restore();}
      c.restore();
      // HUD remains fixed while the arena reacts to a hit.
      c.fillStyle='#eee8d9dc';c.fillRect(25,16,435,87);c.fillRect(740,16,435,87);
      fighters.forEach((f,i)=>{const x=i?758:42;c.fillStyle='#c4c8b7';c.fillRect(x,55,400,13);c.fillStyle='#40573f';c.fillRect(i?x+400*(1-f.hp/100):x,55,400*f.hp/100,13);c.fillStyle='#aaa997';c.fillRect(x,77,400,3);c.fillStyle=f.energy>=100?'#b78b43':'#a34d35';c.fillRect(x,77,400*f.energy/100,3);this.text(f.type==='stick'?'火柴人 / 疾风':'叉叉怪 / 磐石',x,40,18);this.text(Math.ceil(f.hp)+' HP',x+400,40,13,'#67715e','right');this.text(f.energy>=100?'气满 · O 释放奥义':Math.floor(f.energy)+' 气',x+400,97,11,'#8b5541','right');if(f.combo>1){this.text(f.combo+' 连击',i?1020:100,169,29,'#a34d35');this.text(f.comboDamage+' 伤害',i?1020:100,191,13,'#80563c');}if(f.wakeInv||f.juggleProtected)this.text('保护中',i?1040:120,148,13,'#3a8d7c');if(f.down)this.text(f.hp<=0?'倒地 · K.O.':f.down==='rise'?'起身保护':f.down==='floor'?'倒地':'浮空',i?1040:120,126,13,'#8b5541');});
      this.text(state?.training?'∞':state?Math.ceil(state.time):99,600,72,40,'#30392d','center');this.text(state?.training?'TRAINING':'ROUND '+String(state?.round||1).padStart(2,'0'),600,96,10,'#737c69','center');
      if(ultimate&&ultimate.attack.age<.70){const a=ultimate.attack;c.save();c.globalAlpha=Math.min(1,a.age*6,(.70-a.age)*6);c.fillStyle='#211d32df';c.fillRect(367,112,466,47);this.text(a.name,600,144,25,a.color,'center');c.restore();}
      fighters.forEach((f,i)=>{if(f.stun>0&&!f.down)this.text('僵直 · 禁止出招',i?1040:130,128,14,'#a4484b','center');else if(f.attack&&f.attack.key!=='light')this.text('技能霸体 · 抵抗普攻',i?1040:140,128,12,'#80572c','center');});
      let title='',sub='';if(!state){title='以墨为形 · 以气为锋';sub='创建房间 / 邀请好友 / 或添加测试假人';}else if(state.paused||stale){title='等待重连';sub='对局已暂停，请保持页面开启';}else if(state.phase==='waiting'){title='等待挑战者';sub='房间 '+state.code+' · 准备后开战';}else if(state.phase==='countdown'){title=String(Math.ceil(state.countdown));sub='准备交锋';}else if(state.phase==='over'&&!state.uiOverlay){title=state.winner===-1?'平局':(state.fighters[state.winner].type==='stick'?'火柴人':'叉叉怪')+' 获胜';sub='点击「准备再战」开启下一局';}
      if(title){c.fillStyle='#ece6d8d9';c.fillRect(330,157,540,103);this.text(title,600,204,33,'#2e382a','center');this.text(sub,600,235,13,'#717965','center');}
      this.text('荒原遗迹  /  风起，墨落。',600,534,12,'#596d51','center');
    }
  }
  root.InkDuelRenderer=Renderer;
  if(typeof module!=='undefined')module.exports={pose,lerpPose};
})(typeof window==='undefined'?globalThis:window);

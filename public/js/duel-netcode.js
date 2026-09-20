'use strict';
(function(root){
  const core=typeof module!=='undefined'&&module.exports?require('./duel-core'):root.InkDuelCore;
  const copy=f=>({...f,projectile:f.projectile?{...f.projectile}:null,mark:f.mark?{...f.mark}:null,input:{...f.input},previous:{...f.previous},pulses:{...f.pulses},attack:f.attack?{...f.attack}:null});
  class Predictor {
    constructor(){this.reset();}
    reset(){this.samples=[];this.inputs=[];this.state=null;this.at=0;this.correction=null;this.index=undefined;this.rtt=0;}
    input(seq,input,at){this.inputs.push({seq,input:{...input},at});if(this.inputs.length>256)this.inputs.shift();}
    receive(state,at){
      const previous=this.state;
      const before=previous&&this.index!==undefined?this.render(at,this.index,this.rtt):null;
      if(this.state&&(state.code!==this.state.code||state.round!==this.state.round))this.reset();
      this.state=state;this.at=at;this.samples.push({state,at});if(this.samples.length>10)this.samples.shift();
      this.inputs=this.inputs.filter(i=>at-i.at<2000);
      this.correction=null;
      if(before&&previous?.round===state.round&&previous?.phase===state.phase&&state.phase==='fight'&&!state.paused){
        const after=this.build(at,this.index,this.rtt),old=before.fighters[this.index],next=after.fighters[this.index];
        if(next.hp===old.hp&&next.down===old.down&&Math.abs(old.x-next.x)<100)this.correction={x:old.x-next.x,y:old.y-next.y,at};
      }
    }
    render(now,index,rtt=0){
      this.index=index;this.rtt=rtt;const out=this.build(now,index,rtt);
      if(this.correction&&out?.fighters[index]&&out.phase==='fight'&&!out.paused){
        const weight=Math.exp(-(now-this.correction.at)/65);
        out.fighters[index].x+=this.correction.x*weight;out.fighters[index].y=Math.max(0,out.fighters[index].y+this.correction.y*weight);
      }
      return out;
    }
    build(now,index,rtt=0){
      const state=this.state;if(!state||state.fighters.length<2)return state;
      const out={...state,fighters:state.fighters.map(copy),uiOverlay:true,localIndex:index};
      if(state.paused||now-this.at>500||state.phase!=='fight'||state.hitstop>0)return out;
      const local=out.fighters[index],enemy=out.fighters[1-index];
      const start=this.at-Math.min(100,Math.max(0,rtt/2));
      const horizon=Math.min(150,Math.max(0,now-start));
      const commands=this.inputs.filter(i=>i.seq>(state.ack?.[index]||0));let next=0;
      const simulation={effects:[],effectSerial:0};
      for(let elapsed=0;elapsed+1000/60<=horizon;elapsed+=1000/60){
        while(next<commands.length&&commands[next].at<=start+elapsed+1000/60){
          const command=commands[next++];local.pulses ||= {};
          for(const k of ['jump','dash','light','skill','special','ultimate'])if(command.input[k]&&!local.input[k])local.pulses[k]=true;
          local.input={...command.input};
        }
        core.advanceFighter(local,enemy,simulation);
        // Do not predict a shove or damage on the remote player.
        if(!local.down&&!enemy.down&&Math.abs(local.y-enemy.y)<75&&Math.abs(local.x-enemy.x)<66)local.x=enemy.x-(local.face||1)*66;
        local.x=Math.max(60,Math.min(1140,local.x));
      }
      // Remote motion interpolates one and a half packets behind the newest arrival.
      const target=now-50;
      for(let i=1;i<this.samples.length;i++){
        const a=this.samples[i-1],b=this.samples[i];if(a.at<=target&&b.at>=target){
          const u=(target-a.at)/Math.max(1,b.at-a.at),fa=a.state.fighters[1-index],fb=b.state.fighters[1-index];
          enemy.x=fa.x+(fb.x-fa.x)*u;enemy.y=fa.y+(fb.y-fa.y)*u;break;
        }
      }
      return out;
    }
  }
  if(typeof module!=='undefined'&&module.exports)module.exports={Predictor};else root.InkDuelPredictor=Predictor;
})(typeof window==='undefined'?globalThis:window);

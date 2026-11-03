import { pathToFileURL } from 'node:url';
const root = process.argv[2];
const imp = (f) => import(pathToFileURL(`${root}/host/src/games/kart/${f}`).href);
const T = await imp('track.js'), P = await imp('physics.js'), R = await imp('race.js'), AP = await imp('autopilot.js');
const track = T.buildTrack();
const DT = 1/60;
const wrap = (a)=>a-Math.PI*2*Math.round(a/(Math.PI*2));
// piece starts
let acc=0; const ranges={};
T.PIECES.forEach(p=>{const l=T.pieceLength(p); ranges[p.tag]={s0:acc,s1:acc+l,p}; acc+=l;});
const out=[];
for (const tag of ['t1','sLeft','sRight','hill','sweeper']) {
  const {s0,s1,p}=ranges[tag]; const dir=p.turn==='right'?1:-1;
  for (const mode of ['plain','drift','tap']) {
    // run-up: enter at start of piece, 20 m/s
    const fr=track.frameAt(s0+0.01);
    const k=P.createKart({id:'k',slot:{x:fr.x,y:0,z:fr.z,h:fr.h,s:s0,lateral:0}});
    Object.assign(k,{x:fr.x,z:fr.z,h:fr.h,s:s0,speed:20,vx:Math.cos(fr.h)*20,vz:Math.sin(fr.h)*20});
    let t=0,hits=0,maxSlip=0,maxLvl=0,maxLat=0,off=0,prevHit=false,minSpeed=99,steps=0,fireLevel=0,cancelled=false,wasSliding=false;
    const hw=p.width/2;
    let guard=0;
    while(k.s<s1 && guard++<60*60){
      const ap=AP.autopilotInput(track,k);
      let steer=ap.steer, drift=false;
      if(mode==='tap'){ if(k.drift.sliding){drift=Math.abs(k.lateral)<0.7*hw;} else {drift=Math.abs(k.lateral)<0.3*hw && ap.steer*dir>0.35;} steer=k.drift.sliding?ap.steer:dir*Math.max(0.35,Math.min(1,ap.steer*dir)); if(!drift) steer=ap.steer; }
      if(mode==='drift'){drift=true; steer = dir*Math.max(0.35, Math.min(1, ap.steer*dir)); if(k.drift.sliding) steer=ap.steer; }
      const v0=k.speed;
      P.stepKart(k,{steer,brake:0,drift,throttle:1},DT,track);
      t+=DT;
      if(k.drift.sliding) wasSliding=true;
      if(wasSliding && !k.drift.sliding && mode!=='plain' && !cancelled && k.s<s1-1){cancelled=true;}
      maxLvl=Math.max(maxLvl,k.drift.level);
      const vmag=Math.hypot(k.vx,k.vz); if(vmag>1){maxSlip=Math.max(maxSlip,Math.abs(wrap(Math.atan2(k.vz,k.vx)-k.h))*180/Math.PI);}
      maxLat=Math.max(maxLat,Math.abs(k.lateral)/hw);
      if(k.surface!=='road')off++;
      const hit = (v0-k.speed)>0.6 ; if(hit&&!prevHit)hits++; prevHit=hit;
      minSpeed=Math.min(minSpeed,k.speed);
    }
    // release
    let rel=null;
    if(mode!=='plain'){ P.stepKart(k,{steer:0,brake:0,drift:false,throttle:1},DT,track); rel={boostLevel:k.boostLevel,boost:+k.boost.toFixed(2)}; }
    out.push({piece:tag,mode,time:+t.toFixed(2),exitSpeed:+k.speed.toFixed(1),minSpeed:+minSpeed.toFixed(1),hits,maxSlipDeg:+maxSlip.toFixed(0),maxLevel:maxLvl,maxLatFrac:+maxLat.toFixed(2),offroadPct:+(100*off/(t/DT)).toFixed(0),driftCancelledMidCorner:cancelled,release:rel});
  }
}
console.table(out.map(o=>({...o,release:JSON.stringify(o.release)})));
// lap tests
function lap(mode){
  const race=R.createRace(track,[{id:'a',name:'a',color:1}]);
  while(race.phase==='countdown')R.stepRace(race,{},DT,track);
  let g=0,sliding=0,drifts=0,levels=[0,0,0,0],wall=0;
  const k=race.karts[0]; let prevS=0;
  while(race.phase!=='finished'&&g++<60*400){
    const ap=AP.autopilotInput(track,k);
    let inp={steer:ap.steer};
    if(mode!=='plain'){
      // find piece
      const s=((k.s%track.length)+track.length)%track.length;
      const nm=Object.entries(ranges).find(([n,r])=>s>=r.s0&&s<r.s1);
      const pc=nm[1].p;
      if(pc.kind==='arc'){const dir=pc.turn==='right'?1:-1; const hw=pc.width/2; const lat=Math.abs(k.lateral); inp.drift = k.drift.sliding ? lat<0.7*hw : (lat<0.3*hw && ap.steer*dir>0.35); inp.steer = (k.drift.sliding||!inp.drift)?ap.steer:dir*Math.max(0.35,Math.min(1,ap.steer*dir));}
      else inp.drift=false;
    }
    const was=k.drift.sliding, lv=k.drift.level;
    R.stepRace(race,{a:inp},DT,track);
    if(k.drift.sliding)sliding++; if(was&&!k.drift.sliding)levels[lv]++;
  }
  return {mode,lapTimes:k.lapTimes.map(x=>+x.toFixed(2)),slidingSecs:+(sliding*DT).toFixed(1),releasesByLevel:levels};
}
console.log(JSON.stringify(lap('plain')));
console.log(JSON.stringify(lap('tap')));

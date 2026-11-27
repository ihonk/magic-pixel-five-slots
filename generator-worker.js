/* Verify candidates by executing the production game in a worker, without drawing. */
importScripts('./vendor/three.r147.min.js', './level-core.js?v=locks-1');
const delay = setTimeout.bind(self);
const noop = () => {};
THREE.WebGLRenderer = class { setPixelRatio(){} setSize(){} setClearColor(){} render(){} };
function element(id) {
  const classes=new Set();
  return {id,style:{},textContent:'',innerHTML:'',classList:{add:(...xs)=>xs.forEach(x=>classes.add(x)),remove:(...xs)=>xs.forEach(x=>classes.delete(x)),contains:x=>classes.has(x)},addEventListener:noop,querySelector:()=>null,getBoundingClientRect:()=>({left:0,top:0,width:448,height:960})};
}
function canvas() {
  const gradient={addColorStop:noop};
  const drawing=new Proxy({}, {get:(_,key)=>key==='createLinearGradient'||key==='createRadialGradient'?()=>gradient:noop,set:()=>true});
  return {width:448,height:960,style:{},getContext:()=>drawing};
}
function load(level) {
  const elements=new Map([['gl',canvas()]]);
  self.document={body:element('body'),createElement:type=>type==='canvas'?canvas():element(type),getElementById:id=>{if(!elements.has(id))elements.set(id,element(id));return elements.get(id);}};
  self.window={innerWidth:448,innerHeight:960,devicePixelRatio:1,addEventListener:noop,__MF_CUSTOM_LEVEL:level,__MF_PLAY_LOCATION:{search:'?sim=0.001',hash:''},__MF_HEADLESS:true};
  self.requestAnimationFrame=noop;self.setTimeout=noop;self.clearTimeout=noop;
  importScripts('./game.js?v=locks-1');
  return window.__mf;
}
function verify(level,variant=0) {
  const game=load(level), total=game.grid.filter(c=>c.alive).length;
  const actions=[], samples=[], cleared=[];let lastAlive=total,lastDispatch=-99,peak=0;
  const rng=MFLevel.random(level.generation.seed+':policy:'+variant);
  for(let frame=1;frame<=60*360;frame++) {
    const t=frame/60;game.step(1/60,t);
    const alive=game.grid.filter(c=>c.alive).length;
    const progress=1-alive/total;
    if(alive!==lastAlive) { cleared.push({progress,pixels:lastAlive-alive,time:+t.toFixed(3)});lastAlive=alive; }
    peak=Math.max(peak,game.state.slots.filter(Boolean).length);
    if(frame%30===0&&alive>0)samples.push({progress,pressure:MFLevel.pressure(game)});
    if(game.state.over) {
      if(alive||!game.isBoardCleared())return null;
      const measured=MFLevel.profileFromSamples(samples);
      return {status:'passed',engine:'production-game-60hz',seconds:+t.toFixed(2),peakOccupancy:peak,actions,samples,measured,cleared,usedRevives:0};
    }
    if(t-lastDispatch<.4||game.state.pendingBoarding||game.state.rearranging)continue;
    const choices=game.state.queue.filter(w=>game.boardingStatus(w).ok);
    // Prefer a head whose colour is currently exposed; legal buffered moves
    // remain available when all heads are covered. No queue rules are bypassed.
    const exposed=new Set();for(let x=0;x<36;x++){const target=game.attackTarget(x);if(target&&target.available)exposed.add(target.color);}
    if(variant===2&&game.state.slots.some(w=>w&&w.mesh.userData.charges>0&&exposed.has(w.mesh.userData.colorKey)))continue;
    const ranked=choices.map(w=>({w,score:(exposed.has(w.mesh.userData.colorKey)?3:0)+(w.partner&&exposed.has(w.partner.mesh.userData.colorKey)?1:0)+rng()*(variant?.9:.2)})).sort((a,b)=>b.score-a.score);
    for(const {w} of ranked)if(game.send(w)){actions.push({time:+t.toFixed(6),id:w.id});lastDispatch=t;break;}
  }
  return null;
}
function fit(verification,target) {
  const m=verification.measured.map(v=>v/100),mean=m.reduce((a,b)=>a+b)/6,tm=target.reduce((a,b)=>a+b)/6;
  const shape=m.reduce((sum,v,i)=>sum+Math.abs((v-mean)-(target[i]-tm)),0)/6;
  return shape*.75+Math.abs(mean-tm)*.25;
}
self.onmessage=async function (event) {
  const {options}=event.data;
  try {
    let best=null,bestError=Infinity,passed=0,matched=0;
    const attempts=Math.min(48,12+Number(options.locks||0)*12);
    for(let attempt=0;attempt<attempts;attempt++) {
      postMessage({type:'progress',attempt:attempt+1,total:attempts,passed});
      const level=MFLevel.generateCandidate(options,attempt);
      const verified=verify(level,attempt%3);
      if(verified) {
        passed++;if(!MFLevel.matchesRhythm(verified.measured,level.generation.rhythm))continue;
        matched++;const error=fit(verified,level.generation.target);
        if(error<bestError){bestError=error;best={...level,verification:verified};}
      }
      await new Promise(resolve=>delay(resolve,0));
    }
    if(!best)throw Error('这组参数未找到同时通过通关和节奏趋势检查的候选。请换一个种子或调整绑定对数。');
    best.generation.candidates=attempts;best.generation.passedCandidates=passed;best.generation.rhythmMatchedCandidates=matched;
    best.generation.fitError=+bestError.toFixed(3);
    postMessage({type:'result',level:best});
  } catch(error) { postMessage({type:'error',message:error.message}); }
};

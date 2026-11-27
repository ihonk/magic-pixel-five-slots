/* Shared, dependency-free level generation and validation. */
(function (root) {
  'use strict';
  const COLORS = ['R','B','G','Y','P'], SIZE = 36;
  function random(seed) {
    let n=2166136261; for (const c of String(seed)) n=Math.imul(n^c.charCodeAt(0),16777619);
    return function () { n+=0x6D2B79F5; let t=n; t=Math.imul(t^t>>>15,t|1); t^=t+Math.imul(t^t>>>7,t|61); return ((t^t>>>14)>>>0)/4294967296; };
  }
  function shuffle(a,rng) { a=a.slice(); for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; }
  function components(map) {
    const seen=new Set(), out=[];
    for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++) {
      const k=y*SIZE+x, color=map[y][x]; if(color==='.'||seen.has(k))continue;
      const cells=[k]; seen.add(k);
      for(let h=0;h<cells.length;h++){
        const key=cells[h],cx=key%SIZE,cy=Math.floor(key/SIZE);
        for(const [nx,ny] of [[cx-1,cy],[cx+1,cy],[cx,cy-1],[cx,cy+1]]) {
          const nk=ny*SIZE+nx;
          if(nx>=0&&nx<SIZE&&ny>=0&&ny<SIZE&&!seen.has(nk)&&map[ny][nx]===color){seen.add(nk);cells.push(nk);}
        }
      }
      out.push({color,cells});
    }
    return out;
  }
  function validateLevel(raw) {
    if(!raw||typeof raw!=='object')throw Error('关卡必须是 JSON 对象');
    if(raw.version!==1)throw Error('不支持的关卡版本，需要 version: 1');
    if(!Array.isArray(raw.map)||raw.map.length!==36||raw.map.some(r=>typeof r!=='string'||r.length!==36||/[^.RBGYP]/.test(r)))throw Error('地图必须是 36×36，仅支持 . R B G Y P');
    const groups=components(raw.map); if(!groups.length)throw Error('地图不能是空白');
    if(!Array.isArray(raw.lanes)||raw.lanes.length!==3)throw Error('必须提供三列法师 lanes');
    let count=0;const ammo={};
    const lanes=raw.lanes.map(lane=>{
      if(!Array.isArray(lane)||lane.length>48)throw Error('每列最多 48 名法师');
      return lane.map(w=>{
        if(!w||!COLORS.includes(w.color)||!Number.isInteger(w.charges)||w.charges<1||w.charges>5)throw Error('法师颜色不合法或弹药不在 1–5 之间');
        count++;ammo[w.color]=(ammo[w.color]||0)+w.charges;return {color:w.color,charges:w.charges};
      });
    });
    if(count<1||count>96)throw Error('法师总数需要在 1–96 之间');

    const occupied=new Set(),ids=new Set();
    if(raw.links!==undefined&&!Array.isArray(raw.links))throw Error('links 必须是数组');
    const links=(raw.links||[]).map(link=>{
      if(!link||typeof link.id!=='string'||!/^[A-Z0-9]{1,6}$/.test(link.id)||ids.has(link.id))throw Error('绑定编号需为不重复的 1–6 位大写字母或数字');
      ids.add(link.id);
      if(!Array.isArray(link.members)||link.members.length!==2)throw Error('绑定必须恰有两位成员');
      const members=link.members.map(pos=>{
        if(!Array.isArray(pos)||pos.length!==2||!Number.isInteger(pos[0])||!Number.isInteger(pos[1])||pos[0]<0||pos[0]>2||pos[1]<0||!lanes[pos[0]][pos[1]])throw Error('绑定成员坐标不存在');
        const key=pos.join(':');if(occupied.has(key))throw Error('同一法师不能重复绑定');occupied.add(key);return pos.slice();
      });
      if(members[0][0]===members[1][0])throw Error('绑定成员必须来自不同列');
      return {id:link.id,members};
    });
    if(raw.locks!==undefined&&!Array.isArray(raw.locks))throw Error('locks 必须是数组');
    if((raw.locks||[]).length>4)throw Error('最多设置 4 个锁区');
    const lockCells=new Set(),lockIds=new Set();
    const locks=(raw.locks||[]).map(lock=>{
      if(!lock||typeof lock.id!=='string'||!/^[A-Z0-9]{1,6}$/.test(lock.id)||lockIds.has(lock.id))throw Error('锁区编号必须唯一且为 1–6 位大写字母或数字');
      lockIds.add(lock.id);
      for(const key of ['x','y','width','height','hits'])if(!Number.isInteger(lock[key]))throw Error('锁区坐标、尺寸与命中次数必须是整数');
      if(lock.x<0||lock.y<0||lock.width<1||lock.width>6||lock.height<1||lock.height>6||lock.x+lock.width>36||lock.y+lock.height>36)throw Error('锁区超出棋盘或尺寸不在 1–6 格之间');
      if(!COLORS.includes(lock.color)||lock.hits<1||lock.hits>3)throw Error('锁颜色不合法或数字不在 1–3 之间');
      let pixels=0;
      for(let y=lock.y;y<lock.y+lock.height;y++)for(let x=lock.x;x<lock.x+lock.width;x++){
        const key=y*36+x;if(lockCells.has(key))throw Error('锁区不能相互重叠');lockCells.add(key);if(raw.map[y][x]!=='.')pixels++;
      }
      if(!pixels)throw Error('锁区必须覆盖至少一个像素');
      return {id:lock.id,x:lock.x,y:lock.y,width:lock.width,height:lock.height,color:lock.color,hits:lock.hits};
    });
    for(const color of COLORS){
      const required=groups.filter(g=>g.color===color).length+locks.filter(l=>l.color===color).reduce((sum,l)=>sum+l.hits,0);
      if((ammo[color]||0)<required)throw Error('颜色 '+color+' 的弹药不足以清空像素和解锁');
    }
    return {version:1,name:String(raw.name||'生成关卡').slice(0,48),map:raw.map.slice(),lanes,links,locks};
  }
  function profile(difficulty,rhythm) {
    const base={easy:.26,normal:.50,hard:.75}[difficulty];if(base===undefined)throw Error('未知难度');
    if(!['rising','falling','alternating','steady'].includes(rhythm))throw Error('未知难度节奏');
    return Array.from({length:6},(_,i)=>{
      const delta=rhythm==='rising'?(i/5-.5)*.46:rhythm==='falling'?(.5-i/5)*.46:rhythm==='alternating'?(i%2?-.20:.20):0;
      return Math.max(.05,Math.min(.95,base+delta));
    });
  }
  function exposedGroups(map) {
    const groups=components(map), index=new Map();groups.forEach(g=>g.cells.forEach(k=>index.set(k,g)));
    const visible=new Set(); for(let x=0;x<36;x++)for(let y=35;y>=0;y--)if(map[y][x]!=='.'){visible.add(index.get(y*36+x));break;}
    return [...visible];
  }
  function generateCandidate(options={},attempt=0) {
    const difficulty=options.difficulty||'normal', rhythm=options.rhythm||'rising', seed=String(options.seed||'MAGIC-01').slice(0,80);
    const requested=Number(options.pairs===undefined?1:options.pairs);
    const lockCount=Number(options.locks===undefined?0:options.locks),lockHits=Number(options.lockHits===undefined?2:options.lockHits),lockColor=options.lockColor||'random';
    if(!Number.isInteger(lockCount)||lockCount<0||lockCount>4||!Number.isInteger(lockHits)||lockHits<1||lockHits>3||!(lockColor==='random'||COLORS.includes(lockColor)))throw Error('锁区参数不合法');
    if(!Number.isInteger(requested)||requested<0||requested>4)throw Error('绑定数量需要在 0–4 之间');
    const target=profile(difficulty,rhythm),rng=random(seed+':'+attempt),palette=shuffle(COLORS,rng).slice(0,difficulty==='easy'?3:difficulty==='normal'?4:5);
    const map=Array.from({length:36},()=>Array(36).fill('.'));
    for(let stage=0;stage<6;stage++) {
      const p=target[stage],bottom=35-stage*6,layers=p>.65?[[bottom-4,bottom-4],[bottom-2,bottom-2],[bottom,bottom]]:p>.36?[[bottom-4,bottom-4],[bottom-1,bottom]]:[[bottom-2,bottom]];
      for(const [top,low] of layers) {
        const segments=Math.max(1,Math.min(palette.length,Math.round(2+p*2+(rng()-.5))));
        const cuts=[3]; for(let i=1;i<segments;i++)cuts.push(3+Math.round(i*30/segments+(rng()-.5)*3));cuts.push(33);cuts.sort((a,b)=>a-b);
        const colors=shuffle(palette,rng);
        for(let i=0;i<segments;i++)for(let y=top;y<=low;y++)for(let x=cuts[i];x<cuts[i+1];x++)map[y][x]=colors[i];
      }
    }
    const locks=[],used=new Set();
    for(let n=0;n<lockCount;n++){
      const stageFor=k=>Math.max(0,Math.min(5,Math.floor((35-Math.floor(k/36))/6)));
      const choices=shuffle(components(map).flatMap(g=>g.cells),rng).sort((a,b)=>target[stageFor(b)]-target[stageFor(a)]);let placed=false;
      for(const cell of choices){
        const x=Math.max(0,Math.min(32,cell%36-1)),y=Math.max(0,Math.min(33,Math.floor(cell/36)-1)),width=4,height=3;
        const cells=[];for(let yy=y;yy<y+height;yy++)for(let xx=x;xx<x+width;xx++)cells.push(yy*36+xx);
        if(cells.some(k=>used.has(k)))continue;
        cells.forEach(k=>used.add(k));locks.push({id:'L'+(n+1),x,y,width,height,color:lockColor==='random'?palette[Math.floor(rng()*palette.length)]:lockColor,hits:lockHits});placed=true;break;
      }
      if(!placed)throw Error('没有足够空间放置锁区');
    }
    // Construct queues with both lock-opening shots and normal pixel shots.
    // The worker still replays the production game to certify a winning path.
    const working=map.map(r=>r.slice()), trace=[],active=locks.map(l=>({...l,remaining:l.hits}));let removed=0;
    const total=map.flat().filter(c=>c!=='.').length;
    while(removed<total){
      const blocked=new Map();active.filter(l=>l.remaining>0).forEach(l=>{for(let y=l.y;y<l.y+l.height;y++)for(let x=l.x;x<l.x+l.width;x++)blocked.set(y*36+x,l);});
      const free=working.map((row,y)=>row.map((color,x)=>blocked.has(y*36+x)?'.':color));
      const index=new Map();components(free).forEach(group=>group.cells.forEach(k=>index.set(k,group)));
      const choices=new Map();
      for(let x=0;x<36;x++)for(let y=35;y>=0;y--){
        const k=y*36+x,lock=blocked.get(k);
        if(lock){choices.set(lock,{lock,color:lock.color,cells:[],bottom:y});break;}
        if(working[y][x]!=='.'){const group=index.get(k);choices.set(group,{...group,bottom:Math.max(...group.cells.map(i=>Math.floor(i/36)))});break;}
      }
      const g=shuffle([...choices.values()],rng).sort((a,b)=>b.bottom-a.bottom)[0];
      if(!g)throw Error('关卡构造没有可达目标');
      trace.push({color:g.color,progress:removed/total,cells:g.cells.length,lock:!!g.lock});
      if(g.lock)g.lock.remaining--;else{for(const k of g.cells)working[Math.floor(k/36)][k%36]='.';removed+=g.cells.length;}
    }
    const units=[];
    // Locks can split one original colour component into several separately
    // removable pieces. Budget the atomic outside/inside pieces so shot order
    // cannot exhaust a colour needed for a remaining lock or protected fragment.
    const atomic=components(map.map((row,y)=>row.map((c,x)=>used.has(y*36+x)?'.':c)));
    for(const lock of locks)atomic.push(...components(map.map((row,y)=>row.map((c,x)=>x>=lock.x&&x<lock.x+lock.width&&y>=lock.y&&y<lock.y+lock.height?c:'.'))));
    for(const color of COLORS){
      const required=atomic.filter(g=>g.color===color).length+locks.filter(l=>l.color===color).reduce((sum,l)=>sum+l.hits,0);
      const hits=trace.map((hit,index)=>({...hit,index})).filter(hit=>hit.color===color);
      while(hits.length<required)hits.push({...hits[hits.length-1],index:trace.length+hits.length});
      // Pool future shots of the same colour. Balance the final remainder
      // across carriers instead of producing a long tail of one-shot wizards.
      const count=Math.ceil(hits.length/5),base=Math.floor(hits.length/Math.max(1,count));
      let cursor=0;
      for(let i=0;i<count;i++){
        const charges=base+(i<hits.length%count?1:0),first=hits[cursor];
        units.push({color,charges,progress:first.progress,order:first.index});cursor+=charges;
      }
    }
    units.sort((a,b)=>a.order-b.order);
    while(units.length<requested*2){
      const index=units.reduce((best,u,i)=>u.charges>units[best].charges?i:best,0),unit=units[index];
      if(!unit||unit.charges<2)throw Error('当前地图无法容纳指定数量的绑定对');
      const charges=Math.floor(unit.charges/2);unit.charges-=charges;
      units.splice(index+1,0,{...unit,charges});
    }
    let prevLane=Math.floor(rng()*3);
    for(let i=0;i<units.length;i++) {
      const p=target[Math.min(5,Math.floor(units[i].progress*6))];
      units[i].lane=rng()<p*.65?prevLane:(prevLane+1+Math.floor(rng()*2))%3;prevLane=units[i].lane;
    }
    const candidates=shuffle(Array.from({length:Math.max(0,units.length-1)},(_,i)=>i),rng).sort((a,b)=>target[Math.min(5,Math.floor(units[b].progress*6))]-target[Math.min(5,Math.floor(units[a].progress*6))]);
    let pairCount=0;
    for(const i of candidates)if(pairCount<requested&&!units[i].pair&&!units[i+1].pair){
      if(units[i].lane===units[i+1].lane)units[i+1].lane=(units[i].lane+1+Math.floor(rng()*2))%3;
      const id=String.fromCharCode(65+pairCount++);units[i].pair=units[i+1].pair=id;
    }
    while(pairCount<requested){
      const free=units.filter(u=>!u.pair);if(free.length<2)break;
      if(free[0].lane===free[1].lane)free[1].lane=(free[0].lane+1+Math.floor(rng()*2))%3;
      const id=String.fromCharCode(65+pairCount++);free[0].pair=free[1].pair=id;
    }
    if(pairCount!==requested)throw Error('当前地图无法容纳指定数量的绑定对');
    const lanes=[[],[],[]],links=[];
    for(const u of units){u.row=lanes[u.lane].length;lanes[u.lane].push({color:u.color,charges:u.charges});}
    for(let i=0;i<pairCount;i++){const id=String.fromCharCode(65+i);links.push({id,members:units.filter(u=>u.pair===id).map(u=>[u.lane,u.row])});}
    const clean=validateLevel({version:1,name:'工坊 · '+({easy:'轻松',normal:'标准',hard:'挑战'}[difficulty])+' · '+seed,map:map.map(r=>r.join('')),lanes,links,locks});
    return {...clean,generation:{seed,attempt,difficulty,rhythm,target,requestedPairs:requested,locks:lockCount,lockHits,lockColor},stats:{pixels:total,components:components(map).length,lockShots:lockCount*lockHits,wizards:units.length}};
  }
  function pressure(game) {
    const g=game.grid,heads=game.state.queue.filter(w=>game.isGroundHead(w)),colors=new Set(),allColors=new Set(g.filter(c=>c.alive).map(c=>c.color));
    if(game.attackTarget)for(let x=0;x<36;x++){const target=game.attackTarget(x);if(target&&target.available)colors.add(target.color);}
    else for(let x=0;x<36;x++)for(let y=35;y>=0;y--)if(g[y*36+x].alive){colors.add(g[y*36+x].color);break;}
    if(game.locks)game.locks.filter(l=>l.remaining>0).forEach(l=>allColors.add(l.color));
    const blocked=heads.filter(w=>!colors.has(w.mesh.userData.colorKey)||(w.partner&&!game.isGroundHead(w.partner))).length/Math.max(1,heads.length);
    const occupied=game.state.slots.filter(Boolean),waiting=occupied.filter(w=>w.mesh.userData.charges===0).length;
    // Local obstruction depth is measured from the live grid, not the requested
    // curve. Looking only six rows ahead avoids counting the whole future board
    // as opening difficulty, and can distinguish late multi-layer modules.
    const liveMap=Array.from({length:36},(_,y)=>Array.from({length:36},(_,x)=>g[y*36+x].alive?g[y*36+x].color:'.'));
    const index=new Map();components(liveMap).forEach((group,id)=>group.cells.forEach(k=>index.set(k,id)));
    let depth=0,columns=0;
    for(let x=0;x<36;x++)for(let y=35;y>=0;y--)if(g[y*36+x].alive){
      const near=new Set();for(let j=y;j>=Math.max(0,y-5);j--)if(index.has(j*36+x))near.add(index.get(j*36+x));
      depth+=Math.min(1,(near.size-1)/2);columns++;break;
    }
    const localDepth=depth/Math.max(1,columns);
    return Math.round(100*(.30*blocked+.15*occupied.length/5+.10*(1-colors.size/Math.max(1,allColors.size))+.10*waiting/Math.max(1,occupied.length)+.35*localDepth));
  }
  function profileFromSamples(samples) {
    const bins=Array.from({length:6},()=>[]);for(const s of samples)bins[Math.min(5,Math.floor(s.progress*6))].push(s.pressure);
    const global=samples.reduce((a,s)=>a+s.pressure,0)/Math.max(1,samples.length);
    return bins.map(b=>Math.round(b.length?b.sort((a,c)=>a-c)[Math.floor((b.length-1)*.75)]:global));
  }
  function matchesRhythm(measured,rhythm) {
    const early=(measured[0]+measured[1])/2,late=(measured[4]+measured[5])/2;
    if(rhythm==='rising')return late>=early+3;
    if(rhythm==='falling')return early>=late+3;
    if(rhythm==='alternating')return (measured[0]+measured[2]+measured[4])/3>=(measured[1]+measured[3]+measured[5])/3+3;
    return Math.max(...measured)-Math.min(...measured)<=40;
  }
  const api={COLORS,random,components,validateLevel,profile,generateCandidate,pressure,profileFromSamples,matchesRhythm};
  root.MFLevel=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);

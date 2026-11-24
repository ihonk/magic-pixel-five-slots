import * as THREE from './three.module.js';
const $=id=>document.getElementById(id), COLORS={P:'#f056a8',C:'#40dbdd',Y:'#ffd25e',V:'#9368f4',O:'#ff8c4d'};
function spiral(){const g=Array.from({length:12},(_,y)=>Array.from({length:12},(_,x)=>{const d=Math.min(x,y,11-x,11-y);return d<2?'C':d<4?'P':'Y';}).join(''));return g;}
const levels=[
 {name:'彩虹同心环',rows:spiral(),queues:[['C','P','Y','C','P'],['P','Y','C','Y','P'],['Y','C','P','C','Y'],['C','Y','P','Y','C']]},
 {name:'霓虹之星',rows:[
 '....CC......','....CC......','....CC......','CCCCCCCCC...','.CCYYYYCC...','..CYYYYC....','..CPPPPC....','.CCPPPPCC...','CCPPPPPPCC..','CPOOOOOPPC..','COOOOOOOC...','OOOOOOOOOO..'],queues:[['O','P','C','Y','O'],['C','Y','P','O','C'],['P','O','Y','C','P'],['Y','C','O','P','Y']]},
 {name:'甜甜圈',rows:[
 '....VVVV....','..VVPPPPVV..','.VPPPPPPPPV.','VPPPPPPPPPPV','VPPYYYYYYPPV','VPPYY..YYPPV','VPPY....YPPV','VPPY....YPPV','VPPYY..YYPPV','VPPYYYYYYPPV','.VPPPPPPPPV.','..VVPPPPVV..'],queues:[['V','P','Y','V','P'],['P','Y','V','P','Y'],['Y','V','P','Y','V'],['P','V','Y','P','V']]}
];
let levelIndex=0,grid=[],slots=[],queues=[],busy=false,done=false,meshes=new Map(),effects=[],bolts=[],sparks=[],rings=[],renderer,scene,camera,boardGroup,clock=new THREE.Clock(),pending=null,activeSlot=-1,combo=0;
const wrap=$('boardWrap');scene=new THREE.Scene();scene.background=new THREE.Color('#474454');camera=new THREE.OrthographicCamera(-7.7,7.7,7.7,-7.7,.1,100);camera.position.set(0,-5,22);camera.lookAt(0,0,0);renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.setSize(wrap.clientWidth,wrap.clientHeight);wrap.append(renderer.domElement);scene.add(new THREE.AmbientLight(0xffffff,1.8));const light=new THREE.DirectionalLight(0xffffff,2.8);light.position.set(-4,9,12);scene.add(light);const lilac=new THREE.PointLight(0xa86bff,70);lilac.position.set(5,3,8);scene.add(lilac);boardGroup=new THREE.Group();scene.add(boardGroup);
// Bevelled candy-like tiles catch a narrow highlight, rather than looking like raw cubes.
const tileShape=new THREE.Shape();tileShape.moveTo(-.39,-.39);tileShape.lineTo(.39,-.39);tileShape.lineTo(.39,.39);tileShape.lineTo(-.39,.39);tileShape.closePath();
const geo=new THREE.ExtrudeGeometry(tileShape,{depth:.18,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:.065,bevelThickness:.065});
function glowTexture(){const canvas=document.createElement('canvas');canvas.width=canvas.height=128;const ctx=canvas.getContext('2d'),g=ctx.createRadialGradient(64,64,0,64,64,64);g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.12,'rgba(255,255,255,.95)');g.addColorStop(.32,'rgba(255,255,255,.4)');g.addColorStop(.65,'rgba(255,255,255,.08)');g.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=g;ctx.fillRect(0,0,128,128);return new THREE.CanvasTexture(canvas);}
const glowMap=glowTexture(),beamGeo=new THREE.PlaneGeometry(1,1);
function glow(position,color,size,opacity=1){const mesh=new THREE.Sprite(new THREE.SpriteMaterial({map:glowMap,color,transparent:true,opacity,depthTest:false,depthWrite:false,blending:THREE.AdditiveBlending}));mesh.position.copy(position);mesh.scale.set(size,size,1);mesh.renderOrder=5;scene.add(mesh);return mesh;}
const material={};for(const [key,value] of Object.entries(COLORS))material[key]=new THREE.MeshStandardMaterial({color:value,roughness:.42,metalness:0,emissive:value,emissiveIntensity:.06});
const base=new THREE.Mesh(new THREE.BoxGeometry(12.8,12.8,.4),new THREE.MeshStandardMaterial({color:'#494654',roughness:.7,metalness:.05}));base.position.z=-.36;boardGroup.add(base);
function size(){const w=wrap.clientWidth,h=wrap.clientHeight;renderer.setSize(w,h);const aspect=w/h;const vertical=Math.max(7.1,7.1/aspect);camera.left=-vertical*aspect;camera.right=vertical*aspect;camera.top=vertical;camera.bottom=-vertical;camera.updateProjectionMatrix();}new ResizeObserver(size).observe(wrap);size();
function validRows(rows){if(rows.length!==12||rows.some(r=>r.length!==12||/[^.PCYVO]/.test(r)))throw Error('Invalid board data');}
function makeLevel(index){levelIndex=index;const l=levels[index];validRows(l.rows);grid=l.rows.map(r=>[...r].map(v=>v==='.'?null:v));slots=Array(5).fill(null);queues=l.queues.map(q=>q.map(c=>({color:c,charges:3})));if(pending)clearTimeout(pending);busy=false;done=false;pending=null;activeSlot=-1;combo=0;clearFX();$('modal').hidden=true;$('levelText').textContent=`第 ${index+1} 关`;$('boardLabel').textContent=l.name;for(const m of meshes.values())boardGroup.remove(m);meshes.clear();effects=[];for(let y=0;y<12;y++)for(let x=0;x<12;x++)if(grid[y][x]){const mesh=new THREE.Mesh(geo,material[grid[y][x]]);mesh.position.set(x-5.5,5.5-y,.09);mesh.userData.baseZ=.09;mesh.castShadow=false;boardGroup.add(mesh);meshes.set(`${x},${y}`,mesh);}toast('点下方队首巫师，打开颜色通路');renderUI();}
function bottomExposed(){const cells=[];for(let x=0;x<12;x++)for(let y=11;y>=0;y--)if(grid[y][x]){cells.push([x,y]);break;}return cells;}
function component(x,y){const color=grid[y][x],seen=new Set([`${x},${y}`]),stack=[[x,y]],out=[];while(stack.length){const [cx,cy]=stack.pop();out.push([cx,cy]);for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=cx+dx,ny=cy+dy,k=`${nx},${ny}`;if(nx>=0&&nx<12&&ny>=0&&ny<12&&!seen.has(k)&&grid[ny][nx]===color){seen.add(k);stack.push([nx,ny]);}}}return out;}
function target(color){const cells=bottomExposed().filter(([x,y])=>grid[y][x]===color);if(!cells.length)return null;let best=null;for(const [x,y] of cells){const group=component(x,y);if(!best||group.length>best.cells.length)best={cells:group,seed:[x,y]};}return best;}
function remaining(){return grid.flat().filter(Boolean).length;}
function renderUI(){const count=slots.filter(Boolean).length;$('slotCount').textContent=`施法栏位 ${count} / 5`;$('progress').textContent=`剩余像素 · ${remaining()}`;$('slots').replaceChildren();slots.forEach((w,i)=>{const el=document.createElement('div');el.className='slot'+(i===activeSlot?' casting':'');if(w){const orb=document.createElement('div');orb.className='orb';orb.style.background=COLORS[w.color];orb.textContent=w.color;const num=document.createElement('span');num.className='count';num.textContent=w.charges;orb.append(num);el.append(orb);}else el.textContent=i+1;$('slots').append(el);});$('queues').replaceChildren();queues.forEach((q,i)=>{const b=document.createElement('button');b.type='button';b.className='queue';b.disabled=!q.length||done;const face=document.createElement('div');face.className='queue-face';if(q.length){const orb=document.createElement('div');orb.className='orb';orb.style.background=COLORS[q[0].color];orb.textContent=q[0].charges;face.append(orb);for(const w of q.slice(1,3)){const n=document.createElement('div');n.className='next';n.style.background=COLORS[w.color];face.append(n);}}else face.textContent='—';b.append(face);const label=document.createElement('small');label.textContent=`队列 ${i+1} · ${q.length}名`;b.append(label);b.onclick=()=>dispatch(i);$('queues').append(b);});}
function toast(t){$('toast').textContent=t;}
function dispatch(i){if(done)return;if(busy){toast('正在施法，请稍候');return;}const slot=slots.findIndex(s=>!s);if(slot<0){toast('五个栏位都满了');return;}const w=queues[i].shift();if(!w)return;slots[slot]=w;renderUI();toast(`${w.color} 色巫师入位`);schedule();}
function schedule(){if(pending)clearTimeout(pending);pending=setTimeout(step,230);}
function clearFX(){for(const item of [...bolts,...sparks,...rings]){scene.remove(item.mesh);item.mesh.material.dispose();}for(const e of effects){boardGroup.remove(e.mesh);if(e.mesh.material!==material[e.color])e.mesh.material.dispose();}bolts=[];sparks=[];rings=[];effects=[];}
function cellPos([x,y]){return new THREE.Vector3(x-5.5,5.5-y,.7);}
function castFX(slotIndex,color,seed,duration){
 const start=new THREE.Vector3(-4.8+slotIndex*2.4,-7.05,1.1),end=cellPos(seed);
 // A translucent textured ribbon has no hard cylinder silhouette.
 const beam=new THREE.Mesh(beamGeo,new THREE.MeshBasicMaterial({map:glowMap,color:0xffedb0,transparent:true,opacity:0,depthTest:false,depthWrite:false,blending:THREE.AdditiveBlending}));
 beam.renderOrder=4;scene.add(beam);bolts.push({mesh:beam,start,end,t:0,lifetime:duration,width:.09});
 const source=glow(start,0xffdc65,.9,.7);rings.push({mesh:source,t:0,lifetime:duration,size:.9,source:true});
}
function spawnSpark(position,color,count=3){for(let k=0;k<count;k++){const size=.065+Math.random()*.1,m=glow(position,k%2?COLORS[color]:0xfff7d8,size,.9),a=Math.random()*Math.PI*2,v=.5+Math.random()*1.1;sparks.push({mesh:m,t:0,lifetime:.18+Math.random()*.18,vx:Math.cos(a)*v,vy:Math.sin(a)*v+.5,vz:.1,size});}}
function impact(position,color){
 const halo=glow(position,0xffdc81,1.55,.8),core=glow(position,0xfff9e8,.72,1);
 rings.push({mesh:halo,t:0,lifetime:.19,size:1.55},{mesh:core,t:0,lifetime:.13,size:.72});
 spawnSpark(position,color);
}
function waveDistances(seed,cells){const allowed=new Set(cells.map(([x,y])=>`${x},${y}`)),seen=new Set([seed.join(',')]),queue=[[...seed,0]],out=[];for(let i=0;i<queue.length;i++){const [x,y,d]=queue[i];out.push({x,y,d});for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy,key=`${nx},${ny}`;if(allowed.has(key)&&!seen.has(key)){seen.add(key);queue.push([nx,ny,d+1]);}}}return out;}
function step(){pending=null;if(done)return;let move=null;for(let i=0;i<5;i++)if(slots[i]){const t=target(slots[i].color);if(t){move={i,...t};break;}}
 if(move){busy=true;activeSlot=move.i;const w=slots[move.i],color=w.color;const wave=waveDistances(move.seed,move.cells),maxD=Math.max(...wave.map(c=>c.d));const spacing=Math.min(.036,.75/Math.max(maxD,1));castFX(move.i,color,move.seed,.16+maxD*spacing);
 for(const {x,y,d} of wave){grid[y][x]=null;const mesh=meshes.get(`${x},${y}`);if(mesh){meshes.delete(`${x},${y}`);mesh.material=material[color].clone();mesh.material.transparent=true;effects.push({mesh,color,t:-.09-d*spacing,lifetime:.14,started:false,x:mesh.position.x,y:mesh.position.y});}}
 w.charges--;if(w.charges===0)slots[move.i]=null;combo++;toast(`${move.cells.length} 格连锁消除${combo>1?' · 连击 '+combo:''}`);renderUI();const wait=400+maxD*spacing*1000;
 pending=setTimeout(()=>{busy=false;activeSlot=-1;if(!remaining()){done=true;renderUI();modal('画面清空！',`完成了 ${levels[levelIndex].name}。`,levelIndex<levels.length-1?'下一关':'再玩一轮');}else step();},wait);return;}
 busy=false;activeSlot=-1;combo=0;renderUI();if(slots.every(Boolean)){done=true;modal('栏位已满','所有巫师暂时都没有可攻击的颜色。调整派遣顺序，再试一次。','重试本关');}else if(queues.every(q=>!q.length)){done=true;modal('巫师用完了','画板还有像素，试试新的派遣顺序。','重试本关');}else toast('等待派遣：观察每列底部露出的颜色');}
function modal(title,body,action){$('modalTitle').textContent=title;$('modalBody').textContent=body;$('modalAction').textContent=action;$('modal').hidden=false;}
$('modalAction').onclick=()=>makeLevel(remaining()===0?(levelIndex+1)%levels.length:levelIndex);$('resetBtn').onclick=()=>makeLevel(levelIndex);$('helpBtn').onclick=()=>{$('help').hidden=false};$('closeHelp').onclick=()=>{$('help').hidden=true};
function animate(){requestAnimationFrame(animate);const delta=Math.min(clock.getDelta(),.05);
 for(const e of effects){e.t+=delta;if(e.t<0)continue;
  if(!e.started){e.started=true;const hit=e.mesh.position.clone().add(new THREE.Vector3(0,0,.7));impact(hit,e.color);for(const beam of bolts)beam.end.copy(hit);}
  const p=Math.min(e.t/e.lifetime,1),shrink=1-Math.pow(p,3);e.mesh.scale.set(Math.max(.001,shrink),Math.max(.001,shrink),Math.max(.001,1-p*.4));e.mesh.position.z=e.mesh.userData.baseZ+.12*Math.sin(p*Math.PI);e.mesh.material.emissiveIntensity=.06+Math.sin(p*Math.PI)*.9;e.mesh.material.opacity=1-p*p;
  if(p>=1){boardGroup.remove(e.mesh);e.mesh.material.dispose();}
 }effects=effects.filter(e=>e.t<e.lifetime);
 for(const e of bolts){e.t+=delta;const p=e.t/e.lifetime,dir=e.end.clone().sub(e.start);e.mesh.position.copy(e.start).addScaledVector(dir,.5);e.mesh.rotation.z=Math.atan2(dir.y,dir.x)-Math.PI/2;e.mesh.scale.set(e.width,dir.length(),1);e.mesh.material.opacity=.44*Math.min(1,e.t/.07)*Math.min(1,(1-p)/.18);if(p>=1){scene.remove(e.mesh);e.mesh.material.dispose();}}bolts=bolts.filter(e=>e.t<e.lifetime);
 for(const e of rings){e.t+=delta;const p=e.t/e.lifetime,fade=Math.max(0,1-p);const size=e.source?e.size*(.9+.1*Math.sin(e.t*40)):e.size*(.75+p*.5);e.mesh.scale.set(size,size,1);e.mesh.material.opacity=fade*(e.source?.65:1);if(p>=1){scene.remove(e.mesh);e.mesh.material.dispose();}}rings=rings.filter(e=>e.t<e.lifetime);
 for(const e of sparks){e.t+=delta;const p=e.t/e.lifetime;e.mesh.position.x+=e.vx*delta;e.mesh.position.y+=e.vy*delta;e.mesh.position.z+=e.vz*delta;e.vy-=2*delta;e.mesh.scale.setScalar(Math.max(.001,e.size*(1-p*.6)));e.mesh.material.opacity=Math.max(0,1-p);if(p>=1){scene.remove(e.mesh);e.mesh.material.dispose();}}sparks=sparks.filter(e=>e.t<e.lifetime);
 renderer.render(scene,camera);}animate();makeLevel(0);

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const source=fs.readFileSync(path.join(here,'..','game.js'),'utf8');

function fnSource(name){
  const start=source.indexOf(`function ${name}(`);assert.notEqual(start,-1,`missing ${name}`);
  const open=source.indexOf('{',start);let depth=0,quote=null,escaped=false;
  for(let i=open;i<source.length;i++){const ch=source[i];if(quote){if(escaped)escaped=false;else if(ch==='\\')escaped=true;else if(ch===quote)quote=null;continue;}if(ch==='"'||ch==="'"||ch==='`'){quote=ch;continue;}if(ch==='{')depth++;if(ch==='}'&&--depth===0)return source.slice(start,i+1);}
  throw Error(`unterminated ${name}`);
}
function mechanics(grid,NX=5,NY=5,locks=[]){const lockCoverage=Array(NX*NY).fill(null);for(const lock of locks)for(let y=lock.y;y<lock.y+lock.height;y++)for(let x=lock.x;x<lock.x+lock.width;x++)lockCoverage[y*NX+x]=lock;const code=['lockAtCell','bottomOfColumn','attackTarget','componentFrom','legalColumnsForColor','fuseOrderFrom'].map(fnSource).join('\n');return new Function('grid','NX','NY','lockCoverage',`${code};return{lockAtCell,bottomOfColumn,attackTarget,componentFrom,legalColumnsForColor,fuseOrderFrom}`)(grid,NX,NY,lockCoverage);}
function beltApi(){const code=['beltPosition','columnUnderWizard'].map(fnSource).join('\n');return new Function('W','BX','BW','CW','BELT_LEFT','BELT_LENGTH','beltOffset',`${code};return{beltPosition,columnUnderWizard}`)(448,28,392,28, -48,544,0);}
const makeGrid=(nx=5,ny=5)=>Array.from({length:nx*ny},()=>({alive:false,color:null}));
const put=(g,nx,x,y,color)=>g[y*nx+x]={alive:true,color};
const tests=[];const test=(name,fn)=>tests.push({name,fn});

test('each column exposes only its lowest live block',()=>{const g=makeGrid();put(g,5,0,0,'r');put(g,5,0,3,'b');put(g,5,2,2,'y');put(g,5,4,4,'g');const a=mechanics(g);assert.equal(a.bottomOfColumn(0),15);assert.equal(a.bottomOfColumn(1),-1);assert.equal(a.bottomOfColumn(2),12);assert.equal(a.bottomOfColumn(4),24);assert.deepEqual(a.legalColumnsForColor('r'),[]);assert.deepEqual(a.legalColumnsForColor('b'),[0]);});

test('components use four directions and exclude diagonals',()=>{const g=makeGrid();put(g,5,1,1,'p');put(g,5,2,1,'p');put(g,5,2,2,'p');put(g,5,0,2,'p');assert.deepEqual(new Set(mechanics(g).componentFrom(6)),new Set([6,7,12]));});

test('locked cells block four-direction components and fuse paths until unlocked',()=>{const g=makeGrid(),lock={x:2,y:2,width:1,height:1,remaining:1,pending:0,color:'y'};for(const x of [1,2,3])put(g,5,x,2,'r');const a=mechanics(g,5,5,[lock]);assert.deepEqual(a.componentFrom(11),[11]);assert.deepEqual(a.fuseOrderFrom(11),[11]);assert.equal(a.attackTarget(2).lock,lock);lock.remaining=0;assert.deepEqual(new Set(a.componentFrom(11)),new Set([11,12,13]));});

test('belt positions are evenly spaced, periodic, and wrap for negative offsets',()=>{const a=beltApi();const base=Array.from({length:5},(_,i)=>a.beltPosition(i,0));base.forEach((x,i)=>assert.ok(Math.abs(x-(-48+i*108.8))<1e-9));for(let i=0;i<5;i++){assert.ok(Math.abs(a.beltPosition(i,544)-base[i])<1e-9);assert.ok(Math.abs(a.beltPosition(i,-544)-base[i])<1e-9);}assert.equal(a.beltPosition(0,-1),495);});

test('columnUnderWizard uses the wizard current position and strict board bounds',()=>{const a=beltApi(),w=x=>({mesh:{position:{x:x-224}}});assert.equal(a.columnUnderWizard(w(27.99)),-1);assert.equal(a.columnUnderWizard(w(28)),0);assert.equal(a.columnUnderWizard(w(55.99)),0);assert.equal(a.columnUnderWizard(w(56)),1);assert.equal(a.columnUnderWizard(w(419.99)),13);assert.equal(a.columnUnderWizard(w(420)),-1);});

test('fuse order covers exactly one connected component',()=>{const g=makeGrid();[[1,1],[2,1],[3,1],[2,2],[2,3]].forEach(([x,y])=>put(g,5,x,y,'o'));put(g,5,0,0,'o');assert.deepEqual(new Set(mechanics(g).fuseOrderFrom(7)),new Set([6,7,8,12,17]));});

test('five-slot deadlock waits for arrivals and pending shots',()=>{const step=fnSource('step');assert.match(step,/shelfCount\(\)\s*>=\s*5\s*&&\s*!anyLegalMove\(\)/);assert.match(step,/t\s*<\s*resolveUntil/);assert.match(step,/wizards\.some\([^]*w\.moving/);});

test('autoFire only attacks the currently aligned exposed same-color column',()=>{const s=fnSource('autoFire');assert.match(s,/columnUnderWizard\(w\)/);assert.match(s,/attackTarget\(col\)/);assert.match(s,/target\.color\s*!==\s*w\.mesh\.userData\.colorKey/);assert.doesNotMatch(s,/legalColumnsForColor|bestColumn/);});

test('fireAtColumn rejects cross-column calls and fires a vertical streak from current x',()=>{const s=fnSource('fireAtColumn');assert.match(s,/col\s*!==\s*columnUnderWizard\(w\)/);assert.match(s,/targetX\s*=\s*w\.mesh\.position\.x\s*\+\s*W\s*\/\s*2/);assert.match(s,/fireStreak\(targetX,\s*sourceY,\s*targetDesignY/);assert.doesNotMatch(s,/SLOT_X\[/);});

test('belt movement advances at configured speed and wraps by full length',()=>{const s=fnSource('advanceBelt');assert.match(s,/beltOffset\s*=\s*\(beltOffset\s*\+\s*BELT_SPEED\s*\*\s*rate\s*\*\s*dt\)\s*%\s*BELT_LENGTH/);assert.match(source,/const BELT_LEFT\s*=\s*-48,\s*BELT_LENGTH\s*=\s*W\s*\+\s*96,\s*BELT_SPEED\s*=\s*48/);assert.match(source,/BELT_BOOST\s*=\s*1\.5,\s*BELT_RUSH\s*=\s*200\s*\/\s*BELT_SPEED/);});

function groundQueueApi(groundLayout = true) {
  const queue = Array.from({length: 9}, (_, id) => ({
    id, lane: id % 3, state: 'ground', slot: null, moving: false,
    mesh:{position:{x:0},userData:{charges:2,colorKey:'r'}}
  }));
  const state = {queue, slots: Array(5).fill(null), running: true, over: false, pendingBoarding:null, rearranging:false};
  const linkedPairs=[]; const notices=[];
  const code = ['partnerOf','configureLinks','isGroundHead','boardingStatus','planPairSlots',
    'finishPairBoarding','updatePairBoarding','sendToSlot','leaveWizard','releaseReadyPairs','revive'].map(fnSource).join('\n');
  const api = new Function(
    'state', 'linkedPairs', 'wizards', 'FX', 'W', 'BELT_LENGTH', 'beltPosition', 'wx', 'placeInSlot',
    'relayoutGround', 'updateCounter', 'showHint', 'hideOverlay', 'simT',
    `${code}; return {configureLinks,boardingStatus,planPairSlots,sendToSlot,updatePairBoarding,releaseReadyPairs,revive};`
  )(
    state, linkedPairs, queue, {ground: groundLayout}, 448, 544, i => 40 + i * 80, x=>x,
    (w, idx) => { w.state = 'slot'; w.slot = idx; w.moving = true; },
    () => {}, () => {}, s=>notices.push(s), () => {}, 2
  );
  return {...api, state, linkedPairs, notices, wizards: queue.slice()};
}

test('each ground lane admits only its head and unlocks the next wizard on departure', () => {
  const {sendToSlot, state, wizards} = groundQueueApi();
  const originalQueue = state.queue.slice();
  for (const w of wizards.slice(3)) assert.equal(sendToSlot(w), false);
  assert.deepEqual(state.queue, originalQueue);
  assert.ok(state.slots.every(w => w === null));
  assert.ok(wizards.every(w => w.state === 'ground' && w.slot === null));
  assert.equal(sendToSlot(wizards[2]), true);
  assert.equal(sendToSlot(wizards[3]), false);
  assert.equal(sendToSlot(wizards[0]), true);
  assert.equal(sendToSlot(wizards[0]), false);
  assert.equal(sendToSlot(wizards[3]), true);
  assert.equal(sendToSlot(wizards[4]), false);
  assert.equal(sendToSlot(wizards[5]), true);
});

test('revived wizards regain lane priority over the waiting ground queue', () => {
  const {sendToSlot, revive, state, wizards} = groundQueueApi();
  for (const w of wizards.slice(0, 3)) assert.equal(sendToSlot(w), true);
  revive();
  assert.deepEqual(state.queue.slice(0,6).map(w => w.id), [0, 1, 2, 3, 4, 5]);
  for (const w of wizards.slice(3)) assert.equal(sendToSlot(w), false);
  assert.equal(sendToSlot(wizards[1]), true);
  assert.equal(sendToSlot(wizards[4]), true);
  assert.equal(sendToSlot(wizards[3]), false);
});

test('classic ground layout retains free wizard selection', () => {
  const {sendToSlot, wizards} = groundQueueApi(false);
  assert.equal(sendToSlot(wizards[5]), true);
});

test('send capacity remains five carriers and rejects a sixth wizard',()=>{const s=fnSource('sendToSlot');assert.match(s,/for\s*\(let i\s*=\s*0;\s*i\s*<\s*5;\s*i\+\+\)/);assert.match(s,/if\s*\(idx\s*<\s*0\)[^]*return false/);assert.match(s,/state\.slots\[idx\]\s*=\s*w/);});

test('revive returns first three occupied slots without losing charges',()=>{const a=groundQueueApi(),{state,wizards,revive}=a;state.queue=[wizards[5]];state.slots=[wizards[0],null,wizards[2],wizards[3],wizards[4]];[0,2,3,4].forEach(i=>{wizards[i].state='slot';wizards[i].slot=i;wizards[i].mesh.userData.charges=i%2+1;});state.over=true;state.running=false;revive();assert.deepEqual(state.slots.map(x=>x?.id??null),[null,null,null,null,4]);assert.deepEqual(state.queue.map(x=>x.id),[0,2,3,5]);assert.deepEqual(state.queue.slice(0,3).map(x=>x.mesh.userData.charges),[1,1,2]);assert.ok(state.queue.slice(0,3).every(x=>x.state==='ground'&&x.slot===null&&!x.warned));assert.equal(state.over,false);assert.equal(state.running,true);});

test('linked members need both lane heads and board together into adjacent carriers',()=>{
  const a=groundQueueApi(),{state,wizards,configureLinks,sendToSlot,updatePairBoarding}=a;
  configureLinks([{id:'A',members:[[0,0],[2,1]]}]);
  assert.equal(sendToSlot(wizards[0]),false);
  assert.equal(state.slots.filter(Boolean).length,0);
  assert.equal(sendToSlot(wizards[2]),true);
  wizards[2].moving=false;
  assert.equal(sendToSlot(wizards[0]),true);
  assert.equal(state.slots.filter(Boolean).length,3);
  assert.ok(!state.queue.includes(wizards[0])&&!state.queue.includes(wizards[5]));
  assert.equal((wizards[0].slot+1)%5,wizards[5].slot);
  assert.equal(sendToSlot(wizards[3]),false);
  wizards[0].moving=wizards[5].moving=false;updatePairBoarding(0);
  assert.equal(state.pendingBoarding,null);
});

test('linked pair waits with only one free carrier',()=>{
  const a=groundQueueApi(),{state,wizards,configureLinks,sendToSlot}=a;
  configureLinks([{id:'A',members:[[0,0],[2,1]]}]);
  state.queue=[wizards[0],wizards[5]];
  [1,2,3,4].forEach((slot,i)=>{const w=wizards[i+1];w.slot=slot;w.state='slot';w.moving=false;state.slots[slot]=w;});
  assert.equal(sendToSlot(wizards[0]),false);
  assert.equal(state.pendingBoarding,null);
  assert.deepEqual(state.queue,[wizards[0],wizards[5]]);
  assert.equal(state.slots.filter(Boolean).length,4);
});

test('dispersed free carriers repack without losing occupants or charges and reserve both targets',()=>{
  const a=groundQueueApi(),{state,wizards,configureLinks,sendToSlot,updatePairBoarding}=a;
  configureLinks([{id:'A',members:[[0,0],[2,1]]}]);
  state.queue=[wizards[0],wizards[5],wizards[7]];
  [0,2,4].forEach((slot,i)=>{const w=wizards[i+1];w.slot=slot;w.state='slot';w.moving=false;w.mesh.userData.charges=i+1;state.slots[slot]=w;});
  const before=new Map(state.slots.filter(Boolean).map(w=>[w,w.mesh.userData.charges]));
  assert.equal(sendToSlot(wizards[0]),true);
  assert.equal(state.rearranging,true);
  assert.equal(state.pendingBoarding.phase,'rearranging');
  assert.equal(state.slots.filter(Boolean).length,3);
  assert.equal(sendToSlot(wizards[7]),false);
  updatePairBoarding(.45);
  assert.equal(state.slots.filter(Boolean).length,5);
  assert.equal((wizards[0].slot+1)%5,wizards[5].slot);
  for(const [w,charges] of before){assert.equal(w.state,'slot');assert.equal(w.mesh.userData.charges,charges);assert.equal(state.slots[w.slot],w);}
  assert.equal(state.pendingBoarding.phase,'boarding');
  wizards[0].moving=wizards[5].moving=false;updatePairBoarding(0);
  assert.equal(state.pendingBoarding,null);
});

test('repacking keeps an existing linked pair together across the circular seam',()=>{
  const a=groundQueueApi(),{wizards,configureLinks,planPairSlots}=a;
  configureLinks([{id:'A',members:[[0,0],[2,1]]}]);
  const slots=[wizards[0],null,wizards[1],null,wizards[5]];
  const plan=planPairSlots(slots);
  assert.deepEqual(new Set(plan.slots.filter(Boolean)),new Set(slots.filter(Boolean)));
  assert.equal((plan.slots.indexOf(wizards[5])+1)%5,plan.slots.indexOf(wizards[0]));
  assert.equal((plan.targets[0]+1)%5,plan.targets[1]);
});

test('spent linked wizard waits until both shots resolve, then both leave in one release',()=>{
  const a=groundQueueApi(),{state,wizards,configureLinks,releaseReadyPairs}=a;
  configureLinks([{id:'A',members:[[0,0],[2,1]]}]);
  for(const [slot,w] of [[0,wizards[0]],[1,wizards[5]]]){state.slots[slot]=w;w.slot=slot;w.state='slot';w.moving=false;}
  wizards[0].mesh.userData.charges=0;wizards[5].mesh.userData.charges=1;
  releaseReadyPairs();assert.equal(state.slots.filter(Boolean).length,2);
  wizards[5].mesh.userData.charges=0;wizards[5].shotUntil=3;
  releaseReadyPairs();assert.equal(state.slots.filter(Boolean).length,2);
  wizards[5].shotUntil=1;releaseReadyPairs();
  assert.equal(state.slots.filter(Boolean).length,0);
  assert.equal(wizards[0].state,'leaving');assert.equal(wizards[5].state,'leaving');
});

test('revive returns a complete linked pair even when that exceeds three wizards',()=>{
  const a=groundQueueApi(),{state,wizards,configureLinks,revive}=a;
  configureLinks([{id:'A',members:[[0,0],[2,1]]}]);
  state.queue=[wizards[7]];
  state.slots=[wizards[1],wizards[2],wizards[0],wizards[3],wizards[5]];
  state.slots.forEach((w,i)=>{w.slot=i;w.state='slot';w.mesh.userData.charges=i+1;});
  state.over=true;state.running=false;revive();
  assert.deepEqual(state.queue.slice(0,4),[wizards[1],wizards[2],wizards[0],wizards[5]]);
  assert.equal(wizards[3].state,'slot');
});

test('all five-carrier layouts with at least two gaps retain occupants and circular order',()=>{
  const a=groundQueueApi(),{wizards,planPairSlots}=a;
  for(let mask=0;mask<32;mask++){
    const occupied=Array.from({length:5},(_,i)=>i).filter(i=>mask&(1<<i));
    if(occupied.length>3) continue;
    const slots=Array(5).fill(null);
    occupied.forEach((slot,i)=>slots[slot]=wizards[i]);
    const plan=planPairSlots(slots);
    assert.ok(plan,`mask ${mask}`);
    assert.equal((plan.targets[0]+1)%5,plan.targets[1],`targets ${mask}`);
    assert.ok(plan.targets.every(i=>plan.slots[i]===null),`gaps ${mask}`);
    assert.deepEqual(new Set(plan.slots.filter(Boolean)),new Set(slots.filter(Boolean)),`members ${mask}`);
    const next=plan.slots.filter(Boolean);
    const original=slots.filter(Boolean);
    assert.ok(next.every((w,i)=>w===original[i]),`order ${mask}`);
  }
});

test('repacking preserves every existing pair that spans carrier four to zero',()=>{
  const a=groundQueueApi(),{wizards,configureLinks,planPairSlots}=a;
  configureLinks([{id:'A',members:[[0,0],[2,1]]}]);
  for(const extra of [null,1,2,3]){
    const slots=[wizards[5],null,null,null,wizards[0]];
    if(extra!==null)slots[extra]=wizards[1];
    const plan=planPairSlots(slots);
    assert.deepEqual(new Set(plan.slots.filter(Boolean)),new Set(slots.filter(Boolean)));
    assert.equal((plan.slots.indexOf(wizards[0])+1)%5,plan.slots.indexOf(wizards[5]));
    assert.equal((plan.targets[0]+1)%5,plan.targets[1]);
  }
});

test('level reset clears belt, old timers, and transient effect pools',()=>{const s=fnSource('startLevel');assert.match(s,/beltOffset\s*=\s*0[^]*syncBeltTexture\(\)/);assert.match(s,/timers\.length\s*=\s*0/);assert.match(s,/levelGeneration\+\+/);assert.match(s,/resolveUntil\s*=\s*simT/);assert.match(s,/streaks\.forEach[^]*onHit\s*=\s*null[^]*visible\s*=\s*false/);assert.match(s,/flashes\.forEach[^]*life\s*=\s*0[^]*visible\s*=\s*false/);assert.match(s,/pLife\.fill\(0\)[^]*pCol\.fill\(0\)/);assert.match(s,/clearTimeout\(hintTimer\)/);});

test('scheduled callbacks are owned by their level generation',()=>{const s=fnSource('schedule');assert.match(s,/owner\s*=\s*levelGeneration/);assert.match(s,/owner\s*===\s*levelGeneration/);});

test('inter-level transition rejects double clicks and nests completion after reset',()=>{const s=fnSource('goNextLevel'),start=s.indexOf('startLevel(n)'),nested=s.indexOf('schedule(1.3',start);assert.ok(start>=0&&nested>start);assert.match(s,/classList\.contains\("on"\)[^]*return/);assert.match(s,/startLevel\(n\);\s*state\.running\s*=\s*false/);assert.match(s,/intro\.classList\.remove\("on"\);\s*state\.running\s*=\s*true/);});

test('last-shot victory waits until visible resolution completes',()=>{const s=fnSource('fireAtColumn');assert.match(s,/isBoardCleared\(\)[^]*resolveUntil\s*-\s*simT[^]*win\(\)/);});

test('wizard rebuild disposes old per-wizard GPU resources',()=>{const s=fnSource('buildWizards');assert.match(s,/scene\.remove\(mesh\)/);assert.match(s,/mesh\.traverse/);assert.match(s,/geometries\.forEach[^]*\.dispose\(\)/);assert.match(s,/m\.map[^]*m\.map\.dispose\(\)[^]*m\.dispose\(\)/);});

let failures=0;for(const {name,fn} of tests){try{await fn();console.log(`✓ ${name}`);}catch(e){failures++;console.error(`✗ ${name}\n${e.stack||e}`);}}console.log(`\n${tests.length-failures}/${tests.length} tests passed`);if(failures)process.exitCode=1;

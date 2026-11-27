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
function mechanics(grid,NX=5,NY=5){const code=['bottomOfColumn','componentFrom','legalColumnsForColor','fuseOrderFrom'].map(fnSource).join('\n');return new Function('grid','NX','NY',`${code};return{bottomOfColumn,componentFrom,legalColumnsForColor,fuseOrderFrom}`)(grid,NX,NY);}
function beltApi(){const code=['beltPosition','columnUnderWizard'].map(fnSource).join('\n');return new Function('W','BX','BW','CW','BELT_LEFT','BELT_LENGTH','beltOffset',`${code};return{beltPosition,columnUnderWizard}`)(448,28,392,28, -48,544,0);}
const makeGrid=(nx=5,ny=5)=>Array.from({length:nx*ny},()=>({alive:false,color:null}));
const put=(g,nx,x,y,color)=>g[y*nx+x]={alive:true,color};
const tests=[];const test=(name,fn)=>tests.push({name,fn});

test('each column exposes only its lowest live block',()=>{const g=makeGrid();put(g,5,0,0,'r');put(g,5,0,3,'b');put(g,5,2,2,'y');put(g,5,4,4,'g');const a=mechanics(g);assert.equal(a.bottomOfColumn(0),15);assert.equal(a.bottomOfColumn(1),-1);assert.equal(a.bottomOfColumn(2),12);assert.equal(a.bottomOfColumn(4),24);assert.deepEqual(a.legalColumnsForColor('r'),[]);assert.deepEqual(a.legalColumnsForColor('b'),[0]);});

test('components use four directions and exclude diagonals',()=>{const g=makeGrid();put(g,5,1,1,'p');put(g,5,2,1,'p');put(g,5,2,2,'p');put(g,5,0,2,'p');assert.deepEqual(new Set(mechanics(g).componentFrom(6)),new Set([6,7,12]));});

test('belt positions are evenly spaced, periodic, and wrap for negative offsets',()=>{const a=beltApi();const base=Array.from({length:5},(_,i)=>a.beltPosition(i,0));base.forEach((x,i)=>assert.ok(Math.abs(x-(-48+i*108.8))<1e-9));for(let i=0;i<5;i++){assert.ok(Math.abs(a.beltPosition(i,544)-base[i])<1e-9);assert.ok(Math.abs(a.beltPosition(i,-544)-base[i])<1e-9);}assert.equal(a.beltPosition(0,-1),495);});

test('columnUnderWizard uses the wizard current position and strict board bounds',()=>{const a=beltApi(),w=x=>({mesh:{position:{x:x-224}}});assert.equal(a.columnUnderWizard(w(27.99)),-1);assert.equal(a.columnUnderWizard(w(28)),0);assert.equal(a.columnUnderWizard(w(55.99)),0);assert.equal(a.columnUnderWizard(w(56)),1);assert.equal(a.columnUnderWizard(w(419.99)),13);assert.equal(a.columnUnderWizard(w(420)),-1);});

test('fuse order covers exactly one connected component',()=>{const g=makeGrid();[[1,1],[2,1],[3,1],[2,2],[2,3]].forEach(([x,y])=>put(g,5,x,y,'o'));put(g,5,0,0,'o');assert.deepEqual(new Set(mechanics(g).fuseOrderFrom(7)),new Set([6,7,8,12,17]));});

test('five-slot deadlock waits for arrivals and pending shots',()=>{const step=fnSource('step');assert.match(step,/shelfCount\(\)\s*>=\s*5\s*&&\s*!anyLegalMove\(\)/);assert.match(step,/t\s*<\s*resolveUntil/);assert.match(step,/wizards\.some\([^]*w\.moving/);});

test('autoFire only attacks the currently aligned exposed same-color column',()=>{const s=fnSource('autoFire');assert.match(s,/columnUnderWizard\(w\)/);assert.match(s,/bottomOfColumn\(col\)/);assert.match(s,/grid\[cell\]\.color\s*!==\s*w\.mesh\.userData\.colorKey/);assert.doesNotMatch(s,/legalColumnsForColor|bestColumn/);});

test('fireAtColumn rejects cross-column calls and fires a vertical streak from current x',()=>{const s=fnSource('fireAtColumn');assert.match(s,/col\s*!==\s*columnUnderWizard\(w\)/);assert.match(s,/targetX\s*=\s*w\.mesh\.position\.x\s*\+\s*W\s*\/\s*2/);assert.match(s,/fireStreak\(targetX,\s*sourceY,\s*targetDesignY/);assert.doesNotMatch(s,/SLOT_X\[/);});

test('belt movement advances at configured speed and wraps by full length',()=>{const s=fnSource('advanceBelt');assert.match(s,/beltOffset\s*=\s*\(beltOffset\s*\+\s*BELT_SPEED\s*\*\s*rate\s*\*\s*dt\)\s*%\s*BELT_LENGTH/);assert.match(source,/const BELT_LEFT\s*=\s*-48,\s*BELT_LENGTH\s*=\s*W\s*\+\s*96,\s*BELT_SPEED\s*=\s*48/);assert.match(source,/BELT_BOOST\s*=\s*1\.5,\s*BELT_RUSH\s*=\s*200\s*\/\s*BELT_SPEED/);});

function groundQueueApi(groundLayout = true) {
  const queue = Array.from({length: 6}, (_, id) => ({
    id, lane: id % 3, state: 'ground', slot: null, moving: false
  }));
  const state = {queue, slots: Array(5).fill(null), running: true, over: false};
  const code = ['isGroundHead', 'sendToSlot', 'revive'].map(fnSource).join('\n');
  const api = new Function(
    'state', 'FX', 'W', 'BELT_LENGTH', 'beltPosition', 'placeInSlot',
    'relayoutGround', 'updateCounter', 'showHint', 'hideOverlay',
    `${code}; return {sendToSlot, revive};`
  )(
    state, {ground: groundLayout}, 448, 544, i => 40 + i * 80,
    (w, idx) => { w.state = 'slot'; w.slot = idx; w.moving = true; },
    () => {}, () => {}, () => {}, () => {}
  );
  return {...api, state, wizards: queue.slice()};
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
  assert.deepEqual(state.queue.map(w => w.id), [0, 1, 2, 3, 4, 5]);
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

test('revive returns first three occupied slots without losing charges',()=>{const state={slots:[],queue:[{id:'q'}],over:true,running:false};const w=(id,n)=>({id,slot:id,state:'slot',warned:true,mesh:{userData:{charges:n}}});state.slots=[w(0,2),null,w(2,1),w(3,2),w(4,1)];let hidden=0,relaid=0,updated=0;const revive=new Function('state','hideOverlay','relayoutGround','updateCounter',`${fnSource('revive')};return revive`)(state,()=>hidden++,()=>relaid++,()=>updated++);revive();assert.deepEqual(state.slots.map(x=>x?.id??null),[null,null,null,null,4]);assert.deepEqual(state.queue.map(x=>x.id),[0,2,3,'q']);assert.deepEqual(state.queue.slice(0,3).map(x=>x.mesh.userData.charges),[2,1,2]);assert.ok(state.queue.slice(0,3).every(x=>x.state==='ground'&&x.slot===null&&!x.warned));assert.equal(state.over,false);assert.equal(state.running,true);assert.deepEqual([hidden,relaid,updated],[1,1,1]);});

test('level reset clears belt, old timers, and transient effect pools',()=>{const s=fnSource('startLevel');assert.match(s,/beltOffset\s*=\s*0[^]*syncBeltTexture\(\)/);assert.match(s,/timers\.length\s*=\s*0/);assert.match(s,/levelGeneration\+\+/);assert.match(s,/resolveUntil\s*=\s*simT/);assert.match(s,/streaks\.forEach[^]*onHit\s*=\s*null[^]*visible\s*=\s*false/);assert.match(s,/flashes\.forEach[^]*life\s*=\s*0[^]*visible\s*=\s*false/);assert.match(s,/pLife\.fill\(0\)[^]*pCol\.fill\(0\)/);assert.match(s,/clearTimeout\(hintTimer\)/);});

test('scheduled callbacks are owned by their level generation',()=>{const s=fnSource('schedule');assert.match(s,/owner\s*=\s*levelGeneration/);assert.match(s,/owner\s*===\s*levelGeneration/);});

test('inter-level transition rejects double clicks and nests completion after reset',()=>{const s=fnSource('goNextLevel'),start=s.indexOf('startLevel(n)'),nested=s.indexOf('schedule(1.3',start);assert.ok(start>=0&&nested>start);assert.match(s,/classList\.contains\("on"\)[^]*return/);assert.match(s,/startLevel\(n\);\s*state\.running\s*=\s*false/);assert.match(s,/intro\.classList\.remove\("on"\);\s*state\.running\s*=\s*true/);});

test('last-shot victory waits until visible resolution completes',()=>{const s=fnSource('fireAtColumn');assert.match(s,/aliveCount\s*<=\s*0[^]*resolveUntil\s*-\s*simT[^]*win\(\)/);});

test('wizard rebuild disposes old per-wizard GPU resources',()=>{const s=fnSource('buildWizards');assert.match(s,/scene\.remove\(mesh\)/);assert.match(s,/mesh\.traverse/);assert.match(s,/geometries\.forEach[^]*\.dispose\(\)/);assert.match(s,/m\.map[^]*m\.map\.dispose\(\)[^]*m\.dispose\(\)/);});

let failures=0;for(const {name,fn} of tests){try{await fn();console.log(`✓ ${name}`);}catch(e){failures++;console.error(`✗ ${name}\n${e.stack||e}`);}}console.log(`\n${tests.length-failures}/${tests.length} tests passed`);if(failures)process.exitCode=1;

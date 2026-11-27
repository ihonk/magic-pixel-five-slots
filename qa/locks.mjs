import assert from 'node:assert/strict';
import {createRuntime,loadGame} from './runtime.mjs';

const core=createRuntime({scripts:['level-core.js']}).context.MFLevel;
const empty=()=>Array.from({length:36},()=>'.'.repeat(36));
function put(map,x,y,color){map[y]=map[y].slice(0,x)+color+map[y].slice(x+1);}
const map=empty();put(map,5,35,'R');put(map,5,29,'B');
const raw={version:1,name:'QA 锁区',map,lanes:[[{color:'R',charges:1}],[{color:'Y',charges:2}],[{color:'B',charges:1}]],
  links:[{id:'A',members:[[1,0],[2,0]]}],locks:[{id:'K1',x:5,y:28,width:2,height:3,color:'Y',hits:2}]};
const level=core.validateLevel(raw);
assert.equal(level.locks.length,1);
for(const broken of [
  {...raw,locks:[{...raw.locks[0],hits:4}]},
  {...raw,locks:[{...raw.locks[0],x:35,width:2}]},
  {...raw,locks:[raw.locks[0],{...raw.locks[0],id:'K2'}]},
  {...raw,locks:[{...raw.locks[0],x:0,y:0}]},
  {...raw,locks:Array.from({length:5},(_,i)=>({...raw.locks[0],id:'K'+i,x:5+i*3}))}
])assert.throws(()=>core.validateLevel(broken));
console.log('✓ lock schema accepts valid region and rejects hits, bounds, overlaps, blank and count overflow');

const {game}=loadGame({search:'?sim=0.001',scripts:['level-core.js','game.js'],customLevel:level});
const [red,yellow,blue]=['L0-0','L1-0','L2-0'].map(id=>game.wizards.find(w=>w.id===id));
assert.ok(red&&yellow&&blue);
const lock=game.locks[0],cell=29*36+5,col=5;
assert.equal(game.attackTarget(col).color,'R');
assert.equal(game.attackTarget(col).lock,null);
assert.equal(game.lockAtCell(cell),lock);
assert.equal(game.isBoardCleared(),false);
for(const pixel of game.grid)pixel.alive=false;
assert.equal(game.isBoardCleared(),false,'living locks prevent victory even if no pixels remain');
game.grid[35*36+5].alive=true;game.grid[cell].alive=true;
function place(w,slot){w.state='slot';w.slot=slot;w.moving=false;w.mesh.position.x=38+(col+.5)*373/36-448/2;game.state.slots[slot]=w;}
place(red,0);place(yellow,1);place(blue,2);
game.state.running=false; // Advance visual callbacks without automatic shots.
assert.equal(game.fire(yellow,col),false,'lock remains behind the lower red pixel');
assert.equal(game.fire(red,col),true);
assert.equal(game.grid[35*36+5].alive,false);
assert.equal(game.attackTarget(col).lock,lock);
assert.equal(game.fire(blue,col),false,'blue pixel inside the lock is inaccessible');
assert.equal(game.fire(yellow,col),true);
assert.equal(lock.remaining,2,'number changes on impact, not launch');
assert.equal(lock.pending,1);
assert.equal(game.fire(yellow,col),true);
assert.equal(lock.pending,2);
assert.equal(game.attackTarget(col).available,false);
assert.equal(game.fire(yellow,col),false,'two reserved hits cannot be repeated');
assert.equal(yellow.mesh.userData.charges,0);
assert.equal(yellow.state,'slot','spent linked member waits on the belt');
for(let frame=1;frame<=30;frame++)game.step(1/60,frame/60);
assert.equal(lock.remaining,0);
assert.equal(lock.pending,0);
assert.equal(game.grid[cell].alive,true,'unlock does not clear the covered pixel');
assert.equal(game.attackTarget(col).color,'B');
assert.equal(game.isBoardCleared(),false);
assert.equal(game.fire(blue,col),true);
assert.equal(game.grid[cell].alive,false);
for(let frame=31;frame<=90;frame++)game.step(1/60,frame/60);
assert.equal(game.isBoardCleared(),true);
assert.equal(yellow.state,blue.state);
assert.ok(['leaving','gone'].includes(yellow.state));
assert.equal(game.state.slots.filter(Boolean).length,0);
console.log('✓ real game prioritizes lower pixel, reserves lock hits, unlocks without erasing pixels and releases linked pair together');
game.startLevel(0);
assert.equal(game.locks[0].remaining,2);
assert.equal(game.locks[0].pending,0);
assert.equal(game.isBoardCleared(),false);
console.log('✓ restart restores lock hits and clears pending shots');

function assertAtomicAmmoBudget(candidate){
  const coverage=Array(36*36).fill(null);
  for(const lock of candidate.locks)for(let y=lock.y;y<lock.y+lock.height;y++)for(let x=lock.x;x<lock.x+lock.width;x++)coverage[y*36+x]=lock;
  const masked=selected=>candidate.map.map((row,y)=>Array.from(row,(color,x)=>coverage[y*36+x]===selected?color:'.').join(''));
  const required=Object.fromEntries(core.COLORS.map(color=>[color,0]));
  for(const group of core.components(masked(null)))required[group.color]++;
  for(const lock of candidate.locks){
    for(const group of core.components(masked(lock)))required[group.color]++;
    required[lock.color]+=lock.hits;
  }
  const charges=Object.fromEntries(core.COLORS.map(color=>[color,0]));
  for(const wizard of candidate.lanes.flat())charges[wizard.color]+=wizard.charges;
  for(const color of core.COLORS)assert.ok(charges[color]>=required[color],`${candidate.generation.seed} ${color}: ${charges[color]} charges < ${required[color]} atomic shots`);
}
for(const locks of [0,1,2,3,4]){
  const candidate=core.generateCandidate({seed:'qa-locks-'+locks,difficulty:'normal',rhythm:'rising',pairs:1,locks,lockHits:2,lockColor:'Y'},0);
  assert.equal(candidate.locks.length,locks);
  assert.ok(candidate.locks.every(l=>l.color==='Y'&&l.hits===2));
  assert.equal(core.validateLevel(candidate).locks.length,locks);
  assertAtomicAmmoBudget(candidate);
}
const stress=core.generateCandidate({seed:'MAGIC-01',difficulty:'normal',rhythm:'rising',pairs:2,locks:4,lockHits:3,lockColor:'R'},2);
assert.equal(stress.locks.length,4);
assertAtomicAmmoBudget(stress);
console.log('✓ generator funds outside and per-lock atomic components plus opening hits, including four-lock stress seed');

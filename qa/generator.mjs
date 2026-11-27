import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRuntime,loadGame,root} from './runtime.mjs';

const core=createRuntime({scripts:['level-core.js']}).context.MFLevel;
assert.ok(core);
const options={seed:'qa-fixed',difficulty:'normal',rhythm:'rising',pairs:1};
const one=core.generateCandidate(options,0),again=core.generateCandidate(options,0);
assert.equal(JSON.stringify(one),JSON.stringify(again),'same seed and attempt must be deterministic');
assert.notEqual(JSON.stringify(one.map),JSON.stringify(core.generateCandidate({...options,seed:'qa-other'},0).map));
assert.equal(core.validateLevel(one).map.length,36);
assert.ok(one.map.every(row=>row.length===36&&/^[.RBGYP]+$/.test(row)));
console.log('✓ seeded 36×36 candidate is deterministic and validates');

for(const difficulty of ['easy','normal','hard'])for(const rhythm of ['rising','falling','alternating','steady']){
  const level=core.generateCandidate({seed:'qa-'+difficulty+'-'+rhythm,difficulty,rhythm,pairs:1},0);
  assert.equal(core.validateLevel(level).links.length,1);
  assert.equal(level.generation.target.length,6);
  if(rhythm==='rising')assert.ok(level.generation.target[0]<level.generation.target[5]);
  if(rhythm==='falling')assert.ok(level.generation.target[0]>level.generation.target[5]);
  if(rhythm==='alternating')assert.ok(level.generation.target[0]>level.generation.target[1]&&level.generation.target[1]<level.generation.target[2]);
}
for(let pairs=0;pairs<=4;pairs++)assert.equal(core.generateCandidate({...options,pairs},0).links.length,pairs);
console.log('✓ all difficulty/rhythm combinations and 0–4 linked pairs generate valid levels');

assert.equal(core.matchesRhythm([20,25,30,35,40,45],'rising'),true);
assert.equal(core.matchesRhythm([45,40,35,30,25,20],'rising'),false);
assert.equal(core.matchesRhythm([45,40,35,30,25,20],'falling'),true);
assert.equal(core.matchesRhythm([20,25,30,35,40,45],'falling'),false);
assert.equal(core.matchesRhythm([55,25,55,25,55,25],'alternating'),true);
assert.equal(core.matchesRhythm([25,55,25,55,25,55],'alternating'),false);
assert.equal(core.matchesRhythm([20,30,40,45,50,60],'steady'),true);
assert.equal(core.matchesRhythm([10,20,30,50,60,70],'steady'),false);
assert.deepEqual(Array.from(core.profileFromSamples([{progress:0,pressure:10},{progress:0,pressure:20},{progress:0,pressure:30},{progress:0,pressure:100}])),[30,40,40,40,40,40]);
console.log('✓ measured rhythm gate and per-stage upper-quartile pressure behave as specified');

const invalid=JSON.parse(JSON.stringify(one));invalid.map[0]='X'+invalid.map[0].slice(1);
assert.throws(()=>core.validateLevel(invalid));
const invalidLink=JSON.parse(JSON.stringify(one));invalidLink.links[0].members[1]=invalidLink.links[0].members[0];
assert.throws(()=>core.validateLevel(invalidLink));
const lowAmmo=JSON.parse(JSON.stringify(one));lowAmmo.lanes=lowAmmo.lanes.map(()=>[]);
assert.throws(()=>core.validateLevel(lowAmmo));
console.log('✓ validator rejects malformed maps, duplicate bindings and insufficient roster');

function worker(){
  const messages=[];
  const context={console,Math,Date,Uint8Array,Float32Array,Int32Array,ArrayBuffer,setTimeout,clearTimeout,
    postMessage:message=>messages.push(message)};
  context.self=context;
  vm.createContext(context);
  context.importScripts=(...scripts)=>{for(const script of scripts){const filename=script.replace(/\?.*$/,'').replace(/^\.\//,'');const text=fs.readFileSync(path.join(root,filename),'utf8');vm.runInContext(text,context,{filename,timeout:120000});}};
  vm.runInContext(fs.readFileSync(path.join(root,'generator-worker.js'),'utf8'),context,{filename:'generator-worker.js',timeout:120000});
  return {context,messages};
}

const started=Date.now(),w=worker();
await w.context.onmessage({data:{options}});
const result=w.messages.find(message=>message.type==='result');
assert.ok(result,w.messages.find(message=>message.type==='error')?.message||'no result');
assert.equal(w.messages.filter(message=>message.type==='progress').length,12);
assert.equal(result.level.verification.status,'passed');
assert.ok(result.level.verification.actions.length>0);
assert.equal(core.matchesRhythm(result.level.verification.measured,options.rhythm),true);
console.log('✓ worker verified 12 candidates with production game in',((Date.now()-started)/1000).toFixed(2),'s');

const rejected=worker();
rejected.context.MFLevel.matchesRhythm=()=>false;
await rejected.context.onmessage({data:{options}});
assert.equal(rejected.messages.filter(message=>message.type==='progress').length,12);
assert.equal(rejected.messages.some(message=>message.type==='result'),false);
assert.equal(rejected.messages.at(-1).type,'error');
console.log('✓ worker reports an error when no candidate meets the measured rhythm');

const loaded=loadGame({search:'?sim=0.001',scripts:['level-core.js','game.js'],customLevel:result.level});
assert.equal(loaded.game.wizards.length,result.level.lanes.flat().length);
assert.equal(loaded.game.linkedPairs.length,result.level.links.length);
console.log('✓ selected candidate loads into the production game');

let actionIndex=0;
const actions=result.level.verification.actions;
for(let frame=1;frame<=60*360;frame++){
  const t=frame/60;loaded.game.step(1/60,t);
  while(actionIndex<actions.length&&actions[actionIndex].time<=t+1e-6){
    const action=actions[actionIndex++],wizard=loaded.game.wizards.find(w=>w.id===action.id);
    assert.ok(wizard,`unknown replay wizard ${action.id}`);
    assert.equal(loaded.game.boardingStatus(wizard).ok,true,`replay action ${actionIndex} cannot board`);
    assert.equal(loaded.game.send(wizard),true,`replay action ${actionIndex} was refused`);
  }
  if(loaded.game.state.over)break;
}
assert.equal(actionIndex,actions.length);
assert.equal(loaded.game.grid.filter(cell=>cell.alive).length,0);
assert.equal(loaded.game.state.over,true);
console.log('✓ worker action trace independently replays to a clear board');

const badImport=loadGame({search:'?sim=0.001',scripts:['level-core.js','game.js']});
const control=badImport.elements.get('importLevel');
assert.equal(typeof control.onchange,'function');
control.files=[{size:10,text:async()=>'{bad json'}];
await control.onchange();
assert.match(badImport.elements.get('hint').textContent,/导入失败/);
assert.equal(badImport.location.reloaded,false);
control.files=[{size:201000,text:async()=>JSON.stringify(one)}];
await control.onchange();
assert.match(badImport.elements.get('hint').textContent,/200 KB/);
assert.equal(badImport.location.reloaded,false);
control.files=[{size:100,text:async()=>JSON.stringify(invalid)}];
await control.onchange();
assert.match(badImport.elements.get('hint').textContent,/导入失败/);
assert.equal(badImport.location.reloaded,false);
console.log('✓ file import rejects malformed, oversized and invalid level data');

const validHash='#level='+encodeURIComponent(JSON.stringify(one));
const hashGame=loadGame({search:'?sim=0.001',hash:validHash,scripts:['level-core.js','game.js']});
assert.equal(hashGame.game.wizards.length,one.lanes.flat().length);
assert.equal(hashGame.game.linkedPairs.length,one.links.length);
assert.throws(()=>loadGame({search:'?sim=0.001',hash:'#level='+encodeURIComponent(JSON.stringify(invalid)),scripts:['level-core.js','game.js']}));
console.log('✓ valid level hash loads; invalid encoded level is rejected before play');

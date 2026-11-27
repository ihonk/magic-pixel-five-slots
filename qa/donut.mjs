import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRuntime,loadGame,root} from './runtime.mjs';

const directory=path.join(root,'experiments/donut');
const core=createRuntime({scripts:['level-core.js']}).context.MFLevel;
const map=JSON.parse(fs.readFileSync(path.join(directory,'map.json')));
for(const id of ['steady','rising','alternating']){
  const level=JSON.parse(fs.readFileSync(path.join(directory,id+'.json')));
  const html=fs.readFileSync(path.join(directory,'play-'+id+'.html'),'utf8');
  assert.equal(html.replace(/<script>window\.__MF_CUSTOM_LEVEL=.*?;<\/script>/,''),fs.readFileSync(path.join(root,'magic_fever_standalone.html'),'utf8'),'offline runtime must match current standalone');
  const boot=JSON.parse(html.match(/window\.__MF_CUSTOM_LEVEL=(.*?);<\/script>/)[1]);
  assert.deepEqual(JSON.parse(JSON.stringify(core.validateLevel(boot))),JSON.parse(JSON.stringify(core.validateLevel(level))));
  assert.deepEqual(boot.map,map);
  const wizards=boot.lanes.flat();
  assert.ok(wizards.every(w=>w.charges>=1&&w.charges<=5));
  assert.ok(wizards.filter(w=>w.charges>=4).length>wizards.length/2,'majority must carry four or five shots');
  assert.ok(wizards.every(w=>w.charges>1),'donut roster must not contain one-shot wizards');
  assert.equal(core.matchesRhythm(level.verification.measured,id),true);
  assert.ok(level.verification.stageSamples.every(n=>n>0));
  const game=loadGame({search:'?sim=0.001',scripts:['level-core.js','game.js'],customLevel:boot}).game;
  let cursor=0;
  for(let frame=1;frame<=21600;frame++){
    const time=frame/60;game.step(1/60,time);
    while(cursor<level.verification.actions.length&&level.verification.actions[cursor].time<=time+1e-6){
      const action=level.verification.actions[cursor++];
      assert.equal(game.send(game.wizards.find(w=>w.id===action.id)),true);
    }
    if(game.state.over)break;
  }
  assert.equal(cursor,level.verification.actions.length);
  assert.equal(game.isBoardCleared(),true);assert.equal(game.state.over,true);
  console.log('✓ donut',id,'has mostly 4–5 shots, six sampled stages and a replayable clear');
}
for(const match of fs.readFileSync(path.join(directory,'index.html'),'utf8').matchAll(/href="([^"]+)"/g))assert.ok(fs.existsSync(path.join(directory,match[1].split('?')[0])));

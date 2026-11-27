import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {root} from './runtime.mjs';

const source=name=>fs.readFileSync(path.join(root,name),'utf8');
function uiRuntime({protocol='http:'}={}){
  const nodes=new Map(),workers=[],blobs=[],opens=[],copies=[];
  const draw=new Proxy({}, {get:(_,key)=>key==='createLinearGradient'?()=>({addColorStop(){}}):()=>{},set:()=>true});
  function node(id){
    const classes=new Set(),events=new Map();
    return {id,style:{},hidden:false,disabled:false,textContent:'',innerHTML:'',value:'',children:[],className:'',
      classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x),toggle:(x,on)=>on?classes.add(x):classes.delete(x)},
      addEventListener:(type,fn)=>events.set(type,fn),emit:(type,arg)=>events.get(type)?.(arg),
      querySelectorAll:()=>['difficulty','rhythm','pairs','seed','generate'].map(get),
      requestSubmit(){this.emit('submit',{preventDefault(){}});},
      replaceChildren(){this.children=[];},append(...children){this.children.push(...children);},
      click(){this.clicked=true;},remove(){this.removed=true;},
      getContext:()=>draw};
  }
  function get(id){if(!nodes.has(id))nodes.set(id,node(id));return nodes.get(id);}
  const document={getElementById:get,createElement:type=>node(type),body:get('body')};
  const form=get('settings');
  const values={difficulty:'normal',rhythm:'rising',pairs:'1',seed:'UI-SEED'};
  const FormData=class {constructor(input){assert.equal(input,form);} get(key){return values[key];}};
  const Worker=class {constructor(url){this.url=url;this.terminated=false;workers.push(this);}postMessage(data){this.sent=data;}terminate(){this.terminated=true;}};
  class TestURL extends URL {static createObjectURL(blob){blobs.push(blob);return 'blob:qa';}static revokeObjectURL(){}}
  const window={open:(...args)=>opens.push(args)};
  const navigator={clipboard:{writeText:async text=>copies.push(text)}};
  const location={href:'https://example.test/workshop/generator.html',protocol};
  const context={console,document,window,navigator,location,FormData,Worker,URL:TestURL,Blob,setTimeout:()=>0,Math};
  vm.createContext(context);
  vm.runInContext(source('level-core.js'),context,{filename:'level-core.js'});
  vm.runInContext(source('generator-ui.js'),context,{filename:'generator-ui.js'});
  return {context,document,get,workers,blobs,opens,copies,values};
}

const success=uiRuntime();
assert.equal(success.workers.length,1,'page starts generation on load');
assert.equal(success.get('play').disabled,true);
assert.equal(success.get('cancel').hidden,false);
success.workers[0].onmessage({data:{type:'progress',attempt:3,total:12,passed:1}});
assert.match(success.get('status').textContent,/3 \/ 12/);
const level=success.context.MFLevel.generateCandidate({seed:'ui-result',difficulty:'normal',rhythm:'rising',pairs:1});
level.generation={...level.generation,passedCandidates:3,candidates:12,fitError:.1};
level.verification={status:'passed',seconds:37,measured:[30,35,40,45,50,55],peakOccupancy:4,actions:[{time:1.2,id:'L0-0'}]};
success.workers[0].onmessage({data:{type:'result',level}});
assert.equal(success.workers[0].terminated,true);
assert.equal(success.get('play').disabled,false);
assert.equal(success.get('export').disabled,false);
assert.equal(success.get('copy').disabled,false);
assert.equal(success.get('verificationState').textContent,'✓ 自动通关已验证');
assert.equal(success.get('empty').hidden,true);
success.get('play').onclick();
const playLink=success.opens[0][0],parsed=new URL(playLink);
assert.equal(parsed.pathname,'/workshop/index.html');
const imported=success.context.MFLevel.validateLevel(JSON.parse(decodeURIComponent(parsed.hash.slice(7))));
assert.equal(imported.map.length,36);
success.get('export').onclick();
assert.equal(success.blobs.length,1);
assert.equal(success.context.MFLevel.validateLevel(JSON.parse(await success.blobs[0].text())).links.length,1);
await success.get('copy').onclick();
assert.equal(success.copies[0],playLink);
console.log('✓ progress and verified result unlock play, export and copy with valid level data');

const cancelled=uiRuntime();
cancelled.get('cancel').onclick();
assert.equal(cancelled.workers[0].terminated,true);
assert.equal(cancelled.get('play').disabled,true);
assert.equal(cancelled.get('verificationState').textContent,'等待生成');
assert.match(cancelled.get('status').textContent,/已取消/);
console.log('✓ cancel stops worker without presenting an unverified level');

const failed=uiRuntime();
failed.workers[0].onmessage({data:{type:'error',message:'no valid candidate'}});
assert.equal(failed.workers[0].terminated,true);
assert.equal(failed.get('play').disabled,true);
assert.equal(failed.get('verificationState').textContent,'等待生成');
assert.equal(failed.get('status').textContent,'no valid candidate');
assert.equal(failed.get('status').classList.contains('error'),true);
console.log('✓ worker error leaves result actions disabled');

const crashed=uiRuntime();
crashed.workers[0].onerror({message:'worker crashed'});
assert.equal(crashed.workers[0].terminated,true);
assert.equal(crashed.get('play').disabled,true);
assert.match(crashed.get('status').textContent,/未输出未经验证的关卡/);
assert.equal(crashed.get('status').classList.contains('error'),true);
console.log('✓ worker crash never enables an unverified result');

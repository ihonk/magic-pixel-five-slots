import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const files={three:fs.readFileSync(path.join(root,'vendor/three.r147.min.js'),'utf8'),game:fs.readFileSync(path.join(root,'game.js'),'utf8')};
const noop=()=>{};
function canvas(){
  const gradient={addColorStop:noop};
  const drawing=new Proxy({}, {get:(target,key)=>key==='createLinearGradient'||key==='createRadialGradient'?()=>gradient:noop,set:()=>true});
  return {width:448,height:960,style:{},getContext:()=>drawing,getBoundingClientRect:()=>({left:0,top:0,width:448,height:960})};
}
function element(id){
  const classes=new Set();
  return {id,style:{},textContent:'',innerHTML:'',classList:{add:(...xs)=>xs.forEach(x=>classes.add(x)),remove:(...xs)=>xs.forEach(x=>classes.delete(x)),contains:x=>classes.has(x)},
    addEventListener:noop,dispatchEvent:noop,getBoundingClientRect:()=>({left:0,top:0,width:448,height:960}),querySelector:()=>null};
}
function load(search){
  const elements=new Map([['gl',canvas()]]);
  const document={title:'',body:element('body'),createElement:type=>type==='canvas'?canvas():element(type),getElementById:id=>{if(!elements.has(id))elements.set(id,element(id));return elements.get(id);}};
  const window={innerWidth:448,innerHeight:960,devicePixelRatio:1,addEventListener:noop};
  const context={window,document,location:{search},console,Math,Date,Uint8Array,Float32Array,Int32Array,ArrayBuffer,
    setTimeout:noop,clearTimeout:noop,requestAnimationFrame:noop,performance:{now:()=>0}};
  vm.createContext(context);
  context.exports={};context.module={exports:context.exports};
  vm.runInContext(files.three,context,{filename:'three.r147.min.js',timeout:30000});
  context.THREE=context.module.exports;
  context.THREE.WebGLRenderer=class {setPixelRatio(){} setSize(){} setClearColor(){} render(){}};
  vm.runInContext(files.game,context,{filename:'game.js',timeout:120000});
  assert.ok(window.__mf,'game API did not initialize');
  assert.equal(document.title.startsWith('ERR '),false,document.title);
  return {game:window.__mf,document};
}

const fast=load('?auto=1&sim=120');
assert.equal(fast.game.linkedPairs.length,1);
assert.equal(fast.game.linkedPairs[0].members.length,2);
assert.ok(fast.game.state.slots.filter(Boolean).length<=5);
assert.equal(fast.game.grid.filter(cell=>cell.alive).length,0);
assert.equal(fast.game.state.over,true);
console.log('✓ actual Three r147 game initialized and cleared the first board in 120 seconds');

const manual=load('?sim=0.01');
const {game}=manual;
const pair=game.linkedPairs[0].members;
assert.equal(game.send(pair[0]),false);
const blocker=game.wizards.find(w=>w.lane===pair[1].lane&&w!==pair[1]);
assert.equal(game.send(blocker),true);
for(let i=1;i<=40;i++)game.step(1/60,i/60);
assert.equal(game.send(pair[0]),true);
assert.ok(game.state.pendingBoarding);
for(let i=41;i<=130;i++)game.step(1/60,i/60);
assert.ok(pair.every(w=>w.slot!==null));
assert.equal((pair[0].slot+1)%5,pair[1].slot);
console.log('✓ full game blocks then boards the first linked pair together');
game.startLevel(0);
assert.equal(game.state.pendingBoarding,null);
assert.equal(game.state.rearranging,false);
assert.ok(game.state.slots.every(w=>w===null));
assert.equal(game.linkedPairs.length,1);
assert.ok(game.linkedPairs[0].members.every(w=>w.state==='ground'&&w.slot===null));
console.log('✓ restart clears pending boarding and restores the linked roster');

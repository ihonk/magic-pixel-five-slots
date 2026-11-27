import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

export const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
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

export function loadScript(context,filename,timeout=30000){
  const source=fs.readFileSync(path.join(root,filename),'utf8');
  return vm.runInContext(source,context,{filename,timeout});
}

export function createRuntime({search='',hash='',scripts=['game.js'],timeout=120000,customLevel=null}={}){
  const elements=new Map([['gl',canvas()]]);
  const document={title:'',body:element('body'),createElement:type=>type==='canvas'?canvas():element(type),getElementById:id=>{if(!elements.has(id))elements.set(id,element(id));return elements.get(id);}};
  const window={innerWidth:448,innerHeight:960,devicePixelRatio:1,addEventListener:noop};
  if(customLevel)window.__MF_CUSTOM_LEVEL=customLevel;
  const location={search,hash,reloaded:false,reload(){this.reloaded=true;}};
  const context={window,document,location,console,Math,Date,Uint8Array,Float32Array,Int32Array,ArrayBuffer,
    setTimeout:noop,clearTimeout:noop,requestAnimationFrame:noop,performance:{now:()=>0}};
  vm.createContext(context);
  context.exports={};context.module={exports:context.exports};
  loadScript(context,'vendor/three.r147.min.js');
  context.THREE=context.module.exports;
  context.THREE.WebGLRenderer=class {setPixelRatio(){} setSize(){} setClearColor(){} render(){}};
  for(const filename of scripts)loadScript(context,filename,timeout);
  assert.equal(document.title.startsWith('ERR '),false,document.title);
  return {context,window,document,elements,location,game:window.__mf};
}

export function loadGame(options={}){
  const runtime=createRuntime(options);
  assert.ok(runtime.game,'game API did not initialize');
  return runtime;
}

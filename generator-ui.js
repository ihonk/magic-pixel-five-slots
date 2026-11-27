(function () {
  'use strict';
  const $=id=>document.getElementById(id),form=$('settings');
  const colors={R:'#C6383F',B:'#3D8FE0',G:'#81C94B',Y:'#EFC53F',P:'#E2449B'};
  let worker=null,current=null,busy=false,generation=0;
  function readOptions(){const data=new FormData(form);return {difficulty:data.get('difficulty'),rhythm:data.get('rhythm'),pairs:Number(data.get('pairs')),seed:String(data.get('seed')).trim()};}
  function setBusy(value){
    busy=value;for(const el of form.querySelectorAll('input,select,button'))el.disabled=value;
    $('cancel').disabled=false;$('cancel').hidden=!value;
    for(const id of ['play','export','copy'])$(id).disabled=value||!current;
    $('generate').textContent=value?'正在生成与验证…':'✦ 生成并验证关卡';
    $('verificationState').className='chip'+(value?' busy':current?' success':'');
    $('verificationState').textContent=value?'正在运行通关验证':current?'✓ 自动通关已验证':'等待生成';
  }
  function status(text,error=false){$('status').textContent=text;$('status').classList.toggle('error',error);}
  function drawBoard(map){
    const ctx=$('board').getContext('2d'),cell=20;ctx.clearRect(0,0,720,720);ctx.fillStyle='#303442';ctx.fillRect(0,0,720,720);
    for(let y=0;y<36;y++)for(let x=0;x<36;x++){
      const color=map&&colors[map[y][x]];
      if(!color){ctx.fillStyle='#ffffff09';ctx.fillRect(x*cell+9,y*cell+9,2,2);continue;}
      const px=x*cell+1.2,py=y*cell+1.2,w=17.6;
      ctx.fillStyle='#13182288';ctx.fillRect(px+1,py+2,w,w);
      const fill=ctx.createLinearGradient(px,py,px,py+w);fill.addColorStop(0,color);fill.addColorStop(1,color);
      ctx.fillStyle=fill;ctx.beginPath();ctx.moveTo(px+3,py);ctx.lineTo(px+w-3,py);ctx.quadraticCurveTo(px+w,py,px+w,py+3);ctx.lineTo(px+w,py+w-3);ctx.quadraticCurveTo(px+w,py+w,px+w-3,py+w);ctx.lineTo(px+3,py+w);ctx.quadraticCurveTo(px,py+w,px,py+w-3);ctx.lineTo(px,py+3);ctx.quadraticCurveTo(px,py,px+3,py);ctx.fill();
      ctx.fillStyle='#ffffff3b';ctx.fillRect(px+2,py+1,w-4,2);ctx.fillStyle='#00000022';ctx.fillRect(px+1,py+w-3,w-2,2);
    }
  }
  function drawCurve(target,measured){
    const svg=$('curve'),xs=Array.from({length:6},(_,i)=>48+i*113),y=v=>170-v*1.4;
    const poly=values=>values.map((v,i)=>xs[i]+','+y(v)).join(' ');
    let content='';
    for(const value of [0,25,50,75,100])content+='<line x1="48" x2="613" y1="'+y(value)+'" y2="'+y(value)+'" stroke="#ffffff0c"/><text x="33" y="'+(y(value)+3)+'" fill="#637d8c" text-anchor="end" font-size="9">'+value+'</text>';
    for(let i=0;i<6;i++)content+='<text x="'+xs[i]+'" y="192" text-anchor="middle" fill="#78909b" font-size="10">'+Math.round(i/5*100)+'%</text>';
    content+='<polyline points="'+poly(target.map(v=>v*100))+'" fill="none" stroke="#e7bc7e" stroke-width="2" stroke-dasharray="5 5"/>';
    if(measured){content+='<polyline points="'+poly(measured)+'" fill="none" stroke="#8ac6c1" stroke-width="3"/>';measured.forEach((v,i)=>content+='<circle cx="'+xs[i]+'" cy="'+y(v)+'" r="4" fill="#8ac6c1"/>');}
    svg.innerHTML=content;
  }
  function renderQueues(level){
    const container=$('queues');container.className='roster-grid';container.replaceChildren();
    const links=new Map();level.links.forEach(link=>link.members.forEach(pos=>links.set(pos.join(':'),link.id)));
    level.lanes.forEach((lane,index)=>{
      const column=document.createElement('div');column.className='lane';const title=document.createElement('h3');title.textContent=['左列','中列','右列'][index]+' · '+lane.length+' 人';column.append(title);
      lane.forEach((wizard,row)=>{
        const line=document.createElement('div');line.className='wizard-row';const order=document.createElement('span');order.className='order';order.textContent=String(row+1).padStart(2,'0');
        const orb=document.createElement('span');orb.className='orb';orb.style.background=colors[wizard.color];orb.textContent=wizard.charges;orb.title='剩余 '+wizard.charges+' 次施法';line.append(order,orb);
        const linked=links.get(index+':'+row);if(linked){const badge=document.createElement('span');badge.className='link-tag';badge.textContent='连线 '+linked;line.append(badge);}
        column.append(line);
      });container.append(column);
    });
  }
  function render(level){
    current=level;$('previewTitle').textContent=level.name;$('empty').hidden=true;$('board').classList.add('ready');drawBoard(level.map);
    $('pixels').textContent=level.stats.pixels;$('components').textContent=level.stats.components;$('rosterCount').textContent=level.stats.wizards+' / '+level.links.length+' 对';$('seconds').textContent=level.verification.seconds+'s';
    drawCurve(level.generation.target,level.verification.measured);renderQueues(level);
    const v=level.verification,g=level.generation;
    $('analysis').textContent=g.passedCandidates+' / '+g.candidates+' 个候选通过自动通关验证，其中 '+g.rhythmMatchedCandidates+' 个符合节奏趋势 · 峰值占用 '+v.peakOccupancy+'/5 · 无复活 · 节奏拟合偏差 '+Math.round(g.fitError*100)+'。验证是在 60 Hz 的真实游戏逻辑中执行，试玩操作时机不同可能产生不同过程。';
    const list=$('solutionList');list.replaceChildren();
    const named=new Map();level.lanes.forEach((lane,index)=>lane.forEach((w,row)=>named.set('L'+index+'-'+row,['左','中','右'][index]+'列第 '+(row+1)+' 人')));
    v.actions.forEach(action=>{const li=document.createElement('li');li.textContent=action.time.toFixed(2)+'s · 点击'+(named.get(action.id)||action.id);list.append(li);});
  }
  function playURL(){const clean=MFLevel.validateLevel(current);return new URL('./index.html#level='+encodeURIComponent(JSON.stringify(clean)),location.href).href;}
  form.addEventListener('submit',event=>{
    event.preventDefault();if(busy)return;
    const options=readOptions();if(!options.seed){status('请填写一个生成种子。',true);return;}
    if(location.protocol==='file:'){status('请通过网页地址或本地 HTTP 服务器使用工坊。离线单文件仍可导入已生成的 JSON 关卡。',true);return;}
    if(typeof Worker==='undefined'){status('此浏览器不支持后台验证，请换用支持 Web Worker 的浏览器。',true);return;}
    const job=++generation;
    setBusy(true);status('正在构造地图、队列与连线，并运行第一批候选…');
    try {worker=new Worker(new URL('./generator-worker.js?v=1',location.href));}catch(error){setBusy(false);status('无法启动验证：'+error.message,true);return;}
    worker.onmessage=({data})=>{
      if(job!==generation)return;
      if(data.type==='progress')status('验证候选 '+data.attempt+' / '+data.total+' · 已有 '+data.passed+' 个可通关结果');
      else if(data.type==='result'){render(data.level);worker.terminate();worker=null;setBusy(false);status('生成完成。可直接试玩、分享链接，或导出 JSON。');}
      else if(data.type==='error'){worker.terminate();worker=null;setBusy(false);status(data.message,true);}
    };
    worker.onerror=event=>{if(job!==generation)return;if(worker){worker.terminate();worker=null;}setBusy(false);status('验证器运行失败，未输出未经验证的关卡：'+(event.message||'请刷新后再试'),true);};
    worker.postMessage({options});
  });
  $('cancel').onclick=()=>{generation++;if(worker){worker.terminate();worker=null;}setBusy(false);status('已取消生成'+(current?'，保留上一张关卡。':'。'));};
  $('randomSeed').onclick=()=>{$('seed').value='MF-'+Math.random().toString(36).slice(2,10).toUpperCase();};
  $('play').onclick=()=>{if(current)window.open(playURL(),'_blank','noopener');};
  $('export').onclick=()=>{
    if(!current)return;const blob=new Blob([JSON.stringify(current,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');
    link.href=url;link.download='magic-fever-'+current.generation.seed.replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,40)+'.json';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  $('copy').onclick=async()=>{
    if(!current)return;try{await navigator.clipboard.writeText(playURL());status('试玩链接已复制，可在手机上打开。');}catch{status('浏览器未允许复制链接，请点击试玩后复制地址栏网址。',true);}
  };
  form.addEventListener('change',()=>{if(current&&!busy)status('参数已修改，点击生成以应用；当前预览和导出仍为上一关。');else if(!busy){const o=readOptions();drawCurve(MFLevel.profile(o.difficulty,o.rhythm));}});
  drawBoard();const initial=readOptions();drawCurve(MFLevel.profile(initial.difficulty,initial.rhythm));
  if(location.protocol!=='file:')form.requestSubmit();
})();

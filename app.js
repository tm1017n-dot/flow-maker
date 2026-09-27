/* Flow Maker prototype — runs locally without a server or external packages. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const K = 'flow-maker-recovery-v1';
  const TYPES = {start:'開始・終了',task:'作業',decision:'判断',document:'帳票',system:'システム'};
  const SIZES = {start:[126,54],task:[172,76],decision:[148,94],document:[144,67],system:[144,67]};
  const COLORS = {start:['#dcf8ee','#2dbb92'],task:['#e8efff','#6687e8'],decision:['#fff3d9','#e5ad41'],document:['#f3eaff','#ae83df'],system:['#e3f5fa','#60b5c9']};
  let model, selected = null, connecting = null, zoom = 1, dirty = false;
  let undo = [], redo = [], drag = null, suppressClick = false, toastTimer, saveTimer, editBefore = null;
  const uid = () => (globalThis.crypto?.randomUUID?.() || `id-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const clearRecovery = () => {try{localStorage.removeItem(K);}catch{ /* Private browsing may disable storage. */ }};
  const clone = value => JSON.parse(JSON.stringify(value));
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const getNode = id => model.nodes.find(n => n.id === id);
  const getLane = id => model.lanes.find(l => l.id === id);
  const isFlow = n => n && !['document','system'].includes(n.type);
  const limit = (v,min,max) => Math.max(min,Math.min(max,v));
  const width = () => Math.max(1160,model.lanes.length * 260 + 110);
  const height = () => Math.max(790, model.nodes.reduce((m,n) => Math.max(m,n.y+110),0)+90);
  const laneX = i => 54 + i * 260;
  const laneCenter = id => laneX(Math.max(0,model.lanes.findIndex(l => l.id === id))) + 120;
  const sample = () => {
    const lanes = ['住民','窓口担当','審査担当','決裁担当'].map(name=>({id:uid(),name}));
    const at = (type,label,lane,y,xoff=0) => ({id:uid(),type,label,laneId:lanes[lane].id,x:laneCenterFromIndex(lane)+xoff,y,description:''});
    const nodes = [at('start','申請',0,215),at('task','申請書を受け付ける',1,215),at('decision','書類に不備がある？',1,420),at('task','不足書類を案内する',0,575),at('task','内容を審査する',2,420),at('task','決裁する',3,420),at('start','処理完了',3,640),at('document','申請書',1,90,75),at('system','申請管理システム',2,255,70)];
    const edge=(a,b,label='')=>({id:uid(),from:nodes[a].id,to:nodes[b].id,label});
    return {version:1,id:uid(),title:'申請受付の業務フロー',lanes,nodes,edges:[edge(0,1),edge(1,2),edge(2,3,'あり'),edge(2,4,'なし'),edge(3,1,'再提出'),edge(4,5),edge(5,6)],associations:[{id:uid(),artifact:nodes[7].id,task:nodes[1].id},{id:uid(),artifact:nodes[8].id,task:nodes[4].id}]};
  };
  function laneCenterFromIndex(i){return 54+i*260+120;}
  function empty(){const l={id:uid(),name:'担当者'};return {version:1,id:uid(),title:'新しい業務フロー',lanes:[l],nodes:[],edges:[],associations:[]};}
  function notify(msg){const t=$('toast');t.textContent=msg;t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),3000);}
  function scheduleRecovery(){clearTimeout(saveTimer);saveTimer=setTimeout(()=>{try{localStorage.setItem(K,JSON.stringify({at:Date.now(),model}));}catch{notify('一時保存できませんでした。編集用ファイルを保存してください。');}},350);}
  function changed(before){undo.push(before || clone(model));if(undo.length>60)undo.shift();redo=[];dirty=true;status();scheduleRecovery();render();}
  function status(){$('saveStatus').textContent=dirty?'未保存の変更があります':'編集用ファイルに保存済み';$('saveStatus').style.color=dirty?'#c48b45':'#2f9b7b';}
  function load(next, isDirty=false){model=next;selected=null;connecting=null;undo=[];redo=[];dirty=isDirty;zoom=1;$('flowTitle').value=model.title;status();render();}
  function confirmLoss(){return !dirty || confirm('未保存の変更があります。現在の図を閉じますか？');}
  function validate(data){
    if(!data||data.version!==1||!Array.isArray(data.lanes)||!Array.isArray(data.nodes)||!Array.isArray(data.edges)||!Array.isArray(data.associations)||!data.lanes.length||typeof data.title!=='string'||typeof data.id!=='string')throw Error('対応していない形式です。');
    if(data.lanes.length>30||data.nodes.length>1000||data.edges.length>3000)throw Error('この試作版で扱える図の規模を超えています。');
    const ids=new Set(data.nodes.map(n=>n.id)), lanes=new Set(data.lanes.map(l=>l.id));
    if(data.nodes.some(n=>!TYPES[n.type]||!ids.has(n.id)||!lanes.has(n.laneId)||!Number.isFinite(n.x)||!Number.isFinite(n.y)||typeof n.label!=='string')||data.edges.some(e=>!ids.has(e.from)||!ids.has(e.to)||typeof e.label!=='string')||data.associations.some(a=>!ids.has(a.task)||!ids.has(a.artifact)))throw Error('図形または接続のデータが正しくありません。');
    return data;
  }
  function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
  function filename(ext){return (model.title.trim()||'業務フロー').replace(/[\\/:*?"<>|]/g,'_').slice(0,80)+'.'+ext;}
  function save(){download(new Blob([JSON.stringify(model,null,2)],{type:'application/json'}),filename('json'));dirty=false;clearRecovery();status();notify('編集用ファイルを保存しました。ダウンロード先をご確認ください。');}
  const labelLines = (text,max=13,lines=3) => {const chars=Array.from(text||'');const result=[];while(chars.length && result.length<lines){result.push(chars.splice(0,max).join(''));}if(chars.length)result[result.length-1]=result[result.length-1].slice(0,-1)+'…';return result.length?result:['名称なし'];};
  function textSvg(str,x,y,max=13,count=3,size=13,color='#293551'){
    const parts=labelLines(str,max,count),start=y-(parts.length-1)*8;
    return `<text x="${x}" y="${start}" text-anchor="middle" dominant-baseline="middle" font-size="${size}" font-weight="700" fill="${color}" font-family="Segoe UI,Yu Gothic UI,Meiryo,sans-serif">${parts.map((p,i)=>`<tspan x="${x}" dy="${i?17:0}">${esc(p)}</tspan>`).join('')}</text>`;
  }
  function nodeSvg(n, interactive){
    const [w,h]=SIZES[n.type], x=n.x-w/2,y=n.y-h/2,[fill,stroke]=COLORS[n.type],sel=selected?.kind==='node'&&selected.id===n.id;
    const group=`data-node="${esc(n.id)}" style="cursor:${interactive?'grab':'default'}"`;
    let shape='';
    if(n.type==='decision')shape=`<path d="M ${n.x} ${y} L ${x+w} ${n.y} L ${n.x} ${y+h} L ${x} ${n.y} Z" fill="${fill}" stroke="${sel?'#5e55df':stroke}" stroke-width="${sel?3:1.6}"/>`;
    else if(n.type==='start')shape=`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="27" fill="${fill}" stroke="${sel?'#5e55df':stroke}" stroke-width="${sel?3:1.5}"/>`;
    else shape=`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${n.type==='task'?12:8}" fill="${fill}" stroke="${sel?'#5e55df':stroke}" stroke-width="${sel?3:1.4}"/>`;
    const icon=n.type==='document'?'▤':n.type==='system'?'▧':'';
    return `<g ${group}>${sel?`<rect x="${x-6}" y="${y-6}" width="${w+12}" height="${h+12}" rx="16" fill="none" stroke="#958cfa" stroke-width="1" stroke-dasharray="4 4"/>`:''}${shape}${icon?`<text x="${x+15}" y="${y+23}" font-size="17" fill="${stroke}">${icon}</text>`:''}${textSvg(n.label,n.x,n.y+(icon?7:0),n.type==='decision'?10:n.type==='start'?11:13,3,n.type==='document'||n.type==='system'?12:13)}</g>`;
  }
  function edgePath(a,b){
    const wa=SIZES[a.type][0]/2, wb=SIZES[b.type][0]/2,ha=SIZES[a.type][1]/2,hb=SIZES[b.type][1]/2;
    if(Math.abs(b.x-a.x)<110){
      const down=b.y>=a.y, y1=a.y+(down?ha:-ha), y2=b.y+(down?-hb:hb), mid=(y1+y2)/2;
      return {d:`M ${a.x} ${y1} L ${a.x} ${mid} L ${b.x} ${mid} L ${b.x} ${y2}`,lx:(a.x+b.x)/2+44,ly:mid};
    }
    if(b.x>a.x+35){let x1=a.x+wa,x2=b.x-wb,mid=(x1+x2)/2;return {d:`M ${x1} ${a.y} L ${mid} ${a.y} L ${mid} ${b.y} L ${x2} ${b.y}`,lx:mid,ly:(a.y+b.y)/2};}
    const via=Math.min(a.y-ha,b.y-hb)-45;return {d:`M ${a.x} ${a.y-ha} L ${a.x} ${via} L ${b.x} ${via} L ${b.x} ${b.y-hb}`,lx:(a.x+b.x)/2,ly:via-10};
  }
  function svgMarkup(interactive=true){
    const W=width(),H=height();
    const laneMarkup=model.lanes.map((l,i)=>`<g ${interactive?`data-lane="${esc(l.id)}"`:''}><rect x="${laneX(i)}" y="65" width="240" height="${H-111}" rx="14" fill="${i%2?'#f8faff':'#f5f7fc'}" stroke="#e4e9f3"/><rect x="${laneX(i)}" y="65" width="240" height="53" rx="13" fill="${i%2?'#eaeefa':'#e5eaf8'}"/><rect x="${laneX(i)}" y="106" width="240" height="12" fill="${i%2?'#eaeefa':'#e5eaf8'}"/><circle cx="${laneX(i)+19}" cy="92" r="4" fill="#7065df"/><text x="${laneX(i)+32}" y="97" font-size="13" font-weight="750" fill="#344264" font-family="Segoe UI,Yu Gothic UI,Meiryo,sans-serif">${esc(l.name.slice(0,16))}</text><text x="${laneX(i)+214}" y="97" font-size="10" text-anchor="end" fill="#9ca8c3">${String(i+1).padStart(2,'0')}</text></g>`).join('');
    const edges=model.edges.map(e=>{const a=getNode(e.from),b=getNode(e.to);if(!a||!b)return '';const p=edgePath(a,b),sel=selected?.kind==='edge'&&selected.id===e.id;return `<g ${interactive?`data-edge="${esc(e.id)}" style="cursor:pointer"`:''}><path d="${p.d}" fill="none" stroke="${sel?'#675be7':'#8a98b5'}" stroke-width="${sel?3:2}" marker-end="url(#arrow)" stroke-linecap="round" stroke-linejoin="round"/><path d="${p.d}" fill="none" stroke="transparent" stroke-width="17"/>${e.label?`<rect x="${p.lx-38}" y="${p.ly-13}" width="76" height="25" rx="7" fill="white" stroke="#dfe4ee"/>${textSvg(e.label,p.lx,p.ly,8,1,11,'#53617f')}`:''}</g>`;}).join('');
    const assoc=model.associations.map(a=>{const n=getNode(a.artifact),t=getNode(a.task);if(!n||!t)return '';return `<line x1="${n.x}" y1="${n.y}" x2="${t.x}" y2="${t.y}" stroke="#b6a6d1" stroke-width="1.5" stroke-dasharray="5 5"/>`;}).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs><marker id="arrow" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto"><path d="M 0 0 L 9 4.5 L 0 9 z" fill="#8a98b5"/></marker></defs><rect width="${W}" height="${H}" fill="white"/><text x="54" y="38" font-size="16" font-weight="800" fill="#26334e" font-family="Segoe UI,Yu Gothic UI,Meiryo,sans-serif">${esc(model.title.slice(0,80))}</text>${laneMarkup}${assoc}${edges}${model.nodes.map(n=>nodeSvg(n,interactive)).join('')}</svg>`;
  }
  function renderCanvas(){const W=width(),H=height(),s=$('canvas');s.setAttribute('viewBox',`0 0 ${W} ${H}`);s.setAttribute('width',W*zoom);s.setAttribute('height',H*zoom);$('canvasInner').style.width=`${W*zoom}px`;$('canvasInner').style.height=`${H*zoom}px`;const markup=svgMarkup(true);s.innerHTML=markup.slice(markup.indexOf('>')+1,-6);$('zoomLabel').textContent=`${Math.round(zoom*100)}%`;}
  function render(){renderCanvas();renderInspector();$('counts').textContent=`${model.lanes.length} レーン・${model.nodes.length} 図形`;$('footerMeta').textContent=`${model.lanes.length} 担当 / ${model.edges.length} 接続`;$('undoBtn').disabled=!undo.length;$('redoBtn').disabled=!redo.length;$('hint').textContent=connecting?'接続先の図形をクリックしてください。Escでキャンセルできます。':'図形を選んで、右側で内容を編集できます。';}
  function renderInspector(){const el=$('inspectorBody');
    if(connecting){el.innerHTML=`<div class="inspector-content"><div class="connection-banner">${connecting.mode==='associate'?'関連付け':'矢印の接続'}モード</div><h3>接続先を選択</h3><p class="inspector-note">キャンバス上の図形をクリックしてください。Escキーで取り消せます。</p><div class="inspector-actions"><button id="cancelConnect">キャンセル</button></div></div>`;return;}
    if(!selected){el.innerHTML='<div class="empty-inspector"><div class="empty-visual">⌗</div><strong>図形を選択してください</strong>キャンバス上の図形や矢印をクリックすると、ここで編集できます。<div class="hint-card"><b>クイックガイド</b>左のパレットから図形を追加。ドラッグで位置を調整し、「つなぐ」で流れを作ります。</div></div>';return;}
    if(selected.kind==='node'){
      const n=getNode(selected.id);if(!n){selected=null;renderInspector();return;}const artifact=!isFlow(n);
      el.innerHTML=`<div class="inspector-content"><div class="inspector-kicker">${artifact?'REFERENCE':'FLOW NODE'} / ${esc(TYPES[n.type])}</div><h3>${esc(TYPES[n.type])}を編集</h3><label for="nodeLabel">表示する文言</label><textarea id="nodeLabel" data-field="label" maxlength="100">${esc(n.label)}</textarea><label for="nodeLane">担当レーン</label><select id="nodeLane" data-field="laneId">${model.lanes.map(l=>`<option value="${esc(l.id)}" ${l.id===n.laneId?'selected':''}>${esc(l.name)}</option>`).join('')}</select><label for="nodeDesc">補足メモ（編集用）</label><textarea id="nodeDesc" data-field="description" maxlength="500" placeholder="必要な手順や注意事項">${esc(n.description||'')}</textarea><div class="inspector-actions">${artifact?'<button class="accent" data-action="associate">作業に関連付ける</button>':'<button class="accent" data-action="connect">→ つなぐ</button>'}<button data-action="duplicate">複製</button><button class="danger" data-action="delete">削除</button></div><p class="inspector-note">${artifact?'関連付けは破線で表示されます。':'図形の移動中も矢印は接続されたままです。'}</p></div>`;return;
    }
    if(selected.kind==='edge'){const e=model.edges.find(x=>x.id===selected.id);if(!e){selected=null;renderInspector();return;}el.innerHTML=`<div class="inspector-content"><div class="inspector-kicker">CONNECTION</div><h3>矢印を編集</h3><label for="edgeLabel">条件・ラベル</label><input id="edgeLabel" data-field="edgeLabel" value="${esc(e.label)}" maxlength="40" placeholder="例：不備あり"><p class="inspector-note">判断からの分岐には、それぞれの条件を入力してください。</p><div class="inspector-actions"><button class="danger" data-action="delete">矢印を削除</button></div></div>`;return;}
    const l=getLane(selected.id);if(!l){selected=null;renderInspector();return;}el.innerHTML=`<div class="inspector-content"><div class="inspector-kicker">SWIMLANE</div><h3>担当レーンを編集</h3><label for="laneName">担当・部署名</label><input id="laneName" data-field="laneName" value="${esc(l.name)}" maxlength="40"><div class="inspector-actions"><button data-action="laneLeft">← 左へ</button><button data-action="laneRight">右へ →</button><button class="danger" data-action="delete">削除</button></div><p class="inspector-note">レーンを並べ替えると、中の図形も一緒に移動します。</p></div>`;
  }
  function select(kind,id){selected={kind,id};render();}
  function addNode(type){const before=clone(model),lane=model.lanes[0];const others=model.nodes.filter(n=>n.laneId===lane.id),y=others.length?Math.max(200,...others.map(n=>n.y+130)):215;const n={id:uid(),type,label:{start:'開始',task:'新しい作業',decision:'条件を確認',document:'帳票名',system:'システム名'}[type],laneId:lane.id,x:laneCenter(lane.id),y,description:''};model.nodes.push(n);selected={kind:'node',id:n.id};changed(before);$('canvasScroll').scrollTop=Math.max(0,(y-250)*zoom);}
  function addLane(){if(model.lanes.length>=12){notify('試作版では最大12レーンです。');return;}const before=clone(model);const l={id:uid(),name:`担当 ${model.lanes.length+1}`};model.lanes.push(l);selected={kind:'lane',id:l.id};changed(before);$('canvasScroll').scrollLeft=width()*zoom;}
  function deleteSelected(){if(!selected)return;const before=clone(model);if(selected.kind==='node'){model.nodes=model.nodes.filter(n=>n.id!==selected.id);model.edges=model.edges.filter(e=>e.from!==selected.id&&e.to!==selected.id);model.associations=model.associations.filter(a=>a.artifact!==selected.id&&a.task!==selected.id);}else if(selected.kind==='edge')model.edges=model.edges.filter(e=>e.id!==selected.id);else{if(model.lanes.length===1){notify('最後のレーンは削除できません。');return;}const count=model.nodes.filter(n=>n.laneId===selected.id).length;if(count&&!confirm(`このレーンには${count}件の図形があります。図形と接続も削除しますか？`))return;const ids=new Set(model.nodes.filter(n=>n.laneId===selected.id).map(n=>n.id));model.nodes=model.nodes.filter(n=>!ids.has(n.id));model.edges=model.edges.filter(e=>!ids.has(e.from)&&!ids.has(e.to));model.associations=model.associations.filter(a=>!ids.has(a.artifact)&&!ids.has(a.task));model.lanes=model.lanes.filter(l=>l.id!==selected.id);}selected=null;changed(before);}
  function connectTo(id){const from=getNode(connecting.from),to=getNode(id);if(!from||!to||from.id===to.id){notify('別の図形を選んでください。');return;}if(connecting.mode==='associate'){
      if(!isFlow(to)){notify('関連付け先には作業や判断を選んでください。');return;}
      if(model.associations.some(a=>a.artifact===from.id&&a.task===to.id)){notify('すでに関連付けています。');connecting=null;render();return;}
      const before=clone(model);model.associations.push({id:uid(),artifact:from.id,task:to.id});connecting=null;selected={kind:'node',id:from.id};changed(before);
    }else{
      if(!isFlow(to)){notify('帳票・システムは作業に関連付けてください。');return;}
      if(model.edges.some(e=>e.from===from.id&&e.to===to.id)){notify('すでに接続されています。');connecting=null;render();return;}
      const before=clone(model),e={id:uid(),from:from.id,to:to.id,label:''};model.edges.push(e);connecting=null;selected={kind:'edge',id:e.id};changed(before);
    }
  }
  function coordinate(ev){const rect=$('canvas').getBoundingClientRect();return {x:(ev.clientX-rect.left)*width()/rect.width,y:(ev.clientY-rect.top)*height()/rect.height};}
  function laneAt(x){const i=limit(Math.floor((x-54)/260),0,model.lanes.length-1);return model.lanes[i];}
  function preview(){const svg=svgMarkup(false);$('exportPreview').innerHTML=svg;const paper=$('paperSize').value;const ratio=paper==='a4'?1.414:1.414;const shape=width()/height();$('exportWarning').textContent=width()>1900||height()>1250?'図が大きいため、1ページに収めると文字が小さくなる可能性があります。A3で確認してください。':Math.abs(shape-ratio)>.4?'ページの余白が広くなる可能性があります。プレビューを確認してください。':'';}
  function exportSvg(){return svgMarkup(false).replace('<svg ','<svg style="background:#ffffff" ');}
  async function png(){try{const blob=new Blob([exportSvg()],{type:'image/svg+xml;charset=utf-8'}),url=URL.createObjectURL(blob),img=new Image();await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;img.src=url;});const canvas=document.createElement('canvas');canvas.width=width()*2;canvas.height=height()*2;const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);URL.revokeObjectURL(url);canvas.toBlob(b=>{if(b){download(b,filename('png'));notify('PNGを保存しました。');}else notify('PNGの作成に失敗しました。');},'image/png');}catch(e){notify('PNGの作成に失敗しました。ブラウザを確認してください。');console.error(e);}}
  function pdf(){const area=$('printArea');area.innerHTML=exportSvg();const style=document.createElement('style');style.id='pageStyle';const a3=$('paperSize').value==='a3';style.textContent=`@page{size:${a3?'A3':'A4'} landscape;margin:10mm}@media print{#printArea svg{max-height:${a3?'277':'185'}mm}}`;document.getElementById('pageStyle')?.remove();document.head.append(style);$('exportDialog').close();setTimeout(()=>window.print(),60);}
  function undoAction(){if(!undo.length)return;redo.push(clone(model));model=undo.pop();selected=null;connecting=null;dirty=true;$('flowTitle').value=model.title;status();scheduleRecovery();render();}
  function redoAction(){if(!redo.length)return;undo.push(clone(model));model=redo.pop();selected=null;connecting=null;dirty=true;$('flowTitle').value=model.title;status();scheduleRecovery();render();}

  $('palette').addEventListener('click',e=>{const b=e.target.closest('[data-add]');if(b)addNode(b.dataset.add);});$('addLane').onclick=addLane;
  $('canvas').addEventListener('pointerdown',e=>{const group=e.target.closest('[data-node]');if(!group||connecting)return;const n=getNode(group.dataset.node),p=coordinate(e);drag={id:n.id,before:clone(model),dx:n.x-p.x,dy:n.y-p.y,moved:false};$('canvas').setPointerCapture(e.pointerId);});
  $('canvas').addEventListener('pointermove',e=>{if(!drag)return;const n=getNode(drag.id),p=coordinate(e);if(Math.abs(n.x-(p.x+drag.dx))>2||Math.abs(n.y-(p.y+drag.dy))>2)drag.moved=true;if(!drag.moved)return;n.x=limit(Math.round(p.x+drag.dx),35,width()-35);n.y=limit(Math.round(p.y+drag.dy),155,height()-45);renderCanvas();});
  $('canvas').addEventListener('pointerup',e=>{if(!drag)return;const d=drag;drag=null;if(d.moved){const n=getNode(d.id),oldIndex=model.lanes.findIndex(l=>l.id===n.laneId),lane=laneAt(n.x);if(lane.id!==n.laneId){n.laneId=lane.id;const delta=(model.lanes.findIndex(l=>l.id===lane.id)-oldIndex)*260;n.x=laneCenter(lane.id)+limit(n.x-(laneCenterFromIndex(oldIndex)+delta),-75,75);}selected={kind:'node',id:n.id};suppressClick=true;changed(d.before);e.preventDefault();}else select('node',d.id);});
  $('canvas').addEventListener('pointercancel',()=>{drag=null;});
  $('canvas').addEventListener('click',e=>{if(suppressClick){suppressClick=false;return;}if(drag)return;const node=e.target.closest('[data-node]'),edge=e.target.closest('[data-edge]'),lane=e.target.closest('[data-lane]');if(connecting){if(node)connectTo(node.dataset.node);return;}if(node)select('node',node.dataset.node);else if(edge)select('edge',edge.dataset.edge);else if(lane)select('lane',lane.dataset.lane);else{selected=null;render();}});
  $('inspectorBody').addEventListener('click',e=>{if(e.target.id==='cancelConnect'){connecting=null;render();return;}const action=e.target.closest('[data-action]')?.dataset.action;if(!action||!selected)return;if(action==='delete'){deleteSelected();return;}if(action==='connect'||action==='associate'){connecting={mode:action,from:selected.id};render();return;}if(action==='duplicate'){const n=getNode(selected.id),before=clone(model),copy={...clone(n),id:uid(),x:n.x+28,y:n.y+105};model.nodes.push(copy);selected={kind:'node',id:copy.id};changed(before);return;}if(action==='laneLeft'||action==='laneRight'){const i=model.lanes.findIndex(l=>l.id===selected.id),j=i+(action==='laneLeft'?-1:1);if(j<0||j>=model.lanes.length)return;const before=clone(model),a=model.lanes[i],b=model.lanes[j];[model.lanes[i],model.lanes[j]]=[b,a];model.nodes.forEach(n=>{if(n.laneId===a.id)n.x+=(j-i)*260;else if(n.laneId===b.id)n.x+=(i-j)*260;});changed(before);}});
  $('inspectorBody').addEventListener('focusin',e=>{if(e.target.matches('[data-field]'))editBefore=clone(model);});
  $('inspectorBody').addEventListener('input',e=>{const f=e.target.dataset.field;if(!f||!selected)return;if(selected.kind==='node'){const n=getNode(selected.id);if(f==='label')n.label=e.target.value;if(f==='description')n.description=e.target.value;}else if(selected.kind==='edge'&&f==='edgeLabel')model.edges.find(x=>x.id===selected.id).label=e.target.value;else if(selected.kind==='lane'&&f==='laneName')getLane(selected.id).name=e.target.value;dirty=true;status();scheduleRecovery();renderCanvas();});
  $('inspectorBody').addEventListener('change',e=>{const f=e.target.dataset.field;if(!f||!selected)return;const before=editBefore||clone(model);if(f==='laneId'){const n=getNode(selected.id);const old=model.lanes.findIndex(l=>l.id===n.laneId),next=model.lanes.findIndex(l=>l.id===e.target.value);n.x+=(next-old)*260;n.laneId=e.target.value;}if(JSON.stringify(before)!==JSON.stringify(model))changed(before);editBefore=null;});
  $('flowTitle').addEventListener('focus',()=>editBefore=clone(model));$('flowTitle').addEventListener('input',e=>{model.title=e.target.value;dirty=true;status();scheduleRecovery();renderCanvas();});$('flowTitle').addEventListener('change',()=>{if(editBefore&&JSON.stringify(editBefore)!==JSON.stringify(model))changed(editBefore);editBefore=null;});
  $('saveBtn').onclick=save;$('openBtn').onclick=()=>{if(confirmLoss())$('fileInput').click();};$('fileInput').onchange=async e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;try{if(file.size>5_000_000)throw Error('ファイルが大きすぎます。');const data=validate(JSON.parse(await file.text()));load(data,false);clearRecovery();notify('編集用ファイルを開きました。');}catch(err){notify('開けませんでした: '+err.message);}};
  $('newBtn').onclick=()=>{if(confirmLoss()){load(empty(),true);scheduleRecovery();notify('新しい図を作成しました。');}};
  $('sampleBtn').onclick=()=>{if(confirmLoss()){load(sample(),true);scheduleRecovery();notify('サンプルを読み込みました。');}};
  $('undoBtn').onclick=undoAction;$('redoBtn').onclick=redoAction;
  $('zoomIn').onclick=()=>{zoom=limit(Math.round((zoom+.1)*10)/10,.4,1.5);renderCanvas();};$('zoomOut').onclick=()=>{zoom=limit(Math.round((zoom-.1)*10)/10,.4,1.5);renderCanvas();};$('fitBtn').onclick=()=>{zoom=limit(Math.floor(Math.min($('canvasScroll').clientWidth/width(),$('canvasScroll').clientHeight/height())*10)/10,.4,1.5);renderCanvas();$('canvasScroll').scrollTo(0,0);};
  $('exportBtn').onclick=()=>{preview();$('exportDialog').showModal();};$('paperSize').onchange=preview;$('pngBtn').onclick=png;$('pdfBtn').onclick=pdf;
  document.addEventListener('keydown',e=>{const editable=e.target.matches('input,textarea,select');if(e.key==='Escape'&&connecting){connecting=null;render();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();save();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'&&!editable){e.preventDefault();undoAction();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'&&!editable){e.preventDefault();redoAction();}if(e.key==='Delete'&&!editable&&!$('exportDialog').open)deleteSelected();});
  window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
  try{const draft=JSON.parse(localStorage.getItem(K));if(draft?.model){validate(draft.model);const when=new Date(draft.at).toLocaleString('ja-JP');if(confirm(`一時保存された「${draft.model.title}」（${when}）があります。復旧しますか？`)){load(draft.model,true);notify('一時保存から復旧しました。編集用ファイルも保存してください。');}else{clearRecovery();load(sample(),true);}}else load(sample(),true);}catch{clearRecovery();load(sample(),true);}
})();

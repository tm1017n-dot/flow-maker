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
  let recoveryGeneration = 0, lastDownloadAt = null, savedSnapshot = null;
  const uid = () => (globalThis.crypto?.randomUUID?.() || `id-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const clearRecovery = () => {clearTimeout(saveTimer);recoveryGeneration++;try{localStorage.removeItem(K);}catch{ /* Private browsing may disable storage. */ }};
  const clone = value => JSON.parse(JSON.stringify(value));
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const getNode = id => model.nodes.find(n => n.id === id);
  const getLane = id => model.lanes.find(l => l.id === id);
  const isFlow = n => n && !['document','system'].includes(n.type);
  const limit = (v,min,max) => Math.max(min,Math.min(max,v));
  const width = () => Math.max(1160,model.lanes.length * 260 + 110,...model.nodes.map(n=>n.x+nodeGeometry(n).w/2+55),...model.edges.map(e=>{const p=edgePath(getNode(e.from),getNode(e.to),e);return Math.max(p.hx+50,p.lx+130);}));
  const height = () => Math.max(790,...model.nodes.map(n=>n.y+nodeGeometry(n).h/2+90),...model.edges.map(e=>{const p=edgePath(getNode(e.from),getNode(e.to),e);return Math.max(p.hy+60,p.ly+wrapText(e.label,180,11).length*8+60);}));
  const laneX = i => 54 + i * 260;
  const laneCenter = id => laneX(Math.max(0,model.lanes.findIndex(l => l.id === id))) + 120;
  const sample = () => {
    const lanes = ['住民','窓口担当','審査担当','決裁担当'].map(name=>({id:uid(),name}));
    const at = (type,label,lane,y,xoff=0) => ({id:uid(),type,label,laneId:lanes[lane].id,x:laneCenterFromIndex(lane)+xoff,y,description:''});
    const nodes = [at('start','申請',0,215),at('task','申請書を受け付ける',1,215),at('decision','書類に不備がある？',1,420),at('task','不足書類を案内する',0,575),at('task','内容を審査する',2,420),at('task','決裁する',3,420),at('start','処理完了',3,640),at('document','申請書',1,305,35),at('system','申請管理システム',2,255,70)];
    const edge=(a,b,label='')=>({id:uid(),from:nodes[a].id,to:nodes[b].id,label});
    return {version:1,id:uid(),title:'申請受付の業務フロー',lanes,nodes,edges:[edge(0,1),edge(1,2),edge(2,3,'あり'),edge(2,4,'なし'),edge(3,1,'再提出'),edge(4,5),edge(5,6)],associations:[{id:uid(),artifact:nodes[7].id,task:nodes[1].id},{id:uid(),artifact:nodes[8].id,task:nodes[4].id}]};
  };
  function laneCenterFromIndex(i){return 54+i*260+120;}
  function empty(){const l={id:uid(),name:'担当者'};return {version:1,id:uid(),title:'新しい業務フロー',lanes:[l],nodes:[],edges:[],associations:[]};}
  function notify(msg){const t=$('toast');t.textContent=msg;t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),3000);}
  function writeRecovery(){if(!dirty)return;try{localStorage.setItem(K,JSON.stringify({at:Date.now(),model}));}catch{notify('一時保存できませんでした。編集用ファイルを保存してください。');}}
  function scheduleRecovery(){clearTimeout(saveTimer);const generation=++recoveryGeneration,id=model.id;saveTimer=setTimeout(()=>{if(generation===recoveryGeneration&&model.id===id)writeRecovery();},350);}
  function changed(before){undo.push(before || clone(model));if(undo.length>60)undo.shift();redo=[];dirty=true;status();scheduleRecovery();render();}
  function status(){dirty=savedSnapshot===null||JSON.stringify(model)!==savedSnapshot;$('saveStatus').textContent=dirty?'未保存の変更があります':lastDownloadAt?`保存用ファイルのダウンロードを開始 · ${lastDownloadAt.toLocaleTimeString('ja-JP')}`:'読み込んだ状態から変更なし';$('saveStatus').style.color=dirty?'#c48b45':'#2f9b7b';}
  function load(next, isDirty=false){
    const previous={model,selected,connecting,undo,redo,dirty,zoom,lastDownloadAt,savedSnapshot};
    try{model=validate(clone(next));selected=null;connecting=null;undo=[];redo=[];dirty=isDirty;zoom=1;lastDownloadAt=null;savedSnapshot=isDirty?null:JSON.stringify(model);render();}
    catch(error){({model,selected,connecting,undo,redo,dirty,zoom,lastDownloadAt,savedSnapshot}=previous);if(model)render();throw error;}
    clearTimeout(saveTimer);recoveryGeneration++;$('flowTitle').value=model.title;status();
  }
  function confirmLoss(){return !dirty || confirm('未保存の変更があります。現在の図を閉じますか？');}
  function validate(data){
    if(!data||data.version!==1||!Array.isArray(data.lanes)||!Array.isArray(data.nodes)||!Array.isArray(data.edges)||!Array.isArray(data.associations)||!data.lanes.length||typeof data.title!=='string'||typeof data.id!=='string')throw Error('対応していない形式です。');
    if(data.lanes.length>30||data.nodes.length>1000||data.edges.length>3000)throw Error('この試作版で扱える図の規模を超えています。');
    const string=(v,max=1000)=>typeof v==='string'&&v.length<=max;
    const number=(v,min,max)=>Number.isFinite(v)&&v>=min&&v<=max;
    const allIds=new Set();
    for(const item of [...data.lanes,...data.nodes,...data.edges,...data.associations]){if(!item||!string(item.id,200)||!item.id||allIds.has(item.id))throw Error('IDが不足しているか重複しています。');allIds.add(item.id);}
    if(!string(data.title,200)||data.lanes.some(l=>!string(l.name,100)))throw Error('図や担当レーンの名前が正しくありません。');
    const nodes=new Map(data.nodes.map(n=>[n.id,n])),lanes=new Set(data.lanes.map(l=>l.id));
    for(const n of data.nodes){if(!Object.hasOwn(TYPES,n.type)||!lanes.has(n.laneId)||!number(n.x,0,100000)||!number(n.y,0,100000)||!string(n.label)||n.description!==undefined&&!string(n.description,2000))throw Error('図形のデータが正しくありません。');
      for(const [key,min,max] of [['width',80,600],['height',40,2000],['fontSize',10,24]])if(n[key]!==undefined&&!number(n[key],min,max))throw Error('図形サイズが正しくありません。');}
    for(const e of data.edges){if(!isFlow(nodes.get(e.from))||!isFlow(nodes.get(e.to))||e.from===e.to||!string(e.label,200))throw Error('矢印の接続が正しくありません。');
      for(const key of ['fromPort','toPort'])if(e[key]!==undefined&&!['auto','top','right','bottom','left'].includes(e[key]))throw Error('矢印の接続位置が正しくありません。');
      if(e.routeAxis!==undefined&&!['auto','x','y'].includes(e.routeAxis))throw Error('矢印の経路が正しくありません。');
      for(const key of ['bend','labelDx','labelDy'])if(e[key]!==undefined&&!number(e[key],-100000,100000))throw Error('矢印の座標が正しくありません。');}
    for(const a of data.associations){if(!nodes.has(a.artifact)||isFlow(nodes.get(a.artifact))||!isFlow(nodes.get(a.task)))throw Error('帳票・システムの関連付けが正しくありません。');}
    return data;
  }
  function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
  function filename(ext){return (model.title.trim()||'業務フロー').replace(/[\\/:*?"<>|]/g,'_').slice(0,80)+'.'+ext;}
  function save(){try{download(new Blob([JSON.stringify(model,null,2)],{type:'application/json'}),filename('json'));dirty=false;savedSnapshot=JSON.stringify(model);lastDownloadAt=new Date();clearRecovery();status();notify('保存用JSONのダウンロードを開始しました。保存先をご確認ください。');}catch{notify('ダウンロードを開始できませんでした。再度保存してください。');}}
  const FONT = 'Segoe UI,Yu Gothic UI,Meiryo,sans-serif';
  let measureContext;
  function textWidth(text,size=13){if(!measureContext)measureContext=document.createElement('canvas').getContext('2d');measureContext.font=`700 ${size}px ${FONT}`;return measureContext.measureText(text).width;}
  function wrapText(text,available,size=13){
    const result=[];for(const paragraph of String(text||'名称なし').split('\n')){let line='';for(const char of Array.from(paragraph)){if(line&&textWidth(line+char,size)>available){result.push(line);line=char;}else line+=char;}result.push(line);}
    return result;
  }
  function textSvg(str,x,y,available=150,size=13,color='#293551'){
    const parts=wrapText(str,available,size),gap=size*1.4,start=y-(parts.length-1)*gap/2;
    return `<text x="${x}" y="${start}" text-anchor="middle" dominant-baseline="middle" font-size="${size}" font-weight="700" fill="${color}" font-family="${FONT}">${parts.map((p,i)=>`<tspan x="${x}" dy="${i?gap:0}">${esc(p)}</tspan>`).join('')}</text>`;
  }
  function nodeGeometry(n){
    const w=n.width||SIZES[n.type][0],size=n.fontSize||13,artifact=!isFlow(n),available=n.type==='decision'?w*.56:w-30;
    const lines=wrapText(n.label,available,size),required=lines.length*size*1.4*(n.type==='decision'?2.4:1)+(artifact?40:24);
    return {w,h:Math.max(n.height||SIZES[n.type][1],required),size,available};
  }
  function nodeSvg(n, interactive){
    const {w,h,size,available}=nodeGeometry(n),x=n.x-w/2,y=n.y-h/2,[fill,stroke]=COLORS[n.type],sel=interactive&&selected?.kind==='node'&&selected.id===n.id;
    const group=interactive?`data-node="${esc(n.id)}" style="cursor:grab"`:'';
    let shape='';
    if(n.type==='decision')shape=`<path d="M ${n.x} ${y} L ${x+w} ${n.y} L ${n.x} ${y+h} L ${x} ${n.y} Z" fill="${fill}" stroke="${sel?'#5e55df':stroke}" stroke-width="${sel?3:1.6}"/>`;
    else shape=`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${n.type==='start'?Math.min(27,h/2):n.type==='task'?12:8}" fill="${fill}" stroke="${sel?'#5e55df':stroke}" stroke-width="${sel?3:1.5}"/>`;
    const icon=n.type==='document'?'▤':n.type==='system'?'▧':'';
    return `<g ${group}>${sel?`<rect data-selection="true" x="${x-6}" y="${y-6}" width="${w+12}" height="${h+12}" rx="16" fill="none" stroke="#958cfa" stroke-width="1" stroke-dasharray="4 4"/>`:''}${shape}${icon?`<text x="${x+15}" y="${y+23}" font-size="17" fill="${stroke}">${icon}</text>`:''}${textSvg(n.label,n.x,n.y+(icon?9:0),available,size)}</g>`;
  }
  function portPoint(n,port){const {w,h}=nodeGeometry(n);return {x:n.x+(port==='right'?w/2:port==='left'?-w/2:0),y:n.y+(port==='bottom'?h/2:port==='top'?-h/2:0)};}
  function edgePath(a,b,e={}){
    const vertical=Math.abs(b.x-a.x)<110,forward=b.x>a.x;
    const defaultFrom=vertical?(b.y>=a.y?'bottom':'top'):forward?'right':'top';
    const defaultTo=vertical?(b.y>=a.y?'top':'bottom'):forward?'left':'top';
    const fp=e.fromPort&&e.fromPort!=='auto'?e.fromPort:defaultFrom,tp=e.toPort&&e.toPort!=='auto'?e.toPort:defaultTo;
    const p=portPoint(a,fp),q=portPoint(b,tp);
    const axis=e.routeAxis&&e.routeAxis!=='auto'?e.routeAxis:vertical?'y':forward?'x':'y';
    const defaultBend=axis==='x'?(p.x+q.x)/2:vertical?(p.y+q.y)/2:Math.min(p.y,q.y)-45;
    const bend=e.routeAxis&&e.routeAxis!=='auto'&&Number.isFinite(e.bend)?e.bend:defaultBend;
    const stub=(point,port)=>({x:point.x+(port==='right'?20:port==='left'?-20:0),y:point.y+(port==='bottom'?20:port==='top'?-20:0)});
    const ps=stub(p,fp),qs=stub(q,tp);
    const points=axis==='x'?[p,ps,{x:bend,y:ps.y},{x:bend,y:qs.y},qs,q]:[p,ps,{x:ps.x,y:bend},{x:qs.x,y:bend},qs,q];
    const hx=axis==='x'?bend:(ps.x+qs.x)/2,hy=axis==='y'?bend:(ps.y+qs.y)/2;
    const lx=(axis==='x'?hx:hx+(vertical?44:0))+(e.labelDx||0),ly=hy+(e.labelDy||0);
    return {d:points.map((pt,i)=>`${i?'L':'M'} ${pt.x} ${pt.y}`).join(' '),lx,ly,hx,hy,axis,bend};
  }
  function svgMarkup(interactive=true){
    const W=width(),H=height(),headingHeight=Math.max(53,...model.lanes.map(l=>wrapText(l.name,174,13).length*18+20));
    const laneMarkup=model.lanes.map((l,i)=>`<g ${interactive?`data-lane="${esc(l.id)}"`:''}><rect x="${laneX(i)}" y="65" width="240" height="${H-111}" rx="14" fill="${i%2?'#f8faff':'#f5f7fc'}" stroke="#e4e9f3"/><rect x="${laneX(i)}" y="65" width="240" height="${headingHeight}" rx="13" fill="${i%2?'#eaeefa':'#e5eaf8'}"/><rect x="${laneX(i)}" y="${65+headingHeight-12}" width="240" height="12" fill="${i%2?'#eaeefa':'#e5eaf8'}"/><circle cx="${laneX(i)+19}" cy="92" r="4" fill="#7065df"/>${textSvg(l.name,laneX(i)+120,65+headingHeight/2,174,13,'#344264')}<text x="${laneX(i)+214}" y="97" font-size="10" text-anchor="end" fill="#9ca8c3">${String(i+1).padStart(2,'0')}</text></g>`).join('');
    const edges=model.edges.map(e=>{const a=getNode(e.from),b=getNode(e.to);if(!a||!b)return '';const p=edgePath(a,b,e),sel=interactive&&selected?.kind==='edge'&&selected.id===e.id;const lines=wrapText(e.label,180,11),lw=Math.max(50,...lines.map(line=>textWidth(line,11)+22)),lh=lines.length*15.4+10;return `<g ${interactive?`data-edge="${esc(e.id)}" style="cursor:pointer"`:''}><path d="${p.d}" fill="none" stroke="${sel?'#675be7':'#8a98b5'}" stroke-width="${sel?3:2}" marker-end="url(#arrow)" stroke-linecap="round" stroke-linejoin="round"/><path d="${p.d}" fill="none" stroke="transparent" stroke-width="17"/>${e.label?`<g ${interactive?`data-label-handle="${esc(e.id)}" style="cursor:move"`:''}><rect x="${p.lx-lw/2}" y="${p.ly-lh/2}" width="${lw}" height="${lh}" rx="7" fill="white" stroke="#dfe4ee"/>${textSvg(e.label,p.lx,p.ly,180,11,'#53617f')}</g>`:''}${sel?`<circle data-bend-handle="${esc(e.id)}" cx="${p.hx}" cy="${p.hy}" r="7" fill="#fff" stroke="#675be7" stroke-width="2" style="cursor:${p.axis==='x'?'ew':'ns'}-resize"/>`:''}</g>`;}).join('');
    const assoc=model.associations.map(a=>{const n=getNode(a.artifact),t=getNode(a.task);if(!n||!t)return '';return `<line x1="${n.x}" y1="${n.y}" x2="${t.x}" y2="${t.y}" stroke="#b6a6d1" stroke-width="1.5" stroke-dasharray="5 5"/>`;}).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs><marker id="arrow" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto"><path d="M 0 0 L 9 4.5 L 0 9 z" fill="#8a98b5"/></marker></defs><rect width="${W}" height="${H}" fill="white"/>${textSvg(model.title,W/2,32,W-110,16,'#26334e')}${laneMarkup}${assoc}${edges}${model.nodes.map(n=>nodeSvg(n,interactive)).join('')}</svg>`;
  }
  function renderCanvas(){const W=width(),H=height(),s=$('canvas');s.setAttribute('viewBox',`0 0 ${W} ${H}`);s.setAttribute('width',W*zoom);s.setAttribute('height',H*zoom);$('canvasInner').style.width=`${W*zoom}px`;$('canvasInner').style.height=`${H*zoom}px`;const markup=svgMarkup(true);s.innerHTML=markup.slice(markup.indexOf('>')+1,-6);$('zoomLabel').textContent=`${Math.round(zoom*100)}%`;}
  function render(){renderCanvas();renderInspector();$('counts').textContent=`${model.lanes.length} レーン・${model.nodes.length} 図形`;$('footerMeta').textContent=`${model.lanes.length} 担当 / ${model.edges.length} 接続`;$('undoBtn').disabled=!undo.length;$('redoBtn').disabled=!redo.length;$('hint').textContent=connecting?'接続先の図形をクリックしてください。Escでキャンセルできます。':'図形を選んで、右側で内容を編集できます。';}
  function renderInspector(){const el=$('inspectorBody');
    if(connecting){el.innerHTML=`<div class="inspector-content"><div class="connection-banner">${connecting.mode==='associate'?'関連付け':'矢印の接続'}モード</div><h3>接続先を選択</h3><p class="inspector-note">キャンバス上の図形をクリックしてください。Escキーで取り消せます。</p><div class="inspector-actions"><button id="cancelConnect">キャンセル</button></div></div>`;return;}
    if(!selected){el.innerHTML='<div class="empty-inspector"><div class="empty-visual">⌗</div><strong>図形を選択してください</strong>キャンバス上の図形や矢印をクリックすると、ここで編集できます。<div class="hint-card"><b>クイックガイド</b>左のパレットから図形を追加。ドラッグで位置を調整し、「つなぐ」で流れを作ります。</div></div>';return;}
    if(selected.kind==='node'){
      const n=getNode(selected.id);if(!n){selected=null;renderInspector();return;}const artifact=!isFlow(n);
      el.innerHTML=`<div class="inspector-content"><div class="inspector-kicker">${artifact?'REFERENCE':'FLOW NODE'} / ${esc(TYPES[n.type])}</div><h3>${esc(TYPES[n.type])}を編集</h3><label for="nodeLabel">表示する文言</label><textarea id="nodeLabel" data-field="label" maxlength="1000">${esc(n.label)}</textarea><label for="nodeLane">担当レーン</label><select id="nodeLane" data-field="laneId">${model.lanes.map(l=>`<option value="${esc(l.id)}" ${l.id===n.laneId?'selected':''}>${esc(l.name)}</option>`).join('')}</select><div class="property-grid"><div><label for="nodeWidth">図形の幅</label><input id="nodeWidth" type="number" data-field="width" min="80" max="600" value="${n.width||SIZES[n.type][0]}"></div><div><label for="nodeHeight">最低の高さ</label><input id="nodeHeight" type="number" data-field="height" min="40" max="2000" value="${n.height||SIZES[n.type][1]}"></div></div><label for="nodeFont">文字サイズ</label><input id="nodeFont" type="number" data-field="fontSize" min="10" max="24" value="${n.fontSize||13}"><p class="property-help">改行を保持し、全文が収まる高さへ自動で広がります。幅を広げると行数を減らせます。</p><label for="nodeDesc">補足メモ（編集用）</label><textarea id="nodeDesc" data-field="description" maxlength="500" placeholder="必要な手順や注意事項">${esc(n.description||'')}</textarea><div class="inspector-actions">${artifact?'<button class="accent" data-action="associate">作業に関連付ける</button>':'<button class="accent" data-action="connect">→ つなぐ</button>'}<button data-action="duplicate">複製</button><button class="danger" data-action="delete">削除</button></div><p class="inspector-note">${artifact?'関連付けは破線で表示されます。':'図形の移動中も矢印は接続されたままです。'}</p></div>`;return;
    }
    if(selected.kind==='edge'){
      const e=model.edges.find(x=>x.id===selected.id);if(!e){selected=null;renderInspector();return;}
      const options=(value)=>[['auto','自動'],['top','上'],['right','右'],['bottom','下'],['left','左']].map(([v,t])=>`<option value="${v}" ${v===(value||'auto')?'selected':''}>${t}</option>`).join('');
      const p=edgePath(getNode(e.from),getNode(e.to),e);
      el.innerHTML=`<div class="inspector-content"><div class="inspector-kicker">CONNECTION</div><h3>矢印を編集</h3><label for="edgeLabel">条件・ラベル</label><textarea id="edgeLabel" data-field="edgeLabel" maxlength="200" placeholder="例：不備あり">${esc(e.label)}</textarea><div class="property-grid"><div><label for="fromPort">接続元の辺</label><select id="fromPort" data-field="fromPort">${options(e.fromPort)}</select></div><div><label for="toPort">接続先の辺</label><select id="toPort" data-field="toPort">${options(e.toPort)}</select></div></div><label for="routeAxis">経路の調整</label><select id="routeAxis" data-field="routeAxis"><option value="auto" ${!e.routeAxis||e.routeAxis==='auto'?'selected':''}>自動</option><option value="x" ${e.routeAxis==='x'?'selected':''}>縦の折れ線を左右へ動かす</option><option value="y" ${e.routeAxis==='y'?'selected':''}>横の折れ線を上下へ動かす</option></select><label for="bend">折れ線の位置</label><input id="bend" type="number" data-field="bend" value="${Math.round(p.bend)}" min="0" max="100000"><div class="property-grid"><div><label for="labelDx">ラベルの横移動</label><input id="labelDx" type="number" data-field="labelDx" value="${e.labelDx||0}" min="-100000" max="100000"></div><div><label for="labelDy">ラベルの縦移動</label><input id="labelDy" type="number" data-field="labelDy" value="${e.labelDy||0}" min="-100000" max="100000"></div></div><p class="property-help">白い丸をドラッグすると経路を調整できます。ラベルも直接ドラッグできます。</p><div class="inspector-actions"><button data-action="resetRoute">自動配置に戻す</button><button class="danger" data-action="delete">矢印を削除</button></div></div>`;return;
    }
    const l=getLane(selected.id);if(!l){selected=null;renderInspector();return;}el.innerHTML=`<div class="inspector-content"><div class="inspector-kicker">SWIMLANE</div><h3>担当レーンを編集</h3><label for="laneName">担当・部署名</label><input id="laneName" data-field="laneName" value="${esc(l.name)}" maxlength="40"><div class="inspector-actions"><button data-action="laneLeft">← 左へ</button><button data-action="laneRight">右へ →</button><button class="danger" data-action="delete">削除</button></div><p class="inspector-note">レーンを並べ替えると、中の図形も一緒に移動します。</p></div>`;
  }
  function select(kind,id){selected={kind,id};render();}
  function addNode(type){const before=clone(model),lane=model.lanes[0];const others=model.nodes.filter(n=>n.laneId===lane.id),y=others.length?Math.max(200,...others.map(n=>n.y+130)):215;const n={id:uid(),type,label:{start:'開始',task:'新しい作業',decision:'条件を確認',document:'帳票名',system:'システム名'}[type],laneId:lane.id,x:laneCenter(lane.id),y,description:''};model.nodes.push(n);selected={kind:'node',id:n.id};changed(before);$('canvasScroll').scrollTop=Math.max(0,(y-250)*zoom);}
  function addLane(){if(model.lanes.length>=12){notify('試作版では最大12レーンです。');return;}const before=clone(model);const l={id:uid(),name:`担当 ${model.lanes.length+1}`};model.lanes.push(l);selected={kind:'lane',id:l.id};changed(before);$('canvasScroll').scrollLeft=width()*zoom;}
  function deleteSelected(){if(!selected)return;const before=clone(model);if(selected.kind==='node'){model.nodes=model.nodes.filter(n=>n.id!==selected.id);model.edges=model.edges.filter(e=>e.from!==selected.id&&e.to!==selected.id);model.associations=model.associations.filter(a=>a.artifact!==selected.id&&a.task!==selected.id);}else if(selected.kind==='edge')model.edges=model.edges.filter(e=>e.id!==selected.id);else{if(model.lanes.length===1){notify('最後のレーンは削除できません。');return;}const count=model.nodes.filter(n=>n.laneId===selected.id).length;if(count&&!confirm(`このレーンには${count}件の図形があります。図形と接続も削除しますか？`))return;const ids=new Set(model.nodes.filter(n=>n.laneId===selected.id).map(n=>n.id));model.nodes=model.nodes.filter(n=>!ids.has(n.id));model.edges=model.edges.filter(e=>!ids.has(e.from)&&!ids.has(e.to));model.associations=model.associations.filter(a=>!ids.has(a.artifact)&&!ids.has(a.task));const previousIndexes=new Map(model.lanes.map((l,i)=>[l.id,i]));model.lanes=model.lanes.filter(l=>l.id!==selected.id);const shifts=new Map();model.nodes.forEach(n=>{const dx=(model.lanes.findIndex(l=>l.id===n.laneId)-previousIndexes.get(n.laneId))*260;n.x+=dx;shifts.set(n.id,dx);});model.edges.forEach(e=>{if(e.routeAxis==='x'&&Number.isFinite(e.bend)&&shifts.get(e.from)===shifts.get(e.to))e.bend+=shifts.get(e.from);});}selected=null;changed(before);}
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
  $('canvas').addEventListener('pointerdown',e=>{
    suppressClick=false;if(connecting)return;
    const bend=e.target.closest('[data-bend-handle]'),label=e.target.closest('[data-label-handle]'),group=e.target.closest('[data-node]'),p=coordinate(e);
    if(bend||label){const id=(bend||label).dataset[bend?'bendHandle':'labelHandle'],edge=model.edges.find(x=>x.id===id),path=edgePath(getNode(edge.from),getNode(edge.to),edge);
      drag={kind:bend?'bend':'label',id,before:clone(model),start:p,axis:path.axis,baseDx:edge.labelDx||0,baseDy:edge.labelDy||0,moved:false};selected={kind:'edge',id};}
    else if(group){const n=getNode(group.dataset.node);drag={kind:'node',id:n.id,before:clone(model),start:p,dx:n.x-p.x,dy:n.y-p.y,moved:false};}
    else return;
    $('canvas').setPointerCapture(e.pointerId);
  });
  $('canvas').addEventListener('pointermove',e=>{
    if(!drag)return;const p=coordinate(e);if(Math.hypot(p.x-drag.start.x,p.y-drag.start.y)>3)drag.moved=true;if(!drag.moved)return;
    if(drag.kind==='node'){const n=getNode(drag.id),g=nodeGeometry(n);n.x=limit(Math.round(p.x+drag.dx),g.w/2+10,width()-g.w/2-10);n.y=Math.max(Math.round(p.y+drag.dy),135+g.h/2);}
    else{const edge=model.edges.find(x=>x.id===drag.id);if(drag.kind==='bend'){edge.routeAxis=drag.axis;edge.bend=Math.max(20,Math.round(p[drag.axis]));}else{edge.labelDx=Math.round(drag.baseDx+p.x-drag.start.x);edge.labelDy=Math.round(drag.baseDy+p.y-drag.start.y);}}
    renderCanvas();
  });
  $('canvas').addEventListener('pointerup',()=>{
    if(!drag)return;const d=drag;drag=null;suppressClick=true;
    if(d.kind==='node'){const n=getNode(d.id);if(d.moved){const lane=laneAt(n.x);n.laneId=lane.id;}selected={kind:'node',id:d.id};}
    else selected={kind:'edge',id:d.id};
    if(d.moved)changed(d.before);else render();
  });
  $('canvas').addEventListener('pointercancel',()=>{if(drag){model=drag.before;drag=null;render();}});
  $('canvas').addEventListener('click',e=>{if(suppressClick){suppressClick=false;return;}if(drag)return;const node=e.target.closest('[data-node]'),edge=e.target.closest('[data-edge]'),lane=e.target.closest('[data-lane]');if(connecting){if(node)connectTo(node.dataset.node);return;}if(node)select('node',node.dataset.node);else if(edge)select('edge',edge.dataset.edge);else if(lane)select('lane',lane.dataset.lane);else{selected=null;render();}});
  $('inspectorBody').addEventListener('click',e=>{if(e.target.id==='cancelConnect'){connecting=null;render();return;}const action=e.target.closest('[data-action]')?.dataset.action;if(!action||!selected)return;if(action==='delete'){deleteSelected();return;}if(action==='resetRoute'){const before=clone(model),e=model.edges.find(e=>e.id===selected.id);for(const key of ['routeAxis','bend','fromPort','toPort','labelDx','labelDy'])delete e[key];changed(before);return;}if(action==='connect'||action==='associate'){connecting={mode:action,from:selected.id};render();return;}if(action==='duplicate'){const n=getNode(selected.id),before=clone(model),copy={...clone(n),id:uid(),x:n.x+28,y:n.y+105};model.nodes.push(copy);selected={kind:'node',id:copy.id};changed(before);return;}if(action==='laneLeft'||action==='laneRight'){const i=model.lanes.findIndex(l=>l.id===selected.id),j=i+(action==='laneLeft'?-1:1);if(j<0||j>=model.lanes.length)return;const before=clone(model),a=model.lanes[i],b=model.lanes[j];[model.lanes[i],model.lanes[j]]=[b,a];model.nodes.forEach(n=>{if(n.laneId===a.id)n.x+=(j-i)*260;else if(n.laneId===b.id)n.x+=(i-j)*260;});changed(before);}});
  $('inspectorBody').addEventListener('focusin',e=>{if(e.target.matches('[data-field]'))editBefore=clone(model);});
  $('inspectorBody').addEventListener('input',e=>{
    const f=e.target.dataset.field;if(!f||!selected)return;
    if(selected.kind==='node'){
      const n=getNode(selected.id);if(['label','description'].includes(f))n[f]=e.target.value;
      const ranges={width:[80,600],height:[40,2000],fontSize:[10,24]};
      if(ranges[f]&&e.target.value!==''&&e.target.checkValidity())n[f]=Number(e.target.value);
      const g=nodeGeometry(n);n.y=Math.max(n.y,135+g.h/2);n.x=Math.max(n.x,g.w/2+10);
    }else if(selected.kind==='edge'){
      const edge=model.edges.find(x=>x.id===selected.id);
      if(f==='edgeLabel')edge.label=e.target.value;
      if(['fromPort','toPort'].includes(f))edge[f]=e.target.value;
      if(f==='routeAxis'){edge.routeAxis=e.target.value;delete edge.bend;if(e.target.value!=='auto')edge.bend=edgePath(getNode(edge.from),getNode(edge.to),edge).bend;}
      if(['bend','labelDx','labelDy'].includes(f)&&e.target.value!==''&&e.target.checkValidity()){
        if(f==='bend'&&(!edge.routeAxis||edge.routeAxis==='auto'))edge.routeAxis=edgePath(getNode(edge.from),getNode(edge.to),edge).axis;
        edge[f]=Number(e.target.value);
      }
    }else if(f==='laneName')getLane(selected.id).name=e.target.value;
    dirty=true;status();scheduleRecovery();renderCanvas();
  });
  $('inspectorBody').addEventListener('change',e=>{
    const f=e.target.dataset.field;if(!f||!selected)return;const before=editBefore||clone(model);
    if(f==='laneId'){const n=getNode(selected.id);const old=model.lanes.findIndex(l=>l.id===n.laneId),next=model.lanes.findIndex(l=>l.id===e.target.value);n.x+=(next-old)*260;n.laneId=e.target.value;}
    if(JSON.stringify(before)!==JSON.stringify(model))changed(before);else renderInspector();editBefore=null;
  });
  $('flowTitle').addEventListener('focus',()=>editBefore=clone(model));$('flowTitle').addEventListener('input',e=>{model.title=e.target.value;dirty=true;status();scheduleRecovery();renderCanvas();});$('flowTitle').addEventListener('change',()=>{if(editBefore&&JSON.stringify(editBefore)!==JSON.stringify(model))changed(editBefore);editBefore=null;});
  $('saveBtn').onclick=save;$('openBtn').onclick=()=>{if(confirmLoss())$('fileInput').click();};$('fileInput').onchange=async e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;try{if(file.size>5_000_000)throw Error('ファイルが大きすぎます。');const data=validate(JSON.parse(await file.text()));load(data,false);clearRecovery();notify('編集用ファイルを開きました。');}catch(err){notify('開けませんでした: '+err.message);}};
  $('newBtn').onclick=()=>{if(confirmLoss()){load(empty(),true);scheduleRecovery();notify('新しい図を作成しました。');}};
  $('sampleBtn').onclick=()=>{if(confirmLoss()){load(sample(),true);scheduleRecovery();notify('サンプルを読み込みました。');}};
  $('undoBtn').onclick=undoAction;$('redoBtn').onclick=redoAction;
  $('zoomIn').onclick=()=>{zoom=limit(Math.round((zoom+.1)*10)/10,.4,1.5);renderCanvas();};$('zoomOut').onclick=()=>{zoom=limit(Math.round((zoom-.1)*10)/10,.4,1.5);renderCanvas();};$('fitBtn').onclick=()=>{zoom=limit(Math.floor(Math.min($('canvasScroll').clientWidth/width(),$('canvasScroll').clientHeight/height())*10)/10,.4,1.5);renderCanvas();$('canvasScroll').scrollTo(0,0);};
  $('exportBtn').onclick=()=>{preview();$('exportDialog').showModal();};$('paperSize').onchange=preview;$('pngBtn').onclick=png;$('pdfBtn').onclick=pdf;
  document.addEventListener('keydown',e=>{const editable=e.target.matches('input,textarea,select');if(e.key==='Escape'&&connecting){connecting=null;render();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();save();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'&&!editable){e.preventDefault();undoAction();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'&&!editable){e.preventDefault();redoAction();}if(e.key==='Delete'&&!editable&&!$('exportDialog').open)deleteSelected();});
  window.addEventListener('beforeunload',e=>{if(dirty){clearTimeout(saveTimer);writeRecovery();e.preventDefault();e.returnValue='';}});
  try{const draft=JSON.parse(localStorage.getItem(K));if(draft?.model){validate(draft.model);const when=new Date(draft.at).toLocaleString('ja-JP');if(confirm(`一時保存された「${draft.model.title}」（${when}）があります。復旧しますか？`)){load(draft.model,true);notify('一時保存から復旧しました。編集用ファイルも保存してください。');}else{clearRecovery();load(sample(),true);}}else load(sample(),true);}catch{clearRecovery();load(sample(),true);}
})();

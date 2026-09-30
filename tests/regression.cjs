/* Regression checks for the offline editor. No dependencies required. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const elements = new Map(), events = new Map(), storage = new Map(), timers = new Map(), downloads = [];
const images = [], exportCanvases = [], exportErrors = [];
let nextTimer = 0, downloadFails = false;
let emptyPng = false;
class Element {
  constructor(id) { this.id=id;this.style={};this.dataset={};this.value=id==='paperSize'?'a4':'';this.innerHTML='';this.classes=new Set();this.classList={add:c=>this.classes.add(c),remove:c=>this.classes.delete(c),toggle:c=>{if(this.classes.has(c)){this.classes.delete(c);return false;}this.classes.add(c);return true;}};this.clientWidth=1000;this.clientHeight=700; }
  addEventListener(event,handler){events.set(`${this.id}:${event}`,handler);}
  setAttribute(name,value){this[name]=value;}
  getAttribute(name){return this[name] ?? null;}
  getContext(){return {font:'',fillRect(){},drawImage(){},measureText(text){return {width:Array.from(text).reduce((sum,c)=>sum+(c.charCodeAt(0)>255?13:7),0)};}};}
  toBlob(callback){callback(emptyPng ? null : new Blob(['png'],{type:'image/png'}));}
  getBoundingClientRect(){return {left:0,top:0,width:Number(this.width)||1160,height:Number(this.height)||790};}
  setPointerCapture(){} scrollTo(){} checkValidity(){return true;} showModal(){this.open=true;} close(){this.open=false;}
  click(){if(this.onclick)this.onclick();}
}
const get=id=>{if(!elements.has(id))elements.set(id,new Element(id));return elements.get(id);};
const context={console:{...console,error(error){exportErrors.push(error);}},Blob,Date,Math,JSON,Map,Set,Object,Number,Array,String,crypto:require('node:crypto').webcrypto,
  Image:class {set src(value){images.push(this);}},
  document:{documentElement:new Element('html'),getElementById:get,querySelector:()=>get('app'),createElement(tag){const e=new Element(tag);if(tag==='a')e.click=()=>{if(downloadFails)throw Error('blocked');};if(tag==='canvas')exportCanvases.push(e);return e;},addEventListener(e,h){events.set(`document:${e}`,h);},head:{append(){}}},
  window:{addEventListener(e,h){events.set(`window:${e}`,h);}},
  localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
  confirm:()=>true,URL:{createObjectURL(blob){downloads.push(blob);return 'blob:test';},revokeObjectURL(){}},
  setTimeout(fn){const id=++nextTimer;timers.set(id,fn);return id;},clearTimeout(id){timers.delete(id);}
};
context.globalThis=context;
let code=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
code=code.replace(/\}\)\(\);\s*$/, 'globalThis.api={load,validate,sample,select,changed,scheduleRecovery,svgMarkup,edgePath,nodeGeometry,wrapText,arrange,addNode,addLane,getDiagnostics,fitCanvas,pageSvg,pageGeometry,preview,changeExportOptions,editingOverlay,portPoint,closestPort,nearestSegment,get model(){return model},get dirty(){return dirty},get selected(){return selected}};})();');
vm.runInNewContext(code,context);const api=context.api;
const flush=()=>{const pending=[...timers.values()];timers.clear();pending.forEach(fn=>fn());};
const fire=(id,event,target)=>events.get(`${id}:${event}`)({target,...target.event});
const action=action=>fire('inspectorBody','click',{id:'',closest:()=>({dataset:{action}})});
const initial=api.sample();

// 1. A pending recovery must not recreate a draft after save or loading another file.
api.load(initial,true);api.scheduleRecovery();get('saveBtn').onclick();flush();assert.equal(storage.size,0);
assert.equal(api.dirty,false);assert.match(get('saveStatus').textContent,/ダウンロードを開始/);assert.doesNotMatch(get('saveStatus').textContent,/保存済み/);
api.load(initial,true);api.scheduleRecovery();api.load(api.sample(),false);flush();assert.equal(storage.size,0);
api.load(initial,true);events.get('window:beforeunload')({preventDefault(){}});assert.equal(JSON.parse(storage.values().next().value).model.id,initial.id);
downloadFails=true;get('saveBtn').onclick();assert.equal(api.dirty,true);downloadFails=false;

// 2. Deleting a middle lane shifts surviving nodes together with their lane.
api.load(initial,true);const removed=api.model.lanes[1].id, survivor=api.model.nodes.find(n=>n.laneId===api.model.lanes[2].id),oldX=survivor.x;
api.model.edges[5].routeAxis='x';api.model.edges[5].bend=900;api.select('lane',removed);action('delete');assert.equal(api.model.edges.find(e=>e.from===survivor.id).bend,640);assert.equal(api.model.nodes.find(n=>n.id===survivor.id).x,oldX-260);
assert(!api.model.nodes.some(n=>n.laneId===removed));get('undoBtn').onclick();assert.equal(api.model.nodes.find(n=>n.id===survivor.id).x,oldX);

// 3. Export markup must be identical regardless of which object is selected.
api.load(initial,true);api.select('node',api.model.nodes[1].id);assert(api.svgMarkup(true).includes('data-selection'));const clean=api.svgMarkup(false);
api.select('edge',api.model.edges[0].id);assert(api.svgMarkup(true).includes('data-bend-handle'));assert.equal(api.svgMarkup(false),clean);
assert(!clean.includes('data-selection'));assert(!clean.includes('data-bend-handle'));assert(!clean.includes('#675be7'));

// 4. Invalid imports leave the previous diagram intact.
for(const corrupt of [d=>d.lanes[0].name=42,d=>d.nodes[1].id=d.nodes[0].id,d=>d.nodes[0]=null,d=>d.edges[0].to='missing',d=>d.nodes[0].x=Infinity,d=>d.associations[0].artifact=d.nodes[1].id,d=>d.edges[0].routeAxis='bad']){
 const bad=JSON.parse(JSON.stringify(initial));corrupt(bad);const before=JSON.stringify(api.model);assert.throws(()=>api.load(bad,false));assert.equal(JSON.stringify(api.model),before);
}

// 5–6. Manual ports/routing and label offsets round-trip and support undo.
api.load(initial,true);const edge=api.model.edges[0],from=api.model.nodes[0],to=api.model.nodes[1];
edge.fromPort='bottom';edge.toPort='top';edge.routeAxis='y';edge.bend=350;edge.label='長い条件の表示を確認するためのラベル';edge.labelDx=60;edge.labelDy=20;
const route=api.edgePath(from,to,edge);assert.equal(route.axis,'y');assert.equal(route.bend,350);assert(route.d.startsWith(`M ${from.x} ${from.y+api.nodeGeometry(from).h/2}`));
api.select('edge',edge.id);
fire('canvas','pointerdown',{closest:sel=>sel==='[data-bend-handle]'?{dataset:{bendHandle:edge.id}}:null,event:{clientX:route.hx,clientY:route.hy,pointerId:1}});
events.get('canvas:pointermove')({clientX:route.hx,clientY:410});events.get('canvas:pointerup')();assert.equal(api.model.edges[0].bend,410);get('undoBtn').onclick();assert.equal(api.model.edges[0].bend,350);
const restored=JSON.parse(JSON.stringify(api.model));api.load(restored,false);assert.equal(api.model.edges[0].labelDx,60);assert.equal(api.model.edges[0].fromPort,'bottom');

api.select('edge',api.model.edges[0].id);const labelPath=api.edgePath(api.model.nodes[0],api.model.nodes[1],api.model.edges[0]);
fire('canvas','pointerdown',{closest:sel=>sel==='[data-label-handle]'?{dataset:{labelHandle:api.model.edges[0].id}}:null,event:{clientX:labelPath.lx,clientY:labelPath.ly,pointerId:2}});
events.get('canvas:pointermove')({clientX:labelPath.lx+20,clientY:labelPath.ly+30});events.get('canvas:pointerup')();assert.equal(api.model.edges[0].labelDx,80);assert.equal(api.model.edges[0].labelDy,50);get('undoBtn').onclick();assert.equal(api.model.edges[0].labelDx,60);

// 7. Long labels/newlines are preserved, geometry grows, and changes are editable.
const node=api.model.nodes[1],short=api.nodeGeometry(node).h;node.label='申請内容の不足と必要書類について確認する\n担当者が申請者へ確認結果を説明し追加提出の期限を案内する';
const geometry=api.nodeGeometry(node);assert(geometry.h>short);assert.equal(api.wrapText(node.label,geometry.available,13).join(''),node.label.replace(/\n/g,''));assert(!api.svgMarkup(false).includes('…'));
api.select('node',node.id);fire('inspectorBody','focusin',{matches:()=>true});fire('inspectorBody','input',{dataset:{field:'width'},value:'240',checkValidity:()=>true});fire('inspectorBody','change',{dataset:{field:'width'}});assert.equal(api.model.nodes[1].width,240);get('undoBtn').onclick();assert.equal(api.model.nodes[1].width,undefined);
// Branch direction: a destination on the left leaves the left side of the diamond.
api.load(initial,true);const decision=api.model.nodes[2],back=api.model.nodes[3],backPath=api.edgePath(decision,back,api.model.edges[2]);assert(backPath.d.startsWith(`M ${decision.x-api.nodeGeometry(decision).w/2} ${decision.y}`));

// 8. Selected lanes and a designated canvas point determine new node position.
api.select('lane',api.model.lanes[2].id);api.addNode('task');assert.equal(api.model.nodes.at(-1).laneId,api.model.lanes[2].id);
get('placeBtn').onclick();events.get('canvas:click')({target:{closest:()=>null},clientX:700,clientY:650});api.addNode('system');assert.equal(api.model.nodes.at(-1).x,700);assert.equal(api.model.nodes.at(-1).y,650);
api.addLane();api.addNode('task');assert.equal(api.model.nodes.at(-1).laneId,api.model.lanes.at(-1).id);

// 9. A pending line appears in the editor only; endpoints can be changed.
api.load(initial,true);api.select('node',api.model.nodes[1].id);action('connect');events.get('canvas:pointermove')({clientX:700,clientY:450});assert(api.svgMarkup(true).includes('data-connection-preview'));assert(!api.svgMarkup(false).includes('data-connection-preview'));
events.get('document:keydown')({target:{matches:()=>false},key:'Escape'});api.select('edge',api.model.edges[0].id);fire('inspectorBody','focusin',{matches:()=>true});fire('inspectorBody','input',{dataset:{field:'toNode'},value:api.model.nodes[4].id});fire('inspectorBody','change',{dataset:{field:'toNode'}});assert.equal(api.model.edges[0].to,api.model.nodes[4].id);get('undoBtn').onclick();assert.equal(api.model.edges[0].to,initial.nodes[1].id);

// 10. Multiple selection alignment and spacing retain lane ownership and undo.
api.load(initial,true);api.select('node',api.model.nodes[1].id);api.select('node',api.model.nodes[4].id,true);api.arrange('alignY');assert.equal(api.model.nodes[4].y,api.model.nodes[1].y);assert.equal(api.model.nodes[4].laneId,initial.nodes[4].laneId);get('undoBtn').onclick();assert.equal(api.model.nodes[4].y,initial.nodes[4].y);

// 11. Reference links are individually removable and undoable.
api.select('association',api.model.associations[0].id);action('delete');assert.equal(api.model.associations.length,1);get('undoBtn').onclick();assert.equal(api.model.associations.length,2);

// 12. Panel state toggles and a large diagram fits below the old 40% lower limit.
get('toggleSidebar').onclick();assert(get('app').classes.has('sidebar-collapsed'));get('toggleSidebar').onclick();assert(!get('app').classes.has('sidebar-collapsed'));
api.model.nodes[0].y=4000;api.fitCanvas();assert(Number(get('zoomLabel').textContent.replace('%',''))<40);assert(Number(get('canvas').height)<=get('canvasScroll').clientHeight);

// 13. A3, margins and DPI round-trip; preview is an actual physical page.
api.load(initial,true);get('paperSize').value='a3';get('pageMargin').value='15';get('pngDpi').value='300';api.changeExportOptions();const paperGeometry=api.pageGeometry();assert.equal(paperGeometry.pw,420);assert.equal(paperGeometry.ph,297);assert(paperGeometry.x>=15);assert(paperGeometry.y>=15);assert(api.pageSvg().includes('viewBox="0 0 420 297"'));const saved=JSON.parse(JSON.stringify(api.model));api.load(saved,false);assert.equal(api.model.exportSettings.dpi,300);assert.equal(api.model.exportSettings.margin,15);

// 15. Missing connections, unlabeled decisions and overlapping nodes are reported.
api.model.edges=[];api.model.nodes[4].x=api.model.nodes[1].x;api.model.nodes[4].y=api.model.nodes[1].y;const issues=api.getDiagnostics();assert(issues.some(i=>i.message.includes('分岐が2本未満')));assert(issues.some(i=>i.message.includes('重なっています')));assert(issues.some(i=>i.message.includes('入る矢印')));
// Direct arrow drag chooses the perpendicular axis of the grabbed segment.
api.load(initial,false);const bodyEdge=api.model.edges[0],bodyPath=api.edgePath(api.model.nodes[0],api.model.nodes[1],bodyEdge);const bodyPoint={x:bodyPath.hx,y:bodyPath.hy};
fire('canvas','pointerdown',{closest:sel=>sel==='[data-route-handle]'?{dataset:{routeHandle:bodyEdge.id}}:null,event:{clientX:bodyPoint.x,clientY:bodyPoint.y,pointerId:3}});
events.get('canvas:pointermove')({clientX:bodyPoint.x,clientY:bodyPoint.y+45});events.get('canvas:pointerup')();assert.equal(api.model.edges[0].routeAxis,'y');assert.equal(api.model.edges[0].bend,bodyPoint.y+45);get('undoBtn').onclick();assert.equal(api.model.edges[0].routeAxis,undefined);

// Endpoint dragging changes the side and position on the shape; undo and JSON preserve it.
api.select('edge',api.model.edges[0].id);const target=api.model.nodes[1],endpoint=api.edgePath(api.model.nodes[0],target,api.model.edges[0]).q,ng=api.nodeGeometry(target);
fire('canvas','pointerdown',{closest:sel=>sel==='[data-endpoint-handle]'?{dataset:{endpointHandle:api.model.edges[0].id,endpointSide:'to'}}:null,event:{clientX:endpoint.x,clientY:endpoint.y,pointerId:4}});
events.get('canvas:pointermove')({clientX:target.x+30,clientY:target.y-ng.h/2});events.get('canvas:pointerup')();assert.equal(api.model.edges[0].toPort,'top');assert(Math.abs(api.model.edges[0].toOffset-30/(ng.w/2))<1e-8);assert(!api.svgMarkup(false).includes('data-endpoint-handle'));
const endpointSaved=JSON.parse(JSON.stringify(api.model));api.load(endpointSaved,false);assert.equal(api.model.edges[0].toPort,'top');
const diamondPoint=api.portPoint(api.model.nodes[2],'left',.4),dg=api.nodeGeometry(api.model.nodes[2]);assert(Math.abs(Math.abs(diamondPoint.x-api.model.nodes[2].x)/(dg.w/2)+Math.abs(diamondPoint.y-api.model.nodes[2].y)/(dg.h/2)-1)<1e-8);

// Blank canvas drag pans without modifying diagram data.
const beforePan=JSON.stringify(api.model);get('canvasScroll').scrollLeft=100;get('canvasScroll').scrollTop=80;
fire('canvas','pointerdown',{closest:()=>null,event:{clientX:600,clientY:500,pointerId:5}});events.get('canvas:pointermove')({clientX:570,clientY:470});events.get('canvas:pointerup')();assert.equal(get('canvasScroll').scrollLeft,130);assert.equal(get('canvasScroll').scrollTop,110);assert.equal(JSON.stringify(api.model),beforePan);assert.equal(api.dirty,false);
// Every static UI binding exists and IDs are unique (prevents missing-control startup failures).
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8'),idList=[...html.matchAll(/\bid="([^"\s]+)"/g)].map(m=>m[1]);assert.equal(new Set(idList).size,idList.length);for(const match of code.matchAll(/\$\('([A-Za-z][\w-]*)'\)/g))assert(idList.includes(match[1]),`Missing UI control: ${match[1]}`);
api.select('edge',api.model.edges[0].id);assert(get('inspectorBody').innerHTML.includes('<details'));assert(get('inspectorBody').innerHTML.includes('線をドラッグ'));

// Loading or undoing clears transient placement/connection state before rendering.
api.load(initial,false);get('placeBtn').onclick();assert.equal(get('placeBtn')['aria-pressed'],'true');
api.load(initial,false);assert.equal(get('placeBtn')['aria-pressed'],'false');
get('placeBtn').onclick();events.get('canvas:click')({target:{closest:()=>null},clientX:600,clientY:650});
assert(api.editingOverlay().includes('＋'));api.load(initial,false);assert(!api.editingOverlay().includes('＋'));
api.select('node',api.model.nodes[1].id);action('connect');events.get('canvas:pointermove')({clientX:700,clientY:450});
api.load(initial,false);assert(!api.editingOverlay().includes('data-connection-preview'));
api.select('node',api.model.nodes[1].id);api.addNode('task');get('placeBtn').onclick();get('undoBtn').onclick();
assert.equal(get('placeBtn')['aria-pressed'],'false');assert.equal(api.model.nodes.length,initial.nodes.length);

// Shift deselecting the primary node edits the remaining selection.
api.load(initial,false);api.select('node',api.model.nodes[1].id);api.select('node',api.model.nodes[4].id,true);
api.select('node',api.model.nodes[4].id,true);assert.equal(api.selected.id,api.model.nodes[1].id);

// Reordering a lane shifts a manual bend when both connected nodes move together.
api.load(initial,false);const laneEdge=api.model.edges[1];laneEdge.routeAxis='x';laneEdge.bend=600;
api.select('lane',api.model.lanes[1].id);action('laneRight');assert.equal(api.model.edges[1].bend,860);
get('undoBtn').onclick();assert.equal(api.model.edges[1].bend,600);

// All dialogs own keyboard input; shortcuts cannot edit the diagram behind them.
for(const dialog of ['exportDialog','diagnosticsDialog','helpDialog']) {
 api.load(initial,false);api.select('node',api.model.nodes[1].id);get(dialog).showModal();
 const before=JSON.stringify(api.model);events.get('document:keydown')({target:{matches:()=>false},key:'Delete',preventDefault(){}});
 assert.equal(JSON.stringify(api.model),before);get(dialog).close();
}
api.load(initial,false);api.select('node',api.model.nodes[1].id);api.addNode('task');get('undoBtn').onclick();
events.get('document:keydown')({target:{matches:()=>false},key:'Z',ctrlKey:true,shiftKey:true,preventDefault(){}});
assert.equal(api.model.nodes.length,initial.nodes.length+1);
if(process.env.FLOW_QA_SVG)fs.writeFileSync(process.env.FLOW_QA_SVG,api.svgMarkup(false));

// Multi-line headings use their actual height in overlap diagnostics.
api.load(initial,false);api.model.lanes[0].name='長い担当レーンの名称を複数行で表示する\n見出しの二行目\n見出しの三行目\n見出しの四行目';
api.model.nodes[0].y=170;assert(api.getDiagnostics().some(issue=>issue.id===api.model.nodes[0].id && issue.message.includes('見出しに重な')));

// Theme preference survives restart without modifying the diagram, history or export.
api.load(initial,false);const themeModel=JSON.stringify(api.model),themeExport=api.pageSvg();
get('themeDark').onclick();assert.equal(context.document.documentElement.dataset.theme,'dark');
assert.equal(get('themeDark')['aria-pressed'],'true');assert.equal(get('themeLight')['aria-pressed'],'false');
assert.equal(storage.get('flow-maker-theme-v1'),'dark');assert.equal(JSON.stringify(api.model),themeModel);
assert.equal(api.dirty,false);assert.equal(get('undoBtn').disabled,true);assert.equal(api.pageSvg(),themeExport);
const restartedElements=new Map();
const restartedGet=id=>{if(!restartedElements.has(id))restartedElements.set(id,new Element(id));return restartedElements.get(id);};
const restarted={...context,document:{...context.document,documentElement:new Element('restarted-html'),getElementById:restartedGet,addEventListener(){}},window:{addEventListener(){}},setTimeout:()=>0,clearTimeout(){}};
restarted.globalThis=restarted;vm.runInNewContext(code,restarted);
assert.equal(restarted.document.documentElement.dataset.theme,'dark');assert.equal(restartedGet('themeDark')['aria-pressed'],'true');
// Saving a diagram clears its recovery record, without deleting the appearance preference.
get('saveBtn').onclick();assert.equal(storage.get('flow-maker-theme-v1'),'dark');
const normalSetItem=context.localStorage.setItem;
context.localStorage.setItem=()=>{throw Error('storage unavailable');};
assert.doesNotThrow(()=>get('themeLight').onclick());assert.equal(context.document.documentElement.dataset.theme,'light');
context.localStorage.setItem=normalSetItem;get('themeLight').onclick();assert.equal(storage.get('flow-maker-theme-v1'),'light');

(async () => {
 // PNG output uses a single snapshot of page dimensions/content while image loading is pending.
 api.load(initial,false);get('pngBtn').disabled=false;
 const pending=get('pngBtn').onclick();assert.equal(get('pngBtn').disabled,true);
 api.model.exportSettings={paper:'a3',margin:10,dpi:300};
 images.pop().onload();await pending;
 assert.equal(exportCanvases.at(-1).width,1754);assert.equal(exportCanvases.at(-1).height,1240);
 assert.equal(downloads.at(-1).type,'image/png');assert.equal(get('pngBtn').disabled,false);
 // Download failures and empty conversions are caught and always unlock the button.
 for(const failure of ['download','conversion']) {
  downloadFails=failure==='download';emptyPng=failure==='conversion';
  const attempt=get('pngBtn').onclick();images.pop().onload();await attempt;
  assert.equal(get('pngBtn').disabled,false);assert.match(get('toast').textContent,/失敗/);
 }
 downloadFails=false;emptyPng=false;assert.equal(exportErrors.length,2);
 console.log('PASS: editing, recovery, JSON, export, drag, history, PNG failures and theme persistence/isolation.');
})().catch(error=>{console.error(error);process.exitCode=1;});

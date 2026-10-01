/* Text-first manual prototype. No external dependencies. */
(() => {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fields = [['purpose','目的'],['preparation','事前準備・必要な資料'],['steps','実施手順'],['checks','確認項目'],['completion','完了条件・成果物'],['cautions','注意事項'],['exceptions','例外対応・相談先']];
  const uid = () => globalThis.crypto?.randomUUID?.() || `m-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const emptyFields = () => Object.fromEntries([...fields.map(([key]) => [key,'']),['body','']]);
  function create(model, demo = false) {
    const intro = {id:uid(),title:'概要と準備'}, tasks = {id:uid(),title:'業務手順'};
    const entries = [{id:uid(),chapterId:intro.id,nodeId:null,code:'G010',title:'この業務について',included:true,fields:{...emptyFields(),body:demo?'このサンプルは申請受付から確認・審査・決裁までの流れを説明します。\n実際の運用に合わせて、対象業務・必要書類・問い合わせ先を書き換えてください。':''}}];
    for (const node of model.nodes.filter(n => ['task','decision'].includes(n.type)).slice(0,299)) {
      const f = emptyFields();
      if (demo) {
        f.purpose = `「${node.label}」を実施し、次の処理へ引き渡すための確認を行います。`;
        f.steps = node.type === 'decision' ? '申請内容と必要書類を確認する\n不足の有無を判定する\n下記の分岐条件に従って次の手順へ進む' : '必要な資料と対象の記録を開く\n担当する処理を実施する\n結果を記録して次の担当へ引き渡す';
        f.completion = '確認結果を記録し、次の手順へ進める状態になっている。';
        f.cautions = 'これは試作の入力例です。実際の手順・確認条件に置き換えてください。';
      }
      entries.push({id:uid(),chapterId:tasks.id,nodeId:node.id,code:`S${String((entries.length)*10).padStart(3,'0')}`,title:node.label.slice(0,200),included:true,fields:f});
    }
    return {meta:{department:'',revision:'1.0'},chapters:[intro,tasks],entries};
  }
  const optionalMeta = {author:100,reviewer:100,date:10,changes:6000};
  const safeLink = value => /^https?:\/\/[^\s<>"\\]+$/i.test(value);
  const references = entry => (entry.references || '').split('\n').filter(line=>line.trim()).map(line=>{
    const parts=line.split('|'),url=parts.length===2?parts[1].trim():'';
    return {label:parts[0].trim(),url: safeLink(url)?url:'',invalid:parts.length>1&&!safeLink(url)};
  });
  function validateImage(image) {
    return image && typeof image.caption==='string' && image.caption.length<=300 && typeof image.data==='string' && image.data.length<=1400000 && /^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(image.data) && (/^data:image\/png;base64,iVBORw0KGgo/.test(image.data)||/^data:image\/jpeg;base64,\/9j\//.test(image.data));
  }
  function validate(manual) {
    const fail = () => {throw Error('マニュアルのデータが正しくありません。');};
    const str = (v,max) => typeof v === 'string' && v.length <= max;
    const id = v => str(v,100) && /^[A-Za-z0-9_-]+$/.test(v);
    if (!manual || !manual.meta || !str(manual.meta.department,100) || !str(manual.meta.revision,50) || !Array.isArray(manual.chapters) || !manual.chapters.length || manual.chapters.length>50 || !Array.isArray(manual.entries) || manual.entries.length>300) fail();
    for(const [key,max] of Object.entries(optionalMeta))if(manual.meta[key]!==undefined&&!str(manual.meta[key],max))fail();
    if(manual.meta.date && (!/^\d{4}-\d{2}-\d{2}$/.test(manual.meta.date) || Number.isNaN(Date.parse(manual.meta.date+'T00:00:00Z')) || new Date(manual.meta.date+'T00:00:00Z').toISOString().slice(0,10)!==manual.meta.date))fail();
    let imageSize=0;
    const all = new Set(), chapters = new Set();
    for (const chapter of manual.chapters) {
      if (!chapter || !id(chapter.id) || all.has(chapter.id) || !str(chapter.title,100)) fail();
      all.add(chapter.id);chapters.add(chapter.id);
    }
    for (const entry of manual.entries) {
      if (!entry || !id(entry.id) || all.has(entry.id) || !chapters.has(entry.chapterId) || !(entry.nodeId === null || str(entry.nodeId,200)) || !str(entry.code,20) || !str(entry.title,200) || typeof entry.included !== 'boolean' || !entry.fields) fail();
      if(entry.references!==undefined&&!str(entry.references,6000))fail();
      if(entry.images!==undefined){if(!Array.isArray(entry.images)||entry.images.length>6||entry.images.some(image=>!validateImage(image)))fail();imageSize+=entry.images.reduce((sum,image)=>sum+image.data.length,0);}
      all.add(entry.id);
      for (const key of [...fields.map(([key])=>key),'body']) if (!str(entry.fields[key],6000)) fail();
    }
    if(imageSize>11200000)fail();
    return manual;
  }
  const nodeFor = (model,entry) => model.nodes.find(node => node.id === entry.nodeId);
  const titleFor = (model,entry) => nodeFor(model,entry)?.label || entry.title || '名称未記入';
  function issues(model, entry) {
    const out=[];
    if(!(nodeFor(model,entry)?.label || entry.title).trim())out.push('見出しが未記入です。');
    if(references(entry).some(r=>r.invalid))out.push('参考資料のリンクは「資料名 | https://…」で記入してください。');
    if(entry.nodeId && !nodeFor(model,entry))out.push('対応する図形が削除されています。本文は保持されています。');
    if(!entry.code.trim())out.push('手順番号が未記入です。');
    if(entry.code.trim() && model.manual.entries.filter(e=>e.code.trim()===entry.code.trim()).length>1)out.push('手順番号が重複しています。');
    if(entry.nodeId){for(const key of ['purpose','steps','completion'])if(!entry.fields[key].trim())out.push(`${fields.find(([f])=>f===key)[1]}が未記入です。`);}
    else if(!entry.fields.body.trim())out.push('本文が未記入です。');
    return out;
  }
  function review(model){
    const m=model.manual;if(!m)return [];
    const results=m.entries.filter(e=>e.included).flatMap(e=>issues(model,e).map(message=>({entryId:e.id,message:`${e.code} ${titleFor(model,e)}：${message}`})));
    if(!m.entries.some(e=>e.included))results.push({message:'掲載する項目がありません。'});
    for(const ch of m.chapters)if(!ch.title.trim())results.push({chapterId:ch.id,message:'章の名前が未記入です。'});
    if(!m.meta.department.trim())results.push({message:'文書の所管部署を設定してください。'});
    if(!m.meta.revision.trim())results.push({message:'文書の版を設定してください。'});
    for(const node of model.nodes.filter(n=>['task','decision'].includes(n.type))){
      if(!m.entries.some(e=>e.nodeId===node.id))results.push({message:`「${node.label}」の手順がありません。「図の作業を取り込む」で追加できます。`});
      const e=m.entries.find(e=>e.nodeId===node.id&&e.included);
      if(e&&node.type==='decision'&&model.edges.filter(edge=>edge.from===node.id).some(edge=>!edge.label.trim()))results.push({entryId:e.id,message:`${e.code}：分岐条件が未記入です。「図で見る」から条件を記入してください。`});
    }
    return results;
  }
  const DOCUMENT_CSS = `
.manual-document{background:white;color:#243149;font:15px/1.85 "Segoe UI","Yu Gothic UI",Meiryo,sans-serif;max-width:900px;margin:auto;padding:48px 54px;overflow-wrap:anywhere}
.manual-document *{box-sizing:border-box}.manual-document h1{font-size:30px;line-height:1.4;margin:0 0 10px}.manual-document h2{font-size:23px;border-bottom:2px solid #dedff3;padding-bottom:8px;margin:40px 0 22px}.manual-document h3{font-size:19px;margin:0 0 14px}.manual-document h4{font-size:14px;color:#5c568f;margin:18px 0 6px}.manual-document p{margin:6px 0;white-space:pre-wrap}.manual-document a{color:#5145bc;text-underline-offset:3px}.manual-document .doc-meta{color:#68748b;font-size:13px;margin:0 0 26px}.manual-document .doc-toc{background:#f5f6fb;border:1px solid #e4e7ef;padding:20px 24px;border-radius:12px}.manual-document .doc-toc ul{padding-left:22px;margin:8px 0}.manual-document .doc-entry{padding:22px 0;border-bottom:1px solid #e8ebf2}.manual-document .doc-code{font-size:12px;color:#6256bc;display:block;letter-spacing:.5px}.manual-document .doc-owner{font-size:13px;color:#68748b}.manual-document .doc-warning{font-size:13px;background:#fff5df;border-left:3px solid #dba247;padding:10px 14px;white-space:normal}.manual-document li{padding-left:3px;margin:4px 0}.manual-document figure{margin:20px 0}.manual-document .doc-image img{display:block;max-width:100%;max-height:520px;margin:auto;object-fit:contain}.manual-document figcaption{font-size:13px;color:#68748b;margin-top:8px;white-space:pre-wrap}.manual-document .doc-revision{background:#f4f6fa;padding:14px 18px;margin:20px 0}.manual-document figure svg{display:block;width:100%;height:auto}.manual-document .doc-related{font-size:13px;background:#f4f6fa;padding:12px 16px;margin-top:16px}.manual-document .doc-related ul{margin:5px 0;padding-left:20px}
@media(max-width:600px){.manual-document{padding:26px 22px}.manual-document h1{font-size:24px}}
@media print{.manual-document{max-width:none;padding:0;font-size:10.5pt;line-height:1.7}.manual-document h1{font-size:22pt}.manual-document h2{font-size:16pt}.manual-document h3{font-size:13pt}.manual-document h4{font-size:11pt}.manual-document h1,.manual-document h2,.manual-document h3,.manual-document h4{break-after:avoid}.manual-document .doc-entry{break-inside:auto}.manual-document li{break-inside:avoid}.manual-document figure{break-inside:avoid}.manual-document figure svg{max-height:175mm}.manual-document a{color:inherit}.manual-document .doc-toc{break-inside:auto;background:white}}
`;
  function documentBody(model, svg, interactive = false) {
    const manual=model.manual;if(!manual)return '';
    const prefix=interactive?'preview':'manual';
    const diagram=svg.replace(/id="arrow"/g,`id="${prefix}-arrow"`).replace(/url\(#arrow\)/g,`url(#${prefix}-arrow)`);
    const linkFor=id=>manual.entries.find(e=>e.nodeId===id && e.included);
    const textBlock=(label,text,list=false)=>!text.trim()?'':`<h4>${label}</h4>${list?`<ol>${text.split('\n').filter(line=>line.trim()).map(line=>`<li>${esc(line)}</li>`).join('')}</ol>`:`<p>${esc(text)}</p>`}`;
    const anchor = entry => `${prefix}-entry-${entry.id}`;
    const toc=manual.chapters.map(ch=>{const items=manual.entries.filter(e=>e.chapterId===ch.id && e.included);return items.length?`<li><a href="#${prefix}-chapter-${ch.id}">${esc(ch.title||'章名未記入')}</a><ul>${items.map(e=>`<li><a href="#${anchor(e)}">${esc(e.code)} ${esc(titleFor(model,e))}</a></li>`).join('')}</ul></li>`:'';}).join('');
    const chapters=manual.chapters.map(ch=>{
      const entries=manual.entries.filter(e=>e.chapterId===ch.id && e.included);if(!entries.length)return '';
      return `<section id="${prefix}-chapter-${ch.id}"><h2>${esc(ch.title||'章名未記入')}</h2>${entries.map(e=>{
        const node=nodeFor(model,e),owner=node?model.lanes.find(l=>l.id===node.laneId)?.name:'';
        const links=node?model.edges.filter(edge=>edge.from===node.id):[];
        const resources=node?model.associations.filter(a=>a.task===node.id).map(a=>model.nodes.find(n=>n.id===a.artifact)?.label).filter(Boolean):[];
        const warnings=issues(model,e);
        return `<section class="doc-entry" id="${anchor(e)}"><span class="doc-code">${esc(e.code)}</span><h3>${esc(titleFor(model,e))}</h3>${owner?`<p class="doc-owner">担当：${esc(owner)}</p>`:''}${interactive?`<button class="secondary" type="button" data-manual-edit="${e.id}">この手順を編集</button>`:''}${warnings.length?`<p class="doc-warning">${warnings.map(esc).join(' / ')}</p>`:''}${e.nodeId?fields.map(([key,label])=>textBlock(label,e.fields[key],['steps','checks'].includes(key))).join(''):textBlock('本文',e.fields.body)}${(e.images||[]).map(image=>`<figure class="doc-image"><img src="${esc(image.data)}" alt="${esc(image.caption||'手順の補足画像')}"><figcaption>${esc(image.caption)}</figcaption></figure>`).join('')}${references(e).length?`<div class="doc-related"><strong>参考資料</strong><ul>${references(e).map(r=>`<li>${r.url?`<a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${esc(r.label||r.url)}</a>`:esc(r.label)}</li>`).join('')}</ul></div>`:''}${resources.length?`<div class="doc-related"><strong>使用する帳票・システム</strong><ul>${resources.map(r=>`<li>${esc(r)}</li>`).join('')}</ul></div>`:''}${links.length?`<div class="doc-related"><strong>次の作業・分岐</strong><ul>${links.map(edge=>{const target=model.nodes.find(n=>n.id===edge.to),entry=linkFor(edge.to),label=`${edge.label?edge.label+' → ':''}${target?.label||'接続先なし'}`;return `<li>${entry?`<a href="#${anchor(entry)}">${esc(label)}（${esc(entry.code)}）</a>`:esc(label)}</li>`;}).join('')}</ul></div>`:''}</section>`;
      }).join('')}</section>`;
    }).join('');
    return `<article class="manual-document"><h1>${esc(model.title)}</h1><p class="doc-meta">${esc(manual.meta.department)}${manual.meta.department?' · ':''}版 ${esc(manual.meta.revision||'未設定')}${manual.meta.date?' · 更新 '+esc(manual.meta.date):''}</p>${manual.meta.author||manual.meta.reviewer||manual.meta.changes?`<section class="doc-revision"><strong>文書管理情報</strong>${manual.meta.author?`<p>作成者：${esc(manual.meta.author)}</p>`:''}${manual.meta.reviewer?`<p>確認者（記入情報）：${esc(manual.meta.reviewer)}</p>`:''}${manual.meta.changes?`<p>改訂内容：${esc(manual.meta.changes)}</p>`:''}</section>`:''}<nav class="doc-toc" aria-label="目次"><strong>目次</strong><ul><li><a href="#${prefix}-flow">業務フロー全体</a></li>${toc}</ul></nav><section id="${prefix}-flow"><h2>業務フロー全体</h2><figure>${diagram}</figure></section>${chapters}${!manual.entries.some(e=>e.included)?'<p>掲載する手順がありません。</p>':''}</article>`;
  }
  function html(model,svg){return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(model.title)}</title><style>body{margin:0;background:#edf0f6}${DOCUMENT_CSS}@page{size:A4 portrait;margin:14mm}</style></head><body>${documentBody(model,svg)}</body></html>`;}
  function init(ctx) {
    const $=id=>document.getElementById(id);
    const text=(id,value)=>{const el=$(id);if(el)el.textContent=value;};
    let view='flow', entryId=null, chapterId=null, query='', before=null, loadedId=null, checking=false, formEntryId=null;
    const style=document.createElement('style');style.textContent=DOCUMENT_CSS;document.head.append(style);
    const model=()=>ctx.model();
    const manual=()=>model().manual;
    const snapshot=()=>JSON.parse(JSON.stringify(model()));
    const change=fn=>{const previous=snapshot();fn();ctx.changed(previous);};
    const selectedEntry=()=>manual()?.entries.find(e=>e.id===entryId);
    const selectedChapter=()=>manual()?.chapters.find(c=>c.id===chapterId) || manual()?.chapters[0];
    function setView(next){view=next;document.querySelector('.app').dataset.view=next;for(const [name,id] of [['flow','tabFlow'],['manual','tabManual'],['preview','tabPreview']]){$(id).setAttribute('aria-selected',String(next===name));$(id).tabIndex=next===name?0:-1;}$('flowView').hidden=next!=='flow';$('manualView').hidden=next!=='manual';$('manualPreview').hidden=next!=='preview';ctx.onView(next);render();}
    function start(demo=false){if(manual()){setView('manual');return;}change(()=>{model().version=2;model().manual=create(model(),demo);entryId=model().manual.entries[demo?1:0]?.id;chapterId=model().manual.entries[demo?1:0]?.chapterId;});setView('manual');}
    function renderOutline(){
      const m=manual();if(!m)return;
      $('manualDepartment').value=m.meta.department;$('manualRevision').value=m.meta.revision;for(const key of Object.keys(optionalMeta))$('manualMeta-'+key).value=m.meta[key]||'';
      const count=m.entries.filter(e=>e.included).length,ready=m.entries.filter(e=>e.included&&!issues(model(),e).length).length;
      $('manualSummary').textContent=`掲載 ${count}件 · 記載済み ${ready}件`;renderGuide();
      $('manualOutline').innerHTML=m.chapters.map(ch=>`<section class="outline-chapter"><button type="button" class="chapter-select ${chapterId===ch.id&&!entryId?'selected':''}" data-chapter="${ch.id}">${esc(ch.title||'章名未記入')}</button>${m.entries.filter(e=>e.chapterId===ch.id && (!query || [titleFor(model(),e),e.code,...Object.values(e.fields)].join(' ').toLowerCase().includes(query))).map(e=>`<button type="button" class="outline-entry ${e.id===entryId?'selected':''}" data-entry="${e.id}" aria-current="${e.id===entryId?'true':'false'}"><span><span id="manualCode-${e.id}">${esc(e.code)}</span> <small id="manualBadge-${e.id}">${e.included?(issues(model(),e).length?'未記入あり':'記載済み'):'非掲載'}</small></span><strong id="manualName-${e.id}">${esc(titleFor(model(),e))}</strong></button>`).join('')}</section>`).join('')+ (query&&!m.entries.some(e=>[titleFor(model(),e),e.code,...Object.values(e.fields)].join(' ').toLowerCase().includes(query))?'<p class="property-help">一致する項目がありません。検索欄を空にすると全件表示されます。</p>':'');
    }
    function renderGuide(refreshChecks=true){
      if(!manual())return;const report=review(model()),count=manual().entries.filter(e=>e.included).length,ready=manual().entries.filter(e=>e.included&&!issues(model(),e).length).length;
      $('manualSummary').textContent=`掲載 ${count}件 · 記載済み ${ready}件`;
      $('manualProgress').textContent=`${ready} / ${count} 件の必須項目を記載 · 点検 ${report.length}件`;
      $('manualNext').disabled=!manual().entries.some(e=>e.included&&issues(model(),e).length);
      $('manualCheckList').hidden=!checking;
      if(refreshChecks)$('manualCheckList').innerHTML=report.length?`<p>次の項目を確認してください。手順名を押すと編集画面へ移動します。</p><ul>${report.map(r=>`<li>${r.entryId?`<button type="button" data-entry="${r.entryId}">${esc(r.message)}</button>`:r.chapterId?`<button type="button" data-chapter="${r.chapterId}">${esc(r.message)}</button>`:esc(r.message)}</li>`).join('')}</ul>`:'<p>必須項目の未記入はありません。業務内容の正確さは、担当者が確認してください。</p>';
      $('manualPreviewStatus').textContent=report.length?`点検 ${report.length}件があります。配布前に「点検へ戻る」で確認してください。`:'必須項目は記載済みです。配布前に内容を確認してください。';
    }
    const field=(key,label,value,rows=3)=>`<label class="manual-field">${label}${['purpose','steps','completion','body'].includes(key)?'（必須）':''}<textarea data-manual-field="${key}" rows="${rows}" maxlength="6000" placeholder="${key==='steps'?'1行に1つの操作を書きます':key==='checks'?'1行に1つの確認項目を書きます':key==='purpose'?'何のために行う作業かを書きます':key==='completion'?'何を確認できたら完了かを書きます':key==='preparation'?'開始前に用意する資料・権限などを書きます':key==='body'?'対象者・業務の概要・用語などを書きます':''}">${esc(value)}</textarea></label>`;
    function renderForm(){
      const m=manual(),e=selectedEntry(),ch=selectedChapter();if(!m)return;
      const resourcesOpen=formEntryId===entryId&&$('manualResources')?.open,extraOpen=formEntryId===entryId&&$('manualExceptions')?.open;formEntryId=entryId;
      if(!e){$('manualEditor').innerHTML=`<div class="manual-editor-head"><div><span class="manual-kicker">章の設定</span><h2>${esc(ch.title)}</h2></div></div><div class="manual-form"><label class="manual-field">章の名前<input data-chapter-field="title" maxlength="100" value="${esc(ch.title)}"></label><div class="manual-inline-actions"><button data-manual-action="chapterUp" ${m.chapters.indexOf(ch)===0?'disabled':''} class="secondary">章を上へ</button><button data-manual-action="chapterDown" ${m.chapters.indexOf(ch)===m.chapters.length-1?'disabled':''} class="secondary">章を下へ</button><button data-manual-action="deleteChapter" ${m.chapters.length===1?'disabled':''} class="secondary danger-text">章を削除</button></div><p class="property-help">左の「説明を追加」で概要・用語などを書けます。章を削除しても、項目は隣の章へ移して保持します。</p></div>`;return;}
      const node=nodeFor(model(),e),warnings=issues(model(),e),siblings=m.entries.filter(item=>item.chapterId===e.chapterId),position=siblings.indexOf(e);
      $('manualEditor').innerHTML=`<div class="manual-editor-head"><div><span class="manual-kicker">${esc(e.code)} · ${e.nodeId?'フローに対応する手順':'共通の説明'}</span><h2 id="manualEditorTitle">${esc(titleFor(model(),e))}</h2><p>${node?`担当：${esc(model().lanes.find(l=>l.id===node.laneId)?.name||'')}`:'章の概要・用語・準備などを記載できます。'}</p></div>${node?'<button type="button" class="secondary" data-manual-action="showNode">図で見る</button>':''}</div><div class="manual-form"><div class="manual-basic-grid"><label class="manual-field">手順番号<input data-manual-field="code" maxlength="20" value="${esc(e.code)}"></label><label class="manual-field">掲載する章<select data-manual-field="chapterId">${m.chapters.map(c=>`<option value="${c.id}" ${c.id===e.chapterId?'selected':''}>${esc(c.title)}</option>`).join('')}</select></label></div>${!node?`<label class="manual-field">見出し<input data-manual-field="title" maxlength="200" value="${esc(e.title)}"></label>`:'<p class="property-help">作業名・担当・分岐条件はフローと連動します。名称を変える場合は「図で見る」から編集します。</p>'}<div class="manual-hints" id="manualEntryHints" ${warnings.length?'':'hidden'}>${warnings.map(w=>`<span>${esc(w)}</span>`).join('')}</div>${e.nodeId?fields.slice(0,5).map(([key,label])=>field(key,label,e.fields[key],key==='steps'?6:3)).join('')+`<details class="manual-extra" id="manualExceptions" ${extraOpen?'open':''}><summary>注意事項・例外対応</summary>${fields.slice(5).map(([key,label])=>field(key,label,e.fields[key])).join('')}</details>`:field('body','本文',e.fields.body,14)}${node?.description?'<button type="button" data-manual-action="copyMemo" class="secondary">図形の補足メモを本文へ取り込む</button>':''}<details class="manual-extra" id="manualResources" ${resourcesOpen?'open':''}><summary>画像・参考資料</summary><p class="property-help">画像はPNG / JPEG、1枚1MB以下・最大6枚。画面の個人情報などは追加前に確認してください。</p><label class="manual-field">手順の画像を追加<input type="file" data-manual-images accept="image/png,image/jpeg" multiple></label><div class="manual-images">${(e.images||[]).map((image,i)=>`<figure><img src="${esc(image.data)}" alt="${esc(image.caption||'手順の画像')}"><label class="manual-field">画像 ${i+1} の説明<input data-image-caption="${i}" maxlength="300" value="${esc(image.caption)}"></label><button type="button" class="secondary" data-remove-image="${i}">画像 ${i+1} を削除</button></figure>`).join('')}</div><label class="manual-field">参考資料（1行に1件）<textarea data-manual-field="references" rows="3" maxlength="6000" placeholder="資料名 | https://example.com&#10;共有フォルダ内の資料名">${esc(e.references||'')}</textarea></label><p class="property-help">URLは http / https のみリンクになります。共有フォルダの場所は文字で記載できます。</p></details>${e.nodeId&&!node?`<label class="manual-field">別の図形に対応付ける<select data-manual-action="relink"><option value="">対応する作業を選択</option>${model().nodes.filter(n=>['task','decision'].includes(n.type)&&!m.entries.some(item=>item.nodeId===n.id)).map(n=>`<option value="${esc(n.id)}">${esc(n.label)}</option>`).join('')}</select></label>`:''}<div class="manual-item-actions"><label><input type="checkbox" data-manual-field="included" ${e.included?'checked':''}> 文書に掲載する</label><div><button type="button" class="secondary" data-manual-action="entryUp" ${position===0?'disabled':''}>上へ</button><button type="button" class="secondary" data-manual-action="entryDown" ${position===siblings.length-1?'disabled':''}>下へ</button><button type="button" class="secondary" data-manual-action="duplicate">複製</button>${e.nodeId?'<button type="button" class="secondary" data-manual-action="detach">図との対応を外す</button>':''}<button type="button" class="secondary danger-text" data-manual-action="deleteEntry">項目を削除</button></div></div></div>`;
    }
    function render(){
      if(!model())return;
      if(loadedId!==model().id){loadedId=model().id;entryId=null;chapterId=null;query='';before=null;checking=false;$('manualCheck').setAttribute('aria-expanded','false');$('manualSearch').value='';}
      const has=Boolean(manual());for(const id of ['manualDepartment','manualRevision',...Object.keys(optionalMeta).map(key=>'manualMeta-'+key)]){$(id).disabled=!has;if(!has)$(id).value='';}$('manualGuide').hidden=!has;$('manualSetup').hidden=has;$('manualWorkbench').hidden=!has;
      $('manualDownload').disabled=!has;$('manualPrint').disabled=!has;$('manualReview').disabled=!has;
      if(!has){$('manualOutline').innerHTML='<p class="property-help">手順書はまだありません。「手順」画面から作成できます。</p><button type="button" class="secondary" data-open-manual>手順書を作成</button>';$('manualSummary').textContent='フローから手順を作成できます。';$('manualSearch').disabled=true;for(const id of ['manualAddChapter','manualAddText','manualSync'])$(id).disabled=true;$('manualPreviewStatus').textContent='';$('manualPreviewBody').innerHTML='<div class="manual-empty"><h2>まだ手順書がありません</h2><p>「手順」画面で、このフローからマニュアルを作成してください。</p><button type="button" class="primary" data-open-manual>手順を作成する</button></div>';return;}
      if(entryId&&!selectedEntry())entryId=null;if(chapterId&&!manual().chapters.some(c=>c.id===chapterId))chapterId=null;
      if(!chapterId)chapterId=manual().chapters[0].id;
      $('manualSearch').disabled=false;for(const id of ['manualAddChapter','manualAddText','manualSync'])$(id).disabled=false;renderOutline();if(view==='manual')renderForm();
      renderGuide();if(view==='preview')$('manualPreviewBody').innerHTML=documentBody(model(),ctx.svg(),true);
    }
    function openNode(id){
      if(!manual()){const previous=snapshot();model().version=2;model().manual=create(model());ctx.changed(previous);}
      let e=manual().entries.find(e=>e.nodeId===id);
      if(!e){if(manual().entries.length>=300){ctx.notify('項目は最大300です。');return;}change(()=>{const node=model().nodes.find(n=>n.id===id);e={id:uid(),nodeId:id,chapterId:selectedChapter().id,code:nextCode('S'),title:node.label.slice(0,200),included:true,fields:emptyFields()};manual().entries.push(e);});}
      entryId=e.id;chapterId=e.chapterId;setView('manual');
    }
    function nextCode(prefix){let n=10;while(manual().entries.some(e=>e.code===`${prefix}${String(n).padStart(3,'0')}`))n+=10;return `${prefix}${String(n).padStart(3,'0')}`;}
    function move(list,id,delta){const i=list.findIndex(e=>e.id===id),j=i+delta;if(j<0||j>=list.length)return;[list[i],list[j]]=[list[j],list[i]];}
    function action(name){
      const e=selectedEntry(),ch=selectedChapter();
      if(name==='showNode'&&e){setView('flow');ctx.showNode(e.nodeId);return;}
      if(name==='deleteEntry'&&e&&!confirm('この項目の本文を削除しますか？フロー図は削除されません。'))return;
      if(name==='deleteChapter'&&manual().chapters.length===1){ctx.notify('最後の章は削除できません。');return;}
      if(name==='deleteChapter'&&!confirm('章を削除し、項目を隣の章へ移しますか？'))return;
      if(name==='detach'&&e&&!confirm('本文を残して、図との対応を外しますか？'))return;
      change(()=>{
        if(name==='chapterUp'||name==='chapterDown')move(manual().chapters,ch.id,name==='chapterUp'?-1:1);
        if(name==='entryUp'||name==='entryDown'){
          const siblings=manual().entries.filter(item=>item.chapterId===e.chapterId),i=siblings.findIndex(item=>item.id===e.id),other=siblings[i+(name==='entryUp'?-1:1)];
          if(other){const a=manual().entries.indexOf(e),b=manual().entries.indexOf(other);[manual().entries[a],manual().entries[b]]=[manual().entries[b],manual().entries[a]];}
        }
        if(name==='deleteEntry'){manual().entries=manual().entries.filter(item=>item.id!==e.id);entryId=null;}
        if(name==='deleteChapter'){const index=manual().chapters.findIndex(c=>c.id===ch.id);const target=manual().chapters[index>0?index-1:index+1];for(const item of manual().entries)if(item.chapterId===ch.id)item.chapterId=target.id;manual().chapters=manual().chapters.filter(c=>c.id!==ch.id);chapterId=target.id;}
        if(name==='detach'){const body=fields.map(([key,label])=>e.fields[key]?`${label}\n${e.fields[key]}`:'').filter(Boolean).join('\n\n');if(body.length>6000){ctx.notify('本文が長いため、対応を外す前に内容を整理してください。');return;}e.title=titleFor(model(),e).slice(0,200);e.fields.body=body;e.nodeId=null;}
        if(name==='duplicate'){if(manual().entries.length>=300){ctx.notify('項目は最大300です。');return;}const copy=JSON.parse(JSON.stringify(e));copy.id=uid();copy.code=nextCode('G');copy.title=titleFor(model(),e).slice(0,190)+'（複製）';copy.nodeId=null;if(e.nodeId)copy.fields.body=fields.map(([key,label])=>e.fields[key]?label+'\n'+e.fields[key]:'').filter(Boolean).join('\n\n');if(copy.fields.body.length>6000){ctx.notify('本文が6000文字を超えるため複製できません。');return;}const candidate=snapshot();candidate.manual.entries.push(copy);try{validate(candidate.manual);if(new Blob([JSON.stringify(candidate)]).size>20*1024*1024)throw Error();}catch{ctx.notify('文書の容量上限を超えるため複製できません。');return;}manual().entries.splice(manual().entries.indexOf(e)+1,0,copy);entryId=copy.id;}
        if(name==='copyMemo'){const text=nodeFor(model(),e).description,combined=e.fields.preparation+(e.fields.preparation?'\n':'')+text;if(combined.length>6000){ctx.notify('6000文字を超えるため取り込めません。');return;}e.fields.preparation=combined;}
      });
    }
    function input(event){if(!manual())return;const target=event.target,e=selectedEntry();
      if(target.dataset.manualMeta && ['department','revision',...Object.keys(optionalMeta)].includes(target.dataset.manualMeta))manual().meta[target.dataset.manualMeta]=target.value;
      else if(e && target.dataset.imageCaption!==undefined && e.images?.[Number(target.dataset.imageCaption)])e.images[Number(target.dataset.imageCaption)].caption=target.value;
      else if(target.dataset.chapterField)selectedChapter()[target.dataset.chapterField]=target.value;
      else if(e && target.dataset.manualField){const key=target.dataset.manualField;if(['code','title','chapterId','included'].includes(key))e[key]=key==='included'?target.checked:target.value;else if(key==='references')e.references=target.value;else if([...fields.map(([f])=>f),'body'].includes(key))e.fields[key]=target.value;}
      else return;
      ctx.touch();
    }
    for(const surface of ['manualView','shapePanel'])$(surface).addEventListener('focusin',event=>{if(manual()&&event.target.matches('[data-manual-field],[data-manual-meta],[data-chapter-field],[data-image-caption]'))before=snapshot();});
    for(const surface of ['manualView','shapePanel'])$(surface).addEventListener('input',input);
    for(const surface of ['manualView','shapePanel'])$(surface).addEventListener('change',event=>{
      if(!manual())return;
      if(event.target.dataset.manualImages!==undefined){addImages(event.target);return;}
      if(event.target.dataset.manualAction==='relink'){const node=model().nodes.find(n=>n.id===event.target.value);if(node&&selectedEntry()&&!manual().entries.some(item=>item.nodeId===node.id))change(()=>{selectedEntry().nodeId=node.id;});return;}
      if(!event.target.matches('[data-manual-field],[data-manual-meta],[data-chapter-field],[data-image-caption]'))return;
      input(event);const previous=before;before=null;
      // Keep clicked navigation targets in the DOM while a textarea loses focus.
      if(previous)ctx.commit(previous);
      const e=selectedEntry();
      if(e){text('manualEditorTitle',titleFor(model(),e));text(`manualName-${e.id}`,titleFor(model(),e));text(`manualCode-${e.id}`,e.code);text(`manualBadge-${e.id}`,e.included?(issues(model(),e).length?'未記入あり':'記載済み'):'非掲載');}
      renderGuide(false);if(e){const warnings=issues(model(),e);$('manualEntryHints').hidden=!warnings.length;$('manualEntryHints').innerHTML=warnings.map(w=>`<span>${esc(w)}</span>`).join('');}
      if(event.target.dataset.manualField==='chapterId'){chapterId=e.chapterId;renderOutline();}
    });
    for(const surface of ['manualView','shapePanel'])$(surface).addEventListener('click',event=>{const item=event.target.closest('[data-entry]'),chapter=event.target.closest('[data-chapter]'),button=event.target.closest('[data-manual-action]');if(item){entryId=item.dataset.entry;if(!selectedEntry())return;chapterId=selectedEntry().chapterId;setView('manual');$('manualEditor').scrollIntoView?.({block:'start',behavior:'smooth'});}else if(chapter){entryId=null;chapterId=chapter.dataset.chapter;setView('manual');}else if(button)action(button.dataset.manualAction);else if(event.target.closest('[data-open-manual]'))setView('manual');else {const remove=event.target.closest('[data-remove-image]');if(remove&&selectedEntry()&&confirm('この画像を削除しますか？'))change(()=>selectedEntry().images.splice(Number(remove.dataset.removeImage),1));}});
    async function addImages(input){
      const selected=selectedEntry(),original=model();if(!selected)return;const id=selected.id,files=Array.from(input.files||[]);input.value='';if(!files.length)return;
      if(files.length+(selected.images||[]).length>6){ctx.notify('画像は1項目につき最大6枚です。');return;}
      try{
        const added=[];
        for(const file of files){
          if(!['image/png','image/jpeg'].includes(file.type)||file.size>1048576)throw Error('PNG / JPEG、1枚1MB以下の画像を選んでください。');
          const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('画像を読み込めませんでした。'));reader.readAsDataURL(file);});
          const image={data,caption:file.name.replace(/\.[^.]+$/,'').slice(0,300)};if(!validateImage(image))throw Error('画像の形式が正しくありません。');
          await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve();img.onerror=()=>reject(Error('画像を表示できません。'));img.src=data;});added.push(image);
        }
        if(model()!==original||!manual().entries.some(e=>e.id===id)){ctx.notify('文書が切り替わったため、画像の追加を中止しました。');return;}
        const entry=manual().entries.find(e=>e.id===id);
        if((entry.images||[]).length+added.length>6)throw Error('画像は1項目につき最大6枚です。');
        const candidate=snapshot();candidate.manual.entries.find(e=>e.id===id).images=[...(entry.images||[]),...added];
        validate(candidate.manual);if(new Blob([JSON.stringify(candidate)]).size>20*1024*1024)throw Error('文書全体が20MBを超えるため、画像を追加できません。');
        change(()=>{entry.images=[...(entry.images||[]),...added];});if(selectedEntry()?.id===id)$('manualResources').open=true;ctx.notify('画像を追加しました。編集を続けるために上部の「保存」でJSONを保存してください。');
      }catch(error){ctx.notify(error.message==='マニュアルのデータが正しくありません。'?'画像の合計容量が上限（約8MB）を超えています。':error.message);}
    }
    $('manualNext').onclick=()=>{const list=manual().entries.filter(e=>e.included&&issues(model(),e).length),index=list.findIndex(e=>e.id===entryId),next=list[(index+1)%list.length];if(next){query='';$('manualSearch').value='';entryId=next.id;chapterId=next.chapterId;render();$('manualEditor').scrollIntoView?.({block:'start',behavior:'smooth'});}};
    $('manualCheck').onclick=()=>{checking=!checking;$('manualCheck').setAttribute('aria-expanded',String(checking));renderGuide();};
    $('manualReview').onclick=()=>{checking=true;setView('manual');$('manualCheck').setAttribute('aria-expanded','true');$('manualGuide').scrollIntoView?.({block:'start'});};
    $('manualSearch').addEventListener('input',event=>{query=event.target.value.toLowerCase();renderOutline();});
    $('manualStart').onclick=()=>start();$('manualDemo').onclick=()=>start(true);
    $('manualAddChapter').onclick=()=>{change(()=>{if(manual().chapters.length>=50){ctx.notify('章は最大50です。');return;}const ch={id:uid(),title:'新しい章'};manual().chapters.push(ch);entryId=null;chapterId=ch.id;});setView('manual');};
    $('manualAddText').onclick=()=>{change(()=>{if(manual().entries.length>=300){ctx.notify('項目は最大300です。');return;}const e={id:uid(),chapterId:selectedChapter().id,nodeId:null,code:nextCode('G'),title:'新しい説明',included:true,fields:emptyFields()};manual().entries.push(e);entryId=e.id;});setView('manual');};
    $('manualSync').onclick=()=>change(()=>{const chapter=manual().chapters.find(c=>c.title==='業務手順')||selectedChapter();for(const node of model().nodes.filter(n=>['task','decision'].includes(n.type)))if(!manual().entries.some(e=>e.nodeId===node.id)&&manual().entries.length<300)manual().entries.push({id:uid(),chapterId:chapter.id,nodeId:node.id,code:nextCode('S'),title:node.label.slice(0,200),included:true,fields:emptyFields()});});
    $('tabFlow').onclick=()=>setView('flow');$('tabManual').onclick=()=>setView('manual');$('tabPreview').onclick=()=>setView('preview');
    $('workspaceTabs').addEventListener('keydown',event=>{const names=['flow','manual','preview'];let i=names.indexOf(view);if(event.key==='ArrowRight')i=(i+1)%3;else if(event.key==='ArrowLeft')i=(i+2)%3;else if(event.key==='Home')i=0;else if(event.key==='End')i=2;else return;event.preventDefault();setView(names[i]);$(['tabFlow','tabManual','tabPreview'][i]).focus();});
    $('manualPreviewBody').addEventListener('click',event=>{const edit=event.target.closest('[data-manual-edit]');if(edit){entryId=edit.dataset.manualEdit;chapterId=selectedEntry().chapterId;setView('manual');}else if(event.target.closest('[data-open-manual]'))setView('manual');});
    $('manualDownload').onclick=()=>{if(manual()){try{ctx.download(new Blob([html(model(),ctx.svg())],{type:'text/html;charset=utf-8'}),ctx.filename('html'));ctx.notify('閲覧用HTMLのダウンロードを開始しました。');}catch{ctx.notify('HTMLのダウンロードを開始できませんでした。');}}};
    $('manualPrint').onclick=()=>{if(!manual())return;$('printArea').innerHTML=documentBody(model(),ctx.svg());document.getElementById('pageStyle')?.remove();const s=document.createElement('style');s.id='pageStyle';s.textContent='@page{size:A4 portrait;margin:14mm}@media print{#printArea{position:static!important;width:auto!important;height:auto!important}.manual-document{margin:0}}';document.head.append(s);setTimeout(()=>window.print(),60);};
    function addLinkedNode(node){
      if(!manual()||!['task','decision'].includes(node.type))return;
      const chapter=manual().chapters.find(c=>c.title==='業務手順')||selectedChapter();
      manual().entries.push({id:uid(),chapterId:chapter.id,nodeId:node.id,code:nextCode('S'),title:node.label.slice(0,200),included:true,fields:emptyFields()});
    }
    return {render,setView,openNode,addLinkedNode,get view(){return view;}};
  }
  globalThis.FlowManual={create,validate,validateImage,issues,review,titleFor,documentBody,html,init};
})();

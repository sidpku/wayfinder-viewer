'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const STATUS = {frontier:'可开始',blocked:'被阻塞',claimed:'已认领',closed:'已关闭',unknown:'待核实',external:'地图外前置'};
  const TYPE = {grilling:'讨论',research:'调研',prototype:'原型',task:'准备事项'};
  const offline = Boolean(window.WAYFINDER_SNAPSHOT);
  const state = {data:null,repo:'',number:1,selected:null,scope:'all',status:'all',type:'all',search:'',focus:false,busy:false,scale:1,x:24,y:20,width:1,height:1,leftHidden:false,rightHidden:false};
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function safeUrl(value) {
    try { const url = new URL(value); return url.protocol === 'https:' ? escape(url.href) : '#'; } catch { return '#'; }
  }
  function link(url, text, cls='') { return `<a class="${cls}" href="${safeUrl(url)}" target="_blank" rel="noopener noreferrer">${escape(text)}</a>`; }
  function inline(raw) {
    const tokens = [];
    // Tokenize links/code before escaping. No raw HTML from GitHub is ever inserted.
    let text = String(raw).replace(/`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (m, code, label, url) => {
      const token = code !== undefined ? `<code>${escape(code)}</code>` : link(url, label);
      tokens.push(token); return `\u0000${tokens.length-1}\u0000`;
    });
    text = escape(text).replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/~~([^~]+)~~/g,'<s>$1</s>');
    return text.replace(/\u0000(\d+)\u0000/g, (_,n) => tokens[Number(n)] || '');
  }
  function markdown(body, dropQuestionHeading=false) {
    const lines = String(body || '').replace(/<!--[\s\S]*?-->/g,'').split('\n');
    let html = '', list = '', code = null, paragraph = [];
    const flush = () => { if (paragraph.length) {html += `<p>${paragraph.map(inline).join('<br>')}</p>`; paragraph=[];} };
    const closeList = () => {if(list){html += `</${list}>`;list='';}};
    for (let i=0;i<lines.length;i++) {
      const line = lines[i];
      const fence = line.match(/^\s*(`{3,}|~{3,})/);
      if (fence) {flush();closeList();if(code===null)code={marker:fence[1][0],lines:[]};else if(fence[1][0]===code.marker){html += `<pre><code>${escape(code.lines.join('\n'))}</code></pre>`;code=null;}else code.lines.push(line);continue;}
      if (code) {code.lines.push(line);continue;}
      if (!line.trim()) {flush();closeList();continue;}
      const heading = line.match(/^(#{1,6})\s+(.+)/);
      if (heading) {flush();closeList();if(dropQuestionHeading && /^Question\s*$/i.test(heading[2]))continue;const level=Math.min(5,Math.max(3,heading[1].length+1));html+=`<h${level}>${inline(heading[2])}</h${level}>`;continue;}
      if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)) {flush();closeList();html+='<hr>';continue;}
      if (line.includes('|') && i+1<lines.length && /^\s*\|?\s*:?-{3,}/.test(lines[i+1])) {
        flush();closeList();const cells = str => str.trim().replace(/^\||\|$/g,'').split('|').map(x=>x.trim());
        html += '<table><thead><tr>'+cells(line).map(x=>`<th>${inline(x)}</th>`).join('')+'</tr></thead><tbody>';i++;
        while (i+1<lines.length && lines[i+1].includes('|') && lines[i+1].trim()) {i++;html += '<tr>'+cells(lines[i]).map(x=>`<td>${inline(x)}</td>`).join('')+'</tr>';}
        html+='</tbody></table>';continue;
      }
      const bullet = line.match(/^\s*(?:([-*+])|(\d+)\.)\s+(.+)/);
      if(bullet){flush();const tag=bullet[2]?'ol':'ul';if(list!==tag){closeList();html+=`<${tag}>`;list=tag;}html+=`<li>${inline(bullet[3])}</li>`;continue;}
      const quote=line.match(/^>\s?(.*)/);if(quote){flush();closeList();html+=`<blockquote>${inline(quote[1])}</blockquote>`;continue;}
      closeList();paragraph.push(line);
    }
    flush();closeList();if(code)html+=`<pre><code>${escape(code.lines.join('\n'))}</code></pre>`;
    return html || '<p>暂无正文。</p>';
  }
  const date = value => value ? new Date(value).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}) : '—';
  const allNodes = () => state.data ? [...state.data.issues,...state.data.external] : [];
  const find = n => allNodes().find(i=>i.key===String(n));
  const badge = issue => `<span class="status-badge ${escape(issue.status)}"><span class="dot ${escape(issue.status)}"></span>${STATUS[issue.status] || '待核实'}</span>`;
  function notice(message, error=false){$('notice').textContent=message;$('notice').classList.toggle('error',error);$('notice').hidden=!message;}
  let toastTimer;
  function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,3300);}
  function related() {
    const ids=new Set();if(!state.selected||!state.data)return ids;
    ids.add(state.selected);
    for (const direction of ['up','down']) {
      const queue=[state.selected],seen=new Set(queue);
      while(queue.length){const n=queue.shift();for(const e of state.data.edges){const next=direction==='up'?(e.target===n?e.source:null):(e.source===n?e.target:null);if(next!==null&&!seen.has(next)){seen.add(next);ids.add(next);queue.push(next);}}}
    }
    return ids;
  }
  function filtered() {
    const rel=state.focus?related():null;
    return (state.data?.issues||[]).filter(i => (state.scope!=='frontier'||i.status==='frontier') && (state.status==='all'||i.status===state.status) && (state.type==='all'||i.type===state.type) && (!state.search||`${i.title} ${i.body||''}`.toLowerCase().includes(state.search.toLowerCase())) && (!rel||rel.has(i.key)));
  }
  function renderList(){
    const items=filtered();
    $('issueList').innerHTML=items.map(i=>`<button class="issue-row ${i.key===state.selected?'selected':''}" data-issue="${i.key}" aria-label="${escape(i.title)}"><span class="dot ${i.status}"></span><span><span class="row-title">${escape(i.title)}</span><span class="row-meta">${TYPE[i.type]} · ${STATUS[i.status]}${i.assignees.length?' · '+escape(i.assignees.join(', ')):''}</span></span></button>`).join('') || '<div class="empty-note">没有符合条件的决策。<br>可以调整搜索或筛选条件。</div>';
    $('frontierTab').setAttribute('aria-selected',String(state.scope==='frontier'));$('allTab').setAttribute('aria-selected',String(state.scope==='all'));
  }
  function layout(nodes, edges) {
    const ids=new Set(nodes.map(n=>n.key)),incoming=new Map(nodes.map(n=>[n.key,[]]));
    edges.filter(e=>ids.has(e.source)&&ids.has(e.target)).forEach(e=>incoming.get(e.target).push(e.source));
    const rank=new Map(),active=new Set();let cyclic=false;
    function visit(id){if(rank.has(id))return rank.get(id);if(active.has(id)){cyclic=true;return 0;}active.add(id);const level=Math.max(0,...incoming.get(id).map(p=>visit(p)+1));active.delete(id);rank.set(id,Math.min(level,nodes.length));return rank.get(id);}
    nodes.forEach(n=>visit(n.key));
    const levels=new Map();nodes.forEach(n=>{const r=rank.get(n.key);if(!levels.has(r))levels.set(r,[]);levels.get(r).push(n);});
    const rows=Math.max(1,...[...levels.values()].map(a=>a.length));const positions=new Map();
    for(const [r,items] of [...levels].sort((a,b)=>a[0]-b[0])) {
      const barycenter = n => {const ys=incoming.get(n.key).map(id=>positions.get(id)?.y).filter(y=>y!==undefined);return ys.length?ys.reduce((a,b)=>a+b,0)/ys.length:0;};
      items.sort((a,b)=>barycenter(a)-barycenter(b));
      items.forEach((n,index)=>positions.set(n.key,{x:r*332+24,y:index*164+(rows-items.length)*82+24}));
    }
    return {positions,width:(Math.max(0,...rank.values())+1)*332-32,height:rows*164+32,cyclic};
  }
  function renderGraph(fit=false) {
    if(!state.data)return;
    const visible=filtered(),ids=new Set(visible.map(n=>n.key));
    const external=state.data.external.filter(n=>state.data.edges.some(e=>e.source===n.key&&ids.has(e.target)));
    const nodes=[...visible,...external],nodeIds=new Set(nodes.map(n=>n.key));
    const edges=state.data.edges.filter(e=>nodeIds.has(e.source)&&nodeIds.has(e.target));
    const grid=layout(nodes,edges),rel=related();state.width=grid.width;state.height=grid.height;
    $('graphWorld').style.width=grid.width+'px';$('graphWorld').style.height=grid.height+'px';
    $('graphNodes').innerHTML=nodes.map(n=>{const p=grid.positions.get(n.key);return `<button class="graph-node ${n.status} ${n.key===state.selected?'selected':''} ${rel.size&&!rel.has(n.key)?'dim':''}" data-issue="${n.key}" style="left:${p.x}px;top:${p.y}px" title="${escape(n.title)}" aria-label="${escape(n.title)}，${STATUS[n.status]}"><span class="node-top"><span class="dot ${n.status}"></span><span class="node-title">${escape(n.title)}</span></span><span class="node-bottom"><span class="node-type">${n.external?'地图外前置':TYPE[n.type]}</span><span class="node-status ${n.status}">${STATUS[n.status]}${n.assignees.length?' · '+escape(n.assignees[0]):''}</span></span></button>`;}).join('');
    $('graphEdges').setAttribute('width',grid.width);$('graphEdges').setAttribute('height',grid.height);
    $('graphEdges').innerHTML='<defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8" fill="#a9b8c2" stroke="none"/></marker><marker id="arrowActive" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8" fill="#62a495" stroke="none"/></marker></defs>'+edges.map(e=>{const s=grid.positions.get(e.source),t=grid.positions.get(e.target),sx=s.x+252,sy=s.y+66,tx=t.x-3,ty=t.y+66,dx=Math.max(35,(tx-sx)*.5),isRelated=rel.has(e.source)&&rel.has(e.target);return `<path class="edge ${isRelated?'related':rel.size?'dim':''}" d="M${sx},${sy} C${sx+dx},${sy} ${tx-dx},${ty} ${tx},${ty}" marker-end="url(#${isRelated?'arrowActive':'arrow'})"/>`;}).join('');
    $('graphEmpty').hidden=nodes.length>0;$('graphEmpty').textContent=nodes.length?'':'没有符合条件的决策。调整筛选条件后再看地图。';
    if(grid.cyclic)notice('检测到循环依赖。地图按近似层级展示，请在 GitHub 检查前置关系。');
    if(fit)fitGraph(false);else transform();
  }
  function transform(){
    $('graphWorld').style.transform=`translate(${state.x}px,${state.y}px) scale(${state.scale})`;
    $('zoomValue').textContent=Math.round(state.scale*100)+'%';
  }
  function fitGraph(full=true){
    const view=$('graphViewport');if(!view.clientWidth)return;
    const fitted=Math.min((view.clientWidth-45)/state.width,(view.clientHeight-85)/state.height,1);
    state.scale=Math.max(full?.16:.66,fitted);
    state.x=state.width*state.scale<view.clientWidth?(view.clientWidth-state.width*state.scale)/2:20;
    state.y=Math.max(20,(view.clientHeight-state.height*state.scale-30)/2);transform();
    if(!full&&fitted<.66)$('canvasHint').textContent='前置事项 → 后续决策 · 向左拖动看后续 · 全图见右侧按钮';
    else $('canvasHint').textContent='连线：前置事项 → 后续决策 · 拖动画布移动';
  }
  function zoom(factor,cx,cy){
    const view=$('graphViewport'),x=cx??view.clientWidth/2,y=cy??view.clientHeight/2;
    const next=Math.min(1.8,Math.max(.16,state.scale*factor)),ratio=next/state.scale;
    state.x=x-(x-state.x)*ratio;state.y=y-(y-state.y)*ratio;state.scale=next;transform();
  }
  function relationship(issue){return `<button class="relationship" data-issue="${issue.key}"><span class="dot ${issue.status}"></span><span><strong>${escape(issue.title)}</strong><small>${STATUS[issue.status]}${issue.external?' · 地图之外':''}</small></span></button>`;}
  function renderDetail(){
    const issue=find(state.selected);if(!issue)return;
    $('inspectorHeading').textContent='决策详情';
    const blockers=(issue.blockedBy||[]).map(find).filter(Boolean);
    const descendants=state.data.edges.filter(e=>e.source===issue.key).map(e=>find(e.target)).filter(Boolean);
    let html=`<h3 class="detail-title">${escape(issue.title)}</h3><div class="detail-badges">${badge(issue)}<span class="node-type">${issue.external?'地图外前置':TYPE[issue.type]}</span></div><div class="detail-meta">${issue.assignees.length?'认领者：'+escape(issue.assignees.join(', ')):'尚未分派'}${issue.updated_at?'<br>议题更新：'+date(issue.updated_at)+'（上海时间）':''}${issue.state_reason==='not_planned'?'<br>关闭原因：不再计划':''}</div>${link(issue.url,'在 GitHub 查看','button primary github-link')}`;
    html+=`<section class="detail-section"><h3>问题</h3><div class="markdown">${markdown(issue.body,true)}</div></section>`;
    if(!issue.external){
      html+=`<section class="detail-section"><h3>前置事项 <span class="muted">${blockers.length}</span></h3>${issue.dependenciesKnown===false?'<div class="empty-note">前置关系未读取成功，状态待核实。</div>':blockers.length?'<div class="relationship-list">'+blockers.map(relationship).join('')+'</div>':'<div class="empty-note">无前置阻塞</div>'}</section>`;
    }
    if(descendants.length)html+=`<section class="detail-section"><h3>后续决策 ${descendants.length}</h3><div class="relationship-list">${descendants.map(relationship).join('')}</div></section>`;
    const comments=issue.comments||[];
    if(!issue.external)html+=`<section class="detail-section"><h3>讨论与决策记录 ${comments.length}</h3>${comments.length?comments.map(c=>`<article class="comment"><div class="comment-meta"><span>${escape(c.author)} · ${date(c.createdAt)}</span>${link(c.url,'原文')}</div><div class="markdown">${markdown(c.body)}</div></article>`).join(''):'<div class="empty-note">该议题暂无评论。</div>'}</section>`;
    if(issue.external)html+='<section class="detail-section"><div class="empty-note">该前置事项不属于当前地图。详情与讨论可在 GitHub 查看。</div></section>';
    $('detailContent').innerHTML=html;
  }
  function selectIssue(number,open=true){
    state.selected=String(number);if(!find(state.selected))return;
    renderList();renderGraph();renderDetail();$('detailContent').scrollTop=0;
    if(open)setPanelVisible('right',true);
  }
  function clearSelection(){state.selected=null;state.focus=false;$('focusButton').setAttribute('aria-pressed','false');}
  function showOverview(){
    if(!state.data)return;clearSelection();renderList();renderGraph();$('inspectorHeading').textContent='地图说明';
    const names={Destination:'目标',Notes:'地图说明', 'Decisions so far':'已有决策索引','Not yet specified':'尚未明确','Out of scope':'范围之外'};
    $('detailContent').innerHTML=`<h3 class="detail-title">${escape(state.data.map.title)}</h3>${link(state.data.map.url,'在 GitHub 查看地图','button primary github-link')}`+Object.entries(state.data.map.sections).map(([key,value])=>`<section class="detail-section"><h3>${escape(names[key]||key)}</h3><div class="markdown">${markdown(value)}</div></section>`).join('');
    setPanelVisible('right',true);
  }
  function updateFilters(fit=true){renderList();renderGraph(fit);}
  function applyData(data){
    if(state.data&&(state.repo!==data.repo||state.number!==data.map.number)){clearSelection();state.scope='all';state.status='all';state.type='all';state.search='';$('statusFilter').value='all';$('typeFilter').value='all';$('searchInput').value='';}
    state.data=data;state.repo=data.repo;state.number=data.map.number;
    if(!find(state.selected))state.selected=data.frontier[0]||data.issues[0]?.key||null;
    $('repoLabel').textContent=data.repo;$('mapTitle').textContent=data.map.title;
    const closed=data.issues.filter(i=>i.status==='closed').length;
    $('mapSummary').innerHTML=`<strong>${closed} / ${data.issues.length}</strong> 已关闭 <span aria-hidden="true">·</span> <strong>${data.frontier.length}</strong> 可开始 <span aria-hidden="true">·</span> ${data.edges.length} 条依赖`;
    $('frontierCount').textContent=data.frontier.length;$('totalCount').textContent=data.issues.length;
    $('destination').textContent=(data.map.sections.Destination||'地图未填写目标。').replace(/\*\*/g,'');
    $('syncTime').textContent=`快照 ${date(data.fetchedAt)}（上海）${offline?' · 离线':''}`;
    $('syncTime').title=`快照时间：${new Date(data.fetchedAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})}（上海时间），点击刷新获取新状态。`;
    $('legend').innerHTML=['closed','frontier','claimed','blocked'].map(s=>`<span><i class="dot ${s}"></i>${STATUS[s]}</span>`).join('');
    $('exportButton').disabled=false;$('overviewButton').disabled=false;
    document.title=`Wayfinder · ${data.map.title}`;
    notice(data.warnings.length?data.warnings.join('；'):offline?'离线快照 · 状态截至 '+date(data.fetchedAt)+'（上海时间）。刷新请启动本地查看器。':'');
    updateFilters(true);if(state.selected)renderDetail();else showOverview();
    if(!offline)history.replaceState(null,'',`?repo=${encodeURIComponent(data.repo)}&map=${data.map.number}`);
  }
  function setBusy(busy){state.busy=busy;$('refreshButton').disabled=busy||offline;$('sourceButton').disabled=busy||offline;$('refreshButton').classList.toggle('busy',busy);$('refreshButton').querySelector('span').textContent=busy?'正在同步…':offline?'离线快照':'刷新地图';}
  async function request(url,options={}){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),240000);
    try{const response=await fetch(url,{...options,signal:controller.signal});const data=await response.json();if(!response.ok)throw new Error(data.error||'请求未完成。');return data;}
    catch(error){if(error.name==='AbortError')throw new Error('同步等待超时。已保留上次快照，可稍后重试。');if(error instanceof TypeError)throw new Error('本地服务连接中断。请重新启动查看器，当前快照仍可浏览。');throw error;}
    finally{clearTimeout(timer);}
  }
  async function refresh(repo=state.repo,number=state.number){
    if(state.busy||offline)return;if(!repo){openSource();return false;}setBusy(true);notice('正在读取 GitHub 地图、前置关系和评论，请稍候。已有快照仍可浏览。');
    try{const data=await request('/api/refresh',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({repo,number})});applyData(data);toast('地图已更新');return true;}
    catch(error){notice(error.message,true);return false;}finally{setBusy(false);}
  }
  async function openMap(repo,number,notify=true){
    let data;try{data=await request(`/api/map?repo=${encodeURIComponent(repo)}&number=${number}`);}catch{}
    if(data){clearSelection();applyData(data);$('sourceDialog').close();if(notify)toast('已打开本地快照，点击刷新获取最新状态。');return true;}
    const ok=await refresh(repo,number);if(ok)$('sourceDialog').close();return ok;
  }
  function openSource(){if(offline)return;$('repoInput').value=state.repo;$('mapNumberInput').value=state.number;$('sourceError').textContent='';$('mapChoices').innerHTML='';$('sourceDialog').showModal();}
  $('sourceButton').addEventListener('click',openSource);$('closeSource').addEventListener('click',()=>$('sourceDialog').close());
  document.querySelector('.brand').addEventListener('click',e=>{e.preventDefault();showOverview();});
  $('refreshButton').addEventListener('click',()=>refresh());
  $('overviewButton').addEventListener('click',showOverview);
  function panelVisible(side){
    if(side==='left')return !state.leftHidden;
    return !state.rightHidden&&(window.innerWidth>960||$('inspector').classList.contains('open'));
  }
  function updatePanelControls(){
    for(const side of ['left','right']){
      const visible=panelVisible(side),button=$(side==='left'?'toggleLeftPanel':'toggleRightPanel');
      const label=(visible?'隐藏':'展开')+(side==='left'?'左侧栏':'右侧栏');
      button.setAttribute('aria-expanded',String(visible));button.setAttribute('aria-label',label);button.title=label;
      button.querySelector('.panel-arrow').setAttribute('d',(side==='left')===visible?'m13 7-3 3 3 3':'m7 7 3 3-3 3');
    }
  }
  function setPanelVisible(side,visible){
    const viewport=$('graphViewport'),before=viewport.getBoundingClientRect();
    const panel=document.querySelector(side==='left'?'#sidebar':'#inspector'),focusInside=panel.contains(document.activeElement);
    state[side==='left'?'leftHidden':'rightHidden']=!visible;
    document.querySelector('.workspace').classList.toggle(side+'-hidden',!visible);
    if(side==='right')$('inspector').classList.toggle('open',visible);
    updatePanelControls();
    const after=viewport.getBoundingClientRect();
    // Keep the same point at the canvas center while its available width changes.
    if(before.width&&after.width){state.x+=(after.width-before.width)/2;state.y+=(after.height-before.height)/2;transform();}
    if(!visible&&focusInside)$(side==='left'?'toggleLeftPanel':'toggleRightPanel').focus();
  }
  $('toggleLeftPanel').addEventListener('click',()=>setPanelVisible('left',!panelVisible('left')));
  $('toggleRightPanel').addEventListener('click',()=>setPanelVisible('right',!panelVisible('right')));
  $('closeDetail').addEventListener('click',()=>setPanelVisible('right',false));
  document.querySelectorAll('[data-scope]').forEach(b=>b.addEventListener('click',()=>{state.scope=b.dataset.scope;updateFilters();}));
  $('searchInput').addEventListener('input',e=>{state.search=e.target.value.trim();updateFilters();});
  $('statusFilter').addEventListener('change',e=>{state.status=e.target.value;updateFilters();});
  $('typeFilter').addEventListener('change',e=>{state.type=e.target.value;updateFilters();});
  $('focusButton').addEventListener('click',()=>{if(!state.focus&&!state.selected){toast('先选择一个决策，再聚焦它的前后依赖。');return;}state.focus=!state.focus;$('focusButton').setAttribute('aria-pressed',String(state.focus));updateFilters();});
  document.addEventListener('click',e=>{const item=e.target.closest('[data-issue]');if(item&&!state.dragged)selectIssue(item.dataset.issue);});
  $('fitButton').addEventListener('click',()=>fitGraph(true));$('zoomInButton').addEventListener('click',()=>zoom(1.25));$('zoomOutButton').addEventListener('click',()=>zoom(.8));$('zoomValue').addEventListener('click',()=>zoom(1/state.scale));
  const viewport=$('graphViewport');let pointer=null;
  viewport.addEventListener('wheel',e=>{e.preventDefault();const box=viewport.getBoundingClientRect();zoom(e.deltaY<0?1.1:1/1.1,e.clientX-box.left,e.clientY-box.top);},{passive:false});
  viewport.addEventListener('pointerdown',e=>{if(e.button!==0)return;pointer={id:e.pointerId,x:e.clientX,y:e.clientY,startX:state.x,startY:state.y};state.dragged=false;});
  viewport.addEventListener('pointermove',e=>{if(!pointer||pointer.id!==e.pointerId)return;const dx=e.clientX-pointer.x,dy=e.clientY-pointer.y;if(Math.abs(dx)+Math.abs(dy)>5){state.dragged=true;viewport.classList.add('dragging');if(!viewport.hasPointerCapture(e.pointerId))viewport.setPointerCapture(e.pointerId);}if(state.dragged){state.x=pointer.startX+dx;state.y=pointer.startY+dy;transform();}});
  const endPointer=e=>{if(pointer&&viewport.hasPointerCapture(e.pointerId))viewport.releasePointerCapture(e.pointerId);pointer=null;viewport.classList.remove('dragging');setTimeout(()=>state.dragged=false,0);};
  viewport.addEventListener('pointerup',endPointer);viewport.addEventListener('pointercancel',endPointer);
  viewport.addEventListener('keydown',e=>{const step=45;if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();if(e.key==='ArrowLeft')state.x+=step;if(e.key==='ArrowRight')state.x-=step;if(e.key==='ArrowUp')state.y+=step;if(e.key==='ArrowDown')state.y-=step;transform();}if(e.key==='+'||e.key==='=')zoom(1.25);if(e.key==='-')zoom(.8);if(e.key==='0')fitGraph(true);});
  let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(state.data)fitGraph(false);updatePanelControls();},120);});
  function mobileMode(list){document.querySelector('.workspace').classList.toggle('list-mode',list);$('listViewButton').classList.toggle('active',list);$('graphViewButton').classList.toggle('active',!list);if(!list)fitGraph(false);}
  $('listViewButton').addEventListener('click',()=>mobileMode(true));$('graphViewButton').addEventListener('click',()=>mobileMode(false));
  $('findMapsButton').addEventListener('click',async()=>{const button=$('findMapsButton');button.disabled=true;button.textContent='查找中…';$('sourceError').textContent='';try{const maps=await request('/api/maps?repo='+encodeURIComponent($('repoInput').value.trim()));$('mapChoices').innerHTML=maps.map(m=>`<button type="button" class="map-choice" data-map="${m.number}">${escape(m.title)} <span class="row-meta">${m.state==='closed'?'地图已关闭':'地图开放中'}</span></button>`).join('')||'<div class="empty-note">此仓库没有找到 Wayfinder 地图。</div>';}catch(error){$('sourceError').textContent=error.message;}finally{button.disabled=false;button.textContent='查找地图';}});
  $('mapChoices').addEventListener('click',e=>{const button=e.target.closest('[data-map]');if(button){$('mapNumberInput').value=button.dataset.map;$('mapChoices').querySelectorAll('button').forEach(b=>b.style.borderColor='');button.style.borderColor='var(--accent)';}});
  $('sourceForm').addEventListener('submit',async e=>{e.preventDefault();if(state.busy)return;$('sourceError').textContent='';const repo=$('repoInput').value.trim(),number=Number($('mapNumberInput').value);if(!/^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(repo)||!Number.isInteger(number)||number<1){$('sourceError').textContent='请填写有效的 owner/repo 和地图编号。';return;}const button=$('sourceForm').querySelector('[type=submit]');button.disabled=true;button.textContent='正在打开…';const ok=await openMap(repo,number);if(!ok)$('sourceError').textContent=$('notice').textContent;button.disabled=false;button.textContent='打开地图';});
  $('exportButton').addEventListener('click',()=>{if(!state.data)return;if(offline){toast('当前文件已经是可独立打开的 HTML 快照。');return;}const anchor=document.createElement('a');anchor.href=`/api/export?repo=${encodeURIComponent(state.repo)}&number=${state.number}`;anchor.download='wayfinder-map.html';document.body.appendChild(anchor);anchor.click();anchor.remove();toast('已导出当前快照；离线文件无法刷新 GitHub。');});
  async function boot(){
    if(offline){applyData(window.WAYFINDER_SNAPSHOT);setBusy(false);return;}
    try{const config=await request('/api/config');const query=new URLSearchParams(location.search);state.repo=query.get('repo')||config.repo;state.number=Number(query.get('map')||config.number);if(!state.repo){$('destination').textContent='请选择仓库和地图。';$('syncTime').textContent='尚未选择地图';openSource();return;}await openMap(state.repo,state.number,false);}catch(error){notice(error.message,true);$('destination').textContent='还没有读取到地图，点击刷新重试。';}
  }
  updatePanelControls();
  boot();
})();

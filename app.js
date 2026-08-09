'use strict';

const DB_NAME = 'cronometro_local_v1';
const DB_VERSION = 1;
const $app = document.getElementById('app');
const $toast = document.getElementById('toast');

let db;
let ui = { tab: 'timers', timerView: 'timers', modal: null, popover: null, modelsEditing: false, historyQuery: '', historyModel: 'all', historyDate: '' };
let data = {
  models: [], sessions: [], current: null,
  settings: { theme: 'system', cardLayout: 'lateral', simultaneous: 'single', accentColor: '#007aff', statsCards: ['summary','total','timers','average','best','worst','percent','trend'] },
  undo: null
};
let tickHandle = null;
let toastHandle = null;

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
const now = () => Date.now();
const clone = obj => JSON.parse(JSON.stringify(obj));
const esc = v => String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const pad = n => String(n).padStart(2,'0');
const fmtDateTime = ms => { const d=new Date(ms); return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} • ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const fmtDate = ms => { const d=new Date(ms); return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()}`; };
const dayKey = ms => { const d=new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; };
const fmtDuration = ms => { ms=Math.max(0,Math.round(ms/1000)*1000); const s=Math.floor(ms/1000), h=Math.floor(s/3600), m=Math.floor((s%3600)/60), sec=s%60; return h?`${h}:${pad(m)}:${pad(sec)}`:`${pad(m)}:${pad(sec)}`; };
const fmtShort = ms => { const s=Math.round(ms/1000); if(s<60)return `${s}s`; const m=Math.round(s/60); if(m<60)return `${m} min`; return `${(m/60).toFixed(1).replace('.',',')} h`; };

function openDB(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,DB_VERSION);
    req.onupgradeneeded=()=>{
      const d=req.result;
      if(!d.objectStoreNames.contains('models')) d.createObjectStore('models',{keyPath:'id'});
      if(!d.objectStoreNames.contains('sessions')) d.createObjectStore('sessions',{keyPath:'id'});
      if(!d.objectStoreNames.contains('state')) d.createObjectStore('state',{keyPath:'key'});
    };
    req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error);
  });
}
function tx(store,mode='readonly'){ return db.transaction(store,mode).objectStore(store); }
function getAll(store){ return new Promise((res,rej)=>{ const r=tx(store).getAll(); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); }); }
function getState(key){ return new Promise((res,rej)=>{ const r=tx('state').get(key); r.onsuccess=()=>res(r.result?.value); r.onerror=()=>rej(r.error); }); }
function put(store,value){ return new Promise((res,rej)=>{ const r=tx(store,'readwrite').put(value); r.onsuccess=()=>res(value); r.onerror=()=>rej(r.error); }); }
function del(store,key){ return new Promise((res,rej)=>{ const r=tx(store,'readwrite').delete(key); r.onsuccess=()=>res(); r.onerror=()=>rej(r.error); }); }
function putState(key,value){ return put('state',{key,value}); }

function defaultModel(){
  const t=now(); return { id:uid(), name:'Meu modelo', createdAt:t, updatedAt:t, deletedAt:null, sortOrder:0, timers:[] };
}
function recordedFromTemplate(t){ return { id:uid(), templateId:t.id, name:t.name, symbol:t.symbol||'●', iconColor:t.iconColor||'#007aff', order:t.order, isAdhoc:false, isRemoved:false, intervals:[], correctedDurationMs:null } }
function newSession(model){
  const t=now(); return { id:uid(), modelId:model.id, modelNameSnapshot:model.name, title:'', manualTitle:false, note:'', openedAt:t, firstTimerStartedAt:null, savedAt:null, originalRecordedAt:null, restoredAt:null, deletedAt:null, status:'active', isNoMeasurement:false, globalPaused:false, pauseIntervals:[], pausedActiveTimerIds:[], customized:false, timers:model.timers.filter(x=>!x.removedAt).sort((a,b)=>a.order-b.order).map(recordedFromTemplate) };
}
function modelById(id){ return data.models.find(m=>m.id===id); }
function activeModels(){ return data.models.filter(m=>!m.deletedAt).sort((a,b)=>(a.sortOrder??0)-(b.sortOrder??0)||a.createdAt-b.createdAt); }
function nextModelOrder(){ return Math.max(-1,...data.models.map(m=>Number.isFinite(m.sortOrder)?m.sortOrder:-1))+1; }
function timerDuration(rt, at=now()){
  if(rt.correctedDurationMs!=null) return rt.correctedDurationMs;
  return rt.intervals.reduce((sum,i)=>sum + Math.max(0,(i.endedAt ?? at)-i.startedAt),0);
}
function sessionTotal(s,at=now()){ return s.timers.reduce((a,t)=>a+timerDuration(t,at),0); }
function pauseTotal(s,at=now()){ return s.pauseIntervals.reduce((a,p)=>a+Math.max(0,(p.endedAt??at)-p.startedAt),0); }
function sessionElapsedGross(s,at=now()){ const start=s.firstTimerStartedAt ?? s.openedAt; const end=s.savedAt ?? at; return Math.max(0,end-start); }
function sessionElapsedNet(s,at=now()){ return Math.max(0,sessionElapsedGross(s,at)-pauseTotal(s,at)); }
function openInterval(rt){ return [...rt.intervals].reverse().find(i=>i.endedAt==null); }
function isTimerActive(rt){ return !!openInterval(rt); }
function openPause(s){ return [...(s.pauseIntervals||[])].reverse().find(p=>p.endedAt==null); }
function isTimerPaused(s,rt){ return !isTimerActive(rt) && timerDuration(rt)>0; }
function isTimerDone(){ return false; }
function startPause(s,t){
  if(!s.firstTimerStartedAt || s.timers.some(isTimerActive) || openPause(s)) return;
  s.pauseIntervals ||= [];
  s.pauseIntervals.push({id:uid(),startedAt:t,endedAt:null,origin:'no-active-timer'});
}
function endPause(s,t){ const p=openPause(s); if(p)p.endedAt=t; }

async function persistCurrent(){ await putState('current',data.current); }
async function persistSettings(){ await putState('settings',data.settings); }
function haptic(kind='light'){
  try { if(navigator.vibrate) navigator.vibrate(kind==='save'?[20,25,20]:kind==='switch'?[12,18,12]:kind==='undo'?[8,12,8]:10); } catch(_){ }
}
function toast(msg){ clearTimeout(toastHandle); $toast.textContent=msg; $toast.classList.add('show'); toastHandle=setTimeout(()=>$toast.classList.remove('show'),1800); }
function setUndo(snapshot,label='Troca desfeita'){
  data.undo={ snapshot, expiresAt:now()+5000, label };
  render(); setTimeout(()=>{ if(data.undo && data.undo.expiresAt<=now()){data.undo=null;render();} },5100);
}
async function undo(){ if(!data.undo)return; data.current=data.undo.snapshot; data.undo=null; await persistCurrent(); haptic('undo'); toast('Desfeito'); render(); }

function hasPendingSession(s){return !!(s&&(s.firstTimerStartedAt||sessionTotal(s)>0||s.note?.trim()||s.customized||s.manualTitle));}

async function ensureCurrent(modelId=null){
  if(data.current?.status==='active') return data.current;
  const model=modelById(modelId)||activeModels()[0];
  if(!model) return null;
  data.current=newSession(model); await persistCurrent(); return data.current;
}

async function chooseModel(id){
  const m=modelById(id); if(!m)return;
  if(data.current && data.current.status==='active' && data.current.modelId!==id && hasPendingSession(data.current)){
    const choice=prompt('Há um registro pendente. Digite:\n1 = Salvar\n2 = Descartar\n3 = Cancelar','3');
    if(choice==='1'){ const ok=await saveSession(); if(!ok)return; }
    else if(choice==='2'){ data.current=null; await putState('current',null); }
    else return;
  }
  data.current=newSession(m); await persistCurrent();
  ui.timerView='timers'; ui.popover=null;
  if(!m.timers.some(t=>!t.removedAt)) ui.modal={type:'editModel',id:m.id}; else ui.modal=null;
  render();
}

async function tapTimer(timerId){
  const s=data.current; if(!s)return;
  const rt=s.timers.find(t=>t.id===timerId); if(!rt)return;
  const t=now();
  if(!s.firstTimerStartedAt) s.firstTimerStartedAt=t;
  const active=s.timers.find(x=>isTimerActive(x));
  if(active?.id===rt.id){
    openInterval(rt).endedAt=t;
    startPause(s,t);
    await persistCurrent(); haptic('light'); render(); return;
  }
  const snap=clone(s);
  if(active){ openInterval(active).endedAt=t; }
  else { endPause(s,t); }
  rt.intervals.push({id:uid(),startedAt:t,endedAt:null,origin:active?'switch':'resume'});
  await persistCurrent();
  if(active){ setUndo(snap); haptic('switch'); } else { haptic('light'); render(); }
}

async function addAdhoc(){
  const s=data.current;if(!s)return;
  const name=(prompt('Nome do cronômetro avulso:','')||'').trim(); if(!name)return;
  if(s.timers.some(t=>t.name.toLocaleLowerCase()===name.toLocaleLowerCase())){alert('Já existe um cronômetro com esse nome neste registro.');return;}
  s.timers.push({id:uid(),templateId:null,name,symbol:'●',iconColor:'#007aff',order:s.timers.length,isAdhoc:true,isRemoved:false,intervals:[],correctedDurationMs:null});
  s.customized=true; await persistCurrent(); render();
}
async function renameCurrentTimer(id){ const s=data.current,rt=s?.timers.find(t=>t.id===id);if(!rt)return; const n=(prompt('Novo nome:',rt.name)||'').trim();if(!n)return;rt.name=n;s.customized=true;await persistCurrent();render(); }
async function removeCurrentTimer(id){
  const s=data.current,rt=s?.timers.find(t=>t.id===id);if(!rt)return;
  if(timerDuration(rt)>0 && !confirm('Este cronômetro já possui tempo acumulado. Remover deste registro?'))return;
  const snap=clone(s),t=now();if(isTimerActive(rt)){openInterval(rt).endedAt=t;} s.timers=s.timers.filter(t=>t.id!==id).map((t,i)=>({...t,order:i})); startPause(s,t); s.customized=true; await persistCurrent(); setUndo(snap,'Remoção desfeita');
}
async function moveCurrentTimer(id,dir){ const s=data.current;if(!s)return;const arr=s.timers.sort((a,b)=>a.order-b.order),i=arr.findIndex(t=>t.id===id),j=i+dir;if(j<0||j>=arr.length)return;[arr[i],arr[j]]=[arr[j],arr[i]];arr.forEach((t,k)=>t.order=k);s.customized=true;await persistCurrent();render(); }

async function saveSession(){
  const s=data.current;if(!s)return false;const t=now();
  if(s.globalPaused){ s.globalPaused=false;s.pausedActiveTimerIds=[]; }
  s.timers.forEach(rt=>{const oi=openInterval(rt);if(oi)oi.endedAt=t;});
  endPause(s,t);
  const measured=sessionTotal(s,t)>0;
  if(!measured){
    let note=s.note.trim(); if(!note) note=(prompt('Para salvar um registro sem medição, escreva uma nota explicando:','')||'').trim();
    if(!note){ alert('A nota é obrigatória para salvar sem medição.'); return false; }
    s.note=note; s.isNoMeasurement=true;
  }
  if(!s.manualTitle) s.title=`(sem título) ${fmtDateTime(s.firstTimerStartedAt ?? s.openedAt)}`;
  s.savedAt=t; s.originalRecordedAt=s.firstTimerStartedAt ?? s.openedAt; s.status='saved';

  const adhoc=s.timers.filter(x=>x.isAdhoc);
  const model=modelById(s.modelId);
  if(adhoc.length && model){
    for(const rt of adhoc){
      if(confirm(`Incorporar “${rt.name}” ao modelo “${model.name}” para os próximos registros?`)){
        const templ={id:uid(),name:rt.name,symbol:rt.symbol,iconColor:rt.iconColor,order:model.timers.filter(x=>!x.removedAt).length,createdAt:t,removedAt:null};
        model.timers.push(templ); model.updatedAt=t; rt.templateId=templ.id; rt.isAdhoc=false; await put('models',model);
      }
    }
  }
  await put('sessions',clone(s)); data.sessions.unshift(clone(s));
  const sameModel=modelById(s.modelId); data.current=sameModel?newSession(sameModel):null; await putState('current',data.current);
  haptic('save'); toast('Registro salvo'); render(); return true;
}

async function discardCurrent(){ if(!data.current)return; if(confirm('Descartar o registro atual?')){ const m=modelById(data.current.modelId); data.current=m?newSession(m):null; await persistCurrent(); render(); } }

async function createModel(){
  const name=(prompt('Nome do novo modelo:','')||'').trim();if(!name)return;
  if(activeModels().some(m=>m.name.toLocaleLowerCase()===name.toLocaleLowerCase())){alert('Já existe um modelo com esse nome.');return;}
  const t=now(),m={id:uid(),name,createdAt:t,updatedAt:t,deletedAt:null,sortOrder:nextModelOrder(),timers:[]};data.models.push(m);await put('models',m);ui.modal={type:'editModel',id:m.id};render();
}
async function renameModel(m){ const n=(prompt('Nome do modelo:',m.name)||'').trim(); if(!n)return; if(activeModels().some(x=>x.id!==m.id&&x.name.toLocaleLowerCase()===n.toLocaleLowerCase())){alert('Já existe um modelo com esse nome.');return;} m.name=n;m.updatedAt=now();await put('models',m);if(data.current?.modelId===m.id){data.current.modelNameSnapshot=n;await persistCurrent();}render(); }
async function addTemplate(m){
  const name=(prompt('Nome do cronômetro:','')||'').trim();if(!name)return;
  if(m.timers.some(t=>!t.removedAt&&t.name.toLocaleLowerCase()===name.toLocaleLowerCase())){alert('Neste modelo, os cronômetros precisam ter nomes diferentes.');return;}
  const symbol=(prompt('Símbolo curto (ex.: C, P, L):',name.slice(0,1).toUpperCase())||name.slice(0,1)).slice(0,2);
  m.timers.push({id:uid(),name,symbol,iconColor:'#007aff',order:m.timers.filter(t=>!t.removedAt).length,createdAt:now(),removedAt:null});m.updatedAt=now();await put('models',m);render();
}
async function editTemplate(m,tid){
  const t=m.timers.find(x=>x.id===tid);if(!t)return;
  const n=(prompt('Nome do cronômetro:',t.name)||'').trim();if(!n)return;
  if(m.timers.some(x=>x.id!==tid&&!x.removedAt&&x.name.toLocaleLowerCase()===n.toLocaleLowerCase())){alert('Neste modelo, os cronômetros precisam ter nomes diferentes.');return;}
  t.name=n;const sym=prompt('Símbolo curto:',t.symbol);if(sym)t.symbol=sym.slice(0,2);m.updatedAt=now();await put('models',m);
  for(const s of data.sessions){
    let changed=false;
    for(const rt of s.timers){if(rt.templateId===tid){rt.name=t.name;rt.symbol=t.symbol;rt.iconColor=t.iconColor;changed=true;}}
    if(changed) await put('sessions',s);
  }
  render();
}
async function removeTemplate(m,tid){
  const t=m.timers.find(x=>x.id===tid);if(!t||!confirm(`Remover “${t.name}” do modelo? O histórico será preservado.`))return;
  t.removedAt=now();m.updatedAt=now();await put('models',m);
  for(const s of data.sessions){let changed=false;for(const rt of s.timers){if(rt.templateId===tid){rt.isRemoved=true;changed=true;}}if(changed)await put('sessions',s);}
  render();
}
async function moveTemplate(m,tid,dir){ const arr=m.timers.filter(t=>!t.removedAt).sort((a,b)=>a.order-b.order);const i=arr.findIndex(t=>t.id===tid),j=i+dir;if(j<0||j>=arr.length)return;[arr[i],arr[j]]=[arr[j],arr[i]];arr.forEach((t,k)=>t.order=k);m.updatedAt=now();await put('models',m);render(); }
async function duplicateModel(m){ let n=2,name=`${m.name} (${n})`;const names=new Set(activeModels().map(x=>x.name));while(names.has(name)){n++;name=`${m.name} (${n})`;}const t=now();const c={id:uid(),name,createdAt:t,updatedAt:t,deletedAt:null,sortOrder:nextModelOrder(),timers:m.timers.filter(x=>!x.removedAt).sort((a,b)=>a.order-b.order).map((x,i)=>({id:uid(),name:x.name,symbol:x.symbol,iconColor:x.iconColor,order:i,createdAt:t,removedAt:null}))};data.models.push(c);await put('models',c);toast('Modelo duplicado');render(); }
async function moveModel(id,dir){const arr=activeModels();const i=arr.findIndex(m=>m.id===id),j=i+dir;if(i<0||j<0||j>=arr.length)return;[arr[i],arr[j]]=[arr[j],arr[i]];for(let k=0;k<arr.length;k++){arr[k].sortOrder=k;arr[k].updatedAt=now();await put('models',arr[k]);}render();}
async function deleteModel(m){ if(data.current?.modelId===m.id && hasPendingSession(data.current)){alert('Salve ou descarte o registro em andamento antes de excluir este modelo.');return;}if(!confirm(`Mover “${m.name}” para Apagados recentemente?`))return;m.deletedAt=now();m.updatedAt=now();await put('models',m);if(data.current?.modelId===m.id){const next=activeModels()[0];data.current=next?newSession(next):null;await persistCurrent();}ui.modal=null;ui.popover=null;render(); }
async function restoreModel(m){m.deletedAt=null;if(!Number.isFinite(m.sortOrder))m.sortOrder=nextModelOrder();m.updatedAt=now();await put('models',m);toast('Modelo restaurado');render();}
async function hardDeleteModel(m){if(!confirm('Excluir este modelo definitivamente? Esta ação é irreversível.'))return;await del('models',m.id);data.models=data.models.filter(x=>x.id!==m.id);render();}

async function deleteSession(s){ if(!confirm('Mover este registro para Apagados recentemente?'))return;s.deletedAt=now();await put('sessions',s);render(); }
async function restoreSession(s){s.deletedAt=null;s.restoredAt=now();if(!s.manualTitle)s.title=`(sem título) ${fmtDateTime(s.restoredAt)}`;await put('sessions',s);toast('Registro restaurado');render();}
async function hardDeleteSession(s){if(!confirm('Apagar definitivamente? Esta ação não pode ser desfeita.'))return;await del('sessions',s.id);data.sessions=data.sessions.filter(x=>x.id!==s.id);ui.modal=null;render();}
async function correctTimer(s,rt){ const current=timerDuration(rt);const input=prompt(`Novo tempo efetivo de “${rt.name}” em minutos:`,(current/60000).toFixed(1).replace('.',','));if(input==null)return;const mins=Number(input.replace(',','.'));if(!Number.isFinite(mins)||mins<0){alert('Digite um número válido.');return;}if(!confirm('Aplicar esta correção de tempo?'))return;rt.correctedDurationMs=Math.round(mins*60000);await put('sessions',s);toast('Tempo corrigido');render(); }
async function saveSessionNote(id,value){const s=data.sessions.find(x=>x.id===id);if(!s)return;s.note=value;await put('sessions',s);const el=document.querySelector('#noteStatus');if(el)el.textContent=`Alterado • salvo às ${pad(new Date().getHours())}:${pad(new Date().getMinutes())}`;}
async function editSessionTitle(s){const n=(prompt('Título:',s.title)||'').trim();if(!n)return;s.title=n;s.manualTitle=true;await put('sessions',s);render();}

async function rebuildModelFromSession(s){
  if(modelById(s.modelId)){alert('Esta ação só fica disponível depois que o modelo de origem é excluído definitivamente.');return;}
  const base=(prompt('Nome do novo modelo:',s.modelNameSnapshot||'Novo modelo')||'').trim();if(!base)return;
  let name=base,n=2;const names=new Set(activeModels().map(m=>m.name));while(names.has(name)){name=`${base} (${n++})`;}
  const chosen=[];
  for(const rt of s.timers.sort((a,b)=>a.order-b.order)){
    if(confirm(`Incluir “${rt.name}” no novo modelo?`)) chosen.push(rt);
  }
  const t=now(),m={id:uid(),name,createdAt:t,updatedAt:t,deletedAt:null,sortOrder:nextModelOrder(),timers:chosen.map((rt,i)=>({id:uid(),name:rt.name,symbol:rt.symbol||'●',iconColor:rt.iconColor||'#007aff',order:i,createdAt:t,removedAt:null}))};
  data.models.push(m);await put('models',m);toast('Novo modelo criado');ui.modal={type:'editModel',id:m.id};render();
}

function currentTitle(){ const s=data.current; if(!s)return 'Cronômetro'; return s.manualTitle&&s.title?s.title:`(sem título) ${fmtDateTime(s.firstTimerStartedAt??s.openedAt)}`; }
function timerStateClass(s,rt){ if(isTimerActive(rt))return 'active'; if(isTimerPaused(s,rt))return 'paused'; return ''; }
function timerStateMark(s,rt){ if(isTimerActive(rt))return '●';if(isTimerPaused(s,rt))return 'Ⅱ';return ''; }
function svgIcon(name){
  const paths={
    timers:'<circle cx="12" cy="13" r="7.5"/><path d="M12 13V8.7M9 2.5h6M16.7 5.2l1.4-1.4"/>',
    history:'<path d="M3.5 6.5h17M3.5 12h17M3.5 17.5h17"/><path d="M6.5 4v5M11 9V4M15.5 4v5"/>',
    stats:'<path d="M5 20V11M12 20V4M19 20v-7"/>',
    settings:'<circle cx="12" cy="12" r="3.2"/><path d="M12 2.8v2M12 19.2v2M21.2 12h-2M4.8 12h-2M18.5 5.5l-1.4 1.4M6.9 17.1l-1.4 1.4M18.5 18.5l-1.4-1.4M6.9 6.9L5.5 5.5"/>',
    back:'<path d="M14.8 5.5 8.3 12l6.5 6.5"/>',
    more:'<circle cx="5" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.2" fill="currentColor" stroke="none"/>',
    clock:'<circle cx="12" cy="12" r="8.5"/><path d="M12 7.2V12l3.2 2"/>',
    plus:'<path d="M12 5v14M5 12h14"/>',
    check:'<path d="m6.5 12.5 3.4 3.4 7.7-8"/>',
    close:'<path d="m7 7 10 10M17 7 7 17"/>'
  };
  return `<svg class="sf-icon" viewBox="0 0 24 24" aria-hidden="true">${paths[name]||''}</svg>`;
}

function shell(content,tab=ui.tab){
  const tabs=[['timers','timers','Cronômetros'],['history','history','Histórico'],['stats','stats','Estatísticas'],['settings','settings','Ajustes']];
  return `<div class="app-shell">${content}</div><nav class="tabbar" aria-label="Navegação principal">
    ${tabs.map(([id,ic,l])=>`<button data-tab="${id}" class="${tab===id?'active':''}" aria-label="${l}">${svgIcon(ic)}<span>${l}</span></button>`).join('')}
  </nav>${data.undo&&data.undo.expiresAt>now()?`<div class="undo"><span>Alteração realizada</span><button id="undoBtn">Desfazer</button></div>`:''}`;
}

function renderTimers(){
  const s=data.current, models=activeModels();
  if(ui.timerView==='models') return renderModelsPage();
  if(!models.length){ return shell(`<header class="topbar simple"><h1>Cronômetro</h1></header><main class="content"><div class="empty">Nenhum modelo criado.<br><br><button class="ios-button" id="createFirst">Criar modelo</button></div></main>`); }
  if(!s) return '';
  const model=modelById(s.modelId);
  const cards=s.timers.sort((a,b)=>a.order-b.order).map(rt=>{
    const central=data.settings.cardLayout==='central';
    return `<button class="timer-card ${central?'central':''} ${timerStateClass(s,rt)}" data-timer="${rt.id}" aria-label="${esc(rt.name)}, ${fmtDuration(timerDuration(rt))}">
      <span class="icon" style="color:${esc(rt.iconColor)}">${esc(timerStateMark(s,rt)||rt.symbol||'●')}</span>
      <span class="name">${esc(rt.name)}${rt.isAdhoc?'<span class="badge">Etapa avulsa</span>':''}</span>
      <span class="time">${fmtDuration(timerDuration(rt))}</span>
    </button>`;
  }).join('');
  const titlePopover=ui.popover?.type==='title'?`<div class="popover-backdrop" id="closePopover"></div><div class="title-popover floating-window"><button id="titleRename">Renomear</button><button id="titleEditModel">Editar modelo</button><button id="titleDiscard" class="danger">Zerar e descartar</button></div>`:'';
  return shell(`<header class="topbar timer-topbar"><div class="header-row"><button class="circle-button" id="modelsBack" aria-label="Modelos">${svgIcon('back')}</button><button class="current-title ${s.manualTitle?'':'untitled'}" id="currentTitleButton">${esc(currentTitle())}</button><button class="circle-button" id="sessionMenu" aria-label="Detalhes">${svgIcon('more')}</button>${titlePopover}</div><div class="current-model-name">${esc(model?.name||s.modelNameSnapshot)}</div>${s.customized?'<div class="status-line">Personalizado neste registro</div>':''}</header>
  <main class="content timer-content"><section class="total-card floating-card"><span class="total-icon">${svgIcon('clock')}</span><span><small>Tempo total</small><strong>${fmtDuration(sessionTotal(s))}</strong></span></section><div class="timer-list">${cards}<button class="add-card" id="addAdhoc">${svgIcon('plus')}<span>Adicionar cronômetro</span></button></div></main>
  <div class="floating-actions single"><button class="save-btn" id="saveBtn">${svgIcon('check')}<span>Salvar</span></button></div>`);
}

function renderHistory(){
  const sessions=data.sessions.filter(s=>s.status==='saved'&&!s.deletedAt).sort((a,b)=>(b.restoredAt||b.savedAt)-(a.restoredAt||a.savedAt));
  const filtered=sessions.filter(s=>{
    const q=ui.historyQuery.trim().toLocaleLowerCase(); if(q&&!s.title.toLocaleLowerCase().includes(q))return false;
    if(ui.historyModel!=='all'&&s.modelId!==ui.historyModel)return false;
    if(ui.historyDate&&dayKey(s.restoredAt||s.savedAt)!==ui.historyDate)return false; return true;
  });
  const groups={};filtered.forEach(s=>{const k=dayKey(s.restoredAt||s.savedAt);(groups[k]??=[]).push(s);});
  const list=Object.entries(groups).map(([k,arr])=>`<div class="history-day">${fmtDate(new Date(k+'T12:00:00').getTime())}</div>${arr.map(s=>`<button class="history-card" data-session="${s.id}"><div class="top"><strong>${esc(s.title)}</strong><span>${s.isNoMeasurement?'':fmtDuration(sessionTotal(s,s.savedAt))}</span></div>${s.isNoMeasurement?'<span class="badge">Sem medição</span>':''}${s.restoredAt?'<span class="badge">Restaurado</span>':''}</button>`).join('')}`).join('');
  return shell(`<header class="topbar"><h1>Histórico</h1></header><main class="content"><h2 class="section-title">Registros</h2><div class="filters"><input id="historySearch" placeholder="Buscar título" value="${esc(ui.historyQuery)}"><select id="historyModel"><option value="all">Todos os modelos</option>${activeModels().map(m=>`<option value="${m.id}" ${ui.historyModel===m.id?'selected':''}>${esc(m.name)}</option>`).join('')}</select><input id="historyDate" type="date" value="${esc(ui.historyDate)}"><button class="chip" id="historyTrash">Apagados recentemente</button></div>${list||'<div class="empty">Nenhum registro encontrado.</div>'}</main>`);
}

function validMeasuredSessions(){ return data.sessions.filter(s=>s.status==='saved'&&!s.deletedAt&&!s.isNoMeasurement && !!modelById(s.modelId)); }
function renderStats(){
  const ss=validMeasuredSessions(); const count=ss.length,total=ss.reduce((a,s)=>a+sessionTotal(s,s.savedAt),0),avg=count?total/count:0;
  const byTimer=new Map();
  ss.forEach(s=>s.timers.forEach(t=>{const d=timerDuration(t,s.savedAt);if(d<=0)return;const key=t.templateId||`adhoc:${t.name}`;const x=byTimer.get(key)||{name:t.name,vals:[],total:0};x.vals.push(d);x.total+=d;byTimer.set(key,x);}));
  const timers=[...byTimer.values()].sort((a,b)=>b.total-a.total); const maxTotal=Math.max(1,...timers.map(x=>x.total));
  let trend='Sem dados suficientes'; if(ss.length>=2){const ordered=[...ss].sort((a,b)=>a.originalRecordedAt-b.originalRecordedAt);const half=Math.max(1,Math.floor(ordered.length/2));const a=ordered.slice(0,half).reduce((x,s)=>x+sessionTotal(s,s.savedAt),0)/half;const bArr=ordered.slice(-half);const b=bArr.reduce((x,s)=>x+sessionTotal(s,s.savedAt),0)/bArr.length;const pct=a?((b-a)/a*100):0;trend=pct<0?`${Math.abs(pct).toFixed(1).replace('.',',')}% mais rápido`:`${pct.toFixed(1).replace('.',',')}% mais lento`;}
  const timerRows=(kind)=>timers.map(x=>{let value;if(kind==='avg')value=x.total/x.vals.length;if(kind==='best')value=Math.min(...x.vals);if(kind==='worst')value=Math.max(...x.vals);return `<div class="row"><span>${esc(x.name)}</span><strong>${fmtDuration(value)}</strong></div>`}).join('')||'<div class="muted">Sem dados.</div>';
  const percentRows=timers.map(x=>`<div><div class="row"><span>${esc(x.name)}</span><strong>${total?(x.total/total*100).toFixed(1).replace('.',','):0}%</strong></div><div class="bar"><span style="width:${Math.min(100,x.total/maxTotal*100)}%"></span></div></div>`).join('')||'<div class="muted">Sem dados.</div>';
  return shell(`<header class="topbar"><h1>Estatísticas</h1></header><main class="content"><h2 class="section-title">Visão geral</h2>${count?`<div class="stats-grid">
    <section class="panel"><h3>Resumo</h3><div class="row"><span>Registros medidos</span><strong>${count}</strong></div><div class="row"><span>Tempo acumulado</span><strong>${fmtDuration(total)}</strong></div><div class="row"><span>Média por registro</span><strong>${fmtDuration(avg)}</strong></div></section>
    <section class="panel"><h3>Tempo total por registro</h3>${ss.sort((a,b)=>b.originalRecordedAt-a.originalRecordedAt).slice(0,12).map(s=>`<div class="row"><span>${esc(s.title)}</span><strong>${fmtDuration(sessionTotal(s,s.savedAt))}</strong></div>`).join('')}</section>
    <section class="panel"><h3>Tempo de cada cronômetro</h3>${timers.map(x=>`<div><div class="row"><span>${esc(x.name)}</span><strong>${fmtDuration(x.total)}</strong></div><div class="bar"><span style="width:${x.total/maxTotal*100}%"></span></div></div>`).join('')}</section>
    <section class="panel"><h3>Média por cronômetro</h3>${timerRows('avg')}</section>
    <section class="panel"><h3>Melhor tempo</h3>${timerRows('best')}</section>
    <section class="panel"><h3>Pior tempo</h3>${timerRows('worst')}</section>
    <section class="panel"><h3>Percentual no tempo total</h3>${percentRows}</section>
    <section class="panel"><h3>Evolução / tendência</h3><div class="stat-big">${esc(trend)}</div><p class="muted small">Comparação da média da primeira metade dos registros com a metade mais recente.</p></section>
  </div>`:`<div class="empty">As estatísticas aparecerão depois que você salvar registros com medição.</div>`}</main>`);
}

function renderSettings(){
  const swatches=['#007aff','#34c759','#af52de','#ff2d55','#ff9500','#5856d6','#32ade6'];
  return shell(`<header class="topbar simple"><h1>Ajustes</h1></header><main class="settings-content"><h2 class="settings-title">Ajustes</h2>
    <section class="settings-section"><div class="settings-card">
      <label class="settings-row" for="themeSelect"><span>Aparência</span><span class="select-wrap"><select id="themeSelect"><option value="system" ${data.settings.theme==='system'?'selected':''}>Sistema</option><option value="light" ${data.settings.theme==='light'?'selected':''}>Claro</option><option value="dark" ${data.settings.theme==='dark'?'selected':''}>Escuro</option></select><span class="chevrons">⌃⌄</span></span></label>
      <label class="settings-row" for="layoutSelect"><span>Layout dos cartões</span><span class="select-wrap"><select id="layoutSelect"><option value="lateral" ${data.settings.cardLayout==='lateral'?'selected':''}>Lateral</option><option value="central" ${data.settings.cardLayout==='central'?'selected':''}>Central</option></select><span class="chevrons">⌃⌄</span></span></label>
    </div><p class="section-footer">Os cronômetros funcionam sempre um por vez. Toque no cronômetro ativo para pará-lo e toque novamente para continuar.</p></section>
    <section class="settings-section"><h3 class="section-label">Cor de destaque</h3><div class="settings-card color-card"><div class="color-swatches">${swatches.map(c=>`<button class="color-swatch ${data.settings.accentColor?.toLowerCase()===c?'selected':''}" data-accent="${c}" style="--swatch:${c}" aria-label="Cor ${c}"></button>`).join('')}<label class="color-swatch custom ${!swatches.includes((data.settings.accentColor||'').toLowerCase())?'selected':''}" style="--swatch:${esc(data.settings.accentColor||'#007aff')}" aria-label="Escolher outra cor"><input id="accentCustom" type="color" value="${esc(data.settings.accentColor||'#007aff')}"><span>＋</span></label></div></div><p class="section-footer">A cor escolhida é usada nos destaques, botões principais e aba selecionada.</p></section>
    <section class="settings-section"><h3 class="section-label">Dados e exportação</h3><div class="settings-card"><button class="settings-row button-row" id="exportCsv"><span>Exportar CSV para planilhas</span></button><button class="settings-row button-row" id="exportPdf"><span>Exportar relatório PDF</span></button><button class="settings-row button-row" id="exportJson"><span>Exportar arquivo completo de dados</span></button><label class="settings-row button-row" for="importJsonFile"><span>Restaurar backup JSON</span><input id="importJsonFile" class="sr-only" type="file" accept="application/json,.json"></label></div><p class="section-footer">Restaurar um JSON substitui os dados atuais pelos dados do arquivo após confirmação. Exporte uma cópia atual antes se quiser preservá-la.</p></section>
    <section class="settings-section"><h3 class="section-label">Armazenamento</h3><div class="settings-card"><div class="settings-row"><span>Dados</span><span class="secondary-value">Somente neste iPhone</span></div><div class="settings-row"><span>Offline</span><span class="secondary-value">Ativo</span></div><div class="settings-row"><span>iCloud</span><span class="secondary-value">Não disponível</span></div></div><p class="section-footer">Os registros ficam no armazenamento local associado a este web app. O GitHub hospeda somente os arquivos do aplicativo.</p></section>
    <section class="settings-section"><div class="settings-card"><div class="settings-row"><span>Versão</span><span class="secondary-value">0.2.0 local</span></div></div></section>
  </main>`);
}

function renderModelsPage(){
  const all=activeModels();
  return shell(`<header class="topbar simple models-header"><h1>Modelos</h1><button class="text-button" id="toggleModelsEdit">${ui.modelsEditing?'Concluir':'Editar'}</button></header><main class="content models-page"><button class="create-model-card" id="createModel">${svgIcon('plus')}<span>Criar novo modelo</span></button><div class="models-list">${all.map((m,i)=>`<div class="model-list-item"><button class="model-main" data-choose-model="${m.id}"><strong>${esc(m.name)}</strong><span>${m.timers.filter(t=>!t.removedAt).length} cronômetro(s)</span></button>${ui.modelsEditing?`<div class="model-reorder"><button data-move-model="${m.id}" data-dir="-1" ${i===0?'disabled':''}>↑</button><button data-move-model="${m.id}" data-dir="1" ${i===all.length-1?'disabled':''}>↓</button></div>`:`<button class="circle-button small-circle" data-model-options="${m.id}" aria-label="Opções de ${esc(m.name)}">${svgIcon('more')}</button>`}${ui.popover?.type==='modelOptions'&&ui.popover.id===m.id?`<div class="popover-backdrop" id="closePopover"></div><div class="model-popover floating-window"><button data-model-rename="${m.id}">Renomear</button><button data-model-edit="${m.id}">Editar</button><button data-model-dup="${m.id}">Duplicar</button><button data-model-delete="${m.id}" class="danger">Apagar</button></div>`:''}</div>`).join('')}</div></main>`,'timers');
}
function renderEditModel(m){ const ts=m.timers.filter(t=>!t.removedAt).sort((a,b)=>a.order-b.order);return `<div class="modal-wrap"><section class="sheet"><div class="sheet-head"><h2>${esc(m.name)}</h2><button class="chip" id="closeToModels">Concluir</button></div><div class="toolbar"><button id="renameModel">Renomear modelo</button><button id="addTemplate">＋ Cronômetro</button></div>${ts.length?ts.map((t,i)=>`<div class="panel"><div class="row"><span><strong>${esc(t.symbol)} ${esc(t.name)}</strong></span><span class="toolbar"><button data-move-template="${t.id}" data-dir="-1" ${i===0?'disabled':''}>↑</button><button data-move-template="${t.id}" data-dir="1" ${i===ts.length-1?'disabled':''}>↓</button></span></div><div class="toolbar"><button data-edit-template="${t.id}">Editar</button><button data-remove-template="${t.id}" class="danger">Remover</button></div></div>`).join(''):'<div class="empty">Este modelo está vazio. Você pode mantê-lo assim ou adicionar cronômetros.</div>'}</section></div>`; }
function renderSessionMenu(){ const s=data.current;return `<div class="modal-wrap"><section class="sheet details-sheet" role="dialog" aria-modal="true"><div class="sheet-head liquid-head"><button class="circle-button glass" id="closeModal" aria-label="Fechar">${svgIcon('close')}</button><h2>Detalhes</h2><span class="sheet-spacer"></span></div><div class="sheet-body"><section class="sheet-card"><textarea id="currentNote" class="notes-box" rows="5" placeholder="Notas">${esc(s.note)}</textarea></section><section class="sheet-card"><button class="sheet-row action-row" id="menuCustomize">Organizar cronômetros</button></section></div></section></div>`; }

function renderOrganize(){const s=data.current;return `<div class="modal-wrap"><section class="sheet"><div class="sheet-head"><h2>Organizar registro</h2><button class="chip" id="closeModal">Concluir</button></div>${s.timers.sort((a,b)=>a.order-b.order).map((t,i)=>`<div class="panel"><div class="row"><strong>${esc(t.name)}</strong><span class="toolbar"><button data-move-current="${t.id}" data-dir="-1" ${i===0?'disabled':''}>↑</button><button data-move-current="${t.id}" data-dir="1" ${i===s.timers.length-1?'disabled':''}>↓</button></span></div><div class="toolbar"><button data-rename-current="${t.id}">Renomear</button><button data-remove-current="${t.id}" class="danger">Remover</button></div></div>`).join('')}</section></div>`;}
function renderSessionDetail(s){ const model=modelById(s.modelId);return `<div class="modal-wrap"><section class="sheet"><div class="sheet-head"><h2>${esc(s.title)}</h2><button class="chip" id="closeModal">Fechar</button></div><div class="toolbar"><button data-edit-session-title="${s.id}">Editar título</button>${!model?' <button data-rebuild-model="'+s.id+'">Criar modelo deste registro</button>':''}<button data-delete-session="${s.id}" class="danger">Excluir</button></div><section class="panel"><div class="row"><span>Modelo de origem</span><strong>${esc(model ? (model.deletedAt ? 'Modelo excluído' : model.name) : 'Modelo excluído')}</strong></div>${s.isNoMeasurement?'<div class="row"><span class="badge">Sem medição</span></div>':`<div class="row"><span>Tempo total</span><strong>${fmtDuration(sessionTotal(s,s.savedAt))}</strong></div><div class="row"><span>Tempo decorrido</span><strong>${fmtDuration(sessionElapsedNet(s,s.savedAt))}</strong></div><div class="row"><span>Pausas</span><strong>${fmtDuration(pauseTotal(s,s.savedAt))}</strong></div>`}<div class="row"><span>Registrado originalmente em</span><span>${fmtDateTime(s.originalRecordedAt)}</span></div>${s.restoredAt?`<div class="row"><span>Restaurado em</span><span>${fmtDateTime(s.restoredAt)}</span></div>`:''}</section>
    ${!s.isNoMeasurement?s.timers.filter(t=>timerDuration(t,s.savedAt)>0).sort((a,b)=>a.order-b.order).map(t=>`<section class="panel"><div class="row"><span><strong>${esc(t.name)}</strong>${t.isAdhoc?'<br><span class="badge">Etapa avulsa</span>':''}${t.isRemoved?'<br><span class="badge">Removido do modelo</span>':''}</span><strong>${fmtDuration(timerDuration(t,s.savedAt))}</strong></div><details><summary class="muted small">Horários e intervalos</summary>${t.intervals.map(i=>`<div class="row small"><span>${fmtDateTime(i.startedAt)}</span><span>${i.endedAt?fmtDateTime(i.endedAt):'aberto'}</span></div>`).join('')}</details><button class="action" data-correct-time="${s.id}" data-timer-id="${t.id}">Corrigir tempo</button></section>`).join(''):''}
    <section class="panel"><label for="detailNote"><strong>Nota</strong></label><textarea id="detailNote" rows="4" data-note-session="${s.id}" placeholder="Notas">${esc(s.note)}</textarea><div id="noteStatus" class="muted small"></div></section></section></div>`; }
function renderTrash(){ const deletedSessions=data.sessions.filter(s=>s.deletedAt),deletedModels=data.models.filter(m=>m.deletedAt);return `<div class="modal-wrap"><section class="sheet"><div class="sheet-head"><h2>Apagados recentemente</h2><button class="chip" id="closeModal">Fechar</button></div><h3>Registros</h3>${deletedSessions.map(s=>`<div class="panel"><strong>${esc(s.title)}</strong><div class="toolbar"><button data-restore-session="${s.id}">Restaurar</button><button data-hard-session="${s.id}" class="danger">Apagar definitivamente</button></div></div>`).join('')||'<p class="muted">Nenhum registro.</p>'}<h3>Modelos</h3>${deletedModels.map(m=>`<div class="panel"><strong>${esc(m.name)}</strong><div class="toolbar"><button data-restore-model="${m.id}">Restaurar</button><button data-hard-model="${m.id}" class="danger">Apagar definitivamente</button></div></div>`).join('')||'<p class="muted">Nenhum modelo.</p>'}</section></div>`; }

function render(){
  applyTheme();
  if(ui.tab==='timers') $app.innerHTML=renderTimers();
  if(ui.tab==='history') $app.innerHTML=renderHistory();
  if(ui.tab==='stats') $app.innerHTML=renderStats();
  if(ui.tab==='settings') $app.innerHTML=renderSettings();
  if(ui.modal){
    if(ui.modal.type==='editModel'){const m=modelById(ui.modal.id);if(m)$app.insertAdjacentHTML('beforeend',renderEditModel(m));}
    if(ui.modal.type==='sessionMenu')$app.insertAdjacentHTML('beforeend',renderSessionMenu());
    if(ui.modal.type==='organize')$app.insertAdjacentHTML('beforeend',renderOrganize());
    if(ui.modal.type==='session'){const s=data.sessions.find(x=>x.id===ui.modal.id);if(s)$app.insertAdjacentHTML('beforeend',renderSessionDetail(s));}
    if(ui.modal.type==='trash')$app.insertAdjacentHTML('beforeend',renderTrash());
  }
  bind();
}


function bind(){
  document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{ui.tab=b.dataset.tab;ui.modal=null;ui.popover=null;if(ui.tab==='timers')ui.timerView='timers';render();});
  const byId=id=>document.getElementById(id);
  if(byId('createFirst'))byId('createFirst').onclick=createModel;
  if(byId('modelsBack'))byId('modelsBack').onclick=()=>{ui.timerView='models';ui.modal=null;ui.popover=null;render();};
  if(byId('currentTitleButton'))byId('currentTitleButton').onclick=()=>{ui.popover={type:'title'};render();};
  if(byId('sessionMenu'))byId('sessionMenu').onclick=()=>{ui.modal={type:'sessionMenu'};ui.popover=null;render();};
  document.querySelectorAll('[data-timer]').forEach(b=>b.onclick=()=>tapTimer(b.dataset.timer));
  if(byId('addAdhoc'))byId('addAdhoc').onclick=addAdhoc;
  if(byId('saveBtn'))byId('saveBtn').onclick=saveSession;
  if(byId('undoBtn'))byId('undoBtn').onclick=undo;
  if(byId('closeModal'))byId('closeModal').onclick=()=>{ui.modal=null;render();};
  if(byId('closePopover'))byId('closePopover').onclick=()=>{ui.popover=null;render();};
  document.querySelectorAll('.modal-wrap').forEach(w=>w.onclick=e=>{if(e.target===w){ui.modal=null;render();}});
  if(byId('closeToModels'))byId('closeToModels').onclick=()=>{ui.modal=null;render();};
  if(byId('createModel'))byId('createModel').onclick=createModel;
  if(byId('toggleModelsEdit'))byId('toggleModelsEdit').onclick=()=>{ui.modelsEditing=!ui.modelsEditing;ui.popover=null;render();};
  document.querySelectorAll('[data-model-options]').forEach(b=>b.onclick=e=>{e.stopPropagation();ui.popover={type:'modelOptions',id:b.dataset.modelOptions};render();});
  document.querySelectorAll('[data-model-rename]').forEach(b=>b.onclick=()=>{ui.popover=null;renameModel(modelById(b.dataset.modelRename));});
  document.querySelectorAll('[data-model-edit]').forEach(b=>b.onclick=()=>{ui.popover=null;ui.modal={type:'editModel',id:b.dataset.modelEdit};render();});
  document.querySelectorAll('[data-model-dup]').forEach(b=>b.onclick=()=>{ui.popover=null;duplicateModel(modelById(b.dataset.modelDup));});
  document.querySelectorAll('[data-model-delete]').forEach(b=>b.onclick=()=>{ui.popover=null;deleteModel(modelById(b.dataset.modelDelete));});
  document.querySelectorAll('[data-move-model]').forEach(b=>b.onclick=()=>moveModel(b.dataset.moveModel,Number(b.dataset.dir)));
  document.querySelectorAll('[data-choose-model]').forEach(b=>b.onclick=()=>chooseModel(b.dataset.chooseModel));
  document.querySelectorAll('[data-edit-model]').forEach(b=>b.onclick=()=>{ui.modal={type:'editModel',id:b.dataset.editModel};render();});
  document.querySelectorAll('[data-dup-model]').forEach(b=>b.onclick=()=>duplicateModel(modelById(b.dataset.dupModel)));
  document.querySelectorAll('[data-delete-model]').forEach(b=>b.onclick=()=>deleteModel(modelById(b.dataset.deleteModel)));
  if(ui.modal?.type==='editModel'){
    const m=modelById(ui.modal.id);
    if(byId('renameModel'))byId('renameModel').onclick=()=>renameModel(m); if(byId('addTemplate'))byId('addTemplate').onclick=()=>addTemplate(m);
    document.querySelectorAll('[data-edit-template]').forEach(b=>b.onclick=()=>editTemplate(m,b.dataset.editTemplate));
    document.querySelectorAll('[data-remove-template]').forEach(b=>b.onclick=()=>removeTemplate(m,b.dataset.removeTemplate));
    document.querySelectorAll('[data-move-template]').forEach(b=>b.onclick=()=>moveTemplate(m,b.dataset.moveTemplate,Number(b.dataset.dir)));
  }
  if(byId('titleRename'))byId('titleRename').onclick=async()=>{const current=data.current;const initial=current.manualTitle?current.title:'';const n=(prompt('Título:',initial)||'').trim();if(n){current.title=n;current.manualTitle=true;await persistCurrent();}ui.popover=null;render();};
  if(byId('titleEditModel'))byId('titleEditModel').onclick=()=>{const m=modelById(data.current?.modelId);ui.popover=null;if(m)ui.modal={type:'editModel',id:m.id};render();};
  if(byId('titleDiscard'))byId('titleDiscard').onclick=async()=>{ui.popover=null;await discardCurrent();};
  const currentNote=byId('currentNote');if(currentNote){let tm;currentNote.oninput=e=>{data.current.note=e.target.value;clearTimeout(tm);tm=setTimeout(()=>persistCurrent(),180);};currentNote.onblur=()=>persistCurrent();}
  if(byId('menuCustomize'))byId('menuCustomize').onclick=()=>{ui.modal={type:'organize'};render();};
  document.querySelectorAll('[data-move-current]').forEach(b=>b.onclick=()=>moveCurrentTimer(b.dataset.moveCurrent,Number(b.dataset.dir)));
  document.querySelectorAll('[data-rename-current]').forEach(b=>b.onclick=()=>renameCurrentTimer(b.dataset.renameCurrent));
  document.querySelectorAll('[data-remove-current]').forEach(b=>b.onclick=()=>removeCurrentTimer(b.dataset.removeCurrent));
  if(byId('historySearch'))byId('historySearch').oninput=e=>{ui.historyQuery=e.target.value;render();};
  if(byId('historyModel'))byId('historyModel').onchange=e=>{ui.historyModel=e.target.value;render();};
  if(byId('historyDate'))byId('historyDate').onchange=e=>{ui.historyDate=e.target.value;render();};
  if(byId('historyTrash'))byId('historyTrash').onclick=()=>{ui.modal={type:'trash'};render();};
  document.querySelectorAll('[data-session]').forEach(b=>b.onclick=()=>{ui.modal={type:'session',id:b.dataset.session};render();});
  document.querySelectorAll('[data-delete-session]').forEach(b=>b.onclick=()=>deleteSession(data.sessions.find(s=>s.id===b.dataset.deleteSession)));
  document.querySelectorAll('[data-edit-session-title]').forEach(b=>b.onclick=()=>editSessionTitle(data.sessions.find(s=>s.id===b.dataset.editSessionTitle)));
  document.querySelectorAll('[data-rebuild-model]').forEach(b=>b.onclick=()=>rebuildModelFromSession(data.sessions.find(s=>s.id===b.dataset.rebuildModel)));
  document.querySelectorAll('[data-correct-time]').forEach(b=>b.onclick=()=>{const s=data.sessions.find(s=>s.id===b.dataset.correctTime);const t=s?.timers.find(t=>t.id===b.dataset.timerId);if(s&&t)correctTimer(s,t);});
  const note=byId('detailNote'); if(note){let tm;note.oninput=e=>{clearTimeout(tm);tm=setTimeout(()=>saveSessionNote(e.target.dataset.noteSession,e.target.value),350);};}
  document.querySelectorAll('[data-restore-session]').forEach(b=>b.onclick=()=>restoreSession(data.sessions.find(s=>s.id===b.dataset.restoreSession)));
  document.querySelectorAll('[data-hard-session]').forEach(b=>b.onclick=()=>hardDeleteSession(data.sessions.find(s=>s.id===b.dataset.hardSession)));
  document.querySelectorAll('[data-restore-model]').forEach(b=>b.onclick=()=>restoreModel(modelById(b.dataset.restoreModel)));
  document.querySelectorAll('[data-hard-model]').forEach(b=>b.onclick=()=>hardDeleteModel(modelById(b.dataset.hardModel)));
  if(byId('themeSelect'))byId('themeSelect').onchange=async e=>{data.settings.theme=e.target.value;await persistSettings();render();};
  if(byId('layoutSelect'))byId('layoutSelect').onchange=async e=>{data.settings.cardLayout=e.target.value;await persistSettings();render();};
  if(byId('exportCsv'))byId('exportCsv').onclick=exportCSV;
  if(byId('exportJson'))byId('exportJson').onclick=exportJSON;
  if(byId('exportPdf'))byId('exportPdf').onclick=exportPDF;
  document.querySelectorAll('[data-accent]').forEach(b=>b.onclick=async()=>{data.settings.accentColor=b.dataset.accent;await persistSettings();render();});
  if(byId('accentCustom'))byId('accentCustom').onchange=async e=>{data.settings.accentColor=e.target.value;await persistSettings();render();};
  if(byId('importJsonFile'))byId('importJsonFile').onchange=async e=>{const f=e.target.files?.[0];if(f)await importJSON(f);e.target.value='';};
}

function applyTheme(){
  const root=document.documentElement; if(data.settings.theme==='system')root.removeAttribute('data-theme');else root.setAttribute('data-theme',data.settings.theme);
  root.style.setProperty('--accent',data.settings.accentColor||'#007aff');
}

async function shareFile(name,type,content){
  const blob=content instanceof Blob?content:new Blob([content],{type}); const file=new File([blob],name,{type});
  try{ if(navigator.canShare?.({files:[file]})){ await navigator.share({files:[file],title:name}); return; } }catch(e){ if(e.name==='AbortError')return; }
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),5000);toast('Arquivo gerado');
}
function csvCell(v){const s=String(v??'');return `"${s.replaceAll('"','""')}"`;}
async function exportCSV(){
  const rows=[['sessionId','originalRecordedAt','savedAt','restoredAt','title','modelId','model','recordedTimerId','templateId','cronometro','tipo','duracaoMs','tempoTotalMs','tempoDecorridoMs','pausasMs','nota']];
  data.sessions.filter(s=>s.status==='saved').forEach(s=>s.timers.forEach(t=>rows.push([s.id,new Date(s.originalRecordedAt).toISOString(),new Date(s.savedAt).toISOString(),s.restoredAt?new Date(s.restoredAt).toISOString():'',s.title,s.modelId,s.modelNameSnapshot,t.id,t.templateId||'',t.name,t.isAdhoc?'avulso':t.isRemoved?'removido':'modelo',timerDuration(t,s.savedAt),sessionTotal(s,s.savedAt),sessionElapsedNet(s,s.savedAt),pauseTotal(s,s.savedAt),s.note])));
  await shareFile(`cronometro-${dayKey(now())}.csv`,'text/csv;charset=utf-8','\ufeff'+rows.map(r=>r.map(csvCell).join(',')).join('\n'));
}
async function exportJSON(){ const payload={schemaVersion:2,exportedAt:new Date().toISOString(),models:data.models,sessions:data.sessions,settings:data.settings,currentSession:data.current}; await shareFile(`cronometro-dados-${dayKey(now())}.json`,'application/json',JSON.stringify(payload,null,2)); }
function validateBackup(payload){
  return payload && typeof payload==='object' && Array.isArray(payload.models) && Array.isArray(payload.sessions) && payload.settings && typeof payload.settings==='object';
}
function normalizeImportedCurrent(current,exportedAt){
  if(!current || current.status!=='active')return null;
  const c=clone(current);const stop=Date.parse(exportedAt)||now();
  (c.timers||[]).forEach(t=>(t.intervals||[]).forEach(i=>{if(i.endedAt==null)i.endedAt=Math.max(i.startedAt,stop);}));
  (c.pauseIntervals||[]).forEach(p=>{if(p.endedAt==null)p.endedAt=Math.max(p.startedAt,stop);});
  c.globalPaused=false;c.pausedActiveTimerIds=[];return c;
}
async function replaceFromBackup(payload){
  const current=normalizeImportedCurrent(payload.currentSession,payload.exportedAt);
  const settings={...data.settings,...payload.settings,simultaneous:'single'};
  await new Promise((resolve,reject)=>{
    const tr=db.transaction(['models','sessions','state'],'readwrite');
    const ms=tr.objectStore('models'),ss=tr.objectStore('sessions'),st=tr.objectStore('state');
    ms.clear();ss.clear();st.clear();
    payload.models.forEach((m,i)=>ms.put({...m,sortOrder:Number.isFinite(m.sortOrder)?m.sortOrder:i}));
    payload.sessions.forEach(x=>ss.put(x));
    st.put({key:'settings',value:settings});st.put({key:'current',value:current});
    tr.oncomplete=resolve;tr.onerror=()=>reject(tr.error);tr.onabort=()=>reject(tr.error||new Error('Importação cancelada'));
  });
  data.models=await getAll('models');data.sessions=await getAll('sessions');data.settings={...data.settings,...(await getState('settings')||{}),simultaneous:'single'};data.current=await getState('current');
  if(!data.current){const m=activeModels()[0];if(m){data.current=newSession(m);await persistCurrent();}}
}
async function importJSON(file){
  try{
    const payload=JSON.parse(await file.text());
    if(!validateBackup(payload)){alert('Este arquivo não parece ser um backup válido do Cronômetro.');return;}
    if(!confirm('Restaurar este backup? Todos os dados atuais do aplicativo serão substituídos pelos dados do arquivo.'))return;
    await replaceFromBackup(payload);data.undo=null;ui.modal=null;ui.popover=null;ui.timerView='timers';toast('Backup restaurado');render();
  }catch(err){console.error(err);alert('Não foi possível importar este arquivo JSON.');}
}
function ascii(s){return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^\x20-\x7E]/g,'?').replace(/[()\\]/g,m=>'\\'+m);}
function makePdf(lines){
  const per=44,pages=[];for(let i=0;i<lines.length;i+=per)pages.push(lines.slice(i,i+per));if(!pages.length)pages=[['Relatorio Cronometro']];
  const objs=[];const fontObj=3;const pageObjStart=4;const contentStart=pageObjStart+pages.length;objs[1]='<< /Type /Catalog /Pages 2 0 R >>';
  objs[2]=`<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_,i)=>`${pageObjStart+i} 0 R`).join(' ')}] >>`;objs[3]='<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  pages.forEach((pg,i)=>{const contentNum=contentStart+i;objs[pageObjStart+i]=`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontObj} 0 R >> >> /Contents ${contentNum} 0 R >>`;let y=800;const body=['BT','/F1 10 Tf',...pg.flatMap(line=>{const cmd=`1 0 0 1 45 ${y} Tm (${ascii(line).slice(0,100)}) Tj`;y-=17;return [cmd];}),'ET'].join('\n');objs[contentNum]=`<< /Length ${body.length} >>\nstream\n${body}\nendstream`;});
  let pdf='%PDF-1.4\n',offs=[0];for(let i=1;i<objs.length;i++){offs[i]=pdf.length;pdf+=`${i} 0 obj\n${objs[i]}\nendobj\n`;}const xref=pdf.length;pdf+=`xref\n0 ${objs.length}\n0000000000 65535 f \n`;for(let i=1;i<objs.length;i++)pdf+=`${String(offs[i]).padStart(10,'0')} 00000 n \n`;pdf+=`trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;return new Blob([pdf],{type:'application/pdf'});
}
async function exportPDF(){
  const ss=data.sessions.filter(s=>s.status==='saved'&&!s.deletedAt);const measured=ss.filter(s=>!s.isNoMeasurement);const total=measured.reduce((a,s)=>a+sessionTotal(s,s.savedAt),0);const lines=['RELATORIO CRONOMETRO',`Gerado em: ${fmtDateTime(now())}`,`Registros medidos: ${measured.length}`,`Tempo total acumulado: ${fmtDuration(total)}`,'','REGISTROS'];ss.sort((a,b)=>b.originalRecordedAt-a.originalRecordedAt).forEach(s=>{lines.push(`${fmtDate(s.originalRecordedAt)} | ${s.title} | ${s.isNoMeasurement?'Sem medicao':fmtDuration(sessionTotal(s,s.savedAt))}`);if(!s.isNoMeasurement)s.timers.filter(t=>timerDuration(t,s.savedAt)>0).forEach(t=>lines.push(`  - ${t.name}: ${fmtDuration(timerDuration(t,s.savedAt))}`));});await shareFile(`cronometro-relatorio-${dayKey(now())}.pdf`,'application/pdf',makePdf(lines));
}

async function purgeExpired(){
  const cutoff=now()-30*24*60*60*1000;
  for(const s of [...data.sessions]) if(s.deletedAt&&s.deletedAt<cutoff){await del('sessions',s.id);data.sessions=data.sessions.filter(x=>x.id!==s.id);}
  // Modelos expiram da restauração, mas os registros históricos permanecem. Mantemos um marcador mínimo do nome no próprio registro.
  for(const m of [...data.models]) if(m.deletedAt&&m.deletedAt<cutoff){await del('models',m.id);data.models=data.models.filter(x=>x.id!==m.id);}
}

async function init(){
  db=await openDB();data.models=await getAll('models');data.sessions=await getAll('sessions');data.settings={...data.settings,...(await getState('settings')||{}),simultaneous:'single'};data.current=await getState('current');
  let modelOrderChanged=false;activeModels().forEach((m,i)=>{if(!Number.isFinite(m.sortOrder)){m.sortOrder=i;modelOrderChanged=true;}});if(modelOrderChanged)for(const m of data.models)await put('models',m);
  if(data.current?.globalPaused){data.current.globalPaused=false;data.current.pausedActiveTimerIds=[];await persistCurrent();}
  if(!data.models.length){const m=defaultModel();data.models=[m];await put('models',m);data.current=newSession(m);await persistCurrent();}
  if(data.current?.status!=='active')data.current=null;
  if(!data.current){const m=activeModels()[0];if(m){data.current=newSession(m);await persistCurrent();}}
  await purgeExpired();render();
  tickHandle=setInterval(()=>{if(ui.tab==='timers'&&ui.timerView==='timers'&&data.current&&data.current.timers.some(isTimerActive))render();},1000);
  if('serviceWorker' in navigator){try{await navigator.serviceWorker.register('./sw.js');}catch(e){console.warn('Service worker não registrado',e);}}
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)render();});
}

init().catch(err=>{console.error(err);$app.innerHTML=`<main class="content"><h1>Erro ao abrir o aplicativo</h1><pre>${esc(err.message)}</pre></main>`;});

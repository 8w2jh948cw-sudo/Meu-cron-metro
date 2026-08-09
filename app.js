'use strict';

/* === factory initial data v0.5.1 === */
const FACTORY_INITIAL_DATA = {"schemaVersion": 2, "models": [{"id": "364a3d6e-de98-484c-ad4f-68de8f8b00cf", "name": "Manutenção", "createdAt": 1786222772945, "updatedAt": 1786223256201, "deletedAt": null, "timers": [{"id": "7f99cafe-c70c-4750-9506-bd26592ba670", "name": "Remoção", "symbol": " ", "iconColor": "#007aff", "order": 0, "createdAt": 1786222849436, "removedAt": null}, {"id": "be165d11-0a07-46a0-bfdc-4b74ec3b7ea5", "name": "Levantamento de cutícula", "symbol": " ", "iconColor": "#007aff", "order": 1, "createdAt": 1786222936686, "removedAt": null}, {"id": "7d55058a-3a47-49cb-a80e-ff109ee29c48", "name": "Corte da cutícula", "symbol": " ", "iconColor": "#007aff", "order": 2, "createdAt": 1786222963610, "removedAt": null}, {"id": "93e6983c-ec54-4835-be8c-8a5a7ab08f7d", "name": "2º Levantamento", "symbol": " ", "iconColor": "#007aff", "order": 3, "createdAt": 1786223122984, "removedAt": null}, {"id": "8ee93d10-6ca8-4c84-aac9-57bcffb877bb", "name": "Primer + Capa base", "symbol": " ", "iconColor": "#007aff", "order": 4, "createdAt": 1786223163495, "removedAt": null}, {"id": "dcd89381-cca3-4be2-b130-7328a21fe0fc", "name": "Estrutura", "symbol": " ", "iconColor": "#007aff", "order": 5, "createdAt": 1786223198958, "removedAt": null}, {"id": "070be45f-bc6f-4d67-a1b8-c9407e8eb711", "name": "Lixamento", "symbol": " ", "iconColor": "#007aff", "order": 6, "createdAt": 1786223210317, "removedAt": null}, {"id": "d3e3dbdc-1a57-4f4a-81cd-8334c85f9aee", "name": "Esmaltação", "symbol": " ", "iconColor": "#007aff", "order": 7, "createdAt": 1786223222787, "removedAt": null}, {"id": "af356cee-e4a7-4fb7-b9f1-a3e23c9f0df2", "name": "Top Coat", "symbol": " ", "iconColor": "#007aff", "order": 8, "createdAt": 1786223243057, "removedAt": null}, {"id": "e5075801-ab4f-4a74-8796-93247991df7c", "name": "Encerramento", "symbol": " ", "iconColor": "#007aff", "order": 9, "createdAt": 1786223256201, "removedAt": null}], "sortOrder": 0}]};
const FACTORY_INIT_KEY = "cronometro_factory_initialized_v051";

function ensureFactoryInitialData() {
  try {
    if (localStorage.getItem(FACTORY_INIT_KEY) === "1") return;
    const likelyKeys = Object.keys(localStorage);
    const hasExistingAppData = likelyKeys.some(k =>
      /cronometro|models|sessions|timer/i.test(k) &&
      localStorage.getItem(k) &&
      localStorage.getItem(k) !== "[]" &&
      localStorage.getItem(k) !== "{}"
    );
    if (!hasExistingAppData) {
      // Try known app state patterns. This function intentionally seeds only models.
      const model = FACTORY_INITIAL_DATA.models[0];
      let seeded = false;

      // Common direct models key.
      for (const key of ["models","cronometro_models","timer_models"]) {
        if (localStorage.getItem(key) === null) {
          localStorage.setItem(key, JSON.stringify([model]));
          seeded = true;
          break;
        }
      }

      // If app uses a single state object, merge model without sessions.
      if (!seeded) {
        const stateKey = likelyKeys.find(k => /state|data|store/i.test(k));
        if (stateKey) {
          try {
            const st = JSON.parse(localStorage.getItem(stateKey) || "{}");
            if (st && typeof st === "object" && (!Array.isArray(st.models) || st.models.length === 0)) {
              st.models = [model];
              localStorage.setItem(stateKey, JSON.stringify(st));
              seeded = true;
            }
          } catch(e) {}
        }
      }
    }
    localStorage.setItem(FACTORY_INIT_KEY, "1");
  } catch(e) {
    console.warn("Falha ao inicializar dados de fábrica", e);
  }
}
ensureFactoryInitialData();


const DB_NAME = 'cronometro_local_v1';
const DB_VERSION = 1;
const $app = document.getElementById('app');
const $toast = document.getElementById('toast');

let db;
let ui = { tab: 'timers', timerView: 'timers', modal: null, popover: null, modelsEditing: false, historyQuery: '', historyModel: 'all', historyDate: '', devCopied: null, devPage: null, devSnapshots: [], devMode:false, devPickMode:false, devInfo:null, devVersionState:null };
const BUILD = window.APP_BUILD || {developerAvailable:false,version:'0.5.0-dev.0',baseVersion:'0.5.0',buildId:'base',designDefaults:{colors:{},sizes:{},shadow:{},layout:{},themePresets:[]}};
let devDesign = JSON.parse(JSON.stringify(BUILD.designDefaults || {}));
let data = {
  models: [], sessions: [], current: null,
  settings: { theme: 'system', colorTheme: 'original', cardLayout: 'lateral', simultaneous: 'single', accentColor: '#007aff', statsCards: ['summary','total','timers','average','best','worst','percent','trend'] },
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
function devStateKey(){return `devDesign:${BUILD.buildId||'base'}`;}
async function persistDevDesign(){ await putState(devStateKey(),devDesign); }
function devSnapshotsKey(){return `devSnapshots:${BUILD.buildId||'base'}`;}
function devVersionKey(){return `devVersion:${BUILD.buildId||'base'}`;}
async function persistDevSnapshots(){ await putState(devSnapshotsKey(),ui.devSnapshots); }
async function persistDevVersion(){ await putState(devVersionKey(),ui.devVersionState); }
function baseDevVersion(){return BUILD.baseVersion || String(BUILD.version||'0.5.0').replace(/-dev\.\d+$/,'');}
function devVersionLabel(seq=ui.devVersionState?.currentSeq??0){return `${baseDevVersion()}-dev.${Math.max(0,Number(seq)||0)}`;}
function flattenDesign(obj,prefix='',out={}){ if(Array.isArray(obj)){obj.forEach((v,i)=>flattenDesign(v,`${prefix}${prefix?'.':''}${i}`,out));return out;} if(obj&&typeof obj==='object'){Object.entries(obj).forEach(([k,v])=>flattenDesign(v,`${prefix}${prefix?'.':''}${k}`,out));return out;} out[prefix]=obj; return out; }
function prettyDevPath(path){ const map={colors:'Cores',sizes:'Dimensões',shadow:'Sombra',layout:'Layout',themePresets:'Temas'}; const bits=String(path).split('.'); const page=DEV_PAGES.find(p=>(p.fields||[]).some(([g,k])=>`${g}.${k}`===path)); return page?`${page.title} · ${page.fields.find(([g,k])=>`${g}.${k}`===path)?.[2]||path}`:`${map[bits[0]]||bits[0]} · ${bits.slice(1).join(' › ')}`; }
function diffDesign(from,to){ const a=flattenDesign(from||{}),b=flattenDesign(to||{}); const keys=[...new Set([...Object.keys(a),...Object.keys(b)])]; return keys.filter(k=>JSON.stringify(a[k])!==JSON.stringify(b[k])).map(k=>({path:k,label:prettyDevPath(k),from:a[k],to:b[k]})); }
function previousSnapshotForCompare(){ return [...ui.devSnapshots].sort((a,b)=>a.createdAt-b.createdAt).at(-1)||null; }
async function saveDevSnapshot(){
  const name=(prompt('Nome do Snapshot:',`Checkpoint ${new Date().toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}`)||'').trim(); if(!name)return;
  const prev=previousSnapshotForCompare(); const seq=(ui.devVersionState?.maxSeq??0)+1; const changes=diffDesign(prev?.design||BUILD.designDefaults,devDesign);
  const snap={id:uid(),name,createdAt:now(),design:clone(devDesign),seq,version:devVersionLabel(seq),changes,comparedTo:prev?.id||null};
  ui.devSnapshots.push(snap); ui.devVersionState={...(ui.devVersionState||{}),maxSeq:seq,currentSeq:seq,restored:false};
  await Promise.all([persistDevSnapshots(),persistDevVersion()]); render(); toast(`Snapshot ${snap.version} salvo`);
}
async function restoreDevSnapshot(id){ const snap=ui.devSnapshots.find(x=>x.id===id); if(!snap)return; if(!confirm(`Restaurar o Snapshot “${snap.name}”? As alterações visuais atuais serão substituídas.`))return; devDesign=clone(snap.design); ui.devVersionState={...(ui.devVersionState||{}),currentSeq:snap.seq??0,restored:true}; await Promise.all([persistDevDesign(),persistDevVersion()]); applyTheme(); render(); toast(`${snap.version||devVersionLabel(snap.seq)} restaurado`); }
async function deleteDevSnapshot(id){ const snap=ui.devSnapshots.find(x=>x.id===id); if(!snap)return; if(!confirm(`Apagar o Snapshot “${snap.name}”?`))return; ui.devSnapshots=ui.devSnapshots.filter(x=>x.id!==id); await persistDevSnapshots(); render(); toast('Snapshot apagado'); }
function snapshotChangeSummary(s){ const n=s.changes?.length||0; const comps=new Set((s.changes||[]).map(c=>c.label.split(' · ')[0])); return `${n} alteraç${n===1?'ão':'ões'} · ${comps.size} componente${comps.size===1?'':'s'}`; }
function snapshotChangesHtml(s){ if(!s.changes?.length)return '<div class="dev-empty">Nenhuma alteração visual em relação ao checkpoint anterior.</div>'; return `<div class="dev-changes">${s.changes.map(c=>`<div><strong>${esc(c.label)}</strong><small>${esc(String(c.from??'—'))} → ${esc(String(c.to??'—'))}</small></div>`).join('')}</div>`; }
function semverNextPatch(v){ const m=String(v).match(/^(\d+)\.(\d+)\.(\d+)/); if(!m)return '0.5.1'; return `${m[1]}.${m[2]}.${Number(m[3])+1}`; }

function deepMerge(base, extra){ if(Array.isArray(base)) return Array.isArray(extra)?clone(extra):clone(base); const out={...(base||{})}; if(extra&&typeof extra==='object') for(const [k,v] of Object.entries(extra)){ out[k]=(v&&typeof v==='object'&&!Array.isArray(v))?deepMerge(out[k]||{},v):clone(v); } return out; }
function cssNum(v, fallback=0){ const n=Number(v); return Number.isFinite(n)?n:fallback; }
function rgbaShadow(){ const sh=devDesign.shadow||{}; return `${cssNum(sh.x)}px ${cssNum(sh.y,12)}px ${cssNum(sh.blur,36)}px ${cssNum(sh.spread)}px rgba(0,0,0,${Math.max(0,Math.min(1,Number(sh.opacity)||0))}), 0 ${cssNum(sh.smallY,2)}px ${cssNum(sh.smallBlur,8)}px rgba(0,0,0,${Math.max(0,Math.min(1,Number(sh.smallOpacity)||0))})`; }
function currentPreset(){ const presets=devDesign.themePresets||[]; return presets.find(p=>p.id===data.settings.colorTheme)||presets[0]||{accent:data.settings.accentColor||'#007AFF',action:data.settings.accentColor||'#007AFF'}; }
function pathParts(path){ return String(path).split('.').map(x=>/^\d+$/.test(x)?Number(x):x); }
function getPath(obj,path){ let cur=obj; for(const k of pathParts(path))cur=cur?.[k]; return cur; }
function setPath(obj,path,value){ const parts=pathParts(path); let cur=obj; for(let i=0;i<parts.length-1;i++){ const k=parts[i]; if(cur[k]==null)cur[k]=typeof parts[i+1]==='number'?[]:{}; cur=cur[k]; } cur[parts.at(-1)]=value; }
function normalizeDevValue(path,value,input){ const old=getPath(devDesign,path); if(typeof old==='number' || input?.type==='number'){ const n=Number(value); return Number.isFinite(n)?n:old; } return String(value); }
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
  const icons={
    timers:'<circle cx="12" cy="13" r="7.5"/><path d="M12 13V8.7M9 2.5h6M16.7 5.2l1.4-1.4"/>',
    history:'<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/>',
    stats:'<path d="M3 3v18h18"/><path d="M7 16v-3"/><path d="M11 16V8"/><path d="M15 16v-5"/><path d="m19 8-4-4-4 4-4-4"/>',
    sliders:'<path d="M4 21v-7"/><path d="M4 10V3"/><path d="M12 21v-9"/><path d="M12 8V3"/><path d="M20 21v-5"/><path d="M20 12V3"/><path d="M1 14h6"/><path d="M9 8h6"/><path d="M17 16h6"/>',
    settings:'<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.09a2 2 0 0 1 1 1.74v.5a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.09a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
    back:'<path d="M14.8 5.5 8.3 12l6.5 6.5"/>',
    more:'<circle cx="5" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none"/>',
    clock:'<circle cx="12" cy="12" r="8.5"/><path d="M12 7.2V12l3.2 2"/>',
    plus:'<path d="M5 12h14"/><path d="M12 5v14"/>',
    check:'<path d="M20 6 9 17l-5-5"/>',
    close:'<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    chevrons:'<path d="m7 15 5 5 5-5"/><path d="m7 9 5-5 5 5"/>'
  };
  const stroke={plus:2.5,check:3,close:2,chevrons:1.75};
  const sw=stroke[name]??'var(--icon-stroke,2)';
  return `<svg class="sf-icon" viewBox="0 0 24 24" aria-hidden="true" style="stroke-width:${sw}">${icons[name]||''}</svg>`;
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
  <main class="content timer-content"><div class="timer-list">${cards}<button class="add-card" id="addAdhoc">${svgIcon('plus')}<span>Adicionar cronômetro</span></button></div></main>
  <div class="floating-actions timer-actions"><section class="total-card floating-card"><span class="total-icon">${svgIcon('clock')}</span><span><small>Tempo total</small><strong>${fmtDuration(sessionTotal(s))}</strong></span></section><button class="save-btn" id="saveBtn">${svgIcon('check')}<span>Salvar</span></button></div>`);
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
  return shell(`<header class="topbar"><h1>Registros</h1></header><main class="content history-content"><div class="filters"><input id="historySearch" placeholder="Buscar título" value="${esc(ui.historyQuery)}"><select id="historyModel"><option value="all">Todos os modelos</option>${activeModels().map(m=>`<option value="${m.id}" ${ui.historyModel===m.id?'selected':''}>${esc(m.name)}</option>`).join('')}</select><div class="date-filter"><input id="historyDate" type="date" value="${esc(ui.historyDate)}">${ui.historyDate?`<button id="historyDateClear" aria-label="Limpar data">${svgIcon('close')}</button>`:''}</div><button class="chip history-trash" id="historyTrash">Apagados recentemente</button></div>${list||'<div class="empty">Nenhum registro encontrado.</div>'}</main>`);
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
  const presets=devDesign.themePresets||[];
  const customSelected=data.settings.colorTheme==='custom';
  return shell(`<header class="topbar simple"><h1>Ajustes</h1></header><main class="settings-content">
    <section class="settings-section"><div class="settings-card">
      <label class="settings-row" for="themeSelect"><span>Aparência</span><span class="select-wrap"><select id="themeSelect"><option value="system" ${data.settings.theme==='system'?'selected':''}>Sistema</option><option value="light" ${data.settings.theme==='light'?'selected':''}>Claro</option><option value="dark" ${data.settings.theme==='dark'?'selected':''}>Escuro</option></select><span class="chevrons">${svgIcon('chevrons')}</span></span></label>
      <label class="settings-row" for="layoutSelect"><span>Layout dos cartões</span><span class="select-wrap"><select id="layoutSelect"><option value="lateral" ${data.settings.cardLayout==='lateral'?'selected':''}>Lateral</option><option value="central" ${data.settings.cardLayout==='central'?'selected':''}>Central</option></select><span class="chevrons">${svgIcon('chevrons')}</span></span></label>
    </div><p class="section-footer">Os cronômetros funcionam sempre um por vez. Toque no cronômetro ativo para pará-lo e toque novamente para continuar.</p></section>
    <section class="settings-section"><h3 class="section-label">Tema de cores</h3><div class="settings-card color-card"><div class="theme-presets">${presets.map(p=>`<button class="theme-preset ${data.settings.colorTheme===p.id?'selected':''}" data-color-theme="${esc(p.id)}"><span class="theme-dot" style="--theme-accent:${esc(p.accent)};--theme-action:${esc(p.action)}"></span><span>${esc(p.name)}</span></button>`).join('')}<button class="theme-preset ${customSelected?'selected':''}" data-color-theme="custom"><span class="theme-dot custom-dot" style="--theme-accent:${esc(data.settings.accentColor||'#007AFF')};--theme-action:${esc(data.settings.accentColor||'#007AFF')}"></span><span>Personalizada</span></button></div>${customSelected?`<div class="custom-theme-row"><input id="accentCustom" type="color" value="${esc(data.settings.accentColor||'#007AFF')}"><span>${esc((data.settings.accentColor||'#007AFF').toUpperCase())}</span></div>`:''}</div><p class="section-footer">O tema Padrão mantém a combinação original azul + verde. Nos demais temas, a cor escolhida também controla Salvar e o cronômetro ativo. Ações de apagar continuam vermelhas.</p></section>
    <section class="settings-section"><h3 class="section-label">Dados e exportação</h3><div class="settings-card"><button class="settings-row button-row" id="exportCsv"><span>Exportar CSV para planilhas</span></button><button class="settings-row button-row" id="exportPdf"><span>Exportar relatório PDF</span></button></div></section>
    <section class="settings-section"><h3 class="section-label">Backup</h3><div class="settings-card"><button class="settings-row button-row" id="exportJson"><span>Exportar Backup em JSON</span></button><label class="settings-row button-row" for="importJsonFile"><span>Restaurar Backup</span><input id="importJsonFile" class="sr-only" type="file" accept="application/json,.json"></label></div><p class="section-footer">Restaurar um backup substitui os dados atuais pelos dados do arquivo após confirmação. Exporte uma cópia atual antes se quiser preservá-la.</p></section>
    <section class="settings-section"><h3 class="section-label">Armazenamento</h3><div class="settings-card"><div class="settings-row"><span>Dados</span><span class="secondary-value">Somente neste iPhone</span></div><div class="settings-row"><span>Offline</span><span class="secondary-value">Ativo</span></div><div class="settings-row"><span>iCloud</span><span class="secondary-value">Não disponível</span></div></div><p class="section-footer">Os registros ficam no armazenamento local associado a este web app. O GitHub hospeda somente os arquivos do aplicativo.</p></section>
    ${BUILD.developerAvailable!==false?`<section class="settings-section dev-entry-section"><div class="settings-card"><button class="settings-row button-row" id="openDeveloper"><span>Abrir modo desenvolvedor</span><span class="secondary-value">${esc(devVersionLabel())}</span></button></div><p class="section-footer">Ferramentas avançadas de aparência, componentes, Snapshots e exportação.</p></section>`:''}
    <section class="settings-section"><div class="settings-card"><div class="settings-row"><span>Versão</span><span class="secondary-value">${esc(BUILD.version||'0.5.0-dev.0')}</span></div></div></section>
  </main>`);
}

const DEV_PAGES = [
  {id:'backButton',section:'Componentes compartilhados',title:'Botão de voltar',desc:'Componente usado para retornar a uma tela anterior. Alterações aqui afetam todas as instâncias que usam o mesmo componente.',preview:'back',fields:[['sizes','headerButton','Tamanho do botão','number',1],['sizes','headerIcon','Tamanho do ícone','number',1],['sizes','headerCircleBorder','Espessura da borda','number',0.25],['colors','lightGlass','Preenchimento claro','text'],['colors','darkGlass','Preenchimento escuro','text'],['colors','lightFloatBorder','Borda clara','text'],['colors','darkFloatBorder','Borda escura','text'],['shadow','blur','Desfoque da sombra','number',1],['shadow','opacity','Opacidade da sombra','number',0.01]]},
  {id:'topTitle',section:'Componentes compartilhados',title:'Título do topo das abas',desc:'Controla os títulos centrais no topo, como Registros, Estatísticas e Ajustes.',preview:'title',fields:[['sizes','topbarHeight','Altura da área superior','number',1],['sizes','topTabTitleSize','Tamanho da fonte','number',0.5],['sizes','contentSide','Margem lateral','number',1]]},
  {id:'timer',section:'Componentes compartilhados',title:'Cronômetro',desc:'Componente-base de cada cronômetro. Os estados virgem, ativo e usado herdam estas dimensões.',preview:'timer',fields:[['sizes','timerMinHeight','Altura mínima','number',1],['sizes','timerRadius','Arredondamento','number',1],['sizes','timerPadY','Padding vertical','number',1],['sizes','timerPadX','Padding horizontal','number',1],['sizes','timerGap','Espaço interno','number',1],['sizes','timerIconSize','Área do símbolo','number',1],['sizes','timerIconRadius','Raio do símbolo','number',1],['sizes','timerNameSize','Tamanho do nome','number',0.5],['sizes','timerTimeSize','Tamanho do número','number',0.5],['layout','timerNameAlign','Alinhamento do nome','select:left|center|right'],['layout','timerTimeAlign','Alinhamento do tempo','select:left|center|right']]},
  {id:'headerButtons',section:'Componentes compartilhados',title:'Botões circulares do topo',desc:'Componente compartilhado pelos botões circulares do cabeçalho da aba Cronômetros.',preview:'headerButtons',fields:[['sizes','headerButton','Diâmetro','number',1],['sizes','headerIcon','Tamanho do ícone','number',1],['sizes','headerCircleBorder','Espessura da borda','number',0.25],['shadow','y','Sombra — posição Y','number',1],['shadow','blur','Sombra — desfoque','number',1],['shadow','opacity','Sombra — opacidade','number',0.01]]},
  {id:'settingsCard',section:'Componentes compartilhados',title:'Cartão de Ajustes',desc:'Componente-base dos cartões agrupados usados na aba Ajustes e no próprio painel Developer.',preview:'settings',fields:[['sizes','settingsRadius','Arredondamento','number',1],['sizes','settingsRowHeight','Altura das linhas','number',1],['sizes','settingsSide','Margem lateral','number',1],['sizes','settingsPadX','Padding horizontal','number',1],['colors','lightCard','Preenchimento claro','color'],['colors','darkCard','Preenchimento escuro','color']]},
  {id:'historyCard',section:'Componentes compartilhados',title:'Cartão de registro',desc:'Componente usado para cada registro salvo no Histórico.',preview:'history',fields:[['sizes','historyRadius','Arredondamento','number',1],['sizes','historyPadY','Padding vertical','number',1],['sizes','historyPadX','Padding horizontal','number',1],['sizes','historyTitleSize','Tamanho do título','number',0.5]]},
  {id:'tabbar',section:'Componentes compartilhados',title:'Barra inferior',desc:'Controla ícones e textos da navegação inferior do aplicativo.',preview:'tabbar',fields:[['sizes','tabIcon','Tamanho do ícone','number',1],['sizes','tabIconStroke','Espessura do ícone','number',0.05],['sizes','tabFont','Tamanho do texto','number',0.5]]},
  {id:'save',section:'Itens específicos',title:'Botão Salvar',desc:'Personalização específica do botão Salvar. Ele continua herdando a cor de ação do tema escolhido pelo usuário.',preview:'save',fields:[['sizes','saveHeight','Altura','number',1],['sizes','saveRadius','Arredondamento','number',1],['sizes','saveFontSize','Tamanho do texto','number',0.5],['sizes','saveIconSize','Tamanho do ícone','number',1],['shadow','y','Sombra — posição Y','number',1],['shadow','blur','Sombra — desfoque','number',1],['shadow','opacity','Sombra — opacidade','number',0.01]]},
  {id:'total',section:'Itens específicos',title:'Cartão Tempo total',desc:'Personalização específica do cartão flutuante de Tempo total.',preview:'total',fields:[['sizes','totalHeight','Altura','number',1],['sizes','totalRadius','Arredondamento','number',1],['sizes','totalTimeSize','Tamanho do tempo','number',0.5],['sizes','totalLabelSize','Tamanho do rótulo','number',0.5],['sizes','totalIconSize','Tamanho do ícone','number',1],['layout','totalJustify','Alinhamento do conteúdo','select:flex-start|center|flex-end'],['shadow','blur','Sombra — desfoque','number',1],['shadow','opacity','Sombra — opacidade','number',0.01]]},
  {id:'historyPage',section:'Páginas',title:'Aba Histórico',desc:'Ajustes gerais específicos da página Histórico, sem alterar os dados ou filtros.',preview:'historyPage',fields:[['sizes','contentSide','Margem lateral','number',1],['sizes','contentTop','Espaço superior','number',1],['sizes','historyFilterHeight','Altura dos campos','number',1],['sizes','historyFilterRadius','Arredondamento dos campos','number',1]]},
  {id:'statsPage',section:'Páginas',title:'Aba Estatísticas',desc:'Ajustes dos cartões e painéis visuais da página Estatísticas.',preview:'stats',fields:[['sizes','panelRadius','Arredondamento dos painéis','number',1],['sizes','contentSide','Margem lateral','number',1],['sizes','statsPanelPad','Padding dos painéis','number',1]]},
  {id:'settingsPage',section:'Páginas',title:'Aba Ajustes',desc:'Ajustes gerais de espaçamento da página Ajustes.',preview:'settingsPage',fields:[['sizes','settingsSide','Margem lateral dos cartões','number',1],['sizes','settingsRadius','Arredondamento dos cartões','number',1],['sizes','settingsRowHeight','Altura das opções','number',1],['sizes','settingsPadX','Padding interno','number',1]]},
  {id:'modals',section:'Páginas',title:'Janelas e modais',desc:'Controla os cartões e folhas modais usados para detalhes, organização e edição.',preview:'modal',fields:[['sizes','panelRadius','Arredondamento dos painéis','number',1],['sizes','modalRadius','Arredondamento da janela inferior','number',1],['sizes','sheetCardRadius','Arredondamento dos cartões internos','number',1],['sizes','borderWidth','Espessura de borda geral','number',0.25]]},
  {id:'colorsLight',section:'Temas e cores',title:'Tema claro',desc:'Cores estruturais usadas quando a aparência do aplicativo está em modo claro.',preview:'paletteLight',fields:[['colors','lightBg','Fundo','color'],['colors','lightCard','Cartões','color'],['colors','lightText','Texto principal','color'],['colors','lightSecondary','Texto secundário','color'],['colors','lightLine','Divisórias','color'],['colors','lightPlaceholder','Placeholder','color'],['colors','lightUsed','Cronômetro usado','color'],['colors','lightGlass','Vidro / flutuantes','text'],['colors','lightFloatBorder','Borda flutuante','text']]},
  {id:'colorsDark',section:'Temas e cores',title:'Tema escuro',desc:'Cores estruturais usadas quando a aparência do aplicativo está em modo escuro.',preview:'paletteDark',fields:[['colors','darkBg','Fundo','color'],['colors','darkCard','Cartões','color'],['colors','darkText','Texto principal','color'],['colors','darkSecondary','Texto secundário','color'],['colors','darkLine','Divisórias','color'],['colors','darkPlaceholder','Placeholder','color'],['colors','darkUsed','Cronômetro usado','color'],['colors','darkGlass','Vidro / flutuantes','text'],['colors','darkFloatBorder','Borda flutuante','text']]},
  {id:'themePresets',section:'Temas e cores',title:'Temas disponíveis ao usuário',desc:'Edite o nome e as cores das predefinições que aparecem em Ajustes. O vermelho de Apagar e Apagados recentemente permanece fixo.',preview:'themes',special:'presets'},
  {id:'shadow',section:'Ajustes avançados',title:'Sombra flutuante compartilhada',desc:'Sombra-base herdada pelos elementos flutuantes. Componentes específicos podem usar estas mesmas propriedades.',preview:'shadow',fields:[['shadow','x','Posição X','number',1],['shadow','y','Posição Y','number',1],['shadow','blur','Desfoque','number',1],['shadow','spread','Expansão','number',1],['shadow','opacity','Opacidade principal','number',0.01],['shadow','smallY','Segunda sombra Y','number',1],['shadow','smallBlur','Segundo desfoque','number',1],['shadow','smallOpacity','Segunda opacidade','number',0.01]]},
  {id:'icons',section:'Ajustes avançados',title:'Ícones gerais',desc:'Espessura global dos ícones e dimensões compartilhadas.',preview:'icons',fields:[['sizes','iconStroke','Espessura geral','number',0.05],['sizes','headerIcon','Ícones do cabeçalho','number',1],['sizes','tabIcon','Ícones da barra inferior','number',1],['sizes','tabIconStroke','Stroke da barra inferior','number',0.05]]}
];
function devPageById(id){return DEV_PAGES.find(p=>p.id===id);}
const DEV_HELP={
 'sizes.headerCircleBorder':'Espessura do contorno dos botões circulares. Aumentar deixa o anel mais evidente; diminuir o deixa mais delicado.',
 'colors.lightGlass':'Cor ou valor RGBA do preenchimento translúcido dos elementos com efeito de vidro no tema claro.',
 'colors.darkGlass':'Equivalente do efeito de vidro no tema escuro.',
 'colors.lightFloatBorder':'Cor/alpha do contorno dos elementos flutuantes no tema claro.',
 'colors.darkFloatBorder':'Cor/alpha do contorno dos elementos flutuantes no tema escuro.',
 'sizes.timerPadY':'Espaço interno acima e abaixo do conteúdo do cronômetro. Não é a margem entre cronômetros.',
 'sizes.timerPadX':'Espaço interno entre as bordas esquerda/direita e o conteúdo do cronômetro.',
 'sizes.timerGap':'Espaço entre símbolo, nome e tempo dentro do cronômetro.',
 'sizes.timerIconRadius':'Arredondamento da área que contém o símbolo do cronômetro.',
 'layout.timerNameAlign':'Alinhamento horizontal do nome dentro da área reservada para ele.',
 'layout.timerTimeAlign':'Alinhamento horizontal do número do tempo dentro da área reservada para ele.',
 'layout.totalJustify':'Posição do conjunto de ícone, rótulo e tempo dentro do cartão Tempo total.',
 'shadow.x':'Desloca a sombra horizontalmente. Valores positivos movem para a direita; negativos, para a esquerda.',
 'shadow.y':'Desloca a sombra verticalmente. Valores positivos movem a sombra para baixo.',
 'shadow.blur':'Desfoque da sombra. Quanto maior, mais difusa e suave ela fica.',
 'shadow.spread':'Expansão da sombra antes do desfoque. Valores positivos aumentam a área; negativos a contraem.',
 'shadow.opacity':'Intensidade da sombra principal, de 0 (invisível) a 1 (totalmente opaca).',
 'shadow.smallY':'Deslocamento vertical da segunda camada de sombra, usada para dar profundidade sutil.',
 'shadow.smallBlur':'Desfoque da segunda camada da sombra.',
 'shadow.smallOpacity':'Opacidade da segunda camada de sombra.',
 'sizes.borderWidth':'Espessura-base de bordas que usam a variável compartilhada.',
 'sizes.iconStroke':'Espessura padrão dos traços de ícones que não têm stroke específico.',
 'sizes.tabIconStroke':'Espessura dos traços dos ícones exclusivamente na barra inferior.',
 'colors.lightUsed':'Cor do texto de cronômetros já usados e pausados no tema claro; propositalmente de baixo contraste.',
 'colors.darkUsed':'Equivalente de baixo contraste para cronômetros usados no tema escuro.',
 'colors.lightPlaceholder':'Cor de textos temporários dentro de campos vazios no tema claro.',
 'colors.darkPlaceholder':'Cor de placeholders no tema escuro.',
 'colors.lightLine':'Cor de divisórias e linhas sutis no tema claro.',
 'colors.darkLine':'Cor de divisórias e linhas sutis no tema escuro.'
};
function devInfoButton(path,label){const text=DEV_HELP[path];return text?`<button class="dev-info" data-dev-info="${esc(path)}" aria-label="Informação sobre ${esc(label)}">i</button>`:'';}
function devControl(group,key,label,type,step=0.5){
  const path=`${group}.${key}`, value=getPath(devDesign,path) ?? '';
  const copy=`<button class="dev-mini" data-dev-copy="${path}">Copiar</button><button class="dev-mini" data-dev-paste="${path}">Colar</button>`;
  const labelHtml=`<div class="dev-label"><span class="dev-label-line"><strong>${esc(label)}</strong>${devInfoButton(path,label)}</span><small>${esc(path)}</small></div>`;
  if(type==='color') return `<div class="dev-row">${labelHtml}<div class="dev-value"><input type="color" data-dev-path="${path}" value="${esc(value)}"><input class="dev-text" data-dev-path="${path}" value="${esc(value)}">${copy}</div></div>`;
  if(type.startsWith('select:')){const opts=type.slice(7).split('|');return `<div class="dev-row">${labelHtml}<div class="dev-value"><select data-dev-path="${path}">${opts.map(o=>`<option value="${esc(o)}" ${String(value)===o?'selected':''}>${esc(o)}</option>`).join('')}</select>${copy}</div></div>`;}
  if(type==='number') return `<div class="dev-row">${labelHtml}<div class="dev-value dev-number-wrap"><button class="dev-step" data-dev-step="${path}" data-step="-${step}" aria-label="Diminuir">−</button><input class="dev-text dev-number" type="number" step="${step}" data-dev-path="${path}" value="${esc(value)}"><button class="dev-step" data-dev-step="${path}" data-step="${step}" aria-label="Aumentar">+</button>${copy}</div></div>`;
  return `<div class="dev-row">${labelHtml}<div class="dev-value"><input class="dev-text" type="text" data-dev-path="${path}" value="${esc(value)}">${copy}</div></div>`;
}
function devPreview(kind){
  if(kind==='back')return `<div class="dev-preview-stage"><button class="circle-button glass dev-preview-back">${svgIcon('back')}</button></div>`;
  if(kind==='title')return `<div class="dev-preview-stage"><div class="dev-preview-title">Registros</div></div>`;
  if(kind==='timer')return `<div class="dev-preview-stage stack"><button class="timer-card"><span class="icon">R</span><span class="name">Remoção</span><span class="time">12:34</span></button><button class="timer-card active"><span class="icon">P</span><span class="name">Preparação</span><span class="time">04:18</span></button><button class="timer-card paused"><span class="icon">C</span><span class="name">Cuticulagem</span><span class="time">08:42</span></button></div>`;
  if(kind==='headerButtons')return `<div class="dev-preview-stage dev-preview-spread"><button class="circle-button glass">${svgIcon('back')}</button><button class="circle-button glass">${svgIcon('more')}</button></div>`;
  if(kind==='settings'||kind==='settingsPage')return `<div class="dev-preview-stage"><div class="settings-card dev-preview-settings"><div class="settings-row"><span>Aparência</span><span class="secondary-value">Sistema</span></div><div class="settings-row"><span>Layout</span><span class="secondary-value">Lateral</span></div></div></div>`;
  if(kind==='history'||kind==='historyPage')return `<div class="dev-preview-stage"><button class="history-card"><div class="top"><strong>Cliente • Alongamento</strong><span>1:42:18</span></div><div class="muted small">09/08/2026</div></button></div>`;
  if(kind==='tabbar')return `<div class="dev-preview-stage"><div class="dev-preview-tabbar"><div class="active">${svgIcon('timers')}<small>Cronômetros</small></div><div>${svgIcon('history')}<small>Histórico</small></div><div>${svgIcon('stats')}<small>Estatísticas</small></div></div></div>`;
  if(kind==='save')return `<div class="dev-preview-stage"><button class="save-btn dev-preview-save">${svgIcon('check')}<span>Salvar</span></button></div>`;
  if(kind==='total')return `<div class="dev-preview-stage"><div class="total-card floating-card dev-preview-total"><span class="total-icon">${svgIcon('clock')}</span><span><small>Tempo total</small><strong>1:25:42</strong></span></div></div>`;
  if(kind==='stats')return `<div class="dev-preview-stage"><section class="panel dev-preview-panel"><h3>Resumo</h3><div class="row"><span>Registros medidos</span><strong>24</strong></div><div class="row"><span>Tempo acumulado</span><strong>31:42:18</strong></div></section></div>`;
  if(kind==='modal')return `<div class="dev-preview-stage"><div class="sheet-card dev-preview-sheet"><strong>Detalhes</strong><p class="muted small">Exemplo de cartão interno de uma janela.</p></div></div>`;
  if(kind==='paletteLight')return `<div class="dev-preview-stage palette-preview light"><span>Fundo</span><div>Cartão</div><strong>Texto principal</strong><small>Texto secundário</small></div>`;
  if(kind==='paletteDark')return `<div class="dev-preview-stage palette-preview dark"><span>Fundo</span><div>Cartão</div><strong>Texto principal</strong><small>Texto secundário</small></div>`;
  if(kind==='themes')return `<div class="dev-preview-stage"><div class="theme-presets dev-theme-preview">${(devDesign.themePresets||[]).slice(0,4).map(p=>`<div class="theme-preset"><span class="theme-dot" style="--theme-accent:${esc(p.accent)};--theme-action:${esc(p.action)}"></span><span>${esc(p.name)}</span></div>`).join('')}</div></div>`;
  if(kind==='shadow')return `<div class="dev-preview-stage"><div class="dev-shadow-sample">Sombra</div></div>`;
  if(kind==='icons')return `<div class="dev-preview-stage dev-preview-icons">${svgIcon('settings')}${svgIcon('ellipsis')}${svgIcon('check')}${svgIcon('close')}</div>`;
  return '';
}
function renderPresetEditor(){return (devDesign.themePresets||[]).map((p,i)=>`<div class="dev-preset"><div class="dev-row"><div class="dev-label"><strong>${esc(p.name)}</strong><small>${esc(p.id)}</small></div></div>${devControl(`themePresets.${i}`,'name','Nome','text')}${devControl(`themePresets.${i}`,'accent','Cor de destaque','color')}${devControl(`themePresets.${i}`,'action','Cor de ação / ativo','color')}</div>`).join('');}
function renderDevHome(){
  const sections=[...new Set(DEV_PAGES.map(x=>x.section))];
  const ordered=[...ui.devSnapshots].sort((a,b)=>b.createdAt-a.createdAt);
  const snapshots=ordered.length?ordered.map(s=>`<div class="dev-snapshot-row"><div class="dev-snapshot-main"><button data-dev-restore-snapshot="${s.id}"><strong>${esc(s.name)}</strong><small>${esc(s.version||devVersionLabel(s.seq))} · ${esc(fmtDateTime(s.createdAt))}</small><span>${esc(snapshotChangeSummary(s))}</span></button><div class="dev-snapshot-actions"><button data-dev-toggle-changes="${s.id}">Ver alterações</button><button data-dev-rename-snapshot="${s.id}">Renomear</button><button class="danger-text" data-dev-delete-snapshot="${s.id}">Excluir</button></div>${ui.devInfo===`snapshot:${s.id}`?snapshotChangesHtml(s):''}</div></div>`).join(''):`<div class="dev-empty">Nenhum Snapshot salvo ainda.</div>`;
  const restored=ui.devVersionState?.restored?' · Restaurado':'';
  return `<header class="topbar simple dev-mode-header"><h1>Desenvolvedor</h1><span class="dev-version-badge">DEV · v${esc(devVersionLabel())}${restored}</span></header><main class="settings-content"><h2 class="settings-title">Desenvolvedor</h2><p class="dev-intro">Edite o aplicativo por componentes. Propriedades compartilhadas afetam todas as instâncias que usam a mesma base; itens específicos podem ter sua própria página.</p>
  <section class="settings-section"><h3 class="section-label">Ferramentas</h3><div class="settings-card"><button class="settings-row button-row" id="devPickComponent"><span>Selecionar componente na tela</span><span class="secondary-value">Toque para identificar</span></button><button class="settings-row button-row" id="devExit"><span>Sair do modo desenvolvedor</span></button></div><p class="section-footer">A seleção é temporária: você volta ao app, toca em um elemento reconhecido e abre diretamente o editor correspondente.</p></section>
  <section class="settings-section"><h3 class="section-label">Snapshots</h3><div class="settings-card"><button class="settings-row button-row" id="devSaveSnapshot"><span>Salvar Snapshot atual</span><span class="secondary-value">Próximo: ${esc(devVersionLabel((ui.devVersionState?.maxSeq??0)+1))}</span></button>${snapshots}</div><p class="section-footer">Cada Snapshot registra as diferenças em relação ao checkpoint anterior e avança a revisão <strong>dev.N</strong>. Restaurar não apaga versões posteriores.</p></section>
  ${sections.map(section=>`<section class="settings-section"><h3 class="section-label">${esc(section)}</h3><div class="settings-card dev-nav-card">${DEV_PAGES.filter(p=>p.section===section).map(p=>`<button class="settings-row dev-nav-row" data-dev-page="${p.id}"><span><strong>${esc(p.title)}</strong><small>${esc(p.desc)}</small></span><span class="dev-chevron">›</span></button>`).join('')}</div></section>`).join('')}
  <section class="settings-section"><h3 class="section-label">Projeto</h3><div class="settings-card"><button class="settings-row button-row" id="devReset"><span>Redefinir para originais desta versão</span></button><button class="settings-row button-row" id="devExportDistribution"><span>Exportar versão de distribuição</span><span class="secondary-value">v${esc(baseDevVersion())}</span></button><button class="settings-row button-row" id="devExportClean"><span>Exportar versão limpa</span></button><button class="settings-row button-row" id="devExportDev"><span>Criar nova base de desenvolvimento</span><span class="secondary-value">v${esc(semverNextPatch(baseDevVersion()))}-dev.0</span></button></div><p class="section-footer">Distribuição mantém o modo Developer escondido em Ajustes. Limpa remove o acesso ao Developer. Nova base transforma o visual atual nos novos originais e inicia a próxima revisão.</p></section></main>`;
}
function renderDevEditor(page){
  const body=page.special==='presets'?renderPresetEditor():(page.fields||[]).map(([g,k,l,t,step])=>devControl(g,k,l,t,step)).join('');
  const info=ui.devInfo&&DEV_HELP[ui.devInfo]?`<div class="dev-info-popover"><button id="devInfoClose" aria-label="Fechar">${svgIcon('close')}</button><strong>${esc(prettyDevPath(ui.devInfo))}</strong><p>${esc(DEV_HELP[ui.devInfo])}</p></div>`:'';
  return `<header class="topbar dev-editor-top"><button class="dev-back-text" id="devBack">‹ Desenvolvedor</button><h1>${esc(page.title)}</h1><span class="dev-version-mini">${esc(devVersionLabel())}</span></header><main class="settings-content dev-editor"><p class="dev-editor-desc">${esc(page.desc)}</p><section class="settings-section"><h3 class="section-label">Prévia ao vivo</h3>${devPreview(page.preview)}</section><section class="settings-section"><h3 class="section-label">Propriedades</h3><div class="settings-card dev-card">${body}</div></section><p class="section-footer dev-live-note">A prévia e o componente real usam os mesmos valores. O botão <strong>i</strong> explica propriedades menos óbvias.</p></main>${info}`;
}
function renderDeveloper(){
  if(BUILD.developerAvailable===false){ui.devMode=false;return renderSettings();}
  const page=devPageById(ui.devPage);
  return shell(page?renderDevEditor(page):renderDevHome(),'settings');
}
function renderModelsPage(){
  const all=activeModels();
  return shell(`<header class="topbar simple models-header"><h1>Modelos</h1><button class="text-button models-edit-button" id="toggleModelsEdit">${ui.modelsEditing?'Concluir':'Editar'}</button></header><main class="content models-page"><button class="create-model-card" id="createModel">${svgIcon('plus')}<span>Criar novo modelo</span></button><div class="models-list">${all.map((m,i)=>`<div class="model-list-item"><button class="model-main" data-choose-model="${m.id}"><strong>${esc(m.name)}</strong><span>${m.timers.filter(t=>!t.removedAt).length} cronômetro(s)</span></button>${ui.modelsEditing?`<div class="model-reorder"><button data-move-model="${m.id}" data-dir="-1" ${i===0?'disabled':''}>↑</button><button data-move-model="${m.id}" data-dir="1" ${i===all.length-1?'disabled':''}>↓</button></div>`:`<button class="circle-button small-circle" data-model-options="${m.id}" aria-label="Opções de ${esc(m.name)}">${svgIcon('more')}</button>`}${ui.popover?.type==='modelOptions'&&ui.popover.id===m.id?`<div class="popover-backdrop" id="closePopover"></div><div class="model-popover floating-window"><button data-model-rename="${m.id}">Renomear</button><button data-model-edit="${m.id}">Editar</button><button data-model-dup="${m.id}">Duplicar</button><button data-model-delete="${m.id}" class="danger">Apagar</button></div>`:''}</div>`).join('')}</div></main>`,'timers');
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
  if(ui.devMode) $app.innerHTML=renderDeveloper();
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
  document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{ui.devMode=false;ui.devPage=null;ui.devPickMode=false;ui.tab=b.dataset.tab;ui.modal=null;ui.popover=null;if(ui.tab==='timers')ui.timerView='timers';render();});
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
  if(byId('historyDateClear'))byId('historyDateClear').onclick=()=>{ui.historyDate='';render();};
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
  document.querySelectorAll('[data-color-theme]').forEach(b=>b.onclick=async()=>{data.settings.colorTheme=b.dataset.colorTheme;if(data.settings.colorTheme==='custom'&&!data.settings.accentColor)data.settings.accentColor='#007AFF';await persistSettings();render();});
  if(byId('accentCustom'))byId('accentCustom').onchange=async e=>{data.settings.accentColor=e.target.value;data.settings.colorTheme='custom';await persistSettings();render();};
  if(byId('importJsonFile'))byId('importJsonFile').onchange=async e=>{const f=e.target.files?.[0];if(f)await importJSON(f);e.target.value='';};
  document.querySelectorAll('[data-dev-page]').forEach(b=>b.onclick=()=>{ui.devPage=b.dataset.devPage;render();});
  if(byId('devBack'))byId('devBack').onclick=()=>{ui.devPage=null;render();};
  if(byId('openDeveloper'))byId('openDeveloper').onclick=()=>{ui.devMode=true;ui.devPage=null;ui.devInfo=null;render();};
  if(byId('devExit'))byId('devExit').onclick=()=>{ui.devMode=false;ui.devPage=null;ui.tab='settings';render();};
  if(byId('devPickComponent'))byId('devPickComponent').onclick=()=>{ui.devPickMode=true;ui.devMode=false;ui.devPage=null;ui.tab='timers';ui.timerView='timers';render();toast('Toque em um componente para editá-lo');};
  if(byId('devSaveSnapshot'))byId('devSaveSnapshot').onclick=saveDevSnapshot;
  document.querySelectorAll('[data-dev-restore-snapshot]').forEach(b=>b.onclick=()=>restoreDevSnapshot(b.dataset.devRestoreSnapshot));
  document.querySelectorAll('[data-dev-toggle-changes]').forEach(b=>b.onclick=()=>{const key=`snapshot:${b.dataset.devToggleChanges}`;ui.devInfo=ui.devInfo===key?null:key;render();});
  document.querySelectorAll('[data-dev-rename-snapshot]').forEach(b=>b.onclick=async()=>{const snap=ui.devSnapshots.find(x=>x.id===b.dataset.devRenameSnapshot);if(!snap)return;const name=(prompt('Novo nome do Snapshot:',snap.name)||'').trim();if(!name)return;snap.name=name;await persistDevSnapshots();render();});
  document.querySelectorAll('[data-dev-delete-snapshot]').forEach(b=>b.onclick=()=>deleteDevSnapshot(b.dataset.devDeleteSnapshot));
  document.querySelectorAll('[data-dev-path]').forEach(el=>{const handler=async e=>{const path=e.target.dataset.devPath;setPath(devDesign,path,normalizeDevValue(path,e.target.value,e.target));await persistDevDesign();applyTheme();if(e.type==='change')render();};el.oninput=handler;el.onchange=handler;});
  document.querySelectorAll('[data-dev-step]').forEach(b=>b.onclick=async()=>{const path=b.dataset.devStep;const step=Number(b.dataset.step)||0;const current=Number(getPath(devDesign,path))||0;const precision=Math.abs(step)<1?2:1;setPath(devDesign,path,Number((current+step).toFixed(precision)));await persistDevDesign();applyTheme();render();});
  document.querySelectorAll('[data-dev-copy]').forEach(b=>b.onclick=async()=>{const path=b.dataset.devCopy;const value=getPath(devDesign,path);ui.devCopied={path,value};try{await navigator.clipboard?.writeText(String(value));toast('Valor copiado');}catch(_){toast('Valor guardado para colar');}});
  document.querySelectorAll('[data-dev-paste]').forEach(b=>b.onclick=async()=>{const path=b.dataset.devPaste;let value=ui.devCopied?.value;try{const clip=await navigator.clipboard?.readText();if(clip)value=clip;}catch(_){}if(value==null){value=prompt('Valor para colar:','');if(value==null)return;}setPath(devDesign,path,normalizeDevValue(path,value));await persistDevDesign();applyTheme();render();toast('Valor colado');});
  if(byId('devReset'))byId('devReset').onclick=async()=>{if(!confirm('Redefinir todas as configurações visuais para os originais desta versão Developer?'))return;devDesign=clone(BUILD.designDefaults);await persistDevDesign();applyTheme();render();toast('Configurações redefinidas');};
  document.querySelectorAll('[data-dev-info]').forEach(b=>b.onclick=()=>{ui.devInfo=b.dataset.devInfo;render();});
  if(byId('devInfoClose'))byId('devInfoClose').onclick=()=>{ui.devInfo=null;render();};
  if(byId('devExportDistribution'))byId('devExportDistribution').onclick=()=>exportProject('distribution');
  if(byId('devExportClean'))byId('devExportClean').onclick=()=>exportProject('clean');
  if(byId('devExportDev'))byId('devExportDev').onclick=()=>exportProject('developer');
  if(ui.devPickMode){
    document.body.classList.add('dev-pick-mode');
    const picks=[
      ['.timer-card','timer'],['.save-btn','save'],['.total-card','total'],['.circle-button','headerButtons'],['.topbar h1','topTitle'],['.history-card','historyCard'],['.tabbar','tabbar'],['.settings-card','settingsCard'],['.panel','statsPage']
    ];
    picks.forEach(([sel,page])=>document.querySelectorAll(sel).forEach(el=>{el.classList.add('dev-pickable');el.onclick=e=>{e.preventDefault();e.stopPropagation();ui.devPickMode=false;ui.devMode=true;ui.devPage=page;document.body.classList.remove('dev-pick-mode');render();};}));
    if(!document.getElementById('devPickBanner'))document.body.insertAdjacentHTML('beforeend','<div id="devPickBanner" class="dev-pick-banner"><strong>Selecionar componente</strong><span>Toque em um item destacado</span><button id="devPickCancel">Cancelar</button></div>');
    const cancel=document.getElementById('devPickCancel');if(cancel)cancel.onclick=()=>{ui.devPickMode=false;document.body.classList.remove('dev-pick-mode');document.getElementById('devPickBanner')?.remove();ui.devMode=true;ui.tab='settings';render();};
  }else{document.body.classList.remove('dev-pick-mode');document.getElementById('devPickBanner')?.remove();}

}

function applyTheme(){
  const root=document.documentElement;
  if(data.settings.theme==='system')root.removeAttribute('data-theme');else root.setAttribute('data-theme',data.settings.theme);
  const c=devDesign.colors||{},z=devDesign.sizes||{},l=devDesign.layout||{};
  const custom=data.settings.colorTheme==='custom'; const p=currentPreset();
  const accent=custom?(data.settings.accentColor||'#007AFF'):(p.accent||'#007AFF');
  const action=custom?accent:(p.action||accent);
  const vars={
    '--accent':accent,'--running':action,'--action':action,'--delete-fixed':c.delete||'#E22400',
    '--dev-light-bg':c.lightBg,'--dev-light-card':c.lightCard,'--dev-light-text':c.lightText,'--dev-light-secondary':c.lightSecondary,'--dev-light-line':c.lightLine,'--dev-light-placeholder':c.lightPlaceholder,'--dev-light-glass':c.lightGlass,'--dev-light-float-border':c.lightFloatBorder,'--dev-light-used':c.lightUsed,
    '--dev-dark-bg':c.darkBg,'--dev-dark-card':c.darkCard,'--dev-dark-text':c.darkText,'--dev-dark-secondary':c.darkSecondary,'--dev-dark-line':c.darkLine,'--dev-dark-placeholder':c.darkPlaceholder,'--dev-dark-glass':c.darkGlass,'--dev-dark-float-border':c.darkFloatBorder,'--dev-dark-used':c.darkUsed,
    '--content-side':`${cssNum(z.contentSide,18)}px`,'--content-top':`${cssNum(z.contentTop,14)}px`,'--topbar-height':`${cssNum(z.topbarHeight,54)}px`,'--header-button':`${cssNum(z.headerButton,40)}px`,'--header-icon':`${cssNum(z.headerIcon,22)}px`,'--title-size':`${cssNum(z.titleSize,17.5)}px`,'--top-tab-title-size':`${cssNum(z.topTabTitleSize,20)}px`,
    '--timer-min-height':`${cssNum(z.timerMinHeight,64)}px`,'--timer-radius':`${cssNum(z.timerRadius,30)}px`,'--timer-pad-y':`${cssNum(z.timerPadY,11)}px`,'--timer-pad-x':`${cssNum(z.timerPadX,14)}px`,'--timer-gap':`${cssNum(z.timerGap,10)}px`,'--timer-icon-size':`${cssNum(z.timerIconSize,38)}px`,'--timer-icon-radius':`${cssNum(z.timerIconRadius,13)}px`,'--timer-name-size':`${cssNum(z.timerNameSize,15)}px`,'--timer-time-size':`${cssNum(z.timerTimeSize,24)}px`,
    '--floating-height':`${cssNum(z.floatingHeight,52)}px`,'--floating-radius':`${cssNum(z.floatingRadius,20)}px`,'--floating-gap':`${cssNum(z.floatingGap,10)}px`,'--total-time-size':`${cssNum(z.totalTimeSize,18)}px`,'--add-height':`${cssNum(z.addHeight,52)}px`,'--save-height':`${cssNum(z.saveHeight,z.floatingHeight||52)}px`,'--save-radius':`${cssNum(z.saveRadius,z.floatingRadius||20)}px`,'--save-font-size':`${cssNum(z.saveFontSize,16)}px`,'--save-icon-size':`${cssNum(z.saveIconSize,20)}px`,'--total-height':`${cssNum(z.totalHeight,z.floatingHeight||52)}px`,'--total-radius':`${cssNum(z.totalRadius,z.floatingRadius||20)}px`,'--total-label-size':`${cssNum(z.totalLabelSize,12)}px`,'--total-icon-size':`${cssNum(z.totalIconSize,19)}px`,'--history-filter-height':`${cssNum(z.historyFilterHeight,44)}px`,'--history-filter-radius':`${cssNum(z.historyFilterRadius,14)}px`,'--stats-panel-pad':`${cssNum(z.statsPanelPad,16)}px`,
    '--settings-radius':`${cssNum(z.settingsRadius,30)}px`,'--settings-row-height':`${cssNum(z.settingsRowHeight,56)}px`,'--settings-side':`${cssNum(z.settingsSide,18)}px`,'--settings-pad-x':`${cssNum(z.settingsPadX,18)}px`,
    '--history-radius':`${cssNum(z.historyRadius,20)}px`,'--history-pad-y':`${cssNum(z.historyPadY,14)}px`,'--history-pad-x':`${cssNum(z.historyPadX,16)}px`,'--history-title-size':`${cssNum(z.historyTitleSize,16)}px`,'--panel-radius':`${cssNum(z.panelRadius,24)}px`,'--modal-radius':`${cssNum(z.modalRadius,52)}px`,'--sheet-card-radius':`${cssNum(z.sheetCardRadius,30)}px`,'--border-width':`${cssNum(z.borderWidth,1)}px`,'--header-circle-border':`${cssNum(z.headerCircleBorder,2.5)}px`,'--icon-stroke':cssNum(z.iconStroke,1.8),'--tab-icon':`${cssNum(z.tabIcon,25)}px`,'--tab-icon-stroke':cssNum(z.tabIconStroke,1.85),'--tab-font':`${cssNum(z.tabFont,10.5)}px`,
    '--float-shadow':rgbaShadow(),'--timer-name-align':l.timerNameAlign||'left','--timer-time-align':l.timerTimeAlign||'right','--total-justify':l.totalJustify||'center','--card-align':l.cardAlign||'center'
  };
  for(const [k,v] of Object.entries(vars))if(v!=null)root.style.setProperty(k,v);
}

function buildConfigSource(mode){
  const base=baseDevVersion();
  let payload;
  if(mode==='developer'){
    const next=semverNextPatch(base); payload={developerAvailable:true,version:`${next}-dev.0`,baseVersion:next,buildId:`dev-${Date.now()}`,designDefaults:clone(devDesign)};
  }else if(mode==='clean') payload={developerAvailable:false,version:base,baseVersion:base,buildId:`clean-${Date.now()}`,designDefaults:clone(devDesign)};
  else payload={developerAvailable:true,version:base,baseVersion:base,buildId:`dist-${Date.now()}`,designDefaults:clone(devDesign)};
  return `'use strict';\nwindow.APP_BUILD = ${JSON.stringify(payload,null,2)};\n`;
}
async function exportProject(mode='distribution'){
  if(typeof JSZip==='undefined'){alert('O gerador ZIP não foi carregado.');return;}
  try{
    const files=['index.html','styles.css','app.js','manifest.webmanifest','icon.svg','sw.js','jszip.min.js','README.md','AI_RULES_MIN.txt'];
    const zip=new JSZip();
    for(const name of files){const r=await fetch('./'+name,{cache:'no-store'});if(r.ok)zip.file(name,await r.blob());}
    zip.file('design-config.js',buildConfigSource(mode));
    const sw=await (await fetch('./sw.js',{cache:'no-store'})).text();
    zip.file('sw.js',sw.replace(/const CACHE = '[^']+';/,`const CACHE = 'cronometro-${mode}-${Date.now()}';`));
    const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:6}});
    const base=baseDevVersion(); const version=mode==='developer'?`${semverNextPatch(base)}-dev.0`:base; const suffix=mode==='clean'?'_limpa':mode==='developer'?'_developer':'';
    await shareFile(`cronometro_pwa_v${version}${suffix}.zip`,'application/zip',blob);
  }catch(err){console.error(err);alert('Não foi possível gerar o ZIP do projeto.');}
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
  db=await openDB();data.models=await getAll('models');data.sessions=await getAll('sessions');data.settings={...data.settings,...(await getState('settings')||{}),simultaneous:'single'};data.current=await getState('current');devDesign=deepMerge(BUILD.designDefaults||{},(await getState(devStateKey()))||{});ui.devSnapshots=(await getState(devSnapshotsKey()))||[];ui.devVersionState=(await getState(devVersionKey()))||{maxSeq:0,currentSeq:0,restored:false};if(!(devDesign.themePresets||[]).some(p=>p.id===data.settings.colorTheme))data.settings.colorTheme='original';
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

function applyTheme(){
  const root=document.documentElement;
  if(data.settings.theme==='system')root.removeAttribute('data-theme');else root.setAttribute('data-theme',data.settings.theme);
  const c=devDesign.colors||{},z=devDesign.sizes||{},l=devDesign.layout||{};
  const custom=data.settings.colorTheme==='custom'; const p=currentPreset();
  const accent=custom?(data.settings.accentColor||'#007AFF'):(p.accent||'#007AFF');
  const action=custom?accent:(p.action||accent);
  const vars={
    '--accent':accent,'--running':action,'--action':action,'--delete-fixed':c.delete||'#E22400',
    '--dev-light-bg':c.lightBg,'--dev-light-card':c.lightCard,'--dev-light-text':c.lightText,'--dev-light-secondary':c.lightSecondary,'--dev-light-line':c.lightLine,'--dev-light-placeholder':c.lightPlaceholder,'--dev-light-glass':c.lightGlass,'--dev-light-float-border':c.lightFloatBorder,'--dev-light-used':c.lightUsed,
    '--dev-dark-bg':c.darkBg,'--dev-dark-card':c.darkCard,'--dev-dark-text':c.darkText,'--dev-dark-secondary':c.darkSecondary,'--dev-dark-line':c.darkLine,'--dev-dark-placeholder':c.darkPlaceholder,'--dev-dark-glass':c.darkGlass,'--dev-dark-float-border':c.darkFloatBorder,'--dev-dark-used':c.darkUsed,
    '--content-side':`${cssNum(z.contentSide,18)}px`,'--content-top':`${cssNum(z.contentTop,14)}px`,'--topbar-height':`${cssNum(z.topbarHeight,54)}px`,'--header-button':`${cssNum(z.headerButton,40)}px`,'--header-icon':`${cssNum(z.headerIcon,22)}px`,'--title-size':`${cssNum(z.titleSize,17.5)}px`,'--top-tab-title-size':`${cssNum(z.topTabTitleSize,20)}px`,
    '--timer-min-height':`${cssNum(z.timerMinHeight,64)}px`,'--timer-radius':`${cssNum(z.timerRadius,30)}px`,'--timer-pad-y':`${cssNum(z.timerPadY,11)}px`,'--timer-pad-x':`${cssNum(z.timerPadX,14)}px`,'--timer-gap':`${cssNum(z.timerGap,10)}px`,'--timer-icon-size':`${cssNum(z.timerIconSize,38)}px`,'--timer-icon-radius':`${cssNum(z.timerIconRadius,13)}px`,'--timer-name-size':`${cssNum(z.timerNameSize,15)}px`,'--timer-time-size':`${cssNum(z.timerTimeSize,24)}px`,
    '--floating-height':`${cssNum(z.floatingHeight,52)}px`,'--floating-radius':`${cssNum(z.floatingRadius,20)}px`,'--floating-gap':`${cssNum(z.floatingGap,10)}px`,'--total-time-size':`${cssNum(z.totalTimeSize,18)}px`,'--add-height':`${cssNum(z.addHeight,52)}px`,'--save-height':`${cssNum(z.saveHeight,z.floatingHeight||52)}px`,'--save-radius':`${cssNum(z.saveRadius,z.floatingRadius||20)}px`,'--save-font-size':`${cssNum(z.saveFontSize,16)}px`,'--save-icon-size':`${cssNum(z.saveIconSize,20)}px`,'--total-height':`${cssNum(z.totalHeight,z.floatingHeight||52)}px`,'--total-radius':`${cssNum(z.totalRadius,z.floatingRadius||20)}px`,'--total-label-size':`${cssNum(z.totalLabelSize,12)}px`,'--total-icon-size':`${cssNum(z.totalIconSize,19)}px`,'--history-filter-height':`${cssNum(z.historyFilterHeight,44)}px`,'--history-filter-radius':`${cssNum(z.historyFilterRadius,14)}px`,'--stats-panel-pad':`${cssNum(z.statsPanelPad,16)}px`,
    '--settings-radius':`${cssNum(z.settingsRadius,30)}px`,'--settings-row-height':`${cssNum(z.settingsRowHeight,56)}px`,'--settings-side':`${cssNum(z.settingsSide,18)}px`,'--settings-pad-x':`${cssNum(z.settingsPadX,18)}px`,
    '--history-radius':`${cssNum(z.historyRadius,20)}px`,'--history-pad-y':`${cssNum(z.historyPadY,14)}px`,'--history-pad-x':`${cssNum(z.historyPadX,16)}px`,'--history-title-size':`${cssNum(z.historyTitleSize,16)}px`,'--panel-radius':`${cssNum(z.panelRadius,24)}px`,'--modal-radius':`${cssNum(z.modalRadius,52)}px`,'--sheet-card-radius':`${cssNum(z.sheetCardRadius,30)}px`,'--border-width':`${cssNum(z.borderWidth,1)}px`,'--header-circle-border':`${cssNum(z.headerCircleBorder,2.5)}px`,'--icon-stroke':cssNum(z.iconStroke,1.8),'--tab-icon':`${cssNum(z.tabIcon,25)}px`,'--tab-icon-stroke':cssNum(z.tabIconStroke,1.85),'--tab-font':`${cssNum(z.tabFont,10.5)}px`,
    '--float-shadow':rgbaShadow(),'--timer-name-align':l.timerNameAlign||'left','--timer-time-align':l.timerTimeAlign||'right','--total-justify':l.totalJustify||'center','--card-align':l.cardAlign||'center'
  };
  for(const [k,v] of Object.entries(vars))if(v!=null)root.style.setProperty(k,v);
}

function buildConfigSource(isDeveloper){
  const payload={developer:!!isDeveloper,version:isDeveloper?'0.4.0-dev':'0.4.0',buildId:`export-${Date.now()}`,designDefaults:clone(devDesign)};
  return `'use strict';\nwindow.APP_BUILD = ${JSON.stringify(payload,null,2)};\n`;
}
async function exportProject(isDeveloper){
  if(typeof JSZip==='undefined'){alert('O gerador ZIP não foi carregado.');return;}
  try{
    const files=['index.html','styles.css','app.js','manifest.webmanifest','icon.svg','sw.js','jszip.min.js','README.md','AI_RULES_MIN.txt'];
    const zip=new JSZip();
    for(const name of files){const r=await fetch('./'+name,{cache:'no-store'});if(r.ok)zip.file(name,await r.blob());}
    zip.file('design-config.js',buildConfigSource(isDeveloper));
    const sw=await (await fetch('./sw.js',{cache:'no-store'})).text();
    zip.file('sw.js',sw.replace(/const CACHE = '[^']+';/,`const CACHE = 'cronometro-${isDeveloper?'dev':'final'}-${Date.now()}';`));
    const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:6}});
    await shareFile(`cronometro-${isDeveloper?'developer':'final'}-${dayKey(now())}.zip`,'application/zip',blob);
  }catch(err){console.error(err);alert('Não foi possível gerar o ZIP do projeto.');}
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
  db=await openDB();data.models=await getAll('models');data.sessions=await getAll('sessions');data.settings={...data.settings,...(await getState('settings')||{}),simultaneous:'single'};data.current=await getState('current');devDesign=deepMerge(BUILD.designDefaults||{},(await getState(devStateKey()))||{});ui.devSnapshots=(await getState(devSnapshotsKey()))||[];ui.devVersionState=(await getState(devVersionKey()))||{maxSeq:0,currentSeq:0,restored:false};if(!(devDesign.themePresets||[]).some(p=>p.id===data.settings.colorTheme))data.settings.colorTheme='original';
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




/* === v0.5.2: version + bottom tabbar developer controls === */
const APP_VERSION = "0.5.2";
const VERSION_BADGE_KEY = "show_version_badge";
const DEV_TABBAR_KEY_V052 = "dev_tabbar_controls_v052";

function getDevTabbarCfg() {
  const defaults = {
    iconColor:"#6E6E73",
    iconSize:25,
    textColor:"#6E6E73",
    textSize:10.5,
    showLabels:true,
    borderColor:"#FFFFFF",
    borderWidth:1
  };
  try {
    return Object.assign({}, defaults, JSON.parse(localStorage.getItem(DEV_TABBAR_KEY_V052) || "{}"));
  } catch(e) {
    return defaults;
  }
}

function saveDevTabbarCfg(cfg) {
  localStorage.setItem(DEV_TABBAR_KEY_V052, JSON.stringify(cfg));
}

function applyDevTabbarCfg() {
  const cfg = getDevTabbarCfg();
  const root = document.documentElement;
  root.style.setProperty("--tabbar-icon-color", cfg.iconColor);
  root.style.setProperty("--tabbar-icon-size", cfg.iconSize + "px");
  root.style.setProperty("--tabbar-text-color", cfg.textColor);
  root.style.setProperty("--tabbar-text-size", cfg.textSize + "px");
  root.style.setProperty("--tabbar-border-color", cfg.borderColor);
  root.style.setProperty("--tabbar-border-width", cfg.borderWidth + "px");

  document.querySelectorAll(".tabbar button").forEach(btn => {
    btn.style.color = btn.classList.contains("active") ? "" : cfg.iconColor;
    const labels = [...btn.children].filter(x => !x.classList.contains("sf-icon"));
    labels.forEach(label => {
      label.style.color = btn.classList.contains("active") ? "" : cfg.textColor;
    });
  });

  const bar = document.querySelector(".tabbar");
  if (bar) bar.classList.toggle("hide-labels", !cfg.showLabels);
}

function ensureVersionBadge() {
  let badge = document.getElementById("app-version-badge");
  if (!badge) {
    badge = document.createElement("div");
    badge.id = "app-version-badge";
    badge.className = "app-version-badge";
    document.body.appendChild(badge);
  }
  badge.textContent = "v" + APP_VERSION;
  const show = localStorage.getItem(VERSION_BADGE_KEY) === "1";
  badge.hidden = !show;
}

function createDevStepper(value, step, onChange) {
  const wrap = document.createElement("div");
  wrap.className = "dev-inline-stepper";
  const minus = document.createElement("button");
  minus.type = "button";
  minus.textContent = "−";
  const input = document.createElement("input");
  input.type = "number";
  input.value = value;
  input.step = step;
  const plus = document.createElement("button");
  plus.type = "button";
  plus.textContent = "+";
  const commit = v => {
    input.value = v;
    onChange(Number(v));
  };
  minus.onclick = () => commit((Number(input.value)||0)-step);
  plus.onclick = () => commit((Number(input.value)||0)+step);
  input.onchange = () => onChange(Number(input.value));
  wrap.append(minus,input,plus);
  return wrap;
}

function createDevRow(label, control, infoText) {
  const row = document.createElement("div");
  row.className = "dev-extra-row";
  const left = document.createElement("div");
  left.className = "dev-extra-label";
  const txt = document.createElement("span");
  txt.textContent = label;
  left.appendChild(txt);
  if (infoText) {
    const info = document.createElement("button");
    info.type = "button";
    info.className = "dev-info-btn";
    info.textContent = "ⓘ";
    info.onclick = () => alert(infoText);
    left.appendChild(info);
  }
  row.append(left, control);
  return row;
}

function injectSettingsVersionToggle() {
  const settingsRoot = document.querySelector("#settingsView,.settings-page,[data-view='settings']");
  if (!settingsRoot || settingsRoot.querySelector("#version-badge-toggle-row")) return;
  const host = settingsRoot.querySelector(".settings-list,.settings-content") || settingsRoot;

  const row = document.createElement("div");
  row.id = "version-badge-toggle-row";
  row.className = "setting-row";
  row.innerHTML = '<div><div class="setting-title">Mostrar versão no topo</div><div class="setting-subtitle">Exibe uma etiqueta pequena com o número da versão atual.</div></div>';

  const toggle = document.createElement("input");
  toggle.type = "checkbox";
  toggle.checked = localStorage.getItem(VERSION_BADGE_KEY) === "1";
  toggle.onchange = () => {
    localStorage.setItem(VERSION_BADGE_KEY, toggle.checked ? "1" : "0");
    ensureVersionBadge();
  };
  row.appendChild(toggle);
  host.appendChild(row);
}

document.addEventListener("DOMContentLoaded", () => {
  ensureVersionBadge();
  applyDevTabbarCfg();
  setTimeout(() => {
    /* developer controls removed */
    injectSettingsVersionToggle();
  }, 100);
});

document.addEventListener("click", () => {
  setTimeout(() => {
    ensureVersionBadge();
    applyDevTabbarCfg();
    /* developer controls removed */
    injectSettingsVersionToggle();
  }, 0);
}, true);

setInterval(() => {
  ensureVersionBadge();
  applyDevTabbarCfg();
  /* developer controls removed */
  injectSettingsVersionToggle();
}, 1200);


/* === Distribution build: developer mode disabled === */
(function disableDeveloperMode(){
  function stripDev(){
    document.querySelectorAll(
      "#developerView,.developer-page,[data-view='developer'],.dev-page," +
      "[data-tab='developer'],[data-view-target='developer'],.developer-tab"
    ).forEach(el => el.remove());

    document.querySelectorAll("button,a,.setting-row,.settings-row,.settings-item").forEach(el => {
      const t = (el.textContent || "").trim().toLowerCase();
      if (t === "abrir modo desenvolvedor" ||
          t === "modo desenvolvedor" ||
          t === "desenvolvedor" ||
          t.includes("abrir modo desenvolvedor")) {
        el.remove();
      }
    });
  }
  document.addEventListener("DOMContentLoaded", () => {
    stripDev();
    setTimeout(stripDev,100);
  });
  document.addEventListener("click", () => setTimeout(stripDev,0), true);
  setInterval(stripDev,1500);
})();

/*
  GymTrack • db.js
  IndexedDB data layer with Promise helpers, schema + CRUD + basic analytics.
  Stores
    - exercises {id, name(unique), muscleGroup, notes, createdAt, updatedAt}
    - templates {id, name, notes, items:[{exerciseId, targetSets, targetReps, notes}], createdAt, updatedAt}
    - sessions  {id, date, templateId|null, notes, createdAt, updatedAt}
    - sets      {id, sessionId, exerciseId, index, weight, reps, rpe, felt, volume, est1RM, createdAt}
    - settings  {key, value}
*/

export const DB_NAME = 'gymdb';
export const DB_VERSION = 1; // bump when schema changes

const hasUUID = typeof crypto !== 'undefined' && crypto.randomUUID;
export const uid = () => hasUUID ? crypto.randomUUID() : ('id-' + Math.random().toString(36).slice(2) + Date.now());

let _dbPromise;

export function openDB(){
  if(_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject)=>{
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e)=>{
      const db = req.result;
      const oldVersion = e.oldVersion || 0;
      // Fresh install or migrations
      if(oldVersion < 1){
        const ex = db.createObjectStore('exercises', { keyPath:'id' });
        ex.createIndex('name','name',{ unique:true });
        ex.createIndex('muscleGroup','muscleGroup');

        const tp = db.createObjectStore('templates', { keyPath:'id' });
        tp.createIndex('name','name',{ unique:false });

        const ss = db.createObjectStore('sessions', { keyPath:'id' });
        ss.createIndex('date','date');
        ss.createIndex('templateId','templateId');

        const st = db.createObjectStore('sets', { keyPath:'id' });
        st.createIndex('sessionId','sessionId');
        st.createIndex('exerciseId','exerciseId');
        st.createIndex('createdAt','createdAt');

        const set = db.createObjectStore('settings', { keyPath:'key' });
      }
    };
    req.onsuccess = ()=> resolve(req.result);
    req.onerror = ()=> reject(req.error);
  });
  return _dbPromise;
}

async function tx(storeNames, mode='readonly'){
  const db = await openDB();
  return db.transaction(storeNames, mode);
}

// Generic helpers
async function getAll(store, indexName=null, query=null){
  const t = await tx([store]);
  const os = indexName ? t.objectStore(store).index(indexName) : t.objectStore(store);
  return new Promise((res, rej)=>{
    const out = [];
    const req = query ? os.openCursor(query) : os.openCursor();
    req.onsuccess = ()=>{
      const c = req.result;
      if(c){ out.push(c.value); c.continue(); } else res(out);
    };
    req.onerror = ()=> rej(req.error);
  });
}

async function getByKey(store, key){
  const t = await tx([store]);
  const os = t.objectStore(store);
  return new Promise((res, rej)=>{
    const req = os.get(key);
    req.onsuccess = ()=> res(req.result || null);
    req.onerror = ()=> rej(req.error);
  });
}

async function put(store, value){
  const t = await tx([store], 'readwrite');
  const os = t.objectStore(store);
  return new Promise((res, rej)=>{
    const req = os.put(value);
    req.onsuccess = ()=> res(value);
    req.onerror = ()=> rej(req.error);
  });
}

async function remove(store, key){
  const t = await tx([store], 'readwrite');
  const os = t.objectStore(store);
  return new Promise((res, rej)=>{
    const req = os.delete(key);
    req.onsuccess = ()=> res(true);
    req.onerror = ()=> rej(req.error);
  });
}

// ===== Exercises =====
export async function listExercises({ search='', group='' }={}){
  let items = await getAll('exercises','name');
  if(search){
    const s = search.toLowerCase();
    items = items.filter(x=> x.name.toLowerCase().includes(s) || (x.muscleGroup||'').toLowerCase().includes(s));
  }
  if(group){ items = items.filter(x=> (x.muscleGroup||'') === group); }
  items.sort((a,b)=> a.name.localeCompare(b.name));
  return items;
}
export async function getExercise(id){ return getByKey('exercises', id); }
export async function upsertExercise({id, name, muscleGroup='', notes=''}){
  name = (name||'').trim();
  if(!name) throw new Error('Name is required');
  const now = new Date().toISOString();
  if(!id){
    // Ensure unique name
    const dup = await findExerciseByName(name);
    if(dup) throw new Error('Exercise with this name already exists');
    id = uid();
    return put('exercises', { id, name, muscleGroup, notes, createdAt:now, updatedAt:now });
  } else {
    const existing = await getExercise(id);
    if(!existing) throw new Error('Exercise not found');
    if(existing.name !== name){
      const dup = await findExerciseByName(name);
      if(dup) throw new Error('Exercise with this name already exists');
    }
    return put('exercises', { ...existing, name, muscleGroup, notes, updatedAt:now });
  }
}
export async function deleteExercise(id){
  // Also remove from templates items (soft cleanup) & orphan sets not allowed -> leave sets (history) intact
  await remove('exercises', id);
  // Cleanup template items referencing this exercise
  const tpls = await getAll('templates');
  await Promise.all(tpls.map(async t=>{
    const newItems = (t.items||[]).filter(it=> it.exerciseId !== id);
    if(newItems.length !== (t.items||[]).length){
      await put('templates', { ...t, items:newItems, updatedAt:new Date().toISOString() });
    }
  }));
  return true;
}
export async function findExerciseByName(name){
  const t = await tx(['exercises']);
  const idx = t.objectStore('exercises').index('name');
  return new Promise((res)=>{
    const req = idx.get(name);
    req.onsuccess = ()=> res(req.result || null);
    req.onerror = ()=> res(null);
  });
}
export async function listMuscleGroups(){
  const all = await getAll('exercises');
  return [...new Set(all.map(x=> x.muscleGroup).filter(Boolean))].sort((a,b)=> a.localeCompare(b));
}

// ===== Templates =====
export async function listTemplates(search=''){
  let items = await getAll('templates');
  if(search){ const s = search.toLowerCase(); items = items.filter(t=> (t.name||'').toLowerCase().includes(s)); }
  items.sort((a,b)=> a.name.localeCompare(b.name));
  return items;
}
export async function getTemplate(id){ return getByKey('templates', id); }
export async function upsertTemplate({id, name, notes='', items=[]}){
  name = (name||'').trim();
  if(!name) throw new Error('Name is required');
  const now = new Date().toISOString();
  if(!id){ id = uid(); return put('templates', { id, name, notes, items, createdAt:now, updatedAt:now }); }
  const existing = await getTemplate(id);
  if(!existing) throw new Error('Template not found');
  return put('templates', { ...existing, name, notes, items, updatedAt:now });
}
export async function deleteTemplate(id){ return remove('templates', id); }
export async function duplicateTemplate(id){
  const t = await getTemplate(id);
  if(!t) throw new Error('Template not found');
  const copy = { ...t, id: uid(), name: t.name + ' (Copy)', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  return put('templates', copy);
}

// ===== Sessions =====
export async function createSession({ templateId=null, notes='' }={}){
  const now = new Date().toISOString();
  const id = uid();
  await put('sessions', { id, date: now, templateId, notes, createdAt: now, updatedAt: now });
  return getSession(id);
}
export async function getSession(id){ return getByKey('sessions', id); }
export async function updateSession(id, patch){
  const s = await getSession(id); if(!s) throw new Error('Session not found');
  const updated = { ...s, ...patch, updatedAt: new Date().toISOString() };
  return put('sessions', updated);
}
export async function deleteSession(id){
  // delete all sets in this session
  const sets = await listSetsBySession(id);
  await Promise.all(sets.map(s=> remove('sets', s.id)));
  await remove('sessions', id);
  return true;
}
export async function listSessionsByDateRange(fromISO, toISO){
  const all = await getAll('sessions','date');
  return all.filter(s=> (!fromISO || s.date >= fromISO) && (!toISO || s.date <= toISO)).sort((a,b)=> a.date.localeCompare(b.date));
}

// ===== Sets =====
export async function listSetsBySession(sessionId){
  const t = await tx(['sets']);
  const idx = t.objectStore('sets').index('sessionId');
  return new Promise((res, rej)=>{
    const out = [];
    const req = idx.openCursor(IDBKeyRange.only(sessionId));
    req.onsuccess = ()=>{ const c = req.result; if(c){ out.push(c.value); c.continue(); } else res(out.sort((a,b)=> a.index - b.index)); };
    req.onerror = ()=> rej(req.error);
  });
}
export async function listSetsByExercise(exerciseId, {from, to}={}){
  const t = await tx(['sets']);
  const idx = t.objectStore('sets').index('exerciseId');
  const out = [];
  return new Promise((res, rej)=>{
    const req = idx.openCursor(IDBKeyRange.only(exerciseId));
    req.onsuccess = ()=>{
      const c = req.result; if(c){ const v = c.value; if((!from || v.createdAt>=from) && (!to || v.createdAt<=to)) out.push(v); c.continue(); } else res(out.sort((a,b)=> a.createdAt.localeCompare(b.createdAt))); };
    req.onerror = ()=> rej(req.error);
  });
}
export async function getLastSetForExercise(exerciseId){
  const items = await listSetsByExercise(exerciseId);
  return items[items.length-1] || null;
}
export function computeVolume(weight, reps){ return (Number(weight)||0) * (Number(reps)||0); }
export function computeEpley1RM(weight, reps){ weight = Number(weight)||0; reps = Number(reps)||0; return +(weight * (1 + reps/30)).toFixed(2); }
export async function addSet({ sessionId, exerciseId, weight, reps, rpe=null, felt=null }){
  const s = await getSession(sessionId); if(!s) throw new Error('Session not found');
  const ex = await getExercise(exerciseId); if(!ex) throw new Error('Exercise not found');
  const existingSets = await listSetsBySession(sessionId);
  const index = existingSets.filter(x=> x.exerciseId === exerciseId).length + 1;
  const volume = computeVolume(weight, reps);
  const est1RM = computeEpley1RM(weight, reps);
  const createdAt = new Date().toISOString();
  const set = { id: uid(), sessionId, exerciseId, index, weight:Number(weight)||0, reps:Number(reps)||0, rpe: rpe?Number(rpe):null, felt: felt||null, volume, est1RM, createdAt };
  await put('sets', set);
  await updateSession(sessionId, {}); // bump updatedAt
  return set;
}
export async function deleteSet(id){ return remove('sets', id); }

// ===== Settings =====
export async function getSetting(key){ const rec = await getByKey('settings', key); return rec ? rec.value : null; }
export async function setSetting(key, value){ return put('settings', { key, value }); }
export async function getAllSettings(){ const list = await getAll('settings'); const out={}; for(const r of list) out[r.key]=r.value; return out; }

// ===== Analytics helpers =====
export async function getExerciseBestWeightByDate(exerciseId, {from, to}={}){
  // Return [{date: 'YYYY-MM-DD', value: maxWeight, setIds:[...]}]
  const sets = await listSetsByExercise(exerciseId, {from, to});
  const map = new Map();
  for(const s of sets){
    const d = s.createdAt.slice(0,10);
    const cur = map.get(d) || { value:0, setIds:[] };
    if(s.weight > cur.value){ map.set(d, { value:s.weight, setIds:[s.id] }); }
  }
  return [...map.entries()].sort((a,b)=> a[0].localeCompare(b[0])).map(([date, v])=> ({ date, value:v.value, setIds:v.setIds }));
}
export async function getExerciseVolumeBySessionDate(exerciseId, {from, to}={}){
  // Sum volume per session date
  const sets = await listSetsByExercise(exerciseId, {from, to});
  const map = new Map(); // date -> volume
  for(const s of sets){ const d = s.createdAt.slice(0,10); map.set(d, (map.get(d)||0) + (s.volume||0)); }
  return [...map.entries()].sort((a,b)=> a[0].localeCompare(b[0])).map(([date, value])=> ({ date, value }));
}
export async function getExerciseEst1RMByDate(exerciseId, {from, to}={}){
  const sets = await listSetsByExercise(exerciseId, {from, to});
  const map = new Map();
  for(const s of sets){ const d = s.createdAt.slice(0,10); map.set(d, Math.max(map.get(d)||0, s.est1RM||0)); }
  return [...map.entries()].sort((a,b)=> a[0].localeCompare(b[0])).map(([date, value])=> ({ date, value }));
}

// ===== Utilities for export/import to be used by export.js =====
export async function dumpAll(){
  const [exercises, templates, sessions, sets, settings] = await Promise.all([
    getAll('exercises'), getAll('templates'), getAll('sessions'), getAll('sets'), getAll('settings')
  ]);
  return { meta:{ db:DB_NAME, version:DB_VERSION, exportedAt:new Date().toISOString() }, exercises, templates, sessions, sets, settings };
}

export async function importMerge(data){
  if(!data) throw new Error('No data');
  const {exercises=[], templates=[], sessions=[], sets=[], settings=[]} = data;
  const t = await tx(['exercises','templates','sessions','sets','settings'], 'readwrite');
  const ops = [];
  const putAll = (store, arr)=> arr.forEach(v=> t.objectStore(store).put(v));
  putAll('exercises', exercises);
  putAll('templates', templates);
  putAll('sessions', sessions);
  putAll('sets', sets);
  putAll('settings', settings);
  ops.push(new Promise((res, rej)=>{ t.oncomplete=()=>res(true); t.onerror=()=>rej(t.error); }));
  await Promise.all(ops);
  return true;
}

// Convenience: bootstrap defaults (called by app.js)
export async function ensureDefaults(){
  const units = await getSetting('units');
  if(!units){ await setSetting('units','kg'); }
  if(!(await getSetting('restSeconds'))){ await setSetting('restSeconds', 90); }
  if(!(await getSetting('intensityMode'))){ await setSetting('intensityMode','rpe'); }
}

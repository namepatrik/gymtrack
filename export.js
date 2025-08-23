/*
  GymTrack • export.js
  JSON backup/restore and CSV exports (all, per-exercise, date-range)
*/

import { dumpAll, importMerge, listExercises, listSessionsByDateRange, listSetsBySession } from './db.js';

// ----- JSON -----
export async function exportJSON(){
  const data = await dumpAll();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type:'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `gymtrack-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  setTimeout(()=> URL.revokeObjectURL(a.href), 2000);
}

export async function importJSON(ev){
  const file = ev.target.files?.[0]; if(!file) return;
  try{
    const text = await file.text();
    const data = JSON.parse(text);
    await importMerge(data);
    toast('Import complete');
  }catch(err){ console.error(err); toast('Import failed'); }
  finally{ ev.target.value = ''; }
}

// ----- CSV utils -----
function csvEscape(s){ if(s==null) return ''; s = String(s); if(/[",\n]/.test(s)) return '"' + s.replace(/"/g,'""') + '"'; return s; }
function toCSV(headers, rows){
  let out = headers.join(',') + '\n';
  for(const r of rows){ out += headers.map(h=> csvEscape(r[h])).join(',') + '\n'; }
  return out;
}
function downloadCSV(name, csv){
  const blob = new Blob([csv], { type:'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(()=> URL.revokeObjectURL(a.href), 2000);
}

// Collect all sets across sessions (optionally filtered)
async function gatherSets({ exerciseId=null, from=null, to=null }={}){
  const sessions = await listSessionsByDateRange(from, to);
  const rows = [];
  for(const s of sessions){
    const sets = await listSetsBySession(s.id);
    for(const st of sets){
      if(exerciseId && st.exerciseId !== exerciseId) continue;
      rows.push({ session:s, set:st });
    }
  }
  return rows;
}

export async function exportCSVAll(){
  const rows = await gatherSets({});
  const exerciseMap = new Map((await listExercises()).map(e=> [e.id, e.name]));
  const headers = ['date','exercise','weight','reps','RPE','volume','est1RM','sessionId','setId'];
  const data = rows.map(({session,set})=>({
    date: set.createdAt,
    exercise: exerciseMap.get(set.exerciseId)||'Unknown',
    weight: set.weight,
    reps: set.reps,
    RPE: set.rpe ?? set.felt ?? '',
    volume: set.volume,
    est1RM: set.est1RM,
    sessionId: session.id,
    setId: set.id
  }));
  downloadCSV(`gymtrack-sets-all-${new Date().toISOString().slice(0,10)}.csv`, toCSV(headers, data));
}

export async function exportCSVByExercise(exerciseId){
  const rows = await gatherSets({ exerciseId });
  const exName = (await listExercises()).find(e=> e.id===exerciseId)?.name || 'exercise';
  const headers = ['date','exercise','weight','reps','RPE','volume','est1RM','sessionId','setId'];
  const data = rows.map(({session,set})=>({
    date: set.createdAt,
    exercise: exName,
    weight: set.weight,
    reps: set.reps,
    RPE: set.rpe ?? set.felt ?? '',
    volume: set.volume,
    est1RM: set.est1RM,
    sessionId: session.id,
    setId: set.id
  }));
  downloadCSV(`gymtrack-sets-${exName.replace(/\s+/g,'_')}-${new Date().toISOString().slice(0,10)}.csv`, toCSV(headers, data));
}

export async function exportCSVByDateRange(fromStr='', toStr=''){
  const from = fromStr ? new Date(fromStr).toISOString() : null;
  const to = toStr ? new Date(new Date(toStr).getTime()+86400000-1).toISOString() : null;
  const rows = await gatherSets({ from, to });
  const exerciseMap = new Map((await listExercises()).map(e=> [e.id, e.name]));
  const headers = ['date','exercise','weight','reps','RPE','volume','est1RM','sessionId','setId'];
  const data = rows.map(({session,set})=>({
    date: set.createdAt,
    exercise: exerciseMap.get(set.exerciseId)||'Unknown',
    weight: set.weight,
    reps: set.reps,
    RPE: set.rpe ?? set.felt ?? '',
    volume: set.volume,
    est1RM: set.est1RM,
    sessionId: session.id,
    setId: set.id
  }));
  const name = `gymtrack-sets-${fromStr||'all'}_${toStr||'all'}.csv`.replace(/[^a-z0-9_\.-]/gi,'_');
  downloadCSV(name, toCSV(headers, data));
}

// Simple toast bridge (used if ui.js not loaded yet)
function toast(msg){ const host=document.getElementById('toast'); if(!host) return; const d=document.createElement('div'); d.className='msg'; d.textContent=msg; host.appendChild(d); setTimeout(()=>d.remove(), 1800); }

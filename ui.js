/*
  GymTrack • ui.js
  DOM rendering, navigation, dialogs, timers, logging, and progress wiring.
  This module imports the data layer (db.js) and charts (charts.js), plus export helpers.
*/

import {
    listExercises, listMuscleGroups, upsertExercise, deleteExercise,
    listTemplates, upsertTemplate, deleteTemplate, duplicateTemplate, getTemplate,
    createSession, getSession, updateSession, deleteSession,
    listSetsBySession, addSet, deleteSet,
    getLastSetForExercise,
    getExerciseBestWeightByDate, getExerciseVolumeBySessionDate, getExerciseEst1RMByDate,
    getAllSettings, getSetting, setSetting, ensureDefaults
  } from './db.js';
  
  import { renderLineChart, destroyChart } from './charts.js';
  import { exportJSON, importJSON, exportCSVAll, exportCSVByExercise, exportCSVByDateRange } from './export.js';
  
  // ===== Utilities =====
  const $ = (sel, root=document)=> root.querySelector(sel);
  const $$ = (sel, root=document)=> Array.from(root.querySelectorAll(sel));
  
  function show(el){ el.classList.remove('hidden'); }
  function hide(el){ el.classList.add('hidden'); }
  

  function toast(msg, ms=1800){
    const host = $('#toast');
    const el = document.createElement('div');
    el.className = 'msg';
    el.textContent = msg;
    host.appendChild(el);
    setTimeout(()=>{ el.remove(); }, ms);
  }
  
  async function confirmDialog(title, message, confirmLabel='Delete'){
    const dlg = $('#dlgConfirm');
    $('#confirmTitle').textContent = title;
    $('#confirmMessage').textContent = message;
    $('#btnConfirm').textContent = confirmLabel;
    return new Promise((res)=>{
      dlg.onclose = ()=> res(dlg.returnValue === 'default');
      dlg.showModal();
    });
  }
  
  // ===== Global state kept in ui.js =====
  const state = {
    currentTab: 'log',
    currentSessionId: null,
    chart: null,
    dateFilter: { from:null, to:null },
    settings: { units:'kg', restSeconds:90, intensityMode:'rpe' }
  };
  
  // ===== Initialization =====
  export async function initUI(){
    await ensureDefaults();
    state.settings = await getAllSettings();
    initTabs();
    bindHeader();
    bindLogView();
    bindLibraryView();
    bindProgramsView();
    bindProgressView();
    bindSettingsView();
    applySettingsToUI();
    await refreshAllLists();
  }
  
  function initTabs(){
    $$('.tabbar .tab').forEach(btn=>{
      btn.addEventListener('click', ()=> switchTab(btn.dataset.tab));
    });
  }
  
  async function switchTab(name){
    state.currentTab = name;
    $$('.tabbar .tab').forEach(b=> b.classList.toggle('tab-active', b.dataset.tab===name));
    $$('.view').forEach(v=> v.classList.remove('view-active'));
    $(`#view-${name}`).classList.add('view-active');
    if(name==='progress'){ await refreshProgressSelectors(); }
  }
  
  function bindHeader(){
    $('#btnQuickAdd').addEventListener('click', async ()=>{
      if(!state.currentSessionId){ toast('Start a session first'); return; }
      // Quick add: open exercise picker via exercise dialog in read-only mode
      await openExercisePicker((exercise)=>{
        appendExerciseBlockToSession(exercise.id, exercise.name);
      });
    });
  }
  
  // ===== Library (Exercises) =====
  function bindLibraryView(){
    $('#btnNewExercise').addEventListener('click', ()=> openExerciseDialog());
    $('#exerciseSearch').addEventListener('input', ()=> renderExerciseList());
    $('#exerciseFilter').addEventListener('change', ()=> renderExerciseList());
  }
  
  async function renderExerciseList(){
    const search = $('#exerciseSearch').value.trim();
    const group = $('#exerciseFilter').value;
    const list = $('#exerciseList');
    const empty = $('#exerciseEmpty');
    list.innerHTML = '';
    const items = await listExercises({ search, group });
    empty.classList.toggle('hidden', items.length>0);
    items.forEach(ex=> list.appendChild(renderExerciseListItem(ex)));
  }
  
  function renderExerciseListItem(ex){
    const tpl = $('#tpl-exercise-item');
    const node = tpl.content.firstElementChild.cloneNode(true);
    $('.title', node).textContent = ex.name;
    $('.subtitle', node).textContent = ex.muscleGroup || '';
    $('.edit', node).addEventListener('click', ()=> openExerciseDialog(ex));
    $('.delete', node).addEventListener('click', async ()=>{
      if(await confirmDialog('Delete Exercise', `Remove "${ex.name}" from library? Templates will be updated, history stays.`, 'Delete')){
        await deleteExercise(ex.id);
        toast('Exercise deleted');
        await refreshAllLists();
      }
    });
    return node;
  }
  
  async function openExerciseDialog(ex=null){
    const dlg = $('#dlgExercise');
    $('#exerciseFormTitle').textContent = ex ? 'Edit Exercise' : 'New Exercise';
    $('#exerciseId').value = ex?.id || '';
    $('#exerciseName').value = ex?.name || '';
    $('#exerciseGroup').value = ex?.muscleGroup || '';
    $('#exerciseNotes').value = ex?.notes || '';
  
    const form = $('#exerciseForm');
form.onsubmit = async (ev)=>{
  // If the cancel button triggered the submit, close without saving
  if (ev.submitter && ev.submitter.value === 'cancel') {
    ev.preventDefault();
    dlg.close('cancel');
    return;
  }
      ev.preventDefault();
      try{
        await upsertExercise({
          id: $('#exerciseId').value || undefined,
          name: $('#exerciseName').value,
          muscleGroup: $('#exerciseGroup').value,
          notes: $('#exerciseNotes').value
        });
        dlg.close();
        toast('Saved');
        await refreshAllLists();
      }catch(err){ toast(err.message||'Failed'); }
    };
    dlg.showModal();
  }
  
  async function openExercisePicker(onPick){
    // reuse exercise dialog as a picker: simple list to pick
    const items = await listExercises();
    if(items.length===0){ toast('No exercises yet'); return; }
    const picker = document.createElement('dialog');
    picker.className = 'modal';
    const wrap = document.createElement('div');
    wrap.className = 'form';
    wrap.innerHTML = `<h3>Pick Exercise</h3>`;
    const list = document.createElement('div'); list.className='list';
    items.forEach(ex=>{
      const btn = document.createElement('button'); btn.className='btn'; btn.textContent = `${ex.name} ${ex.muscleGroup? '· '+ex.muscleGroup:''}`;
      btn.addEventListener('click', ()=>{ onPick(ex); picker.close(); picker.remove(); });
      list.appendChild(btn);
    });
    wrap.appendChild(list);
    const menu = document.createElement('menu'); menu.style.display='flex'; menu.style.justifyContent='flex-end'; menu.style.marginTop='.75rem';
    const cancel = document.createElement('button'); cancel.className='btn'; cancel.textContent='Cancel'; cancel.addEventListener('click', ()=>{ picker.close(); picker.remove(); });
    menu.appendChild(cancel);
    wrap.appendChild(menu);
    picker.appendChild(wrap);
    document.body.appendChild(picker);
    picker.showModal();
  }
  
  async function refreshExerciseFilters(){
    const groups = await listMuscleGroups();
    const sel = $('#exerciseFilter');
    const cur = sel.value;
    sel.innerHTML = '<option value="">All groups</option>' + groups.map(g=>`<option>${g}</option>`).join('');
    sel.value = cur;
  }
  
  // ===== Programs (Templates) =====
  function bindProgramsView(){
    $('#btnNewTemplate').addEventListener('click', ()=> openTemplateDialog());
    $('#templateSearch').addEventListener('input', ()=> renderTemplateList());
  }
  
  async function renderTemplateList(){
    const search = $('#templateSearch').value.trim();
    const list = $('#templateList'); list.innerHTML='';
    const items = await listTemplates(search);
    items.forEach(t=> list.appendChild(renderTemplateListItem(t)));
    // also refresh start-from select
    await refreshStartFromTemplates();
  }
  
  function renderTemplateListItem(t){
    const tpl = $('#tpl-template-item');
    const node = tpl.content.firstElementChild.cloneNode(true);
    $('.title', node).textContent = t.name;
    $('.subtitle', node).textContent = (t.items?.length||0) + ' exercises';
    $('.edit', node).addEventListener('click', ()=> openTemplateDialog(t));
    $('.duplicate', node).addEventListener('click', async ()=>{ await duplicateTemplate(t.id); toast('Duplicated'); await renderTemplateList(); });
    $('.delete', node).addEventListener('click', async ()=>{
      if(await confirmDialog('Delete Template', `Delete "${t.name}"?`, 'Delete')){ await deleteTemplate(t.id); toast('Template deleted'); await renderTemplateList(); }
    });
    return node;
  }
  
  async function openTemplateDialog(tpl=null){
    const dlg = $('#dlgTemplate');
    $('#templateFormTitle').textContent = tpl? 'Edit Template' : 'New Template';
    $('#templateId').value = tpl?.id || '';
    $('#templateName').value = tpl?.name || '';
    $('#templateNotes').value = tpl?.notes || '';
    // load exercise options
    const exs = await listExercises();
    const sel = $('#templateAddExercise');
    sel.innerHTML = exs.map(e=>`<option value="${e.id}">${e.name}</option>`).join('');
    const list = $('#templateItems'); list.innerHTML='';
    (tpl?.items||[]).forEach((it, idx)=> list.appendChild(renderTemplateExerciseRow(it, exs, idx)));
  
    $('#btnTemplateAdd').onclick = (ev)=>{
      ev.preventDefault();
      const exerciseId = sel.value; if(!exerciseId) return;
      const targetSets = Number($('#templateTargetSets').value)||3;
      const targetReps = Number($('#templateTargetReps').value)||8;
      const ex = exs.find(x=> x.id===exerciseId);
      const it = { exerciseId, targetSets, targetReps, notes:'' };
      list.appendChild(renderTemplateExerciseRow(it, exs, list.children.length));
    };
  
    const form = $('#templateForm');
form.onsubmit = async (ev)=>{
  if (ev.submitter && ev.submitter.value === 'cancel') {
    ev.preventDefault();
    dlg.close('cancel');
    return;
  }
      ev.preventDefault();
      try{
        const items = Array.from(list.children).map(row=> ({
          exerciseId: row.dataset.exerciseId,
          targetSets: Number($('.subtitle', row).dataset.sets),
          targetReps: Number($('.subtitle', row).dataset.reps),
          notes: row.dataset.notes||''
        }));
        await upsertTemplate({
          id: $('#templateId').value || undefined,
          name: $('#templateName').value,
          notes: $('#templateNotes').value,
          items
        });
        dlg.close(); toast('Saved');
        await renderTemplateList();
      }catch(err){ toast(err.message||'Failed'); }
    };
  
    dlg.showModal();
  }
  
  function renderTemplateExerciseRow(it, exercises, index){
    const ex = exercises.find(e=> e.id===it.exerciseId);
    const node = $('#tpl-template-exercise-row').content.firstElementChild.cloneNode(true);
    node.dataset.exerciseId = it.exerciseId;
    $('.title', node).textContent = ex ? ex.name : '(deleted)';
    const sub = $('.subtitle', node);
    sub.textContent = `${it.targetSets} × ${it.targetReps}`;
    sub.dataset.sets = it.targetSets;
    sub.dataset.reps = it.targetReps;
  
    $('.up', node).onclick = ()=> moveRow(node, -1);
    $('.down', node).onclick = ()=> moveRow(node, +1);
    $('.remove', node).onclick = ()=> node.remove();
  
    function moveRow(el, dir){
      const parent = el.parentElement; const sib = dir<0 ? el.previousElementSibling : el.nextElementSibling;
      if(!sib) return; parent.insertBefore(dir<0? el: sib, dir<0? sib: el);
    }
    return node;
  }
  
  async function refreshStartFromTemplates(){
    const sel = $('#startFromTemplate');
    const items = await listTemplates('');
    const cur = sel.value;
    sel.innerHTML = '<option value="">— None (blank) —</option>' + items.map(t=>`<option value="${t.id}">${t.name}</option>`).join('');
    sel.value = cur || '';
  }
  
  // ===== Log (Sessions & Sets) =====
  function bindLogView(){
    // New plan shortcut
    $('#btnLogNewPlan').addEventListener('click', ()=> openTemplateDialog());
  
    // Back buttons
    $('#btnBackToPlans').addEventListener('click', ()=>{
      hide($('#logPlanDetail'));
      hide($('#logExerciseInput'));
      show($('#view-log .card')); // plans card
    });
  
    $('#btnBackToPlan').addEventListener('click', ()=>{
      hide($('#logExerciseInput'));
      show($('#logPlanDetail'));
    });
  
    // Initial render of plans list when app starts
    renderLogPlans();
  }
  async function renderLogPlans(){
    const plans = await listTemplates('');
    const wrap = $('#logPlans');
    const empty = $('#logPlansEmpty');
    wrap.innerHTML = '';
    empty.classList.toggle('hidden', plans.length > 0);
  
    plans.forEach(p=>{
      const row = document.createElement('div');
      row.className = 'list-item';
      const t = document.createElement('div'); t.className='title'; t.textContent = p.name;
      const s = document.createElement('div'); s.className='subtitle'; s.textContent = `${(p.items?.length||0)} exercises`;
      const actions = document.createElement('div'); actions.className='actions';
      const btn = document.createElement('button'); btn.className='btn'; btn.textContent='Open';
      btn.addEventListener('click', ()=> openPlanDetail(p.id));
      actions.appendChild(btn);
      row.appendChild((()=>{ const d=document.createElement('div'); d.appendChild(t); d.appendChild(s); return d; })());
      row.appendChild(actions);
      wrap.appendChild(row);
    });
  }

  async function openPlanDetail(templateId){
    const tpl = await getTemplate(templateId);
    if(!tpl){ toast('Plan missing'); return; }
  
    // Start a new session for this plan
    const s = await createSession({ templateId });
    state.currentSessionId = s.id;
  
    $('#logPlanName').textContent = tpl.name;
    const list = $('#planExerciseList');
    list.innerHTML = '';
  
    const exs = await listExercises();
    const nameById = new Map(exs.map(e=> [e.id, e.name]));
  
    (tpl.items||[]).forEach(it=>{
      const row = document.createElement('div');
      row.className = 'list-item';
      const title = document.createElement('div'); title.className='title'; title.textContent = nameById.get(it.exerciseId) || '(deleted)';
      const sub = document.createElement('div'); sub.className='subtitle'; sub.textContent = `${it.targetSets} × ${it.targetReps}`;
      const actions = document.createElement('div'); actions.className='actions';
      const btn = document.createElement('button'); btn.className='btn'; btn.textContent='Log';
      btn.addEventListener('click', ()=> openExerciseInput(it.exerciseId, nameById.get(it.exerciseId) || 'Exercise'));
      actions.appendChild(btn);
  
      const left = document.createElement('div'); left.appendChild(title); left.appendChild(sub);
      row.appendChild(left); row.appendChild(actions);
      list.appendChild(row);
    });
  
    // Show plan view
    hide($('#view-log .card')); // hide plans card
    hide($('#logExerciseInput'));
    show($('#logPlanDetail'));
  }
  
  async function openExerciseInput(exerciseId, name){
    if(!state.currentSessionId){ toast('Start a plan first'); return; }
  
    $('#logExerciseTitle').textContent = name;
    const units = state.settings.units || 'kg';
    const weight = $('#logWeight');
    const reps = $('#logReps');
    const intensity = $('#logIntensity');
    const setsList = $('#logExerciseSets');
  
    // intensity options
    intensity.innerHTML = (state.settings.intensityMode||'rpe')==='rpe'
      ? ['', '6','7','8','9','10'].map(v=> `<option value="${v}">${v? 'RPE '+v : 'RPE'}</option>`).join('')
      : [['','Felt'],['easy','Easy'],['medium','Medium'],['hard','Hard']].map(([v,l])=> `<option value="${v}">${l}</option>`).join('');
  
    // autofill last
    const last = await getLastSetForExercise(exerciseId);
    if(last){ weight.value = String(last.weight); reps.value = String(last.reps); } else { weight.value=''; reps.value=''; }
  
    // steppers
    const wStep = (units==='lb') ? 5 : 2.5;
    $('#logWeightMinus').onclick = ()=> weight.value = String(Math.max(0, (parseFloat(weight.value)||0) - wStep));
    $('#logWeightPlus').onclick = ()=> weight.value = String((parseFloat(weight.value)||0) + wStep);
    $('#logRepsMinus').onclick = ()=> reps.value = String(Math.max(0, (parseInt(reps.value)||0) - 1));
    $('#logRepsPlus').onclick = ()=> reps.value = String((parseInt(reps.value)||0) + 1);
  
    // render previous sets in this session for this exercise
    setsList.innerHTML = '';
    (await listSetsBySession(state.currentSessionId))
      .filter(s=> s.exerciseId === exerciseId)
      .forEach(s=> renderSetRow(setsList, s, name));
  
    // add set
    $('#btnLogAddSet').onclick = async ()=>{
      const w = parseFloat(weight.value)||0;
      const r = parseInt(reps.value)||0;
      let rpe=null, felt=null;
      if((state.settings.intensityMode||'rpe')==='rpe') rpe = intensity.value? Number(intensity.value): null;
      else felt = intensity.value || null;
  
      const set = await addSet({ sessionId: state.currentSessionId, exerciseId, weight:w, reps:r, rpe, felt });
      renderSetRow(setsList, set, name);
    };
  
    // nav
    hide($('#logPlanDetail'));
    show($('#logExerciseInput'));
  }
   
  
  async function onStartSession(){
    if(state.currentSessionId){ toast('Session already running'); return; }
    const templateId = $('#startFromTemplate').value || null;
    const s = await createSession({ templateId });
    state.currentSessionId = s.id;
    $('#btnEndSession').disabled = false;
    $('#currentSession').classList.remove('hidden');
    $('#sessionStartTime').textContent = new Date(s.date).toLocaleString();
    $('#sessionExerciseList').innerHTML = '';
    if(templateId){
      const t = await getTemplate(templateId);
      for(const it of (t.items||[])){
        appendExerciseBlockToSession(it.exerciseId);
      }
    }
    toast('Session started');
  }
  
  async function onEndSession(){
    if(!state.currentSessionId) return;
    if(!(await confirmDialog('End Session', 'Finish and save this workout session?', 'End'))){ return; }
    await updateSession(state.currentSessionId, { notes:'' });
    state.currentSessionId = null;
    $('#btnEndSession').disabled = true;
    $('#currentSession').classList.add('hidden');
    $('#sessionExerciseList').innerHTML = '';
    toast('Session ended');
  }
  
  function intensityOptions(){
    const mode = state.settings.intensityMode || 'rpe';
    if(mode==='rpe'){
      return [ '', '6', '7', '8', '9', '10' ].map(v=> `<option value="${v}">${v? 'RPE '+v : 'RPE'}</option>`).join('');
    } else {
      const map = [['','Felt'],['easy','Easy'],['medium','Medium'],['hard','Hard']];
      return map.map(([v,l])=> `<option value="${v}">${l}</option>`).join('');
    }
  }
  
  async function appendExerciseBlockToSession(exerciseId, nameOpt){
    const ex = nameOpt ? { id:exerciseId, name:nameOpt } : await (async()=> (await listExercises()).find(e=> e.id===exerciseId))();
    if(!ex){ toast('Exercise missing'); return; }
    const node = $('#tpl-session-exercise').content.firstElementChild.cloneNode(true);
    node.dataset.exerciseId = ex.id;
    $('.title', node).textContent = ex.name;
    const last = await getLastSetForExercise(ex.id);
    const units = state.settings.units || 'kg';
    $('.last-used', node).textContent = last ? `Last: ${last.weight}${units} × ${last.reps}` : 'No history';
    const weight = $('.weight', node);
    const reps = $('.reps', node);
    const intensity = $('.intensity', node);
    intensity.innerHTML = intensityOptions();
    if(last){ weight.value = String(last.weight); reps.value = String(last.reps); }
  
    // steppers
    const [wMinus, wPlus] = $$('.stepper .step', node).slice(0,2);
    const [rMinus, rPlus] = $$('.stepper .step', node).slice(2,4);
    const wStep = units==='lb'? 5 : 2.5;
    wMinus.onclick = ()=>{ weight.value = String(Math.max(0, (parseFloat(weight.value)||0) - wStep)); };
    wPlus.onclick = ()=>{ weight.value = String((parseFloat(weight.value)||0) + wStep); };
    rMinus.onclick = ()=>{ reps.value = String(Math.max(0, (parseInt(reps.value)||0) - 1)); };
    rPlus.onclick = ()=>{ reps.value = String((parseInt(reps.value)||0) + 1); };
  
    $('.add-set', node).addEventListener('click', async ()=>{
      if(!state.currentSessionId){ toast('Start session first'); return; }
      const weightVal = parseFloat(weight.value)||0;
      const repsVal = parseInt(reps.value)||0;
      let rpe=null, felt=null;
      if((state.settings.intensityMode||'rpe')==='rpe') rpe = intensity.value? Number(intensity.value): null;
      else felt = intensity.value||null;
      const set = await addSet({ sessionId: state.currentSessionId, exerciseId: ex.id, weight: weightVal, reps: repsVal, rpe, felt });
      renderSetRow($('.sets', node), set, ex.name);
      $('.last-used', node).textContent = `Last: ${set.weight}${units} × ${set.reps}`;
      if($('#toggleTimer').checked){ startTimer(Number($('#timerSeconds').value)||90); }
    });
  
    $('#sessionExerciseList').appendChild(node);
    // preload existing sets for this exercise in current session
    const sets = (await listSetsBySession(state.currentSessionId)).filter(s=> s.exerciseId===ex.id);
    const list = $('.sets', node);
    sets.forEach(s=> renderSetRow(list, s, ex.name));
  }
  
  function renderSetRow(listEl, set, exerciseName){
    const row = $('#tpl-set-row').content.firstElementChild.cloneNode(true);
    $('.title', row).textContent = `${exerciseName} — ${set.weight}${state.settings.units||'kg'} × ${set.reps}`;
    const sub = `${new Date(set.createdAt).toLocaleTimeString()} • Vol ${set.volume} • 1RM ${set.est1RM}` + (set.rpe? ` • RPE ${set.rpe}` : set.felt? ` • ${set.felt}`: '');
    $('.subtitle', row).textContent = sub;
    $('.delete', row).onclick = async ()=>{
      if(await confirmDialog('Delete Set', 'Remove this set?', 'Delete')){
        await deleteSet(set.id); row.remove(); toast('Set removed');
      }
    };
    listEl.appendChild(row);
  }
  
  // ===== Timer =====
  let timerHandle=null, timerUntil=0;
  function onTimerToggle(){
    const on = $('#toggleTimer').checked;
    $('#btnTimer').disabled = !on;
    if(!on) stopTimer();
  }
  function onTimerSecondsChange(){
    const sec = Number($('#timerSeconds').value)||90;
    setSetting('restSeconds', sec);
    $('#btnTimer').textContent = `Start ${sec}s`;
  }
  function startTimer(seconds){
    stopTimer();
    timerUntil = Date.now() + seconds*1000;
    $('#btnTimer').disabled = false;
    tick();
    timerHandle = setInterval(tick, 200);
  }
  function stopTimer(){ if(timerHandle){ clearInterval(timerHandle); timerHandle=null; $('#btnTimer').textContent = `Start ${$('#timerSeconds').value||90}s`; } }
  function tick(){
    const left = Math.max(0, Math.ceil((timerUntil - Date.now())/1000));
    $('#btnTimer').textContent = left>0 ? `${left}s` : 'Done!';
    if(left<=0){ clearInterval(timerHandle); timerHandle=null; navigator.vibrate && navigator.vibrate([100,100,100]); }
  }
  
  // ===== Progress & Charts =====
  function bindProgressView(){
    $('#btnApplyRange').addEventListener('click', ()=> renderProgressChart());
  }
  
  async function refreshProgressSelectors(){
    const exs = await listExercises();
    const sel = $('#progressExercise');
    sel.innerHTML = exs.map(e=>`<option value="${e.id}">${e.name}</option>`).join('');
    if(exs.length===0){ $('#chartHint').textContent = 'Create exercises and log sets to see progress.'; return; }
    await renderProgressChart();
  }
  
  async function renderProgressChart(){
    const exId = $('#progressExercise').value; if(!exId){ destroyChart(state.chart); return; }
    const metric = $('#progressMetric').value;
    const from = $('#dateFrom').value ? new Date($('#dateFrom').value).toISOString() : null;
    const to = $('#dateTo').value ? new Date(new Date($('#dateTo').value).getTime()+86400000-1).toISOString() : null;
    let rows=[];
    if(metric==='best') rows = await getExerciseBestWeightByDate(exId, {from, to});
    else if(metric==='volume') rows = await getExerciseVolumeBySessionDate(exId, {from, to});
    else rows = await getExerciseEst1RMByDate(exId, {from, to});
    const labels = rows.map(r=> r.date);
    const data = rows.map(r=> r.value);
    const units = metric==='best' ? (state.settings.units||'kg') : (metric==='volume' ? `${state.settings.units||'kg'}·reps` : state.settings.units||'kg');
    state.chart = renderLineChart('progressChart', labels, data, `${units}`);
    // Point details list
    const details = $('#chartPointDetails'); details.innerHTML='';
    rows.forEach(r=>{
      const div = document.createElement('div'); div.className='list-item';
      const title = document.createElement('div'); title.className='title'; title.textContent = `${r.date} — ${r.value}`;
      const sub = document.createElement('div'); sub.className='subtitle'; sub.textContent = metric==='best'? 'Best set weight' : metric==='volume'? 'Total session volume' : 'Estimated 1RM';
      div.appendChild(title); div.appendChild(sub); details.appendChild(div);
    });
  }
  
  // ===== Settings & Export =====
  function bindSettingsView(){
    $('#settingUnits').addEventListener('change', async (e)=>{ await setSetting('units', e.target.value); state.settings.units = e.target.value; toast('Units saved'); });
    $('#settingTimer').addEventListener('change', async (e)=>{ await setSetting('restSeconds', Number(e.target.value)||90); state.settings.restSeconds = Number(e.target.value)||90; toast('Saved'); });
    $('#settingIntensity').addEventListener('change', async (e)=>{ await setSetting('intensityMode', e.target.value); state.settings.intensityMode = e.target.value; toast('Saved'); });
  
    // Exports / Imports
    $('#btnExportJSON').addEventListener('click', exportJSON);
    $('#btnImportJSON').addEventListener('click', ()=> $('#inputImportJSON').click());
    $('#inputImportJSON').addEventListener('change', importJSON);
    $('#btnExportCSVAll').addEventListener('click', exportCSVAll);
    $('#btnExportCSVExercise').addEventListener('click', async ()=>{
      const exs = await listExercises(); if(exs.length===0){ toast('No exercises'); return; }
      await openExercisePicker(async (ex)=>{ await exportCSVByExercise(ex.id); });
    });
    $('#btnExportCSVRange').addEventListener('click', async ()=>{
      const from = prompt('From date (YYYY-MM-DD) or blank');
      const to = prompt('To date (YYYY-MM-DD) or blank');
      await exportCSVByDateRange(from||'', to||'');
    });
  }
  
  function applySettingsToUI(){
    $('#settingUnits').value = state.settings.units||'kg';
    $('#settingTimer').value = state.settings.restSeconds||90;
    $('#settingIntensity').value = state.settings.intensityMode||'rpe';
    $('#timerSeconds').value = state.settings.restSeconds||90;
    $('#btnTimer').textContent = `Start ${$('#timerSeconds').value}s`;
  }
  
  // ===== Global refresh helpers =====
  async function refreshAllLists(){
    await refreshExerciseFilters();
    await renderExerciseList();
    await renderTemplateList();
    await refreshStartFromTemplates();
  }
  
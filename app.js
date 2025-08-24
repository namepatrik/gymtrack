/*
  GymTrack • app.js
  Bootstraps the UI and registers the service worker for PWA.
*/

import { DB_VERSION } from './db.js';
import { initUI } from './ui.js';

// --- tiny safe toast used during early init / errors ---
function safeToast(msg, ms = 4000) {
  try {
    const host = document.getElementById('toast');
    if (!host) return;
    const d = document.createElement('div');
    d.className = 'msg';
    d.textContent = String(msg);
    host.appendChild(d);
    setTimeout(() => d.remove(), ms);
  } catch {}
}


window.addEventListener('DOMContentLoaded', async () => {
  // Show schema version if present
  const el = document.getElementById('schemaVersionNum');
  if (el) el.textContent = '1'; // or String(DB_VERSION) if you import it here

  try {
    await initUI();                // <-- your main app boot
  } catch (err) {
    console.error('initUI failed:', err);
    // Show the real error to help you diagnose (you can shorten later)
    safeToast('Failed to initialize app: ' + (err && err.message ? err.message : 'see console'));
  }

  registerSW();                    // PWA registration after UI attempt
});


// Simple one-time toast util in case UI isn't fully booted
let _toasted = false;
function toastOnce(msg){ if(_toasted) return; _toasted=true; const host=document.getElementById('toast'); if(!host) return; const d=document.createElement('div'); d.className='msg'; d.textContent=msg; host.appendChild(d); setTimeout(()=>d.remove(), 2200); }

async function registerSW(){
  if(!('serviceWorker' in navigator)) return;
  try{
    const reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });
    // Listen for updates and prompt to reload
    if(reg.waiting){ promptToReload(reg.waiting); }
    reg.addEventListener('updatefound', ()=>{
      const nw = reg.installing;
      if(!nw) return;
      nw.addEventListener('statechange', ()=>{
        if(nw.state==='installed' && navigator.serviceWorker.controller){ promptToReload(nw); }
      });
    });
  }catch(err){ console.warn('SW registration failed', err); }
}

function promptToReload(sw){
  const host = document.getElementById('toast');
  if(!host) return;
  const div = document.createElement('div');
  div.className = 'msg';
  div.innerHTML = 'Update ready · <button class="btn" style="margin-left:.5rem">Reload</button>';
  const btn = div.querySelector('button');
  btn.addEventListener('click', ()=>{ sw.postMessage({type:'SKIP_WAITING'}); window.location.reload(); });
  host.appendChild(div);
  setTimeout(()=> div.remove(), 10000);
}

// Add to Home Screen UX (non-intrusive)\nlet deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e)=>{
  e.preventDefault();
  deferredPrompt = e;
  // Offer a gentle nudge via toast
  const host = document.getElementById('toast'); if(!host) return;
  const div = document.createElement('div'); div.className='msg';
  const btn = document.createElement('button'); btn.className='btn'; btn.textContent='Install App'; btn.style.marginLeft='.5rem';
  div.textContent = 'Install GymTrack?'; div.appendChild(btn); host.appendChild(div);
  btn.addEventListener('click', async ()=>{ div.remove(); deferredPrompt && deferredPrompt.prompt(); deferredPrompt=null; });
  setTimeout(()=> div.remove(), 10000);
});

// Offline/online feedback
window.addEventListener('online', ()=> notify('You are online'));
window.addEventListener('offline', ()=> notify('Offline – data saves locally'));
function notify(msg){ const host=document.getElementById('toast'); if(!host) return; const d=document.createElement('div'); d.className='msg'; d.textContent=msg; host.appendChild(d); setTimeout(()=>d.remove(), 1500); }

// Surface unexpected runtime errors during navigation/updates
window.addEventListener('error', (e) => {
  // Ignore noisy ResizeObserver errors
  if (String(e?.message || '').includes('ResizeObserver')) return;
  console.error('window error:', e.error || e.message || e);
  safeToast('Error: ' + (e?.message || 'see console'));
});

window.addEventListener('unhandledrejection', (e) => {
  const msg = (e && e.reason && e.reason.message) ? e.reason.message : (e?.reason || 'see console');
  console.error('unhandledrejection:', e);
  safeToast('Error: ' + msg);
});
  
// ============================================================
//  DASHBOARD — AutoTube v8
//  Gemini 2.5 Flash + Unreal Speech + Pollinations AI + YouTube
// ============================================================

const BACKEND = 'https://server-f28i.onrender.com';

// ── STATE ──────────────────────────────────────────────────
const STATE = {
  videos: JSON.parse(localStorage.getItem('autotube_videos') || '[]'),
  credits: {
    gemini:       { used: 0, total: 1500,   unit: 'requêtes' },
    unrealSpeech: { used: 0, total: 250000, unit: 'chars' },
    pollinations: { used: 0, total: 99999,  unit: 'images' },
  },
  ytConnected: !!localStorage.getItem('yt_access_token'),
  ytData: JSON.parse(localStorage.getItem('yt_data') || 'null'),
  pipelineRunning: false,
  currentRun: JSON.parse(localStorage.getItem('current_run') || 'null'),
};

function saveState() {
  localStorage.setItem('autotube_videos', JSON.stringify(STATE.videos));
  localStorage.setItem('autotube_credits', JSON.stringify(STATE.credits));
}

// ── INIT ───────────────────────────────────────────────────
handleOAuthRedirect();

document.addEventListener('DOMContentLoaded', () => {
  const saved = JSON.parse(localStorage.getItem('autotube_credits') || 'null');
  if (saved && saved.gemini && saved.unrealSpeech && saved.pollinations) {
    STATE.credits = saved;
  }
  renderKPIs();
  renderCredits();
  renderPipelineSteps();
  renderVideos();
  renderYouTube();
  checkConfigAlerts();
});

// ── KPIs ───────────────────────────────────────────────────
function renderKPIs() {
  const published = STATE.videos.filter(v => v.status === 'published').length;
  const totalViews = STATE.videos.reduce((s, v) => s + (v.views || 0), 0);
  const totalCost  = STATE.videos.reduce((s, v) => s + (v.cost || 0), 0);
  const avgCost    = published > 0 ? (totalCost / published).toFixed(3) : '—';

  set('kpi-published', published || '0');
  set('kpi-views', totalViews > 1000 ? (totalViews/1000).toFixed(1)+'k' : totalViews || '0');
  set('kpi-cost', published > 0 ? `$${avgCost}` : '—');

  const pcts = Object.values(STATE.credits).map(c => 100 - (c.used/c.total*100));
  const avgPct = Math.round(pcts.reduce((a,b)=>a+b,0)/pcts.length);
  set('kpi-credits', `${avgPct}%`);

  if (avgPct < CONFIG.alerts.dangerThreshold) {
    const el = document.querySelector('.kpi-card.accent');
    if (el) el.style.borderColor = 'rgba(255,59,85,0.4)';
    set('kpi-credits-delta', '⚠ Crédits critiques');
  } else if (avgPct < CONFIG.alerts.warnThreshold) {
    set('kpi-credits-delta', '⚠ Recharger bientôt');
  } else {
    set('kpi-credits-delta', 'Multi-services');
  }

  const week = STATE.videos.filter(v => (Date.now() - new Date(v.date)) < 7*24*3600*1000).length;
  set('kpi-pub-delta', week > 0 ? `+${week} cette semaine` : 'Aucune cette semaine');

  if (STATE.ytData) {
    set('kpi-views', STATE.ytData.viewCount > 1000
      ? (STATE.ytData.viewCount/1000).toFixed(1)+'k'
      : STATE.ytData.viewCount);
    set('kpi-views-delta', `${STATE.ytData.subscriberCount} abonnés`);
  }
}

// ── CRÉDITS ────────────────────────────────────────────────
function renderCredits() {
  const labels = {
    gemini:       { name: 'Gemini API',      icon: '◆' },
    unrealSpeech: { name: 'Unreal Speech',   icon: '◎' },
    pollinations: { name: 'Pollinations AI', icon: '◈' },
  };

  const html = Object.entries(labels).map(([key, label]) => {
    const c = STATE.credits[key] || { used: 0, total: 1, unit: '' };
    const pct = Math.max(0, 100 - (c.used / c.total * 100));
    const cls = pct < CONFIG.alerts.dangerThreshold ? 'danger'
              : pct < CONFIG.alerts.warnThreshold   ? 'warn' : '';
    const remaining = `${(c.total - c.used).toLocaleString()} ${c.unit} restant`;

    return `<div class="credit-item">
      <div class="credit-header">
        <span class="credit-name">${label.icon} ${label.name}</span>
        <span class="credit-value ${cls}">${key === 'pollinations' ? '∞ Gratuit' : Math.round(pct)+'%'}</span>
      </div>
      <div class="credit-bar">
        <div class="credit-fill ${cls}" style="width:${key === 'pollinations' ? 100 : pct}%"></div>
      </div>
      <div style="font-size:11px;color:var(--text3);margin-top:4px">${key === 'pollinations' ? 'Illimité · aucune clé requise' : remaining}</div>
    </div>`;
  }).join('');

  document.getElementById('credits-list').innerHTML = html;
}

async function refreshCredits() {
  showToast('Actualisation des crédits…', 'info');
  saveState();
  renderCredits();
  renderKPIs();
  showToast('Crédits actualisés ✓', 'success');
}

// ── PIPELINE STEPS ─────────────────────────────────────────
const PIPELINE_STEPS_DEF = [
  { id: 'idea',    name: 'Génération du script',  icon: '◆', detail: 'Gemini 2.5 Flash via Render' },
  { id: 'voice',   name: 'Synthèse vocale',        icon: '◎', detail: 'Unreal Speech via Render' },
  { id: 'images',  name: "Génération d'images",    icon: '◈', detail: 'Pollinations AI — gratuit' },
  { id: 'edit',    name: 'Assemblage + Publication', icon: '▦', detail: 'ffmpeg + YouTube API' },
  { id: 'publish', name: 'Vidéo publiée',          icon: '▶', detail: 'YouTube Shorts' },
];

function renderPipelineSteps(runData) {
  const steps = runData || STATE.currentRun;
  const html = PIPELINE_STEPS_DEF.map(s => {
    const st = steps ? steps[s.id] : 'idle';
    const cls = st === 'done' ? 'done' : st === 'running' ? 'running' : st === 'error' ? 'error' : '';
    const ico = st === 'done' ? '✓' : st === 'running' ? '…' : st === 'error' ? '✕' : s.icon;
    const detail = steps && steps[s.id+'_detail'] ? steps[s.id+'_detail'] : s.detail;
    const time   = steps && steps[s.id+'_time']   ? steps[s.id+'_time']   : '';
    return `<div class="pipeline-step">
      <div class="step-icon ${cls}">${ico}</div>
      <div class="step-info">
        <div class="step-name">${s.name}</div>
        <div class="step-detail">${detail}</div>
      </div>
      <div class="step-time">${time}</div>
    </div>`;
  }).join('');
  document.getElementById('pipeline-steps').innerHTML = html;

  const badge = document.getElementById('pipeline-status-badge');
  if (!steps) {
    badge.textContent = 'En attente'; badge.className = 'panel-badge';
  } else if (Object.values(steps).includes('running')) {
    badge.textContent = 'En cours'; badge.className = 'panel-badge running';
  } else if (Object.values(steps).includes('error')) {
    badge.textContent = 'Erreur'; badge.className = 'panel-badge error';
  } else {
    badge.textContent = 'Terminé'; badge.className = 'panel-badge running';
  }
}

// ── VIDÉOS ─────────────────────────────────────────────────
function renderVideos() {
  if (STATE.videos.length === 0) {
    document.getElementById('videos-list').innerHTML = `
      <div style="padding:32px;text-align:center;color:var(--text3);font-size:13px">
        Aucune vidéo encore. Lance ton premier pipeline !
      </div>`;
    return;
  }
  const html = STATE.videos.slice(0,6).map(v => {
    const statusLabel = { published:'Publié', processing:'En cours', error:'Erreur', draft:'Brouillon' };
    const date = new Date(v.date).toLocaleDateString('fr-FR', { day:'numeric', month:'short' });
    return `<div class="video-item" onclick="openVideo('${v.id}')">
      <div class="video-thumb">${v.thumb ? `<img src="${v.thumb}" alt="">` : '▶'}</div>
      <div class="video-info">
        <div class="video-title">${v.title || 'Sans titre'}</div>
        <div class="video-meta">${date} · ${v.views||0} vues · $${(v.cost||0).toFixed(3)}</div>
      </div>
      <span class="video-status ${v.status}">${statusLabel[v.status]||v.status}</span>
    </div>`;
  }).join('');
  document.getElementById('videos-list').innerHTML = html;
}

function openVideo(id) {
  const v = STATE.videos.find(x => x.id === id);
  if (v && v.youtubeId) window.open(`https://studio.youtube.com/video/${v.youtubeId}/edit`, '_blank');
}

// ── YOUTUBE ────────────────────────────────────────────────
function renderYouTube() {
  const btn = document.getElementById('yt-connect-btn');
  if (!STATE.ytConnected || !STATE.ytData) {
    if (btn) btn.textContent = 'Connecter →';
    return;
  }
  const d = STATE.ytData;
  document.getElementById('yt-stats').innerHTML = `
    <div class="yt-stats-grid">
      <div class="yt-stat-item">
        <div class="yt-stat-label">Abonnés</div>
        <div class="yt-stat-value">${parseInt(d.subscriberCount||0).toLocaleString()}</div>
        <div class="yt-stat-delta up">Chaîne connectée</div>
      </div>
      <div class="yt-stat-item">
        <div class="yt-stat-label">Vues totales</div>
        <div class="yt-stat-value">${parseInt(d.viewCount||0).toLocaleString()}</div>
        <div class="yt-stat-delta">Depuis création</div>
      </div>
      <div class="yt-stat-item">
        <div class="yt-stat-label">Vidéos</div>
        <div class="yt-stat-value">${d.videoCount||0}</div>
        <div class="yt-stat-delta">Publiées</div>
      </div>
      <div class="yt-stat-item">
        <div class="yt-stat-label">Chaîne</div>
        <div class="yt-stat-value" style="font-size:14px;line-height:1.3">${d.title||'—'}</div>
        <div class="yt-stat-delta"><a href="https://studio.youtube.com" target="_blank" style="color:var(--yt-red)">Ouvrir Studio →</a></div>
      </div>
    </div>`;
  if (btn) btn.textContent = '✓ Connecté';
}

async function connectYoutube() {
  if (!CONFIG.youtube.clientId) {
    showToast('Configure d\'abord ton Client ID YouTube dans Config', 'warn');
    setTimeout(() => window.location.href = 'pages/settings.html', 1500);
    return;
  }
  const redirectUri = 'https://eugeneglencoe-collab.github.io/youtube-video/index.html';
  const params = new URLSearchParams({
    client_id: CONFIG.youtube.clientId,
    redirect_uri: redirectUri,
    response_type: 'token',
    scope: CONFIG.youtube.scopes.join(' '),
    include_granted_scopes: 'true',
  });
  window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

function handleOAuthRedirect() {
  const hash = window.location.hash;
  if (!hash || hash.length < 2) return;
  const params = new URLSearchParams(hash.slice(1));
  const token = params.get('access_token');
  if (!token) return;
  localStorage.setItem('yt_access_token', token);
  STATE.ytConnected = true;
  history.replaceState(null, '', window.location.pathname);
  document.addEventListener('DOMContentLoaded', () => {
    showToast('YouTube connecté ! Chargement des stats…', 'success');
    fetchYouTubeStats(token);
  });
}

async function fetchYouTubeStats(token) {
  try {
    const r = await fetch(
      'https://www.googleapis.com/youtube/v3/channels?part=statistics,snippet&mine=true',
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const data = await r.json();
    if (data.items && data.items[0]) {
      const ch = data.items[0];
      STATE.ytData = { title: ch.snippet.title, ...ch.statistics };
      localStorage.setItem('yt_data', JSON.stringify(STATE.ytData));
      renderYouTube();
      renderKPIs();
    } else {
      showToast('Aucune chaîne YouTube trouvée sur ce compte', 'warn');
    }
  } catch(e) {
    showToast('Erreur chargement YouTube', 'error');
    console.error(e);
  }
}

// ── LAUNCH MODAL ───────────────────────────────────────────
function openLaunch() {
  CONFIG.gemini.apiKey       = localStorage.getItem('gemini_api_key') || '';
  CONFIG.unrealSpeech.apiKey = localStorage.getItem('unrealspeech_api_key') || '';
  CONFIG.youtube.clientId    = localStorage.getItem('yt_client_id') || '';

  // Pollinations n'a pas besoin de clé
  const missing = [];
  if (!CONFIG.gemini.apiKey)      missing.push('Gemini');
  if (!CONFIG.unrealSpeech.apiKey) missing.push('Unreal Speech');
  if (!CONFIG.youtube.clientId)   missing.push('YouTube');

  if (missing.length > 0) {
    showToast(`Configure d'abord : ${missing.join(', ')}`, 'warn');
    setTimeout(() => window.location.href = 'pages/settings.html', 1500);
    return;
  }
  document.getElementById('launch-modal').classList.add('open');
}

function closeLaunch(e) {
  if (!e || e.target === document.getElementById('launch-modal')) {
    document.getElementById('launch-modal').classList.remove('open');
  }
}

async function launchPipeline() {
  const topic    = document.getElementById('video-topic').value.trim();
  const voice    = document.getElementById('voice-style').value;
  const duration = document.getElementById('video-duration').value;
  const tags     = document.getElementById('video-tags').value.split(',').map(t=>t.trim()).filter(Boolean);

  if (!topic) { showToast('Saisis un sujet pour la vidéo', 'warn'); return; }
  if (STATE.pipelineRunning) { showToast('Un pipeline est déjà en cours', 'warn'); return; }

  closeLaunch();
  STATE.pipelineRunning = true;
  showToast('Pipeline lancé ! Suis l\'avancement ci-dessous…', 'success');

  const runId = Date.now().toString();
  const run = { id: runId, topic, voice, duration, tags, idea: 'running', idea_detail: 'Gemini génère le script…' };
  STATE.currentRun = run;
  localStorage.setItem('current_run', JSON.stringify(run));
  renderPipelineSteps(run);

  try {
    // ÉTAPE 1 — Script
    const script = await generateScript(topic, tags, duration);
    updateRun(run, 'idea', 'done', `"${script.title.slice(0,40)}…"`);
    updateRun(run, 'voice', 'running', 'Unreal Speech en cours…');

    // ÉTAPE 2 — Voix
    const audioUrl = await generateVoice(script.narration, voice);
    updateRun(run, 'voice', 'done', 'Audio généré ✓');
    updateRun(run, 'images', 'running', '0/4 images…');

    // ÉTAPE 3 — Images (URLs Pollinations — pas de base64 !)
    const imageUrls = await generateImageUrls(script.imagePrompts, run);
    updateRun(run, 'images', 'done', `${imageUrls.length} images générées`);
    updateRun(run, 'edit', 'running', 'Assemblage ffmpeg + upload YouTube…');

    // ÉTAPES 4 & 5 — Assemblage + Publication (tout côté serveur)
    const ytToken = localStorage.getItem('yt_access_token');

    const assembleResp = await fetch(`${BACKEND}/assemble-and-publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageUrls,  // ← URLs simples, pas de base64
        audioUrl,
        script,
        tags,
        ytToken,
      }),
    });

    if (!assembleResp.ok) {
      const e = await assembleResp.json().catch(() => ({}));
      throw new Error(`Assemblage : ${e.error || assembleResp.status}`);
    }

    const assembleData = await assembleResp.json();
    updateRun(run, 'edit', 'done', 'Vidéo MP4 assemblée ✓');
    updateRun(run, 'publish', 'done', `youtu.be/${assembleData.youtubeId}`);

    const videoEntry = {
      id: runId,
      title: script.title,
      description: script.description,
      date: new Date().toISOString(),
      status: 'published',
      youtubeId: assembleData.youtubeId,
      views: 0,
      cost: 0,
    };
    STATE.videos.unshift(videoEntry);
    saveState();
    renderVideos();
    renderKPIs();
    showToast(`✓ Short publié : "${script.title}"`, 'success');

  } catch(err) {
    const runningStep = PIPELINE_STEPS_DEF.find(s => run[s.id] === 'running');
    if (runningStep) updateRun(run, runningStep.id, 'error', err.message);
    showToast(`Erreur : ${err.message}`, 'error');
    console.error(err);
  } finally {
    STATE.pipelineRunning = false;
  }
}

function updateRun(run, step, status, detail) {
  run[step] = status;
  run[step+'_detail'] = detail;
  run[step+'_time'] = new Date().toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'});
  STATE.currentRun = run;
  localStorage.setItem('current_run', JSON.stringify(run));
  renderPipelineSteps(run);
}

// ── API CALLS ──────────────────────────────────────────────

async function generateScript(topic, tags, duration) {
  const resp = await fetch(`${BACKEND}/generate-script`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic, tags, duration, apiKey: CONFIG.gemini.apiKey }),
  });
  if (!resp.ok) {
    const e = await resp.json().catch(() => ({}));
    throw new Error(`Script : ${e.error || resp.status}`);
  }
  const data = await resp.json();
  STATE.credits.gemini.used += 1;
  saveState(); renderCredits();
  return data.script;
}

async function generateVoice(text, voiceName) {
  const resp = await fetch(`${BACKEND}/generate-voice`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voiceId: voiceName, apiKey: CONFIG.unrealSpeech.apiKey }),
  });
  if (!resp.ok) {
    const e = await resp.json().catch(() => ({}));
    throw new Error(`Voix : ${e.error || resp.status}`);
  }
  const data = await resp.json();
  STATE.credits.unrealSpeech.used += text.length;
  saveState(); renderCredits();
  return data.audioUrl;
}

// Génère des URLs Pollinations directement — aucun appel au backend, aucun base64
async function generateImageUrls(prompts, run) {
  const urls = [];
  const total = Math.min(prompts.length, 4);

  for (let i = 0; i < total; i++) {
    updateRun(run, 'images', 'running', `${i}/${total} images…`);

    const encodedPrompt = encodeURIComponent(
      `${prompts[i]}, vertical 9:16, cinematic, high quality, 4k`
    );
    // URL Pollinations directe — le serveur la télécharge lui-même
    const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=768&height=1344&nologo=true&enhance=true&seed=${Date.now()+i}`;
    urls.push(url);

    // Délai pour éviter le rate limit
    await new Promise(r => setTimeout(r, 2000));
  }

  STATE.credits.pollinations.used += total;
  saveState(); renderCredits();
  return urls;
}

// ── ALERTES ────────────────────────────────────────────────
function checkCreditAlerts() {
  ['gemini', 'unrealSpeech'].forEach(key => {
    const c = STATE.credits[key];
    if (!c) return;
    const pct = 100 - (c.used / c.total * 100);
    if (pct < CONFIG.alerts.dangerThreshold) {
      showToast(`⚠ ${key} : crédits critiques (${Math.round(pct)}% restant)`, 'error');
    } else if (pct < CONFIG.alerts.warnThreshold) {
      showToast(`${key} : crédits bas (${Math.round(pct)}%)`, 'warn');
    }
  });
}

function checkConfigAlerts() {
  const missing = [];
  if (!localStorage.getItem('gemini_api_key'))       missing.push('Gemini');
  if (!localStorage.getItem('unrealspeech_api_key')) missing.push('Unreal Speech');
  if (!localStorage.getItem('yt_client_id'))         missing.push('YouTube');
  if (missing.length > 0) {
    showToast(`Clés manquantes : ${missing.join(', ')} → va dans Config`, 'warn');
  }
}

// ── UTILS ──────────────────────────────────────────────────
function set(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

// ── TOASTS ─────────────────────────────────────────────────
let toastContainer = null;
function showToast(msg, type = 'info') {
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.className = 'toast-container';
    document.body.appendChild(toastContainer);
  }
  const icons = { success:'✓', warn:'⚠', error:'✕', info:'ℹ' };
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<span style="color:var(--${type==='info'?'info':type==='success'?'accent':type==='warn'?'warn':'danger'})">${icons[type]}</span> ${msg}`;
  toastContainer.appendChild(t);
  setTimeout(() => t.remove(), 4000);
}

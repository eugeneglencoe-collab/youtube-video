// ============================================================
//  DASHBOARD — AutoTube v3
//  Gemini 2.5 Flash + OpenAI TTS + Replicate + YouTube
// ============================================================

const BACKEND = 'https://server-f28i.onrender.com';

// ── STATE ──────────────────────────────────────────────────
const STATE = {
  videos: JSON.parse(localStorage.getItem('autotube_videos') || '[]'),
  credits: JSON.parse(localStorage.getItem('autotube_credits') || 'null') || {
    gemini:    { used: 0, total: 1500,  unit: 'requêtes' },
    openai:    { used: 0, total: 50000, unit: 'chars' },
    replicate: { used: 0, total: 5000,  unit: 'cents' },
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
// Gérer le redirect OAuth EN PREMIER, avant tout le reste
handleOAuthRedirect();

document.addEventListener('DOMContentLoaded', () => {
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
    gemini:    { name: 'Gemini API',  icon: '◆' },
    openai:    { name: 'OpenAI TTS',  icon: '◎' },
    replicate: { name: 'Replicate',   icon: '◈' },
  };

  const html = Object.entries(STATE.credits).map(([key, c]) => {
    const pct = Math.max(0, 100 - (c.used / c.total * 100));
    const cls = pct < CONFIG.alerts.dangerThreshold ? 'danger'
              : pct < CONFIG.alerts.warnThreshold   ? 'warn' : '';
    const remaining = c.unit === 'cents'
      ? `$${((c.total - c.used)/100).toFixed(2)} restant`
      : `${(c.total - c.used).toLocaleString()} ${c.unit} restant`;

    return `<div class="credit-item">
      <div class="credit-header">
        <span class="credit-name">${labels[key].icon} ${labels[key].name}</span>
        <span class="credit-value ${cls}">${Math.round(pct)}%</span>
      </div>
      <div class="credit-bar">
        <div class="credit-fill ${cls}" style="width:${pct}%"></div>
      </div>
      <div style="font-size:11px;color:var(--text3);margin-top:4px">${remaining}</div>
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
  { id: 'voice',   name: 'Synthèse vocale',        icon: '◎', detail: 'OpenAI TTS via Render' },
  { id: 'images',  name: "Génération d'images",    icon: '◈', detail: 'Replicate SDXL via Render' },
  { id: 'edit',    name: 'Assemblage vidéo',        icon: '▦', detail: 'Remotion' },
  { id: 'publish', name: 'Publication YouTube',    icon: '▶', detail: 'YouTube Data API v3' },
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
    // Afficher le placeholder si pas connecté
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

  // redirect_uri = URL exacte de index.html
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
  // Lire le hash AVANT qu'il soit effacé
  const hash = window.location.hash;
  if (!hash || hash.length < 2) return;

  const params = new URLSearchParams(hash.slice(1));
  const token = params.get('access_token');
  if (!token) return;

  // Sauvegarder le token
  localStorage.setItem('yt_access_token', token);
  STATE.ytConnected = true;

  // Effacer le hash proprement sans rechargement
  history.replaceState(null, '', window.location.pathname);

  // Charger les stats après que le DOM soit prêt
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
  // Recharger les clés depuis localStorage au cas où elles ont été ajoutées
  CONFIG.gemini.apiKey  = localStorage.getItem('gemini_api_key') || '';
  CONFIG.openai.apiKey  = localStorage.getItem('openai_api_key') || '';
  CONFIG.replicate.apiKey = localStorage.getItem('replicate_api_key') || '';
  CONFIG.youtube.clientId = localStorage.getItem('yt_client_id') || '';

  const missing = checkConfig();
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
  const run = { id: runId, topic, voice, duration, tags, idea: 'running', idea_detail: 'Gemini 2.5 Flash génère le script…' };
  STATE.currentRun = run;
  localStorage.setItem('current_run', JSON.stringify(run));
  renderPipelineSteps(run);

  try {
    // ÉTAPE 1 — Script via Gemini
    const script = await generateScript(topic, tags, duration);
    updateRun(run, 'idea', 'done', `"${script.title.slice(0,40)}…"`);
    updateRun(run, 'voice', 'running', 'OpenAI TTS en cours…');

    // ÉTAPE 2 — Voix via OpenAI TTS
    const audioBlob = await generateVoice(script.narration, voice);
    updateRun(run, 'voice', 'done', `Audio ${Math.round(audioBlob.size/1024)} KB`);
    updateRun(run, 'images', 'running', `0/${CONFIG.defaults.imagesPerVideo} images…`);

    // ÉTAPE 3 — Images via Replicate
    const images = await generateImages(script.imagePrompts, run);
    updateRun(run, 'images', 'done', `${images.length} images générées`);
    updateRun(run, 'edit', 'running', 'Assemblage…');

    // ÉTAPE 4 — Assemblage
    await sleep(1500);
    updateRun(run, 'edit', 'done', 'Vidéo assemblée');
    updateRun(run, 'publish', 'running', 'Upload YouTube…');

    // ÉTAPE 5 — Publication YouTube
    const ytResult = await publishToYouTube(script, tags);
    updateRun(run, 'publish', 'done', `ID : ${ytResult.id || '—'}`);

    const videoEntry = {
      id: runId,
      title: script.title,
      description: script.description,
      date: new Date().toISOString(),
      status: 'published',
      youtubeId: ytResult.id,
      views: 0,
      cost: estimateCost(script),
    };
    STATE.videos.unshift(videoEntry);
    saveState();
    renderVideos();
    renderKPIs();
    showToast(`✓ Vidéo publiée : "${script.title}"`, 'success');

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
    body: JSON.stringify({
      topic, tags, duration,
      apiKey: CONFIG.gemini.apiKey,
    }),
  });

  if (!resp.ok) {
    const e = await resp.json().catch(() => ({}));
    throw new Error(`Script : ${e.error || resp.status}`);
  }

  const data = await resp.json();
  STATE.credits.gemini.used += 1;
  saveState();
  renderCredits();
  checkCreditAlerts();

  return data.script;
}

async function generateVoice(text, voiceName) {
  const resp = await fetch(`${BACKEND}/generate-voice`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      voiceId: voiceName,
      apiKey: CONFIG.openai.apiKey,
    }),
  });

  if (!resp.ok) {
    const e = await resp.json().catch(() => ({}));
    throw new Error(`Voix : ${e.error || resp.status}`);
  }

  STATE.credits.openai.used += text.length;
  saveState();
  renderCredits();
  checkCreditAlerts();

  return await resp.blob();
}

async function generateImages(prompts, run) {
  const results = [];
  const total = Math.min(prompts.length, CONFIG.defaults.imagesPerVideo);

  for (let i = 0; i < total; i++) {
    updateRun(run, 'images', 'running', `${i}/${total} images générées…`);

    const resp = await fetch(`${BACKEND}/generate-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: prompts[i],
        apiKey: CONFIG.replicate.apiKey,
      }),
    });

    if (!resp.ok) {
      const e = await resp.json().catch(() => ({}));
      throw new Error(`Image ${i+1} : ${e.error || resp.status}`);
    }

    const data = await resp.json();
    results.push(data.url);

    STATE.credits.replicate.used += 2;
    saveState();
    renderCredits();
    checkCreditAlerts();
  }

  return results;
}

async function publishToYouTube(script, tags) {
  const token = localStorage.getItem('yt_access_token');
  if (!token) throw new Error('YouTube non connecté — connecte ta chaîne dans le dashboard');

  const meta = {
    snippet: {
      title: script.title,
      description: script.description,
      tags: [...(script.tags || []), ...tags],
      categoryId: '22',
      defaultLanguage: 'fr',
    },
    status: { privacyStatus: CONFIG.defaults.uploadPrivacy },
  };

  const r = await fetch(
    'https://www.googleapis.com/youtube/v3/videos?part=snippet,status',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(meta),
    }
  );

  if (!r.ok) {
    const e = await r.json();
    throw new Error(`YouTube : ${e.error?.message || r.status}`);
  }
  return await r.json();
}

// ── ALERTES CRÉDITS ────────────────────────────────────────
function checkCreditAlerts() {
  Object.entries(STATE.credits).forEach(([key, c]) => {
    const pct = 100 - (c.used / c.total * 100);
    if (pct < CONFIG.alerts.dangerThreshold) {
      showToast(`⚠ ${key} : crédits critiques (${Math.round(pct)}% restant)`, 'error');
    } else if (pct < CONFIG.alerts.warnThreshold) {
      showToast(`${key} : crédits bas (${Math.round(pct)}%)`, 'warn');
    }
  });
}

function checkConfigAlerts() {
  const missing = checkConfig();
  if (missing.length > 0) {
    showToast(`Clés manquantes : ${missing.join(', ')} → va dans Config`, 'warn');
  }
}

// ── UTILS ──────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function estimateCost(script) {
  const voiceCost = (script.narration.length / 1000) * 0.015;
  const imageCost = CONFIG.defaults.imagesPerVideo * 0.002;
  return parseFloat((voiceCost + imageCost).toFixed(4));
}

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

// ============================================================
//  DASHBOARD — AutoTube
// ============================================================

// ── STATE ──────────────────────────────────────────────────
const STATE = {
  videos: JSON.parse(localStorage.getItem('autotube_videos') || '[]'),
  credits: JSON.parse(localStorage.getItem('autotube_credits') || 'null') || {
    claude:      { used: 0, total: 500000, unit: 'tokens' },
    elevenlabs:  { used: 0, total: 10000,  unit: 'chars' },
    replicate:   { used: 0, total: 5000,   unit: 'cents' }, // $50 = 5000 cents
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

  // Crédits globaux : % moyen restant
  const pcts = Object.values(STATE.credits).map(c => 100 - (c.used/c.total*100));
  const avgPct = Math.round(pcts.reduce((a,b)=>a+b,0)/pcts.length);
  set('kpi-credits', `${avgPct}%`);

  if (avgPct < CONFIG.alerts.dangerThreshold) {
    document.querySelector('.kpi-card.accent').style.borderColor = 'rgba(255,59,85,0.4)';
    set('kpi-credits-delta', '⚠ Crédits critiques');
  } else if (avgPct < CONFIG.alerts.warnThreshold) {
    set('kpi-credits-delta', '⚠ Recharger bientôt');
  }

  // Delta vidéos cette semaine
  const week = STATE.videos.filter(v => {
    const d = new Date(v.date);
    return (Date.now() - d) < 7*24*3600*1000;
  }).length;
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
    claude:     { name: 'Claude API', icon: '⬡', unitLabel: 'tokens' },
    elevenlabs: { name: 'ElevenLabs', icon: '◎', unitLabel: 'chars' },
    replicate:  { name: 'Replicate',  icon: '◈', unitLabel: 'crédits ($)' },
  };

  const html = Object.entries(STATE.credits).map(([key, c]) => {
    const pct  = Math.max(0, 100 - (c.used / c.total * 100));
    const cls  = pct < CONFIG.alerts.dangerThreshold ? 'danger'
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

  // ElevenLabs — API publique pour le quota
  if (CONFIG.elevenlabs.apiKey) {
    try {
      const r = await fetch('https://api.elevenlabs.io/v1/user', {
        headers: { 'xi-api-key': CONFIG.elevenlabs.apiKey }
      });
      if (r.ok) {
        const d = await r.json();
        STATE.credits.elevenlabs.used = d.subscription.character_count;
        STATE.credits.elevenlabs.total = d.subscription.character_limit;
      }
    } catch(e) { console.warn('ElevenLabs quota:', e); }
  }

  saveState();
  renderCredits();
  renderKPIs();
  showToast('Crédits actualisés ✓', 'success');
}

// ── PIPELINE STEPS ─────────────────────────────────────────
const PIPELINE_STEPS_DEF = [
  { id: 'idea',    name: 'Génération du script',   icon: '⬡', detail: 'Claude API' },
  { id: 'voice',   name: 'Synthèse vocale',         icon: '◎', detail: 'ElevenLabs' },
  { id: 'images',  name: "Génération d'images",     icon: '◈', detail: 'Replicate / SDXL' },
  { id: 'edit',    name: 'Assemblage vidéo',         icon: '▦', detail: 'Remotion' },
  { id: 'publish', name: 'Publication YouTube',     icon: '▶', detail: 'YouTube Data API v3' },
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

  // Badge
  if (!steps) {
    document.getElementById('pipeline-status-badge').textContent = 'En attente';
    document.getElementById('pipeline-status-badge').className = 'panel-badge';
  } else if (Object.values(steps).includes('running')) {
    document.getElementById('pipeline-status-badge').textContent = 'En cours';
    document.getElementById('pipeline-status-badge').className = 'panel-badge running';
  } else if (Object.values(steps).includes('error')) {
    document.getElementById('pipeline-status-badge').textContent = 'Erreur';
    document.getElementById('pipeline-status-badge').className = 'panel-badge error';
  } else {
    document.getElementById('pipeline-status-badge').textContent = 'Terminé';
    document.getElementById('pipeline-status-badge').className = 'panel-badge running';
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
      <div class="video-thumb">
        ${v.thumb ? `<img src="${v.thumb}" alt="">` : '▶'}
      </div>
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
  if (!v) return;
  if (v.youtubeId) {
    window.open(`https://studio.youtube.com/video/${v.youtubeId}/edit`, '_blank');
  }
}

// ── YOUTUBE ────────────────────────────────────────────────
function renderYouTube() {
  if (!STATE.ytConnected || !STATE.ytData) return;
  const d = STATE.ytData;
  document.getElementById('yt-stats').innerHTML = `
    <div class="yt-stats-grid">
      <div class="yt-stat-item">
        <div class="yt-stat-label">Abonnés</div>
        <div class="yt-stat-value">${parseInt(d.subscriberCount).toLocaleString()}</div>
        <div class="yt-stat-delta up">Chaîne connectée</div>
      </div>
      <div class="yt-stat-item">
        <div class="yt-stat-label">Vues totales</div>
        <div class="yt-stat-value">${parseInt(d.viewCount).toLocaleString()}</div>
        <div class="yt-stat-delta">Depuis création</div>
      </div>
      <div class="yt-stat-item">
        <div class="yt-stat-label">Vidéos</div>
        <div class="yt-stat-value">${d.videoCount}</div>
        <div class="yt-stat-delta">Publiées</div>
      </div>
      <div class="yt-stat-item">
        <div class="yt-stat-label">Chaîne</div>
        <div class="yt-stat-value" style="font-size:14px;line-height:1.3">${d.title}</div>
        <div class="yt-stat-delta"><a href="https://studio.youtube.com" target="_blank" style="color:var(--yt-red)">Ouvrir Studio →</a></div>
      </div>
    </div>`;
  document.getElementById('yt-connect-btn').textContent = '✓ Connecté';
}

async function connectYoutube() {
  if (!CONFIG.youtube.clientId) {
    showToast('Configure d\'abord ton Client ID YouTube dans Config', 'warn');
    setTimeout(() => window.location.href = 'pages/settings.html', 1500);
    return;
  }
  const params = new URLSearchParams({
    client_id: CONFIG.youtube.clientId,
    redirect_uri: window.location.origin + window.location.pathname,
    response_type: 'token',
    scope: CONFIG.youtube.scopes.join(' '),
    include_granted_scopes: 'true',
  });
  window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

// Gestion du redirect OAuth (token dans l'URL)
function handleOAuthRedirect() {
  const hash = window.location.hash;
  if (!hash) return;
  const params = new URLSearchParams(hash.slice(1));
  const token = params.get('access_token');
  if (!token) return;
  localStorage.setItem('yt_access_token', token);
  STATE.ytConnected = true;
  window.location.hash = '';
  showToast('YouTube connecté ! Chargement des stats…', 'success');
  fetchYouTubeStats(token);
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
      STATE.ytData = {
        title: ch.snippet.title,
        ...ch.statistics,
      };
      localStorage.setItem('yt_data', JSON.stringify(STATE.ytData));
      renderYouTube();
      renderKPIs();
    }
  } catch(e) {
    showToast('Erreur chargement YouTube', 'error');
  }
}

handleOAuthRedirect();

// ── LAUNCH MODAL ───────────────────────────────────────────
function openLaunch() {
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
  const tags     = document.getElementById('video-tags').value.split(',').map(t=>t.trim());

  if (!topic) { showToast('Saisis un sujet pour la vidéo', 'warn'); return; }

  closeLaunch();
  showToast('Pipeline lancé ! Suivi dans le dashboard…', 'success');

  const runId = Date.now().toString();
  const run = {
    id: runId,
    topic, voice, duration, tags,
    idea: 'running', idea_detail: 'Appel Claude API…',
  };
  STATE.currentRun = run;
  localStorage.setItem('current_run', JSON.stringify(run));
  renderPipelineSteps(run);

  try {
    // ÉTAPE 1 — Script via Claude
    const script = await generateScript(topic, tags, duration);
    updateRun(run, 'idea', 'done', `Script généré (${script.title.slice(0,30)}…)`);
    updateRun(run, 'voice', 'running', 'ElevenLabs en cours…');

    // ÉTAPE 2 — Voix via ElevenLabs
    const audioBlob = await generateVoice(script.narration, voice);
    updateRun(run, 'voice', 'done', `Audio ${Math.round(audioBlob.size/1024)} KB`);
    updateRun(run, 'images', 'running', 'Replicate SDXL…');

    // ÉTAPE 3 — Images via Replicate
    const images = await generateImages(script.imagePrompts);
    updateRun(run, 'images', 'done', `${images.length} images générées`);
    updateRun(run, 'edit', 'running', 'Assemblage…');

    // ÉTAPE 4 — Assemblage (placeholder — Remotion nécessite Node.js)
    await simulateAssembly();
    updateRun(run, 'edit', 'done', 'Vidéo assemblée');
    updateRun(run, 'publish', 'running', 'Upload YouTube…');

    // ÉTAPE 5 — Publication YouTube
    const ytResult = await publishToYouTube(script, tags);
    updateRun(run, 'publish', 'done', `Publié : ${ytResult.id}`);

    // Enregistrement
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
    showToast(`Vidéo publiée ! "${script.title}"`, 'success');

  } catch(err) {
    const failedStep = Object.keys(run).find(k => run[k] === 'running') || 'publish';
    updateRun(run, failedStep.replace('_detail',''), 'error', err.message);
    showToast(`Erreur : ${err.message}`, 'error');
    console.error(err);
  }
}

function updateRun(run, step, status, detail) {
  run[step] = status;
  run[step+'_detail'] = detail;
  run[step+'_time'] = new Date().toLocaleTimeString('fr-FR', {hour:'2-digit',minute:'2-digit'});
  STATE.currentRun = run;
  localStorage.setItem('current_run', JSON.stringify(run));
  renderPipelineSteps(run);
}

// ── API CALLS ──────────────────────────────────────────────

async function generateScript(topic, tags, duration) {
  const prompt = `Tu es un expert en création de contenu YouTube francophone.

Génère un script complet pour une vidéo YouTube sur : "${topic}"
Tags/Niche : ${tags.join(', ')}
Durée cible : ${duration}

Réponds UNIQUEMENT en JSON valide avec cette structure :
{
  "title": "Titre accrocheur (max 60 chars)",
  "description": "Description YouTube complète avec keywords (300-500 chars)",
  "tags": ["tag1", "tag2", ...],
  "narration": "Script complet de narration à lire (doit coller à la durée cible)",
  "imagePrompts": ["prompt image 1", "prompt image 2", ..., "prompt image 8"],
  "thumbnailPrompt": "Prompt pour la miniature YouTube (ultra accrocheur)"
}`;

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': CONFIG.claude.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: CONFIG.claude.model,
      max_tokens: CONFIG.claude.maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!resp.ok) {
    const e = await resp.json();
    throw new Error(`Claude API : ${e.error?.message || resp.status}`);
  }

  const data = await resp.json();
  const text = data.content[0].text;
  const clean = text.replace(/```json|```/g, '').trim();

  // Mise à jour crédits Claude
  STATE.credits.claude.used += data.usage?.input_tokens + data.usage?.output_tokens || 1500;
  saveState();
  renderCredits();

  return JSON.parse(clean);
}

async function generateVoice(text, voiceName) {
  const voiceId = CONFIG.elevenlabs.voices[voiceName] || CONFIG.elevenlabs.voices['Neutre (Adam)'];
  const resp = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': CONFIG.elevenlabs.apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text: text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  });

  if (!resp.ok) throw new Error(`ElevenLabs : ${resp.status}`);

  // Mise à jour crédits
  STATE.credits.elevenlabs.used += text.length;
  checkCreditAlerts();
  saveState();
  renderCredits();

  return await resp.blob();
}

async function generateImages(prompts) {
  const results = [];
  for (const prompt of prompts.slice(0, CONFIG.defaults.imagesPerVideo)) {
    const resp = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${CONFIG.replicate.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        version: CONFIG.replicate.model.split(':')[1],
        input: {
          prompt: `${prompt}, ${CONFIG.defaults.imageStyle}`,
          width: 1280, height: 720,
        },
      }),
    });
    if (!resp.ok) throw new Error(`Replicate : ${resp.status}`);
    const pred = await resp.json();

    // Poll jusqu'à complétion
    const url = await pollReplicate(pred.id);
    results.push(url);

    STATE.credits.replicate.used += 2; // ~$0.02 par image
    saveState();
    renderCredits();
  }
  return results;
}

async function pollReplicate(predId, tries = 0) {
  if (tries > 30) throw new Error('Replicate timeout');
  await sleep(2000);
  const r = await fetch(`https://api.replicate.com/v1/predictions/${predId}`, {
    headers: { 'Authorization': `Token ${CONFIG.replicate.apiKey}` },
  });
  const d = await r.json();
  if (d.status === 'succeeded') return d.output[0];
  if (d.status === 'failed') throw new Error(`Replicate failed: ${d.error}`);
  return pollReplicate(predId, tries + 1);
}

async function simulateAssembly() {
  // Remotion nécessite un environnement Node.js local ou un serveur.
  // Ici on simule l'étape — à connecter à ton backend Remotion.
  await sleep(1500);
}

async function publishToYouTube(script, tags) {
  const token = localStorage.getItem('yt_access_token');
  if (!token) throw new Error('YouTube non connecté');

  // NOTE : l'upload vidéo réel nécessite un fichier .mp4.
  // Ici on crée la fiche (titre, description, tags) avec une vidéo placeholder.
  // En production, connecte Remotion output ici.
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
  const tokenCost  = ((STATE.credits.claude.used / 1000) * 0.003);
  const voiceCost  = ((script.narration.length / 1000) * 0.03);
  const imageCost  = ((CONFIG.defaults.imagesPerVideo) * 0.002);
  return parseFloat((tokenCost + voiceCost + imageCost).toFixed(4));
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

// ============================================================
//  AGENT IA — AutoTube v10
//  Dashboard de supervision · Auto-amélioration Claude Vision
// ============================================================

const BACKEND = 'https://server-f28i.onrender.com';

// ── STATE LOCAL ───────────────────────────────────────────
const AGENT_STATE = {
  running: false,
  iterations: [],
  selectedIteration: null,
};

// Définition des phases du cycle
const AGENT_PHASE_DEFS = [
  { id: 'phase1', name: 'Récupération meilleur prompt',   icon: '⬢', detail: 'Analyse de l\'historique…' },
  { id: 'phase2', name: 'Génération script',              icon: '◆', detail: 'Gemini 2.5 Flash' },
  { id: 'phase3', name: 'Synthèse vocale',                icon: '◎', detail: 'Unreal Speech' },
  { id: 'phase4', name: 'Génération images',              icon: '◈', detail: 'Pollinations AI' },
  { id: 'phase5', name: 'Extraction frame',               icon: '⬡', detail: 'Téléchargement image 1' },
  { id: 'phase6', name: 'Analyse Claude Vision',          icon: '⬢', detail: 'Score qualité YT (0→10)' },
  { id: 'phase7', name: 'Sauvegarde itération',           icon: '▦', detail: 'Historique mis à jour' },
];

// ── INIT ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  renderPhases();
  loadHistory();
  checkAnthropicKey();
});

// ── MODAL ────────────────────────────────────────────────
function openAgentModal() {
  checkAnthropicKey();
  document.getElementById('agent-modal').classList.add('open');
}

function closeAgentModal(e) {
  if (!e || e.target === document.getElementById('agent-modal')) {
    document.getElementById('agent-modal').classList.remove('open');
  }
}

function checkAnthropicKey() {
  const key = localStorage.getItem('anthropic_api_key');
  const el = document.getElementById('anthropic-key-status');
  if (!el) return;
  if (key) {
    el.textContent = '✓ Configurée';
    el.style.color = 'var(--accent)';
  } else {
    el.textContent = '⚠ Manquante — va dans Config';
    el.style.color = 'var(--warn)';
  }
}

// ── LANCER UN CYCLE ───────────────────────────────────────
async function launchAgentCycle() {
  const topic = document.getElementById('agent-topic').value.trim();
  const tagsRaw = document.getElementById('agent-tags').value.trim();
  const tags = tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : [];

  if (!topic) { showAgentToast('Saisis un sujet', 'warn'); return; }
  if (AGENT_STATE.running) { showAgentToast('Un cycle est déjà en cours', 'warn'); return; }

  const anthropicKey = localStorage.getItem('anthropic_api_key');
  const geminiKey    = localStorage.getItem('gemini_api_key');
  const unrealKey    = localStorage.getItem('unrealspeech_api_key');

  if (!anthropicKey) {
    showAgentToast('Clé Anthropic manquante — va dans Config', 'warn');
    return;
  }
  if (!geminiKey || !unrealKey) {
    showAgentToast('Clés Gemini ou Unreal Speech manquantes', 'warn');
    return;
  }

  closeAgentModal();
  AGENT_STATE.running = true;
  setAgentStatus(true);
  resetPhases();
  showAgentToast('Cycle agent lancé…', 'success');
  addLog('Cycle démarré — topic : "' + topic + '"');

  try {
    addLog('Appel au backend /agent-run…');
    updateCycleBadge('running');

    const resp = await fetch(`${BACKEND}/agent-run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic, tags, geminiKey, unrealKey, anthropicKey }),
    });

    const data = await resp.json();

    if (!resp.ok) {
      throw new Error(data.error || `Erreur ${resp.status}`);
    }

    // Affiche les logs reçus du serveur
    if (data.iteration && data.iteration.log) {
      data.iteration.log.forEach(line => {
        const type = line.includes('✓') ? 'success' : line.includes('erreur') ? 'error' : '';
        addLog(line, type);
        // Marque la phase correspondante comme done
        markPhaseFromLog(line);
      });
    }

    updateCycleBadge('done');
    showAgentToast(`Cycle terminé — score ${data.iteration.score}/10 ✓`, 'success');
    addLog(`Score final : ${data.iteration.score}/10`, 'success');

    // Ajoute à l'historique local et recharge
    AGENT_STATE.iterations.unshift(data.iteration);
    renderIterations();
    renderKPIs();

    // Ouvre automatiquement le détail
    selectIteration(data.iteration);

  } catch (err) {
    updateCycleBadge('error');
    showAgentToast(`Erreur : ${err.message}`, 'error');
    addLog(`Erreur : ${err.message}`, 'error');
    markPhaseError();
    console.error(err);
  } finally {
    AGENT_STATE.running = false;
    setAgentStatus(false);
  }
}

// ── CHARGER L'HISTORIQUE DEPUIS LE BACKEND ────────────────
async function loadHistory() {
  try {
    const resp = await fetch(`${BACKEND}/agent-history`);
    if (!resp.ok) return;
    const data = await resp.json();
    AGENT_STATE.iterations = data.iterations || [];
    renderIterations();
    renderKPIs();
  } catch (err) {
    console.warn('Impossible de charger l\'historique agent :', err.message);
  }
}

// ── VALIDER / REJETER UNE ITÉRATION ──────────────────────
async function validateIteration(action) {
  const iter = AGENT_STATE.selectedIteration;
  if (!iter) return;

  try {
    const resp = await fetch(`${BACKEND}/agent-validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: iter.id, action }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error);

    // Met à jour localement
    const local = AGENT_STATE.iterations.find(i => i.id === iter.id);
    if (local) local.status = data.iteration.status;

    AGENT_STATE.selectedIteration = data.iteration;
    renderIterations();

    const msg = action === 'validate'
      ? '✓ Itération validée — utilisée pour le prochain cycle'
      : '✕ Itération rejetée';
    showAgentToast(msg, action === 'validate' ? 'success' : 'warn');

    // Met à jour les boutons
    updateDetailButtons(data.iteration.status);

  } catch (err) {
    showAgentToast(`Erreur : ${err.message}`, 'error');
  }
}

// ── RENDER PHASES DU CYCLE ────────────────────────────────
function renderPhases(states) {
  const html = AGENT_PHASE_DEFS.map(p => {
    const st = states ? (states[p.id] || 'idle') : 'idle';
    const cls = st === 'done' ? 'done' : st === 'running' ? 'running' : st === 'error' ? 'error' : '';
    const ico = st === 'done' ? '✓' : st === 'running' ? '…' : st === 'error' ? '✕' : p.icon;
    return `<div class="agent-phase" id="ap-${p.id}">
      <div class="agent-phase-icon ${cls}" id="ap-icon-${p.id}">${ico}</div>
      <div class="agent-phase-info">
        <div class="agent-phase-name">${p.name}</div>
        <div class="agent-phase-detail" id="ap-detail-${p.id}">${p.detail}</div>
      </div>
      <div class="agent-phase-time" id="ap-time-${p.id}"></div>
    </div>`;
  }).join('');
  document.getElementById('agent-phases').innerHTML = html;
}

function resetPhases() {
  renderPhases();
}

function markPhaseFromLog(line) {
  // Associe chaque log à une phase et la marque done
  const phaseMap = [
    { keywords: ['Phase 1', 'meilleur prompt'], phaseId: 'phase1' },
    { keywords: ['Phase 2', 'script généré'],   phaseId: 'phase2' },
    { keywords: ['Phase 3', 'voix générée'],    phaseId: 'phase3' },
    { keywords: ['Phase 4', 'images'],          phaseId: 'phase4' },
    { keywords: ['Phase 5', 'frame'],           phaseId: 'phase5' },
    { keywords: ['Phase 6', 'analyse'],         phaseId: 'phase6' },
    { keywords: ['Phase 7', 'sauvegardée'],     phaseId: 'phase7' },
  ];

  for (const map of phaseMap) {
    if (map.keywords.some(k => line.toLowerCase().includes(k.toLowerCase()))) {
      const icon = document.getElementById(`ap-icon-${map.phaseId}`);
      const detail = document.getElementById(`ap-detail-${map.phaseId}`);
      const time = document.getElementById(`ap-time-${map.phaseId}`);
      if (icon) { icon.className = 'agent-phase-icon done'; icon.textContent = '✓'; }
      if (detail) detail.textContent = line.replace(/Phase \d+ : /i, '');
      if (time) time.textContent = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      break;
    }
  }
}

function markPhaseError() {
  // Marque la première phase "idle" en erreur
  for (const p of AGENT_PHASE_DEFS) {
    const icon = document.getElementById(`ap-icon-${p.id}`);
    if (icon && !icon.classList.contains('done')) {
      icon.className = 'agent-phase-icon error';
      icon.textContent = '✕';
      break;
    }
  }
}

// ── RENDER ITERATIONS ─────────────────────────────────────
function renderIterations() {
  const list = document.getElementById('iterations-list');
  const badge = document.getElementById('history-badge');

  if (!AGENT_STATE.iterations.length) {
    list.innerHTML = `<div class="empty-agent">
      <div class="empty-agent-icon">⬢</div>
      <p>Lance ton premier cycle agent<br>pour voir les itérations ici.</p>
    </div>`;
    if (badge) badge.textContent = '0 cycles';
    return;
  }

  if (badge) badge.textContent = `${AGENT_STATE.iterations.length} cycle${AGENT_STATE.iterations.length > 1 ? 's' : ''}`;

  list.innerHTML = AGENT_STATE.iterations.map(iter => {
    const score = iter.score || iter.analysis?.score || '?';
    const scoreCls = score >= 7 ? 'high' : score >= 5 ? 'mid' : 'low';
    const date = new Date(iter.date || iter.id).toLocaleDateString('fr-FR', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
    });
    const selected = AGENT_STATE.selectedIteration?.id === iter.id ? ' selected' : '';
    const statusLabel = { pending: 'En attente', validated: 'Validé', rejected: 'Rejeté' };
    const statusCls = iter.status || 'pending';

    return `<div class="iteration-item${selected}" onclick="selectIteration(${JSON.stringify(iter).replace(/"/g, '&quot;')})">
      <div class="iter-score-circle ${scoreCls}">${score}</div>
      <div class="iter-info">
        <div class="iter-topic">${iter.topic || 'Sans sujet'}</div>
        <div class="iter-meta">${date} · ${iter.tags?.join(', ') || ''}</div>
      </div>
      <span class="iter-status ${statusCls}">${statusLabel[statusCls] || statusCls}</span>
    </div>`;
  }).join('');
}

// ── RENDER KPIs ───────────────────────────────────────────
function renderKPIs() {
  const iters = AGENT_STATE.iterations;
  const total = iters.length;
  const validated = iters.filter(i => i.status === 'validated').length;
  const scores = iters.map(i => i.score || i.analysis?.score || 0).filter(s => s > 0);
  const avg = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : '—';
  const best = scores.length ? Math.max(...scores) : '—';

  set('agent-kpi-total', total);
  set('agent-kpi-total-sub', total > 0 ? `${total} cycle${total > 1 ? 's' : ''} lancé${total > 1 ? 's' : ''}` : 'Aucun cycle encore');
  set('agent-kpi-score', avg);
  set('agent-kpi-validated', validated);
  set('agent-kpi-best', best);
}

// ── SÉLECTIONNER UNE ITÉRATION ────────────────────────────
function selectIteration(iter) {
  // iter peut être un objet ou une string JSON (depuis onclick HTML)
  if (typeof iter === 'string') {
    try { iter = JSON.parse(iter); } catch(e) { return; }
  }

  AGENT_STATE.selectedIteration = iter;
  renderIterations(); // met à jour la sélection visuelle

  const panel = document.getElementById('iteration-detail');
  panel.style.display = 'block';
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const score = iter.score || iter.analysis?.score || '?';
  const date = new Date(iter.date || iter.id).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });

  // Titre
  set('detail-title', `Itération #${iter.id} · ${date} · Score ${score}/10`);

  // Scores critères
  const criteres = iter.analysis?.criteres || {};
  const critLabels = {
    composition_verticale: 'Composition 9:16',
    qualite_visuelle:      'Qualité visuelle',
    impact_visuel:         'Impact visuel',
    lisibilite_mobile:     'Lisibilité mobile',
    coherence_yt:          'Cohérence YouTube',
  };
  const scoresHtml = Object.entries(critLabels).map(([key, label]) => {
    const val = criteres[key] || 0;
    const cls = val >= 7 ? 'high' : val >= 5 ? 'mid' : 'low';
    return `<div class="score-row">
      <span class="score-label">${label}</span>
      <div class="score-bar-wrap">
        <div class="score-bar-fill ${cls}" style="width:${val * 10}%"></div>
      </div>
      <span class="score-val">${val}/10</span>
    </div>`;
  }).join('');
  document.getElementById('detail-scores').innerHTML = scoresHtml;

  // Points forts
  const strengths = iter.analysis?.points_forts || [];
  document.getElementById('detail-strengths').innerHTML = strengths.map(p => `<li>${p}</li>`).join('') || '<li style="color:var(--text3)">Aucun</li>';

  // Améliorations
  const improvements = iter.analysis?.ameliorations || [];
  document.getElementById('detail-improvements').innerHTML = improvements.map(p => `<li>${p}</li>`).join('') || '<li style="color:var(--text3)">Aucune</li>';

  // Images
  const images = iter.imageUrls || [];
  document.getElementById('detail-images').innerHTML = images.slice(0, 4).map((url, i) =>
    `<div class="detail-img-wrap">
      <img src="${url}" alt="Image ${i+1}" loading="lazy" onerror="this.style.display='none'">
      <div class="detail-img-label">Image ${i+1}</div>
    </div>`
  ).join('') || '<div style="color:var(--text3);font-size:12px">Aucune image</div>';

  // Narration
  set('detail-narration', iter.script?.narration || 'Script non disponible');

  // Prompt amélioré
  set('detail-prompt-improved', iter.analysis?.prompt_ameliore || 'Aucune suggestion de prompt');

  // Boutons
  updateDetailButtons(iter.status);
}

function updateDetailButtons(status) {
  const btnV = document.getElementById('btn-validate');
  const btnR = document.getElementById('btn-reject');
  if (!btnV || !btnR) return;
  if (status === 'validated') {
    btnV.textContent = '✓ Validé';
    btnV.disabled = true;
    btnR.disabled = false;
    btnR.textContent = '✕ Rejeter';
  } else if (status === 'rejected') {
    btnR.textContent = '✕ Rejeté';
    btnR.disabled = true;
    btnV.disabled = false;
    btnV.textContent = '✓ Valider';
  } else {
    btnV.disabled = false;
    btnR.disabled = false;
    btnV.textContent = '✓ Valider';
    btnR.textContent = '✕ Rejeter';
  }
}

function closeDetail() {
  document.getElementById('iteration-detail').style.display = 'none';
  AGENT_STATE.selectedIteration = null;
  renderIterations();
}

// ── BADGE & STATUS ────────────────────────────────────────
function updateCycleBadge(state) {
  const badge = document.getElementById('cycle-badge');
  if (!badge) return;
  const map = {
    running: { text: 'En cours', cls: 'panel-badge running' },
    done:    { text: 'Terminé',  cls: 'panel-badge running' },
    error:   { text: 'Erreur',   cls: 'panel-badge error' },
    idle:    { text: 'En attente', cls: 'panel-badge' },
  };
  const s = map[state] || map.idle;
  badge.textContent = s.text;
  badge.className = s.cls;
}

function setAgentStatus(active) {
  const dot = document.getElementById('agent-status-dot');
  const label = document.getElementById('agent-status-label');
  if (dot) dot.className = 'status-dot' + (active ? ' active' : '');
  if (label) label.textContent = active ? 'Agent actif' : 'Agent inactif';

  const btn = document.getElementById('btn-launch-agent');
  if (btn) {
    btn.disabled = active;
    btn.textContent = active ? '⬢ Cycle en cours…' : '⬢ Lancer un cycle';
  }
}

// ── LOG ───────────────────────────────────────────────────
function addLog(msg, type = '') {
  const box = document.getElementById('agent-log');
  if (!box) return;
  const t = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const d = document.createElement('div');
  d.className = `agent-log-line ${type}`;
  d.dataset.time = t;
  d.textContent = msg;
  // Supprime le message "En attente" initial
  const muted = box.querySelector('.muted');
  if (muted) muted.remove();
  box.appendChild(d);
  box.scrollTop = box.scrollHeight;
}

function clearAgentLog() {
  const box = document.getElementById('agent-log');
  if (box) box.innerHTML = '<div class="agent-log-line muted">Log effacé.</div>';
}

// ── UTILS ─────────────────────────────────────────────────
function set(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

// ── TOASTS ────────────────────────────────────────────────
let agentToastContainer = null;
function showAgentToast(msg, type = 'info') {
  if (!agentToastContainer) {
    agentToastContainer = document.createElement('div');
    agentToastContainer.className = 'toast-container';
    document.body.appendChild(agentToastContainer);
  }
  const icons = { success: '✓', warn: '⚠', error: '✕', info: 'ℹ' };
  const colors = { success: 'var(--accent)', warn: 'var(--warn)', error: 'var(--danger)', info: 'var(--info)' };
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<span style="color:${colors[type]}">${icons[type]}</span> ${msg}`;
  agentToastContainer.appendChild(t);
  setTimeout(() => t.remove(), 4000);
}

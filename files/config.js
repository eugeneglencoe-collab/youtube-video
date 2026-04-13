// ============================================================
//  CONFIG — AutoTube
//  Remplis tes clés API ici avant de déployer
//  NE JAMAIS committer ce fichier avec de vraies clés !
//  Utilise des variables d'environnement en production.
// ============================================================

const CONFIG = {

  // ── CLAUDE (Anthropic) ─────────────────────────────────────
  claude: {
    apiKey: localStorage.getItem('claude_api_key') || '',
    model: 'claude-opus-4-5',
    maxTokens: 2000,
  },

  // ── ELEVENLABS (Voix) ──────────────────────────────────────
  elevenlabs: {
    apiKey: localStorage.getItem('elevenlabs_api_key') || '',
    voices: {
      'Neutre (Adam)':    'pNInz6obpgDQGcFmaJgB',
      'Dynamique (Josh)': 'TxGEqnHWrfWFTfGW9XjX',
      'Calme (Rachel)':   '21m00Tcm4TlvDq8ikWAM',
    },
    // Quota gratuit : 10 000 caractères/mois
    quotaTotal: 10000,
  },

  // ── REPLICATE (Images Stable Diffusion) ───────────────────
  replicate: {
    apiKey: localStorage.getItem('replicate_api_key') || '',
    model: 'stability-ai/sdxl:39ed52f2319f9b697792cf2c47f2c8f6',
    // Crédit offert : ~$5
  },

  // ── YOUTUBE ────────────────────────────────────────────────
  youtube: {
    clientId: localStorage.getItem('yt_client_id') || '',
    // OAuth scope requis :
    // https://www.googleapis.com/auth/youtube.upload
    // https://www.googleapis.com/auth/youtube.readonly
    scopes: [
      'https://www.googleapis.com/auth/youtube.upload',
      'https://www.googleapis.com/auth/youtube.readonly',
    ],
  },

  // ── ALERTES CRÉDITS ────────────────────────────────────────
  alerts: {
    // Pourcentage de crédits restants déclenchant une alerte
    warnThreshold: 30,   // % → orange
    dangerThreshold: 10, // % → rouge + toast
  },

  // ── PARAMÈTRES VIDÉO PAR DÉFAUT ────────────────────────────
  defaults: {
    language: 'fr',
    targetDurationMin: 5,
    targetDurationMax: 8,
    imageStyle: 'cinematic, high quality, 4k',
    imagesPerVideo: 8,
    uploadPrivacy: 'private', // 'public' | 'private' | 'unlisted'
  },

};

// Sauvegarde d'une clé
function saveApiKey(service, key) {
  localStorage.setItem(`${service}_api_key`, key);
  CONFIG[service] = CONFIG[service] || {};
  CONFIG[service].apiKey = key;
  showToast(`Clé ${service} sauvegardée ✓`, 'success');
}

// Vérifie si toutes les clés sont configurées
function checkConfig() {
  const missing = [];
  if (!CONFIG.claude.apiKey)      missing.push('Claude');
  if (!CONFIG.elevenlabs.apiKey)  missing.push('ElevenLabs');
  if (!CONFIG.replicate.apiKey)   missing.push('Replicate');
  if (!CONFIG.youtube.clientId)   missing.push('YouTube');
  return missing;
}

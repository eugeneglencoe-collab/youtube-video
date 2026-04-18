// ============================================================
//  CONFIG — AutoTube v3
//  Gemini 2.5 Flash + OpenAI TTS + Replicate + YouTube
// ============================================================

const CONFIG = {

  // ── GEMINI (Google AI Studio) ──────────────────────────────
  gemini: {
    apiKey: localStorage.getItem('gemini_api_key') || '',
    model: 'gemini-2.5-flash',
    // Gratuit avec facturation activée
  },

  // ── OPENAI (TTS Voix) ─────────────────────────────────────
  openai: {
    apiKey: localStorage.getItem('openai_api_key') || '',
    // $15 de crédit offert · tts-1 ~$0.015/1k chars
  },

  // ── ELEVENLABS (désactivé) ────────────────────────────────
  elevenlabs: {
    apiKey: '',
    voices: {
      'Neutre (Adam)':    'pNInz6obpgDQGcFmaJgB',
      'Dynamique (Josh)': 'TxGEqnHWrfWFTfGW9XjX',
      'Calme (Rachel)':   '21m00Tcm4TlvDq8ikWAM',
    },
    quotaTotal: 10000,
  },

  // ── REPLICATE (Images) ────────────────────────────────────
  replicate: {
    apiKey: localStorage.getItem('replicate_api_key') || '',
    model: 'stability-ai/sdxl:39ed52f2319f9b697792cf2c47f2c8f6',
  },

  // ── YOUTUBE ───────────────────────────────────────────────
  youtube: {
    clientId: localStorage.getItem('yt_client_id') || '',
    scopes: [
      'https://www.googleapis.com/auth/youtube.upload',
      'https://www.googleapis.com/auth/youtube.readonly',
    ],
  },

  // ── ALERTES CRÉDITS ───────────────────────────────────────
  alerts: {
    warnThreshold:   30,
    dangerThreshold: 10,
  },

  // ── PARAMÈTRES VIDÉO ──────────────────────────────────────
  defaults: {
    language: 'fr',
    targetDurationMin: 5,
    targetDurationMax: 8,
    imageStyle: 'cinematic, high quality, 4k',
    imagesPerVideo: 8,
    uploadPrivacy: 'private',
  },

};

function saveApiKey(service, key) {
  localStorage.setItem(`${service}_api_key`, key);
  if (CONFIG[service]) CONFIG[service].apiKey = key;
}

function checkConfig() {
  const missing = [];
  if (!CONFIG.gemini.apiKey)   missing.push('Gemini');
  if (!CONFIG.openai.apiKey)   missing.push('OpenAI');
  if (!CONFIG.replicate.apiKey) missing.push('Replicate');
  if (!CONFIG.youtube.clientId) missing.push('YouTube');
  return missing;
}

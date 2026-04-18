// ============================================================
//  CONFIG — AutoTube v4
//  Gemini 2.5 Flash + Unreal Speech + Replicate + YouTube
// ============================================================

const CONFIG = {

  // ── GEMINI ────────────────────────────────────────────────
  gemini: {
    apiKey: localStorage.getItem('gemini_api_key') || '',
    model: 'gemini-2.5-flash',
  },

  // ── UNREAL SPEECH (Voix) ──────────────────────────────────
  unrealSpeech: {
    apiKey: localStorage.getItem('unrealspeech_api_key') || '',
    // Gratuit : 250 000 chars/mois
  },

  // ── REPLICATE (Images) ────────────────────────────────────
  replicate: {
    apiKey: localStorage.getItem('replicate_api_key') || '',
  },

  // ── YOUTUBE ───────────────────────────────────────────────
  youtube: {
    clientId: localStorage.getItem('yt_client_id') || '',
    scopes: [
      'https://www.googleapis.com/auth/youtube.upload',
      'https://www.googleapis.com/auth/youtube.readonly',
    ],
  },

  // ── ALERTES ───────────────────────────────────────────────
  alerts: {
    warnThreshold:   30,
    dangerThreshold: 10,
  },

  // ── PARAMÈTRES VIDÉO ──────────────────────────────────────
  defaults: {
    language: 'fr',
    imageStyle: 'cinematic, high quality, 4k',
    imagesPerVideo: 8,
    uploadPrivacy: 'private',
  },

};

function checkConfig() {
  const missing = [];
  if (!CONFIG.gemini.apiKey)        missing.push('Gemini');
  if (!CONFIG.unrealSpeech.apiKey)  missing.push('Unreal Speech');
  if (!CONFIG.replicate.apiKey)     missing.push('Replicate');
  if (!CONFIG.youtube.clientId)     missing.push('YouTube');
  return missing;
}

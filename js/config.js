// ============================================================
//  CONFIG — AutoTube v5
//  Gemini 2.5 Flash + Unreal Speech + Stability AI + YouTube
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

  // ── STABILITY AI (Images) ─────────────────────────────────
  stability: {
    apiKey: localStorage.getItem('stability_api_key') || '',
    // Gratuit : 25 crédits/jour
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
    imagesPerVideo: 4, // 4 images = 4 crédits/vidéo sur les 25 gratuits/jour
    uploadPrivacy: 'private',
  },

};

function checkConfig() {
  const missing = [];
  if (!CONFIG.gemini.apiKey)       missing.push('Gemini');
  if (!CONFIG.unrealSpeech.apiKey) missing.push('Unreal Speech');
  if (!CONFIG.stability.apiKey)    missing.push('Stability AI');
  if (!CONFIG.youtube.clientId)    missing.push('YouTube');
  return missing;
}

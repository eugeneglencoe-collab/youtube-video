# AutoTube — Pipeline YouTube Automatisé

Tableau de bord pour gérer ton pipeline de création et publication automatique de vidéos YouTube.

## Stack technique

| Rôle | Service | Plan |
|---|---|---|
| Script & IA | Claude API (claude-opus-4-5) | Pay-as-you-go |
| Voix | ElevenLabs | Gratuit 10k chars/mois |
| Images | Replicate (SDXL) | $5 crédit offert |
| Assemblage | Remotion (Node.js) | Open source gratuit |
| Publication | YouTube Data API v3 | Gratuit |

---

## Déploiement sur GitHub Pages

### 1. Crée le repo GitHub

```bash
git init
git add .
git commit -m "Initial AutoTube setup"
git branch -M main
git remote add origin https://github.com/TON_USERNAME/autotube.git
git push -u origin main
```

### 2. Active GitHub Pages

- Va dans ton repo → **Settings → Pages**
- Source : **Deploy from a branch**
- Branch : `main` / `/ (root)`
- Clique **Save**
- Ton site sera sur `https://TON_USERNAME.github.io/autotube/`

### 3. Configure YouTube OAuth

1. Va sur [console.cloud.google.com](https://console.cloud.google.com)
2. Crée un projet → Active **YouTube Data API v3**
3. **Identifiants → Créer un ID client OAuth → Application Web**
4. Dans "Origines JavaScript autorisées" : ajoute `https://TON_USERNAME.github.io`
5. Dans "URI de redirection" : ajoute `https://TON_USERNAME.github.io/autotube/`
6. Copie le Client ID → colle-le dans **Config** du tableau de bord

### 4. Configure tes clés API

Ouvre `https://TON_USERNAME.github.io/autotube/pages/settings.html` et remplis :
- Clé Claude (console.anthropic.com)
- Clé ElevenLabs (elevenlabs.io)
- Token Replicate (replicate.com/account)
- Client ID YouTube

> ⚠ Les clés sont stockées dans le **localStorage** de ton navigateur, jamais envoyées nulle part d'autre. Ne les commit JAMAIS dans le repo.

---

## Assemblage vidéo (Remotion) — Étape future

L'assemblage vidéo nécessite Node.js. Pour l'activer :

### Option A — En local (test)
```bash
cd remotion-backend
npm install
npm start
# Tourne sur http://localhost:3001
```

### Option B — Déploiement gratuit sur Render.com
1. Push le dossier `remotion-backend/` sur GitHub
2. Crée un nouveau Web Service sur render.com
3. Connecte le repo, commande start : `npm start`
4. Récupère l'URL Render et mets-la dans Config → Backend URL

---

## Structure du projet

```
autotube/
├── index.html          ← Dashboard principal
├── css/
│   └── style.css
├── js/
│   ├── config.js       ← Clés API & configuration
│   └── dashboard.js    ← Logique principale
└── pages/
    ├── pipeline.html   ← Suivi pipeline temps réel
    ├── videos.html     ← Historique vidéos
    ├── credits.html    ← Suivi crédits détaillé
    └── settings.html   ← Configuration clés API
```

---

## Coût estimé par vidéo

| Service | Coût moyen |
|---|---|
| Claude (script) | ~$0.005 |
| ElevenLabs (voix) | ~$0.024 |
| Replicate (8 images) | ~$0.016 |
| YouTube API | Gratuit |
| **Total** | **~$0.045** |

Soit environ **22 vidéos pour $1**.

---

## Roadmap

- [x] Dashboard tableau de bord
- [x] Intégration Claude API (script)
- [x] Intégration ElevenLabs (voix)
- [x] Intégration Replicate (images)
- [x] Publication YouTube via API
- [ ] Backend Remotion (assemblage vidéo)
- [ ] Planificateur automatique (1 vidéo/jour)
- [ ] Notifications email/SMS alertes crédits
- [ ] Support multi-chaînes YouTube

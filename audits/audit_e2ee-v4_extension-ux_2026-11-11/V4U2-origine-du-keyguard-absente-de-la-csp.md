# V4U2 — Origine de synco_keyguard absente de la CSP

|  |  |
|---|---|
| **Sévérité** | 🟡 Moyenne (fonctionnelle : récupération par PIN bloquée en production) |
| **Référentiel** | — (disponibilité d'un chemin de récupération, spec §14) |
| **Fichiers** | [`index.html`](../../index.html) · [`src-tauri/tauri.conf.json`](../../src-tauri/tauri.conf.json) · [`vite.config.ts`](../../vite.config.ts) · [`scripts/tauri-run.js`](../../scripts/tauri-run.js) |
| **Statut** | ✅ Corrigé (`dc650c2`) · ⏳ configuration de production à vérifier |

---

## Description

`pinRecoveryApi.ts` appelle `synco_keyguard` directement depuis le navigateur (`VITE_KEYGUARD_URL`, spec §14.2,
« Isolement »). Le keyguard tourne sur une infrastructure séparée, donc sur une autre origine que `api.synco.one`. Or
aucune CSP (web, Capacitor, Tauri) ne contenait cette origine dans `connect-src` : en production, l'activation et
l'usage de la récupération par PIN auraient échoué (`fetch` bloqué par la CSP), sans erreur explicite pour
l'utilisateur. En développement, le keyguard est sur `localhost`, que la CSP de dev autorise : le défaut était
invisible.

## Correction

Emplacement `__CSP_KEYGUARD__` dans les deux CSP, remplacé au build par l'**origine** de `VITE_KEYGUARD_URL`
(`vite.config.ts` pour le web et Capacitor, `scripts/tauri-run.js` pour Tauri). Seule l'origine `http(s)` est reprise :
une valeur invalide ou contenant `;` n'ajoute rien (vérifié : `javascript:…`, `https://x.fr; script-src *`).

## Reste à vérifier avant publication

- `VITE_KEYGUARD_URL` doit figurer dans le secret GitHub `ENV_PRODUCTION` (le `.env.production` local ne l'a pas : la
  récupération par PIN y est désactivée, `pinRecoveryConfigured = false`).
- `KEYGUARD_ALLOWED_ORIGINS` du keyguard doit contenir toutes les origines clientes : `https://app.synco.one`, et pour
  les applications (CapacitorHttp est désactivé, Tauri passe par la WebView) `https://localhost` (Android),
  `capacitor://localhost` (iOS), `tauri://localhost` et `http://tauri.localhost` (Tauri). Sa valeur par défaut
  (`http://localhost:5174`) ne correspond même pas au dev en HTTPS.

# 🔒 Audit de sécurité complet — Frontend `synco_app` — 2 novembre 2026

> **Date** : 2 novembre 2026
> **Référentiels** : OWASP ASVS 4.0.3 · OWASP Top 10 (2021) · OWASP MASVS (Tauri / Capacitor) · modèle de menace E2EE « serveur non fiable »
> **Scope** : `src/` (≈ 17 300 lignes modifiées depuis le 01/10 sur 185 fichiers), `index.html`, `src-tauri/tauri.conf.json`, `capacitor.config.ts`, dépendances. Contrats serveur lus dans `../synco_api` (branche `audit/full-2026-11-02`).
> **Méthode** : revue de code boîte blanche, audit des dépendances (`bun audit --prod`). Pas de PoC navigateur pour cette campagne : les constats sont confirmés par lecture du code (⚠️).
> **Auditeur** : Claude Code — audit autorisé par le propriétaire du dépôt. Branche `audit/full-2026-11-02` (créée depuis `main`).
> **Rapport général (les deux dépôts, matrice globale, plan de remédiation)** : [`synco_api/audits/audit_full_2026-11-02/README.md`](../../../synco_api/audits/audit_full_2026-11-02/README.md)
> **Document précédent** : [`../audit_pentest_full_2026-10-01/`](../audit_pentest_full_2026-10-01/README.md)

---

## Synthèse exécutive

**6 constats côté app : 1 critique, 1 élevé, 2 moyens, 1 bas, 1 informatif.** S'y ajoutent les 12 constats `NA` de l'API (voir le rapport général).

La surface « web classique » reste saine. Il y a deux `v-html`, tous deux derrière DOMPurify avec des listes blanches strictes. Les puces de références, mentions et horodatages injectés via `innerHTML` n'y insèrent que du texte échappé ou des identifiants filtrés par regex. Aucun jeton Keycloak ne reste dans `localStorage`. La CSP a perdu `unsafe-eval` et `localhost:*`, et `CapacitorHttp` est désactivé.

Le cœur du risque reste la cryptographie côté client face à un serveur malveillant. Les mécanismes demandés le 01/10 existent désormais : PIN v3 réellement utilisé, enveloppes signées, épinglage, E2EE LiveKit activé, ticket PeerJS, handshake P2P authentifié. Mais ils **acceptent par défaut** le cas où la preuve manque :

| Fiche | Constat | Sévérité |
|---|---|---|
| [NF1](./NF1-pin-v3-force-brute-hors-ligne-par-le-serveur-persistante.md) | Le serveur détient vérificateur **et** `wrapSecret` : clé privée E2EE retrouvée en quelques minutes pour n'importe quel utilisateur (FC2 persistante) | 🔴 Critique · 8.7 |
| [NF2](./NF2-enveloppes-de-cles-fc4-verification-fail-open.md) | Enveloppe absente, créateur hors annuaire ou première vue → clé symétrique adoptée sans vérification ; aucune empreinte vérifiable | 🟠 Élevée · 7.4 |
| [NF3](./NF3-apercus-de-liens-fuite-des-url-des-messages-e2ee.md) | Chaque URL d'un message reçu (DM compris) est envoyée automatiquement au serveur pour l'aperçu | 🟡 Moyenne · 5.7 |
| [NF4](./NF4-dependances-vulnerables-app.md) | 68 vulnérabilités en production, dont Capacitor 8.5.0 (critique, applicabilité à confirmer) | 🟡 Moyenne · 6.1 |
| [NF5](./NF5-csp-connect-src-canaux-d-exfiltration.md) | `connect-src` ouvert à Hugging Face, jsDelivr, GitHub raw : canaux d'exfiltration en cas d'injection | 🟢 Basse · 3.1 |
| [NF6](./NF6-sav-frontend-sans-backend-sur-main.md) | Module SAV chiffré fusionné côté app sans son API | 🔵 Info |

Constats API qui concernent directement l'app : [NA2](../../../synco_api/audits/audit_full_2026-11-02/NA2-peerjs-ticket-verifie-apres-enregistrement.md) (ticket PeerJS contournable, correctif FC6), [NA4](../../../synco_api/audits/audit_full_2026-11-02/NA4-materiel-e2ee-reecrasable-sans-reauthentification.md) (clés E2EE réécrasables avec un jeton), [NA5](../../../synco_api/audits/audit_full_2026-11-02/NA5-revocation-sans-coupure-livekit-ni-rotation-des-cles.md) (aucune rotation de clé après expulsion), [NA10](../../../synco_api/audits/audit_full_2026-11-02/NA10-livekit-canupdateownmetadata-usurpation-de-nom.md) (`participant.name` affiché).

---

## État des fiches de l'audit du 01/10

Légende : ✅ vérifiée dans le code lors de cette campagne · ☑️ commit de correction présent, code non relu · ⚠️ correction partielle · 🔁 nouveaux avis / contournement · ♻️ persistant.

| Fiche | État au 02/11 |
|---|---|
| FC1 — clés scellées pour toute clé publique servie | ⚠️ Partielle : scellement via la clé épinglée, clé propre vérifiée au déverrouillage ; le TOFU initial reste non vérifiable → [NF2](./NF2-enveloppes-de-cles-fc4-verification-fail-open.md) |
| FC2 — PIN v3 / legacy | ⚠️ Partielle : comptes legacy migrés au déverrouillage ; force brute serveur intacte → [NF1](./NF1-pin-v3-force-brute-hors-ligne-par-le-serveur-persistante.md) |
| FC3 — E2EE LiveKit | ✅ Vérifiée côté serveur (`e2eeRequired`, refus des invités sans clé) ; activation client déclarée par le commit `d285eb4`, non relue en détail |
| FC4 — clés adoptées sans authentification | ⚠️ Partielle (fail-open) → [NF2](./NF2-enveloppes-de-cles-fc4-verification-fail-open.md) |
| FC5 — `gatewayUrl` IA | ☑️ Commit `7ee9c2e` (périmètre réduit, consentement par origine visible dans `aiGatewayPolicy.ts`) — non revérifiée en profondeur |
| FC6 — identité des pairs WebRTC | ⚠️ Handshake MAC et code de vérification en place ; ticket PeerJS contournable → [NA2](../../../synco_api/audits/audit_full_2026-11-02/NA2-peerjs-ticket-verifie-apres-enregistrement.md) |
| FC7 — clair accepté | ☑️ Commit `35612eb` — non revérifiée |
| FC8 — SAS sans surchiffrement | ☑️ Commit `a12efbc` — non revérifiée |
| FC9 — jetons en `localStorage` | ✅ Vérifiée (seul `userId` est écrit dans `localStorage`) |
| FC10 — hygiène des clés en mémoire | ☑️ Commit `db0e905` ; `deriveMasterKeyV3` non extractible vérifié |
| FC11 — fichiers chiffrés | non revérifiée (aucun commit dédié repéré) |
| FX1 — `open_external_url` | ☑️ Commit `7823aa9` — non revérifiée, non testée sous Windows |
| FX2 — `class` dans le Markdown | ✅ Vérifiée (`FORBID_ATTR: class, style, id, name` dans `MarkdownRender.vue` et `SimpleMarkdown.vue`) |
| FX3 — déconnexion Tauri/Capacitor | ☑️ Commit `700332f` — non revérifiée |
| FX4 — `allowBackup` / `CapacitorHttp` | ✅ Vérifiée pour `CapacitorHttp.enabled = false` ; `allowBackup` non relu |
| FX5 — CSP | ✅ Vérifiée (plus d'`unsafe-eval` ni de `localhost:*`) — reste `connect-src` large → [NF5](./NF5-csp-connect-src-canaux-d-exfiltration.md) |
| FX6 — embeds webhook | ☑️ Commits `3b96863` (app) et `2008547` (API) — non revérifiée |
| FX7 — dépendances | 🔁 Nouveaux avis → [NF4](./NF4-dependances-vulnerables-app.md) |
| FX8 — ui-avatars | ☑️ Commit `c569245` (`defaultAvatar.ts` présent) — non revérifiée |
| FX9 — `state` OAuth natif | ☑️ Commit `9ddf984` — non revérifiée |
| FX10 — service worker FCM | ☑️ Commit `1290a70` — non revérifiée |
| FX11 — `.env.production` dans l'historique | ♻️ Sans objet de code : rotation des secrets concernés à confirmer |

---

## Recommandations prioritaires (volet app)

1. **NF2** — refuser toute clé sans enveloppe valide dès que l'émetteur a une `publicSignKey` ; résoudre explicitement un créateur inconnu ; ajouter des empreintes d'identité vérifiables (QR / numéro de sécurité) et un badge « non vérifié ».
2. **NF4** — mettre à jour Capacitor (≥ 8.5.1) et republier les binaires mobiles ; DOMPurify, socket.io-client ; un seul lockfile.
3. **NF3** — aperçus désactivés par défaut en DM et salons privés ; à terme, aperçu généré par l'expéditeur et chiffré avec le message ; carte liée à l'URL écrite.
4. **NF1** — décision d'architecture sur le secret de déverrouillage, à mener avec l'équipe API (voir la fiche) ; d'ici là, retirer de l'UI et de la documentation toute affirmation selon laquelle le serveur ne peut pas lire les messages.
5. **NF5, NF6** — isoler l'IA locale (worker/iframe avec sa propre CSP) ; fusionner le SAV côté API derrière un audit ciblé.

## Méthodologie et limites

Voir le [rapport général](../../../synco_api/audits/audit_full_2026-11-02/README.md#méthodologie). Pour ce volet : lecture intégrale des modules `crypto.ts`, `keyEnvelope.ts`, `keyTrust.ts`, `keyPinning.ts`, `useLinkPreview.ts`, `LinkPreview.vue`, `MarkdownRender.vue`, `SimpleMarkdown.vue`, `useReferences.ts`, `useMentions.ts`, `useTimestampTokens.ts`, `supportCrypto.ts` (en-tête), des passages pertinents de `App.vue`, `useSecurePeer.ts`, `useLiveKit.ts`, `keycloak.ts`, et de la configuration (`index.html`, `tauri.conf.json`, `capacitor.config.ts`). Les composants d'interface sans logique de sécurité n'ont pas été relus un par un. `bun audit --prod` a été lancé sur le `bun.lock`. Aucun test navigateur ou mobile n'a été exécuté.

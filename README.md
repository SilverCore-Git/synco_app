# Synco — Application cliente

**Plateforme de collaboration française et souveraine**, chiffrée de bout en bout (E2EE) : une alternative à Slack et Microsoft Teams.

Ce dépôt contient le **client** de Synco : une seule base de code Vue 3 livrée en application web, en application de bureau (Tauri : Windows, Linux) et en application mobile (Capacitor : Android, iOS).

> Dépôt public. Code source consultable à des fins de transparence et d'audit uniquement, tous droits réservés (voir [LICENSE](LICENSE)).

## Fonctionnalités

- **Organisations, espaces et salons** : salons textuels, fils de discussion (threads), salons vocaux, messages privés, permissions par espace.
- **Messagerie chiffrée de bout en bout** : réactions, mentions, aperçus de liens, transfert de messages, brouillons, sourdine des notifications.
- **Appels et visio** : salons vocaux et visio via LiveKit, appels privés et sessions éphémères en pair à pair (PeerJS), suppression de bruit.
- **Fichiers** : stockage par espace, envois et téléchargements par morceaux (chunks) avec panneau de transferts, aperçu des médias et des PDF.
- **Tâches** : tableaux Kanban, étiquettes, pièces jointes, archives, vue globale.
- **Agenda** : calendriers d'espace, calendriers externes, rappels.
- **Assistant IA** : recherche sémantique locale, agent côté client, modèles locaux (WebGPU / WebLLM) ou fournisseurs configurés par l'organisation, dont la passerelle auto-hébergée [Synco_AI_Gateway](../Synco_AI_Gateway).
- **Webhooks** : laisser un outil extérieur poster dans un salon.
- **Notifications** : centre de notifications, notifications push (Firebase Cloud Messaging), rapports d'activité.
- **SAV (support)** : tickets, modérateurs, notes internes.
- **Administration** : quotas des organisations et des utilisateurs, gestion des membres, bannissements.

La documentation utilisateur est dans [doc/](doc/index.md).

## Sécurité

Le chiffrement est le cœur du produit. Le serveur ne voit jamais le contenu des messages, des fichiers ni des appels.

- **Identité** : paires RSA-OAEP 4096 et ECDSA P-256, messages et fichiers chiffrés en AES-GCM-256.
- **E2EE v4 (multi-appareil)** : clés d'identité protégées par une `AccountKey` aléatoire de 256 bits, enveloppée pour chaque appareil et par une clé de récupération. Le PIN à 4 chiffres n'est plus qu'un verrou local. Le serveur ne stocke aucun vérificateur dérivé du PIN.
- **Coffres d'appareil** (`src/assets/deviceVault/`) : secret matériel via WebAuthn PRF, trousseau natif (Tauri, Capacitor), PIN, ou **Synco Extension** (extension de navigateur, voir [synco_extension](../synco_extension)).
- **Récupération par PIN** : service tiers [synco_keyguard](../synco_keyguard), en plus de la clé de récupération.
- **Appels** : badge d'état E2EE, validation des identifiants d'appel, protection anti-rejeu.
- **Comptes legacy, v2 et v3** : toujours lisibles, migration vers la v4 proposée à l'utilisateur.
- **Authentification** : Keycloak, mais uniquement via `synco_api` (aucun parcours Keycloak visible).

Détails : [doc/securite/](doc/securite/README.md) et les rapports d'audit dans [audits/](audits/).

## Pile technique

| Domaine | Technologies |
|---|---|
| Interface | Vue 3 (Composition API), TypeScript 5.9, Vite 7, Vue Router, Tailwind CSS 4 |
| Authentification | Keycloak (`keycloak-js`) |
| Temps réel | Socket.IO, LiveKit, PeerJS |
| Chiffrement | Web Crypto API, `@noble/curves`, WebAuthn |
| IA | WebLLM, Transformers.js, Orama (recherche), Monaco (éditeur) |
| Bureau | Tauri 2 (Rust) |
| Mobile | Capacitor 8 (Android, iOS), biométrie et stockage sécurisé |
| Notifications | Firebase Cloud Messaging |
| Tests | `bun test` |

## Démarrage

### Prérequis

- Node.js 22+ (et/ou [Bun](https://bun.sh))
- Les services Synco : [synco_api](../synco_api), Keycloak, LiveKit, serveur PeerJS ; [synco_cdn](../synco_cdn) pour les fichiers et [synco_keyguard](../synco_keyguard) pour la récupération par PIN.

### Installation

```bash
npm install
cp .env.example .env     # puis adapter les valeurs
npm run setup            # active le hook pre-commit anti-secrets
npm run dev              # http://localhost:5174
```

### Configuration

Toutes les variables `VITE_*` sont figées dans le bundle au build. Voir [.env.example](.env.example), qui est commenté. Principales variables :

| Variable | Rôle |
|---|---|
| `VITE_API_URL`, `VITE_SOCKET_URL`, `VITE_SOCKET_PATH` | API et WebSocket de `synco_api` |
| `VITE_KEYCLOAK_URL`, `VITE_KEYCLOAK_REALM`, `VITE_KEYCLOAK_CLIENT_ID` | Authentification |
| `VITE_LIVEKIT_URL` | Salons vocaux et visio |
| `VITE_PEER_*` | Serveur PeerJS (appels et sessions P2P) |
| `VITE_KEYGUARD_URL` | Récupération par PIN (E2EE v4). Vide : option masquée |
| `VITE_FIREBASE_*` | Notifications push |
| `VITE_AI_GATEWAY_ALLOWED_ORIGINS` | Passerelles IA autorisées sans confirmation |
| `VITE_LOCAL_AI_MODELS_URL` | Miroir des modèles IA locaux (vide : HuggingFace) |
| `VITE_EXTENSION_STORE_*` | Liens des boutiques de Synco Extension |
| `SYNCO_DEV_CERT`, `SYNCO_DEV_KEY` | Certificat HTTPS de dev (WebAuthn l'exige) |

## Scripts

```bash
npm run dev               # serveur de dev (port 5174)
npm run build             # vue-tsc puis build de production
npm run preview           # prévisualiser le build
bun test                  # tests unitaires (*.test.ts)

npm run tauri:dev         # application de bureau en dev
npm run tauri:build       # installeur de bureau (-- --bundles msi | appimage)

npm run android:dev       # app Android sur téléphone USB (adb reverse)
npm run android:ports     # ports adb reverse seulement

npm run download-models   # préparer le miroir des modèles IA locaux
npm run check:secrets     # scanner tout le dépôt à la recherche de secrets
```

> Le typage se vérifie avec `vue-tsc` lancé via Node, pas via Bun.

## Structure

```
src/
├── assets/          # Chiffrement (e2eeV4, deviceVault, utils), Keycloak, stockage, init
├── components/      # Composants partagés (e2ee, voice, peer, permissions, settings, ...)
├── composables/     # useWSocket, useLiveKit, useSecurePeer, useNotifications, ...
├── config/          # Firebase, permissions
├── services/        # IA (AIService, agent, localLLM), support, transferts, recherche
├── sw/              # Service worker (Firebase Messaging)
├── types/           # Types TypeScript
├── views/           # OrgSpace, OrgsSelection, Support, admin, invitations
├── workers/         # Web workers
├── router.ts
└── main.ts
src-tauri/           # Application de bureau (Rust)
android/  ios/       # Projets natifs Capacitor
doc/                 # Documentation utilisateur et sécurité
audits/              # Audits et pentests
docker/ Dockerfile   # Image de prod (nginx) et de dev
scripts/             # Outils de build, de dev et de vérification
vibe/                # Règles et guides de développement
```

## Builds et déploiement

- **Docker** : le [Dockerfile](Dockerfile) a une cible `dev` (Vite) et une cible de build statique servie par nginx ([docker/nginx.conf](docker/nginx.conf)). Les variables `VITE_*` sont passées en build args.
- **CI** : [release_main.yml](.github/workflows/release_main.yml) produit à chaque push sur `main` l'APK Android, l'installeur Windows (MSI) et l'AppImage Linux. [test_build_on_pr.yml](.github/workflows/test_build_on_pr.yml) vérifie les builds des pull requests.
- **Développement Android** : [doc/android-dev.md](doc/android-dev.md).

### AppImage Linux sous Fedora

`linuxdeploy` suppose des chemins Ubuntu/Debian et un `strip` qui ne comprend pas tous les formats ELF récents. Avant `npm run tauri:build -- --bundles appimage` :

```bash
export NO_STRIP=true
export GSTREAMER_PLUGINS_DIR=/usr/lib64/gstreamer-1.0
export GSTREAMER_HELPERS_DIR=/usr/libexec/gstreamer-1.0
```

Installer aussi `fuse-libs` (`sudo dnf install fuse-libs`) : Tauri lance `linuxdeploy` sous forme d'AppImage.

## Hook anti-secrets

Le dépôt est public : `.githooks/pre-commit` exécute [scripts/check-secrets.mjs](scripts/check-secrets.mjs) à chaque commit. Activez-le avec `npm run setup`.

## Contribuer

- **Jamais de travail direct sur `main`** : branches `feat/…`, `fix/…`, `refactor/…`, `docs/…`, commits atomiques. Voir [vibe/GIT_RULES.md](vibe/GIT_RULES.md).
- TypeScript strict, aucun `any`.
- Pas de boîtes de dialogue natives (`alert`, `confirm`) : utiliser les composants de l'application (par exemple `ConfirmDelete.vue`).
- E2EE d'abord : tout contenu doit pouvoir être chiffré.
- Règles et guide de développement : [vibe/RULES.md](vibe/RULES.md) et [vibe/guide.md](vibe/guide.md).

## Dépôts liés

| Dépôt | Rôle |
|---|---|
| [synco_api](../synco_api) | API, WebSocket, base de données |
| [synco_cdn](../synco_cdn) | Stockage des fichiers |
| [synco_keyguard](../synco_keyguard) | Récupération par PIN |
| [synco_extension](../synco_extension) | Extension de navigateur (coffre de clés) |
| [Synco_AI_Gateway](../Synco_AI_Gateway) | Passerelle IA auto-hébergée |

## Support

Pour un problème de sécurité, contactez immédiatement l'équipe SilverCore.

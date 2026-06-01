# Guide d'intégration Tauri pour Synco

## ✅ Intégration complétée

Votre app Vue.js Synco a été adaptée avec succès pour Tauri (Windows, macOS, Linux)!

### 📦 Fichiers créés/modifiés:

**Backend Rust (src-tauri/):**
- ✅ `Cargo.toml` - Dépendances Rust configurées
- ✅ `src/main.rs` - Configuration Tauri avec IPC commands
- ✅ `build.rs` - Build script Tauri
- ✅ `tauri.conf.json` - Configuration multi-plateforme
- ✅ `icons/` - Icônes pour les apps

**Vue.js (src/):**
- ✅ `assets/isDesktopApp.ts` - Détection mode desktop Tauri
- ✅ `assets/keycloak.ts` - Adapted pour callbacks desktop
- ✅ `assets/localStore.ts` - Abstraction localStorage ↔ Tauri Store
- ✅ `composables/useWSocket.ts` - Socket.io pour desktop
- ✅ `router.ts` - Router avec createMemoryHistory en mode desktop
- ✅ `vite.config.ts` - Configuration Vite pour Tauri

**Configuration:**
- ✅ `package.json` - Scripts npm/bun pour Tauri
- ✅ `.env.desktop` - Variables d'env pour mode desktop
- ✅ `.gitignore` - Ignore les fichiers Tauri/Rust

### 🚀 Commandes disponibles:

```bash
# Mode développement (web)
bun run dev:web

# Mode développement (Tauri desktop)
bun run dev
# ou avec npm:
npm run dev

# Build web seulement
bun run build

# Build Tauri (créé .exe/.dmg/.AppImage)
bun run build:tauri

# Prévisualiser build web
bun run preview
```

### 🔧 Configuration environnement:

Les fichiers `.env.desktop` et `.env` contiennent les variables d'environnement.
En mode Tauri, vous pouvez personnaliser les URLs Socket.io:

```env
# Pour dev local
VITE_SOCKET_URL_DESKTOP=http://localhost:3467
VITE_API_URL_DESKTOP=http://localhost:9000
```

### 🎯 Fonctionnalités Tauri intégrées:

✅ **Gestion du stockage**
- localStorage web → Tauri Store (persistance)
- Abstraction via `localStore.ts`

✅ **Authentification Keycloak**
- Support SSO adaptés pour desktop
- Gestion des callbacks sans HTML silencieux

✅ **Communication temps réel**
- Socket.io compatible Tauri
- WebRTC/LiveKit natif

✅ **Navigation**
- Router Vue adaptés pour memory history (pas de URL)
- Tous les liens internes fonctionnent

✅ **Multi-plateforme**
- Windows: .msi installer
- macOS: .dmg (10.13+)
- Linux: .AppImage et .deb

### 📋 Prochaines étapes:

1. **Tester en mode dev:**
   ```bash
   bun run dev
   ```
   Cela va lancer Vite (port 5174) et Tauri desktop

2. **Vérifier les permissions** dans `src-tauri/tauri.conf.json`
   - Accès réseau HTTP/HTTPS/WebSocket
   - File system si nécessaire

3. **Tester la chaîne complète:**
   - Authentification Keycloak
   - Connexion Socket.io
   - Appels API
   - LiveKit WebRTC

4. **Build pour production:**
   ```bash
   bun run build:tauri
   ```
   Les installers se trouvent dans `src-tauri/target/release/bundle/`

### 🐛 Troubleshooting:

**"Cannot find module '@tauri-apps/api'"**
- Exécutez: `bun install` (les packages Tauri sont déjà installés)

**Icônes manquantes au build**
- Les icônes PNG (32x32, 128x128, etc.) doivent être en format RGBA
- Elles sont créées dans `src-tauri/icons/`

**Socket.io timeout en localhost**
- Vérifiez que votre serveur local tourne sur le bon port
- Utilisez les URLs dans `.env.desktop`

**Keycloak SSO ne fonctionne pas**
- En mode desktop, les redirects sunt gérés différemment
- Vérifiez que `VITE_KEYCLOAK_URL` pointe vers votre serveur

### 📚 Structure du projet:

```
silverteams_app/
├── src/                    # Code Vue.js
│   ├── assets/
│   │   ├── isDesktopApp.ts    # Détecteur Tauri ← KEY
│   │   ├── localStore.ts      # Storage abstraction ← KEY
│   │   ├── keycloak.ts        # Auth adaptée ← MODIFIÉ
│   │   └── ...
│   ├── composables/
│   │   └── useWSocket.ts      # Socket.io adapté ← MODIFIÉ
│   ├── router.ts              # Routes adaptées ← MODIFIÉ
│   └── ...
├── src-tauri/             # Code Rust Tauri
│   ├── src/
│   │   └── main.rs           # Backend Rust
│   ├── Cargo.toml            # Dépendances Rust
│   ├── build.rs              # Build script
│   ├── tauri.conf.json       # Configuration ← KEY
│   └── icons/                # App icons
├── vite.config.ts         # Vite config adaptée ← MODIFIÉ
├── package.json           # Scripts Tauri ← MODIFIÉ
└── .env.desktop           # Env vars desktop ← NOUVEAU
```

### 🔒 Sécurité:

- ✅ CSP configuré dans `tauri.conf.json`
- ✅ IPC commands exposées explicitement
- ✅ HTTPS/WSS en production, HTTP/WS en dev
- ✅ Tokens Keycloak gérés via `localStore`

---

**L'intégration Tauri est terminée et prête pour le développement!** 🎉

Commencez par: `bun run dev`

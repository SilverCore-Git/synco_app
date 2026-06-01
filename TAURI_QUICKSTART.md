# Quick Start Tauri - Synco Desktop App

## 1️⃣ Installation (première fois)

```bash
cd /home/moi/Documents/GitHub/silverteams_app

# Installez les dépendances
bun install

# Vérifiez que Rust est installé
rustc --version  # Should show: 1.95.0+
cargo --version  # Should show: 1.95.0+
```

## 2️⃣ Développement mode

```bash
# Démarre Vite dev server + Tauri desktop app
bun run dev

# La fenêtre Tauri va s'ouvrir avec hot-reload
# Modifiez les fichiers Vue et ils se rechargent automatiquement
```

## 3️⃣ Variables d'environnement

Configurez selon votre setup:

**.env** (web mode)
```env
VITE_KEYCLOAK_URL=https://auth.silvercore.fr
VITE_SOCKET_URL=wss://socket.silverteams.com
VITE_API_URL=https://api.silverteams.com
```

**.env.desktop** (desktop mode)
```env
VITE_KEYCLOAK_URL=https://auth.silvercore.fr
VITE_SOCKET_URL=http://localhost:3467
VITE_API_URL=http://localhost:9000
```

## 4️⃣ Build pour production

```bash
# Build pour votre plateforme actuelle
bun run build:tauri

# Les installers se trouvent dans:
# src-tauri/target/release/bundle/
# ├── msi/           (Windows .exe installer)
# ├── appimage/      (Linux AppImage)
# └── dmg/           (macOS .dmg - si vous buildiez sur Mac)
```

## 5️⃣ Fichiers importants pour Tauri

| Fichier | Rôle |
|---------|------|
| `src-tauri/tauri.conf.json` | Configuration principale Tauri |
| `src-tauri/src/main.rs` | Backend Rust |
| `src/assets/isDesktopApp.ts` | Détecte si running en desktop |
| `src/assets/localStore.ts` | Storage persistant |
| `vite.config.ts` | Config build Vite |

## 6️⃣ Déboguer

### En mode dev Tauri:
- **Devtools**: Right-click → Inspect (même que Chrome)
- **Console**: F12 pour ouvrir les devtools
- **Logs Rust**: Affichés dans la console de terminal

### Pour les erreurs Tauri:
```bash
RUST_LOG=debug bun run dev
```

## 7️⃣ Vérification

Checklist pour tester votre app:

- [ ] App démarre sans erreurs: `bun run dev`
- [ ] Navigation fonctionne (clic sur routes)
- [ ] Keycloak login fonctionne
- [ ] Socket.io se connecte
- [ ] LocalStore persiste données (rechargez l'app)
- [ ] Devtools ouvrent avec F12

## 🎯 Commandes complètes

```bash
# DEV
bun run dev        # Start Tauri dev (hot reload)
bun run dev:web    # Start web server only (port 5174)

# BUILD
bun run build      # Build web app
bun run build:tauri # Build web + Tauri installers

# PREVIEW
bun run preview    # Preview built web app
```

---

**C'est tout! Tauri est prêt à fonctionner.** 🚀

Commencez par: `bun run dev`

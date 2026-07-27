# 📋 Synco - Guide de Session de Développement du Chat

> **Dernière mise à jour** : 16 Juin 2026  
> **Projet** : synco - Alternative française souveraine à Slack/Teams  
> **Contexte** : Développement du module de chat avec chiffrement E2EE

(n'ésite pas a aller regarder le fichier DEVELOPERS_GUIDE.md pour avoir plus d'information)

---

## 🎯 **À propos du Projet Synco**

**synco** est une plateforme de collaboration **française, souveraine et ultra-sécurisée**, conçue comme une alternative aux outils américains (Slack, Microsoft Teams) en s'inspirant de l'architecture de Discord.

### 🏗️ **Architecture Technique**

#### **Backend** (`synco_api`)
```
├── Node.js 20+ + Bun Runtime
├── Express 5 (API REST)
├── TypeScript (strict mode)
├── Prisma ORM + PostgreSQL
├── Socket.io (Temps réel)
├── Keycloak (Authentification SSO)
├── LiveKit (Appels audio/vidéo - SFU)
├── PeerJS (Appels P2P)
├── prisma-field-encryption (E2EE DB)
└── Zod (Validation des données)
```

#### **Frontend** (`synco_app`)
```
├── Vue 3 + Composition API
├── TypeScript 5.9+
├── Vite 7 (Bundler)
├── Tailwind CSS 4
├── Pinia (State Management)
├── keycloak-js (Auth)
├── LiveKit Client
├── PeerJS
└── Socket.io-client
```

### 🔐 **Fonctionnalités Clés**

| Fonctionnalité | Backend | Frontend | Statut |
|---------------|---------|----------|--------|
| Authentification Keycloak | ✅ | ✅ | Production |
| Messagerie instantanée | ✅ | ✅ | Production |
| Chiffrement E2EE (messages) | ✅ | ✅ | Production |
| Appels P2P chiffrés | ✅ | ✅ | Production |
| Appels de groupe (LiveKit) | ✅ | ✅ | Production |
| Gestion des organisations | ✅ | ✅ | Production |
| Espaces et threads | ✅ | ✅ | Production |
| Upload de fichiers | ✅ | ✅ | Production |
| Réactions aux messages | ✅ | ✅ | Production |
| Partage d'écran | 🟡 | 🟡 | À venir |
| Rotation des clés E2EE | 🟡 | 🟡 | À venir |

---

## 🚀 **Workflow d'une Nouvelle Session de Chat**

### **1. Authentification (Keycloak)**

```typescript
// Frontend: src/assets/keycloak.ts
const keycloak = new Keycloak({
  url: import.meta.env.VITE_KEYCLOAK_URL,
  realm: import.meta.env.VITE_KEYCLOAK_REALM,
  clientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID,
});

// Processus:
// 1. Redirection vers Keycloak pour login
// 2. Récupération du token JWT
// 3. Stockage du userId dans localStorage
// 4. Rafraîchissement automatique du token toutes les 60s
```

**Flux utilisateur** :
```
Utilisateur → Keycloak Login → Redirection avec token → Initialisation app
```

### **2. Initialisation de l'Application**

```typescript
// Frontend: src/assets/init.ts
class Init {
  async run() {
    await Promise.all([
      this.InitUser(),      // Récupère /api/users/me
      this.initOrg()        // Récupère /api/users/me/organizations
    ]);
  }
}
```

**Appels API initiaux** :
- `GET /api/users/me` → Récupère les infos utilisateur
- `GET /api/users/me/organizations` → Liste des organisations
- Initialisation des stores Vue (user, organizations, openedOrg)

### **3. Connexion WebSocket**

```typescript
// Frontend: src/composables/useWSocket.ts
const socket = io(
  import.meta.env.VITE_SOCKET_URL,
  {
    auth: { token: keycloak.token },
    reconnection: true,
    reconnectionAttempts: 5
  }
);
```

**Événements WebSocket** :
- `connect` → Connexion établie
- `connect_error` → Gestion des erreurs
- `disconnect` → Reconnexion automatique

### **4. Joindre une Discussion (DM)**

```typescript
// Frontend: ChatView.vue - mount()
const joinDM = async (userId: string) => {
  loading.value = true;
  messages.value = [];
  socket.value?.emit("join-dm", { recipientId: userId });
};
```

**Backend WebSocket** (`/websocket/routes/...`) :
- Écoute `join-dm` → Crée/rejoint une room privée
- Émet `dm:history` → Envoie l'historique des messages
- Gère `dm:new-message` → Broadcast des nouveaux messages

### **5. Chargement des Messages**

```typescript
// Backend: src/routes/messages.ts
router.get('/threads/:threadId', async (req, res) => {
  const messages = await prisma.message.findMany({
    where: { threadId },
    orderBy: { createdAt: 'desc' },
    take: limitNum,
    skip: offsetNum,
  });
  res.json(response);
});
```

**Frontend - Décryptage E2EE** :
```typescript
// ChatView.vue - procesMessages()
const decryptSingleMessage = async (msg: DMMessage) => {
  const keyToUse = (msg.senderId === user.value?.id)
    ? msg.selfEncryptedAesKey
    : msg.encryptedAesKey;
  
  const clearText = await decryptFromPeer(
    msg.content, 
    keyToUse!, 
    msg.nonce, 
    privateKey.value!
  );
  
  return { ...msg, content: clearText };
};
```

### **6. Envoi de Message**

```typescript
// Frontend: ChatView.vue - sendMessage()
const sendMessage = async () => {
  if (useEncryption) {
    // Chiffrement E2EE avec ECDH + AES-GCM
    const encryptedData = await encryptForPeer(
      newMessage.value, 
      recipientPubKey
    );
    
    finalContent = encryptedData.ciphertext;
    finalEncryptedAesKey = encryptedData.encryptedAesKey;
    finalIv = encryptedData.iv;
  }
  
  socket.value?.emit("dm:send-message", {
    recipientId: recipient.value.id,
    content: finalContent,
    encryptedAesKey: finalEncryptedAesKey,
    selfEncryptedAesKey: selfEncryptedAesKey,
    nonce: finalIv,
    isE2EE: useEncryption,
  });
};
```

**Backend - Sauvegarde** :
```typescript
// src/routes/messages.ts - POST /api/messages
const message = await prisma.message.create({
  data: {
    threadId,
    senderId: user.id,
    content,     // Peut être chiffré
    nonce,       // IV pour le déchiffrement
  },
});
```

---

## 🔒 **Chiffrement E2EE - Protocole Technique**

### **Architecture de Chiffrement**

```
┌─────────────────────────────────────────────────────────────┐
│                    PROTOCOLE E2EE SYNCO                         │
├─────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. ÉCHANGE DE CLÉS PUBLIQUES                                    │
│     ├── Méthode : ECDH P-256                                    │
│     └── Canal : WebRTC Data Channel                             │
│                                                                  │
│  2. DÉRIVATION DE CLÉS                                          │
│     ├── Algorithme : HKDF                                       │
│     ├── Hash : SHA-256                                          │
│     └── Sortie : Clé de session AES (256 bits)                  │
│                                                                  │
│  3. CHIFFREMENT DES MESSAGES                                    │
│     ├── Algorithme : AES-GCM                                    │
│     ├── Longueur IV : 12 octets                                 │
│     └── Longueur tag : 16 octets                                │
│                                                                  │
│  4. PROTECTIONS SUPPLÉMENTAIRES                                 │
│     ├── Perfect Forward Secrecy (callId unique)               │
│     ├── Anti-replay (< 30 secondes)                             │
│     ├── Anti-session hijacking (validation callId)             │
│     └── Timeout échange de clés (10 secondes)                  │
│                                                                  │
└─────────────────────────────────────────────────────────────┘
```

### **Sécurité des Appels P2P**

```typescript
// Frontend: composables/useSecurePeer.ts
// - callId unique : `${peerId}-${Date.now()}-${randomString}`
// - Vérification timestamp des messages de clés
// - Rejet si > 30 secondes (replay attack)
// - Vérification callId pour éviter session hijacking
```

**États de sécurité** :
- `encrypted: false` → Pas de clé E2EE établie
- `encrypted: true, authenticated: false` → Clé établie, attente confirmation
- `encrypted: true, authenticated: true` → E2EE pleinement opérationnel
- `fingerprint: 'TIMEOUT'` → Timeout échange de clés
- `fingerprint: 'ERROR'` → Erreur lors de l'échange

---

## ⚠️ **RÈGLES STRICTES DE DÉVELOPPEMENT**

> ⚠️ **CES RÈGLES SONT OBLIGATOIRES** - Aucun écart ne sera toléré

### **📝 1. Gestion des Commits**

**✅ JE DOIS FAIRE** :
- Faire les commits **automatiquement** quand nécessaire
- Utiliser des messages **clairs et descriptifs**
- Follow le format conventionnel :
  ```
  feat(e2ee): implement SAS authentication for P2P calls
  fix(peer): prevent duplicate call windows
  security(api): add rate limiting to message endpoints
  refactor(crypto): improve key derivation with HKDF
  docs(chat): add session workflow documentation
  ```

**❌ JE NE DOIS JAMAIS FAIRE** :
- ❌ **PUSHER** vers un remote (origin, upstream, etc.)
- ❌ Faire des commits sans message
- ❌ Squash des commits sans raison valable
- ❌ Modifier l'historique git (rebase, amend)

### **💻 2. Qualité du Code**

**✅ JE DOIS** :

**Propreté** :
- Respecter les conventions du projet (eslint, prettier)
- Pas de code mort (dead code)
- Pas de commentaires inutiles
- Nommage clair et explicite
- DRY (Don't Repeat Yourself)

**Typage (TypeScript)** :
- **ZÉRO `any`** - Toujours typer explicitement
- Utiliser les types du domaine (`types/types.ts`)
- Typage des props, returns, paramètres
- Interfaces > type aliases quand approprié
- Generic types pour les fonctions réutilisables

**Sécurité** :
- **TOUJOURS** valider les inputs (Zod, JWT, permissions)
- **TOUJOURS** gérer les erreurs avec try/catch
- **TOUJOURS** nettoyer les ressources (timeouts, connexions, mémoire)
- **JAMAIS** de trust aveugle des données utilisateur
- **JAMAIS** de logs de données sensibles
- Utiliser les middlewares de sécurité (helmet, rate-limit)

### **🔍 3. Processus de Développement**

**Avant de coder** :
1. ✅ Lire le code existant dans le scope
2. ✅ Comprendre l'architecture
3. ✅ Identifier les dépendances
4. ✅ Vérifier les types existants

**Pendant le développement** :
1. ✅ Faire des petits commits atomiques
2. ✅ Tester chaque fonctionnalité
3. ✅ Vérifier la console pour les erreurs
4. ✅ Valider le typage TypeScript

**Avant de committer** :
1. ✅ Relire son code
2. ✅ Vérifier les imports inutilisés
3. ✅ Tester manuellement
4. ✅ S'assurer que tout compile

### **🎯 4. Bonnes Pratiques Spécifiques Synco**

**Frontend (Vue 3)** :
- Utiliser `<script setup>` syntax
- Composition API > Options API
- `ref` pour les primitives réactives
- `computed` pour les valeurs dérivées
- Pas de `v-html` (risque XSS)
- Toujours utiliser `key` dans les `v-for`
- Sanitizer les inputs utilisateur

**Backend (Express)** :
- Middleware de validation avant les controllers
- Zod pour la validation des schemas
- Prisma pour les requêtes DB (pas de SQL raw)
- Toujours vérifier les permissions (getPermission)
- Ne jamais exposer d'infos sensibles dans les logs

**E2EE** :
- Toujours vérifier que E2EEUnloked.value === true
- Gérer les timeouts de déchiffrement
- Afficher des messages d'erreur clairs (pas de stack traces)
- Nettoyer les clés temporaires après usage

---

## 📁 **Structure des Fichiers Importants**

### **Backend**
```
synco_api/
├── src/
│   ├── routes/           # Routes Express
│   │   ├── messages.ts   # Gestion des messages
│   │   ├── users.ts      # Gestion des utilisateurs
│   │   └── ...
│   ├── middleware/       # Middlewares
│   │   ├── auth.ts       # Authentification
│   │   └── validation.ts  # Validation Zod
│   ├── websocket/        # Routes WebSocket
│   │   ├── org.ts        # Organisations
│   │   ├── space.ts      # Espaces
│   │   └── status.ts     # Statuts
│   ├── lib/              # Librairies
│   │   ├── prisma.ts     # Client Prisma
│   │   └── keycloak.ts   # Client Keycloak
│   └── types/            # Types TypeScript
│       └── types.ts
```

### **Frontend**
```
synco_app/
├── src/
│   ├── views/            # Pages principales
│   │   └── OrgSpace/
│   │       ├── views/
│   │       │   └── ChatView.vue    # Vue principale du chat
│   │       └── components/
│   │           └── common/
│   │               └── ChatMessage.vue
│   ├── composables/      # Composables Vue
│   │   ├── useWSocket.ts      # Gestion WebSocket
│   │   ├── useSecurePeer.ts   # Appels P2P sécurisés
│   │   └── useToast.ts        # Notifications
│   ├── assets/           # Utilities et configs
│   │   ├── keycloak.ts        # Config Keycloak
│   │   ├── init.ts            # Initialisation app
│   │   ├── var.ts             # Variables globales
│   │   └── utils/
│   │       ├── crypto.ts      # Fonctions crypto E2EE
│   │       ├── sfetch.ts      # Wrapper fetch sécurisé
│   │       └── ...
│   └── types/            # Types TypeScript
│       └── types.ts
```

---

## 🛠️ **Outils et Commandes**

### **Backend**
```bash
# Développement
bun run dev                    # Lancer le serveur

# Base de données
bun run prisma:migrate        # Migrations
bun run prisma:generate       # Générer le client
bun run prisma:push           # Push schema
bun run prisma:studio        # UI Prisma

# Qualité
bun run lint                  # Linter
bun run type-check            # Vérification types
bun test                      # Tests

# Build
bun run build                 # Build pour production
bun run start                 # Lancer le build
```

### **Frontend**
```bash
# Développement
npm run dev                   # Lancer avec hot reload (port 5174)

# Build
npm run build                 # Build pour production
npm run preview               # Preview du build

# Type checking
vue-tsc -b                    # Vérification des types
```

---

## 🎓 **Ressources et Documentation**

### **Documentation Externe**
- [Keycloak Documentation](https://www.keycloak.org/documentation)
- [Socket.io Documentation](https://socket.io/docs/v4)
- [Prisma Documentation](https://www.prisma.io/docs)
- [LiveKit Documentation](https://docs.livekit.io)
- [PeerJS Documentation](https://peerjs.com/docs)
- [Vue 3 Documentation](https://vuejs.org/guide)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook)

### **Documentation Interne**
- [`E2EE_IMPROVEMENTS.md`](E2EE_IMPROVEMENTS.md) - Améliorations E2EE
- [`README.md`](README.md) - Documentation Vue 3 + TypeScript
- Fichiers de types : `src/types/types.ts`

---

## 📞 **Contact et Support**

Pour toute question ou problème :
- **Responsable projet** : SilverCore Team
- ** Canal de communication** : À définir
- ** Urgence sécurité** : Signaler immédiatement toute vulnérabilité

---

## ✅ **Checklist pour une Nouvelle Session**

- [ ] Lire ce document (`vibe/guide.md`)
- [ ] Comprendre la tâche assignée
- [ ] Explorer le code existant dans le scope
- [ ] Vérifier les types disponibles
- [ ] Respecter les conventions du projet
- [ ] Coder avec les règles de sécurité
- [ ] Faire des commits atomiques
- [ ] **NE JAMAIS PUSHER**
- [ ] Laisser le code propre et commenté
- [ ] Documenter si nécessaire

---

## Tu dois maintenir (Vibe Memory System)

Tu dois suivre strictement les instructions de `vibe/RULES.md`.
Tu dois faire dans chaque repo un dossier `vibe/` dans lequel tu ranges tout pour les agents IA, ce sera ta mémoire à long terme :
- **`RULES.md`** : Lis-le avant chaque session.
- **`session_log.md`** : Ajoute un résumé de ta session à la fin en utilisant `vibe/templates/session_template.md`.
- **`features/`** : Place ici les spécifications de fonctionnalités (`[FEATURE]_FEATURE.md`).
- **`guide.md`** : Maintiens ce fichier à jour pour les prochaines sessions.

---

## 🔚 **Conclusion**

Ce document sert de **référence obligatoire** pour toute session de développement sur le projet Synco.

**Rappel des priorités** :
1. **Sécurité** > Fonctionnalité > Performance
2. **Qualité du code** est non-négociable
3. **Commits automatiques** mais **JAMAIS de push**
4. **TypeScript strict** et **zéro faille**

> 💡 **Bon développement !** L'équipe Synco compte sur votre rigueur pour maintenir la qualité et la sécurité de la plateforme.

---

*Document généré et maintenu par Mistral Vibe*

---

## 📜 Historique des Sessions et Mises à Jour

### 25 Juin 2026 - Résolution des problèmes WebSocket + CORS + HTTPS

**Problèmes résolus** :
- ✅ **Timeout WebSocket après 15000ms** : URL `undefined` en mode dev → URL explicite basée sur `VITE_USE_HTTPS`
- ✅ **NS_ERROR_NET_TIMEOUT** : Backend pas démarré ou ports bloqués → Configuration cohérente HTTP/HTTPS
- ✅ **CORS Failed** : Origin non autorisée → Support multi-origines dans CORS
- ✅ **Mixed Content** : HTTPS frontend → HTTP backend → Tout en HTTPS avec certificat valide
- ✅ **Web Crypto API not available** : Keycloak nécessite HTTPS → Passage complet en HTTPS

**Modifications principales** :

| Projet | Fichier | Changement |
|--------|---------|------------|
| Backend | `src/index.ts` | Basculable HTTPS/HTTP via `API_USE_HTTPS` |
| Backend | `src/index.ts` | CORS multi-origines avec split de `FRONTEND_URL` |
| Backend | `src/websocket/ws.ts` | HTTPS conditionnel + CORS multi-origines |
| Backend | `certs/server.{key,crt}` | Certificat avec SAN pour localhost et 192.168.1.73 |
| Backend | `.env` | `API_USE_HTTPS=true`, `FRONTEND_URL=https://...` |
| Frontend | `vite.config.ts` | HTTPS conditionnel + lecture directe du .env |
| Frontend | `src/composables/useWSocket.ts` | URL dynamique + gestion erreurs améliorée |
| Frontend | `.env` | `VITE_USE_HTTPS=true`, URLs en HTTPS |

**Configuration recommandée** :
```bash
# Pour le développement avec Keycloak (nécessite HTTPS)
# Backend
API_USE_HTTPS=true
FRONTEND_URL=https://localhost:5174,https://192.168.1.73:5174

# Frontend  
VITE_USE_HTTPS=true
VITE_API_URL=https://192.168.1.73:9000
VITE_SOCKET_URL=https://192.168.1.73:3467
```

**Fichiers de suivi** :
- [vibe/session_log.md (Backend)](../synco_api/vibe/session_log.md) - Historique complet du backend
- [vibe/session_log.md (Frontend)](session_log.md) - Historique complet du frontend

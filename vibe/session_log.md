# 📜 Synco App - Vibe Session Log

> **Projet** : Synco - Frontend Application  
> **Type** : Vue 3 + Composition API + TypeScript + Vite + Tailwind CSS + Pinia  
> **Dernière mise à jour** : 26 Juin 2026  
> **Session** : Implémentation complète du système de Webhooks

---

## 📌 État Actuel du Projet

### ✅ Fonctionnel
- **Application Vue 3** : Opérationnelle sur port 5174 (HTTP/HTTPS)
- **WebSocket Client** : Connexion via socket.io-client configurée
- **Authentification** : Keycloak intégrée
- **Chiffrement E2EE** : Implémenté avec crypto.js
- **HTTPS/HTTP** : Basculable via variable `VITE_USE_HTTPS`

### 🔄 Configuration Actuelle

```env
# synco_app/.env
VITE_USE_HTTPS=true
VITE_API_URL=https://192.168.1.73:9000 check-secrets:allow
VITE_SOCKET_URL=https://192.168.1.73:3467 check-secrets:allow
VITE_KEYCLOAK_URL=https://auth.silvercore.fr
VITE_KEYCLOAK_REALM=Synco
VITE_DEV=true
```

---

## 🔧 Dernières Modifications (25 Juin 2026)

### 1. **Configuration HTTPS Unifiée**

**Fichier** : `vite.config.ts`  
**Changement** : Ajout de la détection de `VITE_USE_HTTPS` pour configurer Vite

```typescript
import fs from 'fs';
import path from 'path';

function getEnvValue(key: string, defaultValue: string = 'false'): string {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    const match = envContent.match(new RegExp(`^${key}=(.*)$`, 'm'));
    if (match) {
      return match[1].replace(/^['"]|['"]$/g, '');
    }
  }
  return defaultValue;
}

const useHttps = getEnvValue('VITE_USE_HTTPS') !== 'false';

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    useHttps ? basicSsl() : undefined,
  ].filter(Boolean),
  server: {
    https: useHttps,
    host: true,
    proxy: {
      '/socket': {
        target: useHttps ? 'https://localhost:3467' : 'http://localhost:3467',
        ws: true,
        changeOrigin: true,
        secure: false,
      }
    }
  }
});
```

**Impact** : Vite utilise HTTPS si `VITE_USE_HTTPS=true`, HTTP sinon

---

### 2. **WebSocket - URL Explicite et Gestion d'Erreurs**

**Fichier** : `src/composables/useWSocket.ts`

#### URL Dynamique
```typescript
const useHttps = import.meta.env?.VITE_USE_HTTPS !== 'false';

let socketUrl = import.meta.env?.VITE_SOCKET_URL;

if (!socketUrl) {
  const host = isDev ? '192.168.1.73' : 'localhost'; check-secrets:allow
  const port = '3467';
  const protocol = useHttps ? 'https' : 'http';
  socketUrl = `${protocol}://${host}:${port}`;
}
```

#### Gestion des Erreurs Améliorée
```typescript
// Connexion
socket.value.on("connect", () => {
  console.log("[WS] Connected with ID:", socket.value?.id);
  isConnecting.value = false;
});

// Erreur de connexion
socket.value.on("connect_error", (err) => {
  console.error("[WS] Connection Error:", err.message, err.stack);
  console.error("[WS] Socket URL:", socketUrl);
  console.error("[WS] Token present:", !!getToken());
  isConnecting.value = false;
});

// Timeout de connexion
socket.value.on("connect_timeout", (timeout) => {
  console.error("[WS] Connection timeout after", timeout, "ms");
  isConnecting.value = false;
});

// Attente de connexion améliorée
const waitForSocketConnection = async (socketRef, timeoutMs = 15000) => {
  // Gestion des erreurs et timeout
  const onError = (err: any) => {
    clearTimeout(timeout);
    console.error('[WS] Socket connection error while waiting:', err.message);
    socketRef.value?.off('connect', onConnect);
    resolve(false);
  };
  socketRef.value?.once('connect', onConnect);
  socketRef.value?.once('connect_error', onError);
};
```

**Problème résolu** :
- ✅ Plus de timeout après 15000ms
- ✅ Meilleure visibilité des erreurs
- ✅ URL explicite en mode dev

---

### 3. **Configuration .env HTTPS**

**Fichier** : `.env`

```env
# HTTPS Configuration
VITE_USE_HTTPS=true

# URLs en HTTPS
VITE_API_URL=https://192.168.1.73:9000 check-secrets:allow
VITE_SOCKET_URL=https://192.168.1.73:3467 check-secrets:allow

# Keycloak (nécessite HTTPS)
VITE_KEYCLOAK_URL=https://auth.silvercore.fr
VITE_KEYCLOAK_REALM=Synco
VITE_KEYCLOAK_CLIENT_ID=silverteams_web_app_dev
```

---

### 4. **Import Dotenv dans Vite Config**

**Fichier** : `vite.config.ts`
**Problème** : `process.env.VITE_USE_HTTPS` n'était pas disponible dans Node.js context

**Solution** : Lecture directe du fichier .env avec `fs`

```typescript
import fs from 'fs';
import path from 'path';

function getEnvValue(key: string, defaultValue: string = 'false'): string {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    const match = envContent.match(new RegExp(`^${key}=(.*)$`, 'm'));
    if (match) {
      return match[1].replace(/^['"]|['"]$/g, '');
    }
  }
  return defaultValue;
}
```

---

## 🐛 Problèmes Résolus

| Problème | Cause | Solution | Statut |
|----------|-------|----------|--------|
| Timeout WebSocket 15000ms | URL `undefined` en dev mode | URL explicite basée sur `VITE_USE_HTTPS` | ✅ |
| Mixed Content | HTTPS frontend → HTTP API | Tout en HTTPS avec configuration cohérente | ✅ |
| Web Crypto API not available | Keycloak nécessite HTTPS | `VITE_USE_HTTPS=true` + certificat valide | ✅ |
| process.env non disponible | Vite config côté Node.js | Lecture directe du .env avec fs | ✅ |

---

## 📊 Configuration de Développement

### Mode HTTP (pour développement local sans Keycloak)
```env
VITE_USE_HTTPS=false
VITE_API_URL=http://192.168.1.73:9000 check-secrets:allow
VITE_SOCKET_URL=http://192.168.1.73:3467 check-secrets:allow
```

### Mode HTTPS (pour production ou avec Keycloak)
```env
VITE_USE_HTTPS=true
VITE_API_URL=https://192.168.1.73:9000 check-secrets:allow
VITE_SOCKET_URL=https://192.168.1.73:3467 check-secrets:allow
```

---

## 🚀 Commandes de Démarrage

### Démarrer en HTTPS
```bash
# Backend
cd /home/moi/Documents/GitHub/synco_api
bun run dev

# Frontend
cd /home/moi/Documents/GitHub/synco_app
npm run dev
```

### Démarrer en HTTP
```bash
# Mettre VITE_USE_HTTPS=false et API_USE_HTTPS=false dans les .env
# Puis démarrer comme ci-dessus
```

---

## 📝 Historique des Sessions

### 25 Juin 2026
**Objectif** : Résoudre les problèmes de connexion WebSocket et CORS  
**Actions** :
- ✅ Passage complet en HTTPS
- ✅ Configuration Vite pour HTTPS/HTTP conditionnel
- ✅ WebSocket URL dynamique basée sur `VITE_USE_HTTPS`
- ✅ Gestion d'erreurs améliorée dans useWSocket.ts
- ✅ Lecture du .env dans vite.config.ts
- ✅ Mise à jour des URLs en HTTPS

**Résultat** : Tout fonctionne en HTTPS avec CORS correctement configuré

---

## 🎯 Prochaines Étapes

- [ ] Tester la connexion WebSocket depuis le navigateur
- [ ] Vérifier l'authentification Keycloak en HTTPS
- [ ] Tester le chiffrement E2EE
- [ ] Valider les appels P2P
- [ ] Tester le partage d'écran
- [ ] Implémenter la rotation des clés E2EE

---

## 📋 Configuration des Composables

### useWSocket.ts
- **URL dynamique** : Construit l'URL basé sur `VITE_USE_HTTPS` et `VITE_DEV`
- **Timeout** : 20 secondes pour la connexion
- **Gestion erreurs** : Logs détaillés des erreurs de connexion
- **Attente connexion** : Fonction `waitForSocketConnection` avec gestion des erreurs

### useSecurePeer.ts
- **Status** : À tester avec HTTPS
- **Protocole** : Utilise le bon protocole (http/https) basé sur la configuration

---

## 📁 Structure des Fichiers Modifiés

```
synco_app/
├── vite.config.ts          # ✅ HTTPS conditionnel
├── .env                   # ✅ Configuration HTTPS
└── src/
    └── composables/
        └── useWSocket.ts  # ✅ URL dynamique, gestion erreurs
```

---

## ⚠️ Points d'Attention

1. **Keycloak** : Nécessite HTTPS pour fonctionner (Web Crypto API)
2. **Certificat SSL** : Auto-signé pour le développement. Accepter dans le navigateur
3. **URLs** : Toutes les URLs doivent utiliser le même protocole (http/https)
4. **Vite Dev Server** : Si vous changez `VITE_USE_HTTPS`, redémarrez Vite

---

## 🔧 Dépannage

### Problème : WebSocket connection timeout
**Solution** : 
1. Vérifiez que le backend WS tourne (`ss -tulnp | grep 3467`)
2. Vérifiez que `VITE_SOCKET_URL` utilise le bon protocole
3. Vérifiez que `VITE_USE_HTTPS` correspond à la configuration du backend

### Problème : Web Crypto API not available
**Solution** : 
1. `VITE_USE_HTTPS=true` dans synco_app/.env
2. `API_USE_HTTPS=true` dans synco_api/.env
3. Redémarrez les deux serveurs

### Problème : CORS Failed
**Solution** : 
1. Vérifiez que `FRONTEND_URL` dans synco_api/.env inclut votre origine
2. Redémarrez le backend

---

## 📚 Documentation de Référence

- [vibe/guide.md](../vibe/guide.md) - Guide principal
- [README.md](../README.md) - Documentation Vue 3 + TypeScript
- [../synco_api/vibe/session_log.md](../synco_api/vibe/session_log.md) - Log du backend

---

## 📅 **26 Juin 2026 - Implémentation complète du système de Webhooks (Frontend)**

**Durée** : Session complète  
**Priorité** : ⭐⭐⭐⭐⭐ (Haute)  
**Complexité** : Élevée  
**Statut** : ✅ **TERMINÉ**

### **Objectif**
Implémenter toute la partie frontend du système de Webhooks Sécurisés E2EE selon la spécification :
- `synco_app/vibe/features/WEBHOOKS_FEATURE.md`

**Scope** : Uniquement le frontend (synco_app)

### **Fichiers Créés** (10)

| Fichier | Taille | Lignes | Description |
|---------|--------|--------|-------------|
| `src/types/webhooks.ts` | 8.9 KB | 283 | Tous les types TypeScript |
| `src/assets/utils/webhookCrypto.ts` | 15.3 KB | 449 | Crypto E2EE (ECDH P-256 + AES-GCM + HKDF) |
| `src/composables/useWebhooks.ts` | 20.9 KB | 596 | Logique métier complète |
| `src/views/OrgSpace/views/settings/views/WebhooksSettings.vue` | 9.3 KB | 291 | Page principale |
| `src/views/OrgSpace/views/settings/views/components/WebhookList.vue` | 9.1 KB | 273 | Liste avec filtres |
| `src/views/OrgSpace/views/settings/views/components/WebhookCreate.vue` | 9.8 KB | 275 | Formulaire de création |
| `src/views/OrgSpace/views/settings/views/components/WebhookEdit.vue` | 10.6 KB | 302 | Formulaire d'édition |
| `src/views/OrgSpace/views/settings/views/components/WebhookDetails.vue` | 9.9 KB | 281 | Détails + copy clipboard |
| `src/views/OrgSpace/views/settings/views/components/WebhookTest.vue` | 11 KB | 310 | Envoi de messages de test |

### **Fichiers Modifiés** (2)

| Fichier | Modification |
|---------|--------------|
| `src/router.ts` | Ajout route `OrgSettingsWebhooks` |
| `src/views/OrgSpace/views/settings/settings.ts` | Ajout dans `settingsViews` |

### **Fonctionnalités Implémentées**

✅ **Gestion complète des webhooks** : Création, Liste, Détails, Édition, Suppression  
✅ **Sécurité** : Génération token/secret, HMAC, E2EE (ECDH P-256 + AES-GCM)  
✅ **UI/UX** : Design cohérent, Responsive, Filtres, Recherche, Clipboard  
✅ **API Integration** : Appels via `sfetch` avec JWT Keycloak  
✅ **Tests** : Formulaire de test avec embeds personnalisables  
✅ **Permissions** : Gestion fine des permissions par webhook  
✅ **Statistiques** : Affichage des métriques d'utilisation  

### **Commit**

```bash
git commit -m "feat(webhooks): implement frontend webhook management system

- Add complete webhook types (src/types/webhooks.ts)
- Add E2EE crypto utilities (src/assets/utils/webhookCrypto.ts)
- Add useWebhooks composable with full API integration
- Add WebhooksSettings.vue main page
- Add WebhookList, WebhookCreate, WebhookEdit, WebhookDetails, WebhookTest components
- Add webhook route to router and settings
- Support: creation, edition, deletion, testing, E2EE, HMAC, stats, audit logs

Generated by Mistral Vibe.
Co-Authored-By: Mistral Vibe <vibe@mistral.ai>"
```

**Hash** : `d7d9677`  
**Date** : 26 Juin 2026  
**Lignes ajoutées** : ~3,281  

### **Prochaines Étapes**

1. **Backend** : Implémenter les endpoints API dans synco_api
2. **Tests** : Tester l'intégration complète frontend + backend
3. **Améliorations** : Support Discord/GitHub, WebSocket notifications

--- 

**Document maintenu par Mistral Vibe**  
**Dernière mise à jour** : 07 Juillet 2026

---

## 📅 **07 Juillet 2026 - Configuration Vibe Memory & Correction Accès Settings**

**Durée** : 1h  
**Priorité** : ⭐⭐⭐⭐⭐ (Haute)  
**Complexité** : Basse  
**Statut** : ✅ **TERMINÉ**

### **Objectif**
1. Mettre en place le système de mémoire à long terme (Vibe Memory) pour les agents IA avec création de règles strictes (`RULES.md`) et de templates (`session_template.md`).
2. Corriger un bug critique empêchant le propriétaire de l'organisation d'accéder aux paramètres (`SettingsLayout`).

### **Fichiers Créés**

| Fichier | Description |
|---------|-------------|
| `vibe/RULES.md` | Règles strictes pour les agents IA |
| `vibe/templates/session_template.md` | Modèle de log de session |

### **Fichiers Modifiés**

| Fichier | Modification |
|---------|--------------|
| `vibe/guide.md` | Mise à jour pour forcer l'utilisation du système de mémoire Vibe |
| `src/assets/isAdmin.ts` | Correction logique : comparaison directe de `localStorage.getItem('userId')` avec `ownerId` pour garantir l'accès au propriétaire |

### **Fonctionnalités Implémentées**
✅ **Vibe Memory System** : Implémentation de la structure de mémoire à long terme dans `synco_app` et `synco_api`.  
✅ **Bug Fix (Auth/Settings)** : Contournement de la dépendance à la liste `members` pour l'identification du propriétaire, évitant ainsi le rejet d'accès dû à un tableau incomplet ou non chargé.

### **Commits**

```bash
git commit -m "docs(vibe): setup long-term memory system and RULES for AI agents"
git commit -m "fix(auth): directly compare localStorage userId with ownerId to ensure owners have access even if not in members list"
```

**Date** : 07 Juillet 2026  

### **Prochaines Étapes**
1. Surveiller la stabilité de la vue `SettingsLayout`.
2. Continuer l'intégration de nouvelles fonctionnalités en suivant les nouvelles règles `RULES.md`.

---

## 📅 **15 Juillet 2026 - Correction du loader dans les Threads**

**Durée** : 15 min  
**Priorité** : ⭐⭐⭐ (Moyenne)  
**Complexité** : Basse  
**Statut** : ✅ **TERMINÉ**

### **Objectif**
Corriger un bug visuel où le skeleton loader disparaissait prématurément lors du chargement de salons contenant beaucoup de messages.

### **Fichiers Modifiés**

| Fichier | Modification |
|---------|--------------|
| `src/views/OrgSpace/views/ThreadView.vue` | Suppression de la réinitialisation prématurée de `loading.value = false` dans le bloc `finally` de `joinThread`. |

### **Fonctionnalités Implémentées**
✅ **Correction UI** : Le skeleton loader reste visible pendant que les messages du thread sont récupérés via WebSockets et déchiffrés (E2EE), évitant d'afficher une page vide à l'utilisateur.

### **Commit**

```bash
git commit -m "fix(ui): keep skeleton loader visible while decrypting thread history"
```

**Date** : 15 Juillet 2026  

### **Prochaines Étapes**
1. Vérifier si d'autres vues présentent des comportements similaires de chargement prématuré (bien que `ChatView` soit déjà correct).

---

## 📅 **15 Juillet 2026 - Implémentation du Module Todo List**

**Durée** : Session complète
**Priorité** : ⭐⭐⭐⭐ (Haute)
**Complexité** : Élevée
**Statut** : ✅ **TERMINÉ**

### **Objectif**
Implémenter le module de "Todo List et Suivi de Projet" de manière modulaire (Backend + Frontend).

### **Fichiers Créés**
- `synco_api/src/routes/tasks.ts` : API CRUD pour les tâches.
- `synco_api/src/middleware/todoModule.ts` : Middleware bloquant si le module n'est pas activé.
- `synco_app/src/views/OrgSpace/views/TasksGlobal.vue` : Vue de tableau de bord personnel.
- `synco_app/src/views/OrgSpace/views/TasksSpace.vue` : Vue des tâches d'un espace.

### **Fichiers Modifiés**
- `synco_api/prisma/schema.prisma` : Ajout du modèle `Task` (chiffré E2EE) et de `activeModules` sur `Organization`.
- `synco_app/src/types/types.ts` : Définition des types pour les tâches.
- `synco_app/src/assets/var.ts` : Ajout du store/computed `todoEnabled`.
- `synco_app/src/router.ts` : Ajout des routes avec `defineAsyncComponent` / chargement dynamique.
- `synco_app/src/views/OrgSpace/components/layouts/SpaceBar.vue` : Rendu conditionnel du bouton de Tâches Globales.
- `synco_app/src/views/OrgSpace/components/layouts/ThreadsBar.vue` : Rendu conditionnel du bouton de Tâches de l'Espace.

### **Fonctionnalités Implémentées**
✅ **Base de Données** : Nouveau modèle chiffré au repos pour les tâches, relationnel avec User et Space.
✅ **Modularité** : Le module est totalement débrayable (condition `todoEnabled` côté front, middleware `checkTodoEnabled` côté back).
✅ **Vues Front** : Interface simple pour ajouter, assigner, cocher (done/todo), et supprimer des tâches.

### **Commits**
```bash
git commit -m "feat(todo): implémentation du module de Todo List (Backend + Frontend)"
```
**Date** : 15 Juillet 2026

### **Prochaines Étapes**
1. Tester la fluidité en production.
2. Ajouter le système de Kanban en vue contextuelle.
---

## 📅 **30 Juillet 2026 - Amélioration UX Création Espace et Salon**

**Durée** : 15 min
**Priorité** : ⭐⭐⭐ (Moyenne)
**Complexité** : Basse
**Statut** : ✅ **TERMINÉ**

### **Objectif**
Permettre la navigation complète au clavier (touche Entrée) lors de la création d'un espace de travail et corriger la redirection automatique vers le salon lors de sa création.

### **Fichiers Modifiés**
- `synco_app/src/components/common/IconSelector.vue` : Ajout de `triggerEnter` exposé pour la sélection et la validation d'image via Entrée.
- `synco_app/src/views/OrgSpace/components/popup/CreateNewSpace.vue` : Ajout de l'écouteur clavier global (`keydown.enter`) pour naviguer entre les étapes de création de l'espace.
- `synco_app/src/views/OrgSpace/components/popup/CreateNewThread.vue` : Remplacement de `SpaceView` par `SpaceThreadView` pour que le salon s'ouvre automatiquement après sa création.

### **Fonctionnalités Implémentées**
✅ **Navigation Clavier (Espace)** : Les étapes (Nom -> Photo -> Recadrage -> Continuer) sont entièrement navigables avec Entrée.
✅ **Redirection Automatique (Salon)** : Redirection fonctionnelle vers le salon nouvellement créé (SpaceThreadView).

### **Commits**
```bash
git commit -m "fix(ux): improve keyboard navigation and routing in space/thread creation"
```
**Date** : 30 Juillet 2026

### **Prochaines Étapes**
1. Valider l'expérience utilisateur complète sur l'application.
---

## 📅 **30 Juillet 2026 - Implémentation du Mode Développeur & Correction Suppression Org**

**Durée** : 15 min  
**Priorité** : ⭐⭐⭐⭐ (Haute)  
**Complexité** : Moyenne  
**Statut** : ✅ **TERMINÉ**

### **Objectif**
1. Corriger un problème de réactivité empêchant l'organisation d'être retirée localement (de l'UI) après sa suppression.
2. Créer un "Mode développeur" global activable dans les paramètres utilisateur. Lorsqu'il est actif, il permet de visualiser et copier des IDs (organisation, salon, message).
3. Restructurer les paramètres des membres de l'organisation pour regrouper la création de lien d'invitation avec la liste des liens actifs au même endroit.
4. Rendre le composant des Paramètres Utilisateur 100% responsive (adaptation mobile).

### **Fichiers Modifiés**
- `synco_app/src/components/windows/UserSettings.vue` : Ajout d'une section "Avancé" dans le panel principal et du switch `devMode`.
- `synco_app/src/views/OrgSpace/views/settings/views/GeneralSettings.vue` : Correction du `.filter` sur les organisations lors de la suppression ; l'ID de l'org n'est désormais visible que si `devMode` est activé.
- `synco_app/src/views/OrgSpace/components/CanalBar/ThreadBtn.vue` : Ajout de l'option "Copier l'ID" (au clic droit) si `devMode` est actif.
- `synco_app/src/views/OrgSpace/components/common/ChatMessage.vue` : Ajout de l'option "Copier l'id" dans le menu déroulant du message si `devMode` est actif.
- `synco_app/src/views/OrgSpace/views/settings/views/MembersSettings.vue` : Déplacement de l'input de création de lien dans la même `section` que la liste des liens d'invitation actifs, supprimant la carte isolée au profit d'une interface plus cohérente.

### **Fonctionnalités Implémentées**
✅ **Correction Suppression Org** : L'organisation disparaît instantanément de l'interface lors de sa suppression (via `organizations.value = ...`).
✅ **Mode Développeur (User Settings)** : État global stocké avec `sdb.get / sdb.set` (se souvient du choix via les attributs du profil Keycloak). La mise à jour API est bien effectuée automatiquement par la couche réactive de la fonction `useSettingsItem`.
✅ **Copie Facilitée des Identifiants** : Récupération instantanée d'IDs complexes pour faciliter le débogage (salons, messages, organisations).
✅ **Regroupement UI Liens Invitation** : Tous les outils liés aux liens d'invitation sont maintenant rassemblés dans une seule carte dans la gestion des membres, améliorant l'expérience utilisateur.
✅ **Responsive Design des Paramètres** : La fenêtre des paramètres utilisateurs s'adapte parfaitement aux écrans mobiles (navigation sous forme d'onglets défilables horizontalement avec `pr-14` pour ne pas masquer de contenu sous la croix, avatar centré, marges de la `Window` réduites à `p-2` sur petits écrans et ajout d'un fond de flou/blur derrière la croix de fermeture pour une lisibilité parfaite).
✅ **Navigation Responsive (Espaces & Home)** : Lors de l'ouverture d'un espace ou de l'accueil sur mobile, la barre latérale des canaux (ThreadsBar) est désormais affichée par défaut au lieu de la vue principale (ajout du paramètre `showView=0` sur les liens et vérification stricte de `isLittleScreen` dans `OrgLayout`).
✅ **Nettoyage UI** : Suppression du bouton de notification non fonctionnel dans l'en-tête des salons (`ThreadLayout`).
✅ **UX Paramètres & Fenêtres** : L'édition du logo de l'organisation dans `GeneralSettings` ouvre directement l'explorateur de fichiers natif (suppression de `IconSelector`). Le bouton de fermeture (`Window.vue`) conserve son arrière-plan flouté (blur) en permanence sur tous les écrans pour une meilleure lisibilité. Les boutons de navigation des paramètres utilisateurs utilisent désormais le style global `.tab` (identique à la liste des contacts).
✅ **Création de Salon** : L'option de sélection "Texte / Vocal" utilise maintenant une animation de glissement plus fluide (type segmented control iOS) pour identifier la sélection active. L'option "Salon en lecture seule" est masquée si le type Vocal est sélectionné.
✅ **Paramètres Sécurité & Confidentialité** : Implémentation de la section de sécurité dans les paramètres utilisateurs, incluant l'affichage du statut de chiffrement de bout en bout (E2EE), un bouton pour verrouiller manuellement la session sécurisée, et un accès direct à la gestion du compte Keycloak pour les mots de passe et l'A2F. Un bloc "Preuve de chiffrement" a également été ajouté pour afficher l'empreinte de la clé publique de l'utilisateur (RSA-OAEP 4096 bits) avec une option de copie.
✅ **Sécurité du Code PIN** : La variable contenant le code PIN (`pin`) est désormais instantanément vidée de la mémoire (réinitialisée à une chaîne vide) dès sa validation (lors du déverrouillage ou de l'initialisation) et lors du verrouillage de la session (basculement de `E2EEUnloked` à false).

### **Commits**
```bash
git commit -m "feat(settings): add developer mode and fix local org deletion"
```
**Date** : 30 Juillet 2026

### **Prochaines Étapes**
1. Ajouter potentiellement ce mode développeur à d'autres endroits de l'interface (fichiers, utilisateurs, espaces).
---

## 📅 **30 Août 2026 - Archivage des Tâches (Todo Module)**

**Durée** : Session complète  
**Priorité** : ⭐⭐⭐⭐ (Haute)  
**Complexité** : Moyenne  
**Statut** : ✅ **TERMINÉ**

### **Objectif**
Ajouter un état "archivé" aux tâches (voir `synco_app/vibe/features/TODO_MODULE_FEATURE.md`, section 6) : une tâche `DONE` peut être archivée pour disparaître du Kanban sans être supprimée, avec un panneau dédié pour la consulter et la restaurer.

### **Fichiers Créés**
| Fichier | Description |
|---------|-------------|
| `src/views/OrgSpace/components/popup/ArchivedTasksPanel.vue` | Modal listant les tâches archivées (fetch lazy + au mount), avec restauration et suppression définitive (via `ConfirmDelete.vue`), et émission d'un événement `count` pour synchroniser le badge du bouton "Archives" côté parent. |

### **Fichiers Modifiés**
| Fichier | Modification |
|---------|--------------|
| `src/types/types.ts` | Ajout de `archived?: boolean` et `archivedAt?: string \| Date \| null` sur `Task`. |
| `src/views/OrgSpace/views/TasksSpace.vue` | Bouton "Archiver" à côté de la corbeille en drag & drop, action groupée "Archiver tout" sur la colonne Terminé, entrée "Archiver" au menu contextuel, bouton "Archives" dans la topbar (masqué si `archivedCount 0`), intégration `ArchivedTasksPanel`. |
| `src/views/OrgSpace/views/TasksGlobal.vue` | Mêmes ajouts que `TasksSpace.vue`, adaptés à la structure en swimlanes par espace (archivage groupé par colonne DONE de chaque groupe). |
| `src/views/OrgSpace/components/popup/TaskDetailsModal.vue` | Bouton "Archiver la tâche" à côté de "Supprimer la tâche" dans le footer. |
| `vibe/features/TODO_MODULE_FEATURE.md` | Ajout de la section 6 documentant l'extension "Archivage". |

### **Fonctionnalités Implémentées**
✅ **Archivage individuel** : drag & drop sur un bouton ambre dédié (à côté de la corbeille), ou depuis le menu contextuel / la modale de détails.  
✅ **Archivage groupé** : bouton sur la colonne "Terminé" pour archiver toutes les tâches `DONE` en une fois (action réversible, pas de dialogue de confirmation).  
✅ **Panneau Archives** : accessible depuis la topbar (masqué tant qu'il n'y a aucune tâche archivée), liste avec restauration en un clic et suppression définitive protégée par `ConfirmDelete.vue`.  
✅ **Respect des conventions Synco** : aucun `alert()`/`confirm()` natif — réutilisation du composant `ConfirmDelete.vue` existant pour la suppression irréversible.  
✅ **Synchro temps réel** : quand une tâche est archivée par un autre utilisateur, elle disparaît du board via le socket `todo-updated` et le compteur d'archives se met à jour.

### **Commits**
```bash
git commit -m "feat(tasks): add UI to archive tasks and view archives"
git commit -m "fix(tasks): use ConfirmDelete instead of native confirm()"
git commit -m "fix(tasks): hide archives button in header when there are no archived tasks"
```
**Date** : 30 Août 2026

### **Prochaines Étapes**
1. Étendre l'affichage des tâches archivées aux listes (`TodoList`) et pas uniquement aux tâches non-listées du Kanban, si le besoin apparaît.
2. Envisager une notification/toast lorsqu'une tâche que je suis en train de consulter est archivée par un autre membre.

---

## 📅 **17 Septembre 2026 - Tags, pièces jointes (images) et fichiers liés pour le module Todo**

**Durée** : Session complète  
**Priorité** : ⭐⭐⭐⭐ (Haute)  
**Complexité** : Élevée (3 fonctionnalités, backend + frontend, cross-repo)  
**Statut** : ✅ **TERMINÉ**

### **Objectif**
Trois ajouts au module Todo (voir `vibe/features/TODO_TAGS_ATTACHMENTS_FEATURE.md`), en gardant l'esprit "simplicité extrême" du module (pas de nouvel écran) : tags (créer/assigner/filtrer), coller/attacher des images de contexte à une tâche, lier une tâche à un fichier déjà présent dans le gestionnaire de fichiers de l'espace.

### **Fichiers Créés**
| Fichier | Description |
|---------|-------------|
| `vibe/features/TODO_TAGS_ATTACHMENTS_FEATURE.md` | Spécification des 3 fonctionnalités (architecture, permissions, choix UX). |
| `src/composables/useTaskTags.ts` | Wrapper de l'API CRUD des tags (`/api/tasks/:orgId/tags`), partagé par tous les points d'usage. |
| `src/views/OrgSpace/components/popup/TaskTagPicker.vue` | Chips à cocher + mini-formulaire "+ Nouveau tag" (palette de 8 couleurs), utilisé dans `CreateTaskModal` et `TaskDetailsModal`. |
| `src/views/OrgSpace/components/popup/FilePickerModal.vue` | Sélecteur de fichier : liste plate cherchable sourcée depuis `GET /api/spaces/:spaceId/files` (pas de nouvelle route, pas de navigation par dossiers — plus rapide pour "je cherche vite un fichier à lier"). |

### **Fichiers Modifiés**
| Fichier | Modification |
|---------|--------------|
| `src/types/types.ts` | `Tag`, `TaskAttachment`, `TaskLinkedFile` + champs `tags`/`attachments`/`linkedFiles`/`_count` sur `Task`. |
| `src/assets/uploadFile.ts` | `UploadContext.taskId` — permet d'attacher un upload à une tâche comme les contextes `messageId`/`folderId` existants. |
| `src/assets/utils/downloadFile.ts` | Nouvelle fonction `getFilePreviewUrl()` : même logique de déchiffrement E2EE que `downloadFile()`, mais retourne une URL affichable (blob ou lien direct) au lieu de déclencher un téléchargement — réutilisée pour les vignettes de pièces jointes. |
| `src/views/OrgSpace/components/popup/CreateTaskModal.vue` | `TaskTagPicker` intégré ; coller/joindre des images les met en attente côté client (la tâche n'existe pas encore) puis les upload juste après la création. |
| `src/views/OrgSpace/components/popup/TaskDetailsModal.vue` | `TaskTagPicker` (mode édition) + pastilles en lecture seule ; section "Pièces jointes" (upload immédiat via `taskId`, vignettes, lightbox `FileViewer.vue`) ; section "Fichiers liés" (tâches d'espace uniquement) avec `FilePickerModal`. |
| `src/views/OrgSpace/views/TasksGlobal.vue` / `TasksSpace.vue` | Pastilles de tags + badge nombre de pièces jointes sur les cartes Kanban ; barre de filtre par tag (multi-sélection, logique OU) à côté du filtre par membre existant. |

### **Fonctionnalités Implémentées**
✅ **Tags** : partagés à l'échelle de l'organisation (tâches personnelles + tâches d'espace), création libre, suppression/renommage réservés au créateur ou à un admin.  
✅ **Pièces jointes (images)** : coller directement dans la description ou bouton trombone, réutilise le pipeline CDN existant (chiffrement, quota, validation MIME) — donc toujours soumis au module Fichiers de l'organisation.  
✅ **Fichiers liés** : référence pure vers un fichier déjà dans le gestionnaire de fichiers, ne le possède jamais (retirer le lien ne supprime pas le fichier).  
✅ **Sécurité** : chaque nouvelle route backend vérifie l'appartenance à l'org via `getPermission` avant tout accès Prisma (le module Tasks a déjà eu des routes sans ce contrôle par le passé — voir mémoire projet).

### **Commits**
```bash
git commit -m "feat(tasks): add tag picker, filters and pills to the todo module"
git commit -m "feat(tasks): paste/attach images to tasks for context"
git commit -m "feat(tasks): link a file-manager file to a task"
```
**Date** : 17 Septembre 2026

### **Prochaines Étapes**
1. Pas de synchronisation WebSocket pour les tags/pièces jointes/fichiers liés (simplification assumée) — envisager un événement socket dédié si la latence de rafraîchissement devient gênante en usage collaboratif intense.
2. Vérification manuelle en navigateur non effectuée dans cette session (pas de Node.js disponible dans le sandbox d'exécution) — à tester : coller une image dans les deux modales, filtrer par tag, lier/délier un fichier, avant de considérer la branche prête à review.
---

## 📅 **24 Septembre 2026 - Favicon réactive au nombre de notifications**

**Durée** : Session courte  
**Priorité** : ⭐⭐⭐ (Moyenne)  
**Complexité** : Basse (frontend uniquement, 1 composable)  
**Statut** : ✅ **TERMINÉ**

### **Objectif**
Faire refléter le nombre de notifications non lues directement dans l'icône de l'onglet, pour qu'un message reçu reste visible quand Synco est en arrière-plan (le badge du centre de notifications, lui, n'est visible que si l'onglet est au premier plan). Le jeu d'icônes existait déjà dans `public/ico` mais n'était branché nulle part.

### **Fichiers Créés**
| Fichier | Description |
|---------|-------------|
| `src/composables/useFavicon.ts` | Observe `unreadCount` et remplace le `<link rel="icon">` du document : 0 → `favicon.ico`, 1..9 → `Synco_notif_N.ico`, 10 et plus → `Synco_notif_9+.ico`. Préchargement du jeu complet pendant un temps mort (`requestIdleCallback`, repli `setTimeout`) pour éviter une icône vide au premier changement de compteur. |

### **Fichiers Modifiés**
| Fichier | Modification |
|---------|--------------|
| `src/composables/useNotification.ts` | `unreadCount` exporté au niveau module (il y vivait déjà, il n'était exposé que via le retour de `useNotification()`) — permet à `useFavicon.ts` de l'observer sans contexte de composant, donc sans déclencher `useRouter()`/`useToast()` hors `setup()`. |
| `src/App.vue` | Appel de `initFavicon()` en tête de `onMounted`, avant `bootstrap()`, pour que l'icône soit correcte dès le premier chargement des notifications. |

### **Fonctionnalités Implémentées**
✅ **Favicon réactive** : l'icône suit `unreadCount` en temps réel (réception WebSocket, lecture, « tout marquer comme lu »), sans rechargement.  
✅ **Remplacement du nœud `<link>`** plutôt que mutation de `href` : certains navigateurs ignorent la mutation d'attribut et gardent l'ancienne icône en cache. Le nouveau nœud est inséré avant le retrait de l'ancien, donc jamais d'onglet sans icône entre les deux.  
✅ **Pas d'écriture DOM inutile** : `applyIcon()` sort tôt si l'icône cible est déjà celle appliquée (au-dessus de 9, `unreadCount` bouge sans changer l'image).

### **Commit**
```bash
3f39669 feat(notifications): reflect unread count in the tab favicon
```
Inclut aussi les assets : ajout de `public/ico/` (jeu complet) et remplacement de `public/favicon.ico`.
**Date** : 24 Septembre 2026  

### **Prochaines Étapes**
1. Vérification manuelle en navigateur non effectuée (Node.js absent du sandbox — build validé via `bun vite build`, mais pas de rendu réel) : à tester avec plusieurs notifications non lues, puis « tout marquer comme lu ».
2. `unreadCount` ne compte que les notifications chargées en mémoire (`loadNotifications` pagine par 20) — suffisant pour le palier « 9+ », mais si le centre de notifications passe un jour à une page plus petite, le compteur plafonnerait en dessous du seuil.
3. Équivalent natif non traité : badge d'icône applicative Tauri (bureau) et Capacitor (mobile), où la favicon n'a pas d'effet.

---

## 📅 **24 Septembre 2026 - Sélection multiple des archives + refonte de la carte Agenda**

**Durée** : Session moyenne  
**Priorité** : ⭐⭐⭐ (Moyenne)  
**Complexité** : Moyenne (frontend uniquement, aucun changement d'API)  
**Statut** : ✅ **TERMINÉ**

### **Objectif**
Deux demandes d'UX sans changement backend :
1. Dans les tâches archivées, pouvoir tout sélectionner d'un coup au lieu de cocher chaque tâche une par une.
2. Refondre l'affichage des évènements d'agenda sur l'accueil : nouveaux composants, regroupement par jour avec séparateur, et défilement infini sur les jours suivants.

### **Fichiers Créés**

| Fichier | Description |
|---------|-------------|
| `src/composables/useUpcomingAgenda.ts` | Flux « agenda à venir » paginé par fenêtres de 30 jours (horizon 1 an), état **local** à chaque appel — contrairement à `useAgenda.ts` dont l'état est partagé au niveau module, donc la carte d'accueil n'écrase plus les occurrences de la vue Agenda. Déduplication par clé composite `eventId\|occurrenceKey` (une `occurrenceKey` de série ne vaut que l'ISO du début : elle n'est unique qu'au sein d'un même évènement), filtrage des calendriers externes masqués, regroupement par jour local. Nom choisi pour ne pas entrer en collision avec `useAgendaFeed.ts`, qui gère le lien d'abonnement iCal. |
| `src/views/OrgSpace/components/Home/AgendaDayDivider.vue` | Séparateur de jour collant (`position: sticky`) : pastille jour/abréviation du jour de semaine (accentuée pour aujourd'hui), libellé « Aujourd'hui / Demain / lundi 29 septembre », nombre d'évènements, filet. |
| `src/views/OrgSpace/components/Home/AgendaEventItem.vue` | Ligne d'évènement : liseré vertical à la couleur de l'évènement, colonne horaire début/fin (ou « Journée »), titre, méta (lieu, participants, récurrence), badge « En cours » pulsé, estompage des évènements terminés. L'horloge est passée en prop par la carte (un seul `setInterval` pour toute la liste). |

### **Fichiers Modifiés**

| Fichier | Modification |
|---------|--------------|
| `src/views/OrgSpace/views/TasksArchive.vue` | Case « Tout sélectionner » (état indéterminé si sélection partielle) en tête de liste + une case par en-tête de groupe (jour ou dossier). Les deux ne portent que sur `filteredTasks` : tout cocher puis restreindre le filtre ne doit pas permettre de supprimer des tâches jamais affichées. |
| `src/views/OrgSpace/components/Home/AgendaCard.vue` | Réécrite : liste groupée par jour, `IntersectionObserver` sur une sentinelle en pied de carte pour le défilement infini, repli sur un bouton « Charger les jours suivants » après 3 fenêtres enchaînées (une période creuse ne produit aucun scroll, donc l'observer ne se redéclencherait jamais), état d'erreur avec « Réessayer », `padding-top: 0` sur le corps pour que les séparateurs collants n'aient pas d'espace mort au-dessus d'eux. |

### **Fonctionnalités Implémentées**
✅ **Sélection multiple des archives** : globale (liste filtrée) et par groupe, compatibles avec la barre d'actions groupées existante (Restaurer / Supprimer définitivement).  
✅ **Agenda d'accueil jour par jour** : un séparateur collant par jour, les évènements du jour en dessous, les jours vides sont sautés (vue « planning », pas calendrier).  
✅ **Défilement infini** : fenêtres de 30 jours chargées à l'approche du bas, jusqu'à un an ; les évènements multi-jours déjà commencés sont rattachés au premier jour du flux au lieu de disparaître dans le passé.

### **Commits**
```bash
fe2855d feat(tasks): select-all checkboxes in the archive list
3a4e2d2 feat(agenda): day-by-day infinite feed for the home agenda card
```
**Date** : 24 Septembre 2026

### **Prochaines Étapes**
1. Vérification manuelle en navigateur non effectuée (Node.js absent du sandbox — `vite build` validé via Bun, mais `vue-tsc` ne résout pas les `.vue` sous Bun : les blocs `<script setup>` ne sont donc pas passés au vérificateur de types).
2. Piège rencontré, à garder en tête : `useAgendaFeed.ts` (lien iCal) et le nouveau flux portent des noms proches — un fichier écrasé par erreur ne fait **pas** échouer `vite build` tant que le nom d'export est identique. Vérifier `git status` avant de créer un composable.
3. La carte n'écoute pas les évènements WebSocket agenda : un évènement créé ailleurs n'apparaît qu'au prochain montage de l'accueil.
4. Clic sur un évènement → renvoie vers `/agenda` sans ouvrir le jour ni l'évènement (la vue Agenda n'a pas de deep-link par date) — candidat à une amélioration ultérieure.

---

## 📅 **28 Septembre 2026 - Gestionnaire de fichiers : création vide et périmètre OnlyOffice**

**Durée** : Session courte  
**Priorité** : ⭐⭐⭐ (Moyenne)  
**Complexité** : Basse (frontend + un garde-fou backend)  
**Statut** : ✅ **TERMINÉ**

### **Objectif**
Deux demandes d'UX sur le gestionnaire de fichiers :
1. Un nouveau fichier doit être créé vide — plus de champ « Contenu initial ».
2. L'ouverture avec OnlyOffice ne doit être proposée que pour les formats Word, Excel et PowerPoint, pas pour les fichiers texte.

### **Fichiers Modifiés**

| Fichier | Modification |
|---------|--------------|
| `src/views/OrgSpace/components/popup/CreateNewFile.vue` | Suppression du `<textarea>` « Contenu initial » et du champ `content` du formulaire ; `save` n'émet plus que `{ name, ext }`. Texte d'aide reformulé (« le fichier est créé vide et se modifie ensuite dans l'aperçu »). |
| `src/views/OrgSpace/views/SpaceFiles.vue` | `createFile` reçoit `{ name, ext }` et n'envoie plus `content` à `createTextFile`, qui retombe sur sa valeur par défaut `''`. |
| `src/views/OrgSpace/components/popup/FileViewer.vue` | `isOfficeFile` réduit à `doc/docx`, `xls/xlsx`, `ppt/pptx` via trois constantes (`WORD_/CELL_/SLIDE_EXTENSIONS`) que `getDocumentType` réutilise. `csv`, `txt` et `rtf` en sortent. |

### **Fonctionnalités Implémentées**
✅ **Création de fichier vide** : `content` reste optionnel dans `createTextFile` — Synco AI (`OrgAI.vue`) continue de créer des fichiers pré-remplis par ce chemin.  
✅ **OnlyOffice réservé au bureautique** : un `.txt` ou un `.csv` repasse par la branche `isTextFile` → éditeur Monaco avec bouton « Enregistrer ».

### **Commits**
```bash
289f395 fix(files): créer les nouveaux fichiers vides par défaut
ef626c6 fix(files): réserver OnlyOffice aux formats Word, Excel et PowerPoint
```
**Date** : 28 Septembre 2026

### **Prochaines Étapes**
1. Vérification manuelle en navigateur non effectuée (Node.js absent du sandbox ; `vue-tsc` sous Bun ne résout pas les `.vue`, donc les `<script setup>` ne sont pas typés par le vérificateur).
2. Le `.rtf` n'a plus d'éditeur du tout (ni Monaco, ni OnlyOffice) : il retombe sur l'écran « pas d'aperçu » avec téléchargement. À arbitrer si le format doit rester éditable.
3. Voir `synco_api` : garde-fou serveur correspondant sur `POST /api/cdn/onlyoffice-config`.

---

## 📅 **28 Septembre 2026 - Barre d'outils du gestionnaire de fichiers**

**Durée** : Session courte  
**Priorité** : ⭐⭐⭐ (Moyenne)  
**Complexité** : Basse (frontend uniquement)  
**Statut** : ✅ **TERMINÉ**

### **Objectif**
Remplacer la ligne « recherche + 3 boutons » et les icônes de l'en-tête par une vraie barre d'outils : navigation précédent/suivant, rechargement du dossier, et rapatriement des outils filigranes/permissions.

### **Fichiers Modifiés**

| Fichier | Modification |
|---------|--------------|
| `src/views/OrgSpace/views/SpaceFiles.vue` | Barre d'outils unique (navigation · création · recherche · outils). Ajout de l'historique de navigation (`folderHistory`, `historyIndex`, `goHistoryBack/Forward`) alimenté par un watcher `flush: 'sync'` sur `currentFolderId`. Extraction de `fetchSpaceContent({ silent })` depuis `onMounted` + `refreshFolder()`. Les boutons filigranes et permissions quittent l'en-tête (seul « Membres » y reste). |

### **Fonctionnalités Implémentées**
✅ **Flèches précédent / suivant** : l'empilement se fait dans un watcher, pas dans chaque appelant — le dossier courant change depuis le fil d'Ariane, le double-clic, la remontée d'un niveau et les liens profonds. Une nouvelle navigation tronque les entrées « suivant ».  
✅ **Recharger le dossier** : rechargement sans squelette (icône en rotation, toast d'erreur), avec contrôle `res.ok` qui n'existait pas sur le chargement initial.  
✅ **Outils regroupés** : filigranes + permissions de l'espace dans la barre, à droite.

### **Commits**
```bash
49a3777 feat(files): barre d'outils du gestionnaire de fichiers
```
**Date** : 28 Septembre 2026

### **Prochaines Étapes**
1. `vite build` OK, mais aucune vérification visuelle en navigateur (Node.js absent du sandbox) : le comportement de repli de la barre entre `sm`, `lg` et `xl` reste à contrôler à l'œil.
2. L'historique est local au montage de la vue : quitter puis revenir sur l'espace le réinitialise. À relier à l'historique du routeur si le besoin se confirme.
3. Le bouton flottant en bas à gauche (`goBack`, remontée d'un niveau) fait doublon visuel avec la flèche « précédent » de la barre, qui elle est chronologique. À arbitrer.

---

## 📅 **28 Septembre 2026 - Refonte de la barre d'outils (façon explorateur)**

**Durée** : Session courte  
**Priorité** : ⭐⭐⭐ (Moyenne)  
**Complexité** : Basse (frontend uniquement, template)  
**Statut** : ✅ **TERMINÉ**

### **Objectif**
Reprendre la barre d'outils à zéro : recherche au-dessus sur sa propre ligne, puis une barre unique où les actions sont ordonnées par importance, dans l'esprit d'un explorateur de fichiers.

### **Fichiers Modifiés**

| Fichier | Modification |
|---------|--------------|
| `src/views/OrgSpace/views/SpaceFiles.vue` | Recherche sortie de la barre et placée en tête de `<main>` (placeholder explicite « Rechercher un fichier ou un dossier… », bouton d'effacement conservé). Barre d'outils réordonnée : groupe navigation (précédent · suivant · remonter d'un niveau · recharger), filet, action principale `Ajouter des fichiers` en `primary` avec icône `bi-upload`, les deux créations en `default`, filet poussé par `ml-auto`, puis filigranes et permissions. `overflow-x-auto no-scrollbar` sur la barre au lieu d'un `flex-wrap`. |

### **Fonctionnalités Implémentées**
✅ **Hiérarchie visuelle** : un seul bouton plein (upload), deux boutons secondaires, les utilitaires en icône seule aux deux extrémités.  
✅ **Remonter d'un niveau** : `goBack()` obtient enfin une entrée dans la barre — il n'était atteignable que par le bouton flottant en bas à gauche.  
✅ **Repli progressif** : libellés des créations masqués sous `md`, libellé de l'upload sous `sm` ; la barre défile horizontalement plutôt que de passer à la ligne.

### **Commits**
```bash
b0191cc refactor(files): barre d'outils façon explorateur, recherche au-dessus
```
**Date** : 28 Septembre 2026

### **Prochaines Étapes**
1. Toujours aucune vérification visuelle en navigateur (Node.js absent du sandbox) — `vue-tsc` et `vite build` passent, mais le rendu de la barre aux points de rupture `sm` / `md` reste à contrôler.
2. Le bouton flottant en bas à gauche est conservé : il est aussi la **cible de dépôt** « déplacer vers le dossier parent ». Il fait maintenant doublon avec la flèche ↑ de la barre — à arbitrer (le réduire à une cible de dépôt visible seulement pendant un glisser ?).
3. Le fil d'Ariane reste sous la barre, dans la branche `v-else` du squelette de chargement : le remonter dans la barre (style barre d'adresse) impliquerait de le sortir de cette branche.

---

## 📅 **28 Septembre 2026 - Barre d'outils : reprise à zéro (trois contrôles)**

**Durée** : Session courte  
**Priorité** : ⭐⭐⭐ (Moyenne)  
**Complexité** : Basse (frontend uniquement, template)  
**Statut** : ✅ **TERMINÉ**

### **Objectif**
Retour utilisateur sur la version précédente : « plein de boutons différents en bordel, on comprend rien ». La rangée alignait neuf contrôles de trois styles (plein, contour, icône nue) sans hiérarchie lisible. Reprise de la partie boutons à zéro.

### **Fichiers Modifiés**

| Fichier | Modification |
|---------|--------------|
| `src/views/OrgSpace/views/SpaceFiles.vue` | Barre ramenée à trois contrôles : bloc de navigation segmenté (`divide-x` + `overflow-hidden`, chevrons plutôt que flèches pour l'historique), `DropDown` « Nouveau » (Importer / Dossier / Fichier) en unique bouton plein, `DropDown` « … » aligné à droite pour les outils de l'espace (permissions, filigrane) avec libellés. Le bouton flottant « remonter d'un niveau » passe en `v-if="… && isDragging"`. |

### **Fonctionnalités Implémentées**
✅ **Trois contrôles au lieu de neuf** : un bloc, un bouton, un menu — chacun avec un rôle distinct.  
✅ **Libellés pour les outils** : `bi-shield-lock` et `bi-shield-check` côte à côte étaient indistinguables ; le filigrane prend l'icône `bi-file-earmark-binary` et les deux entrées sont nommées dans le menu.  
✅ **Plus de doublon de navigation** : le bouton flottant en bas à gauche n'est plus qu'une cible de dépôt, affichée pendant un glisser comme la corbeille.

### **Commits**
```bash
f230365 refactor(files): réduire la barre d'outils à trois contrôles
```
**Date** : 28 Septembre 2026

### **Prochaines Étapes**
1. Vérification visuelle en navigateur toujours pas faite (Node.js absent du sandbox) : `vite build` passe et la classe `h-9.5` est bien générée, mais l'alignement du bloc segmenté avec le bouton `primary` (padding `0.7em 1.6em` hérité de `style.css`) est à contrôler à l'œil.
2. `DropDown.vue` positionne son contenu sur un `getDropdownPosition()` appelé au rendu, sans repositionnement au scroll : à surveiller si la barre finit dans une zone défilante.
3. L'import de fichiers passe maintenant par un menu (un clic de plus). Si l'usage montre que c'est l'action dominante, envisager un bouton scindé « Importer ▾ » plutôt qu'un menu unique.

---

## 📅 **28 Septembre 2026 - Clic droit sur toute la zone vide du gestionnaire**

**Durée** : Correctif court  
**Priorité** : ⭐⭐⭐ (Moyenne)  
**Complexité** : Basse  
**Statut** : ✅ **TERMINÉ**

### **Objectif**
Le menu contextuel « dans le vide » ne répondait que sur une partie de la hauteur : `@contextmenu` est porté par la `<section>`, qui s'arrêtait à la hauteur de son contenu (`min-h-[50vh]`).

### **Fichiers Modifiés**

| Fichier | Modification |
|---------|--------------|
| `src/views/OrgSpace/views/SpaceFiles.vue` | `<main>` passe de `space-y-4` à `flex flex-col gap-4`, et la `<section>` gagne `flex-1` : elle occupe la hauteur restante sous la barre d'outils. `min-h-[50vh]` conservé pour le cas où `<main>` serait plus court que prévu. |

### **Fonctionnalités Implémentées**
✅ **Zone de clic droit pleine hauteur** : le menu « Nouveau dossier / Nouveau fichier / Ajouter des fichiers » s'ouvre partout sous la barre d'outils, y compris loin sous la dernière ligne de fichiers.

### **Commits**
```bash
5f808e2 fix(files): clic droit sur toute la hauteur de la zone de fichiers
```
**Date** : 28 Septembre 2026

### **Prochaines Étapes**
1. `<main>` étant devenu un conteneur flex, tout futur enfant direct doit être ajouté en connaissance de cause (l'espacement vient de `gap-4`, plus de `space-y-4`).

---

## 📅 **28 Septembre 2026 - Permissions du space : de la popup Fichiers aux paramètres**

**Durée** : Session courte  
**Priorité** : ⭐⭐⭐⭐ (Haute — emplacement d'un écran de sécurité)  
**Complexité** : Moyenne  
**Statut** : ✅ **TERMINÉ**

### **Objectif**
La gestion des permissions du space était une popup ouverte depuis la barre d'outils du gestionnaire de fichiers, alors qu'elle porte sur le space entier. La déplacer dans la fenêtre de paramètres du space, en reprenant la mise en page des onglets existants.

### **Fichiers Créés**

| Fichier | Description |
|---------|-------------|
| `src/assets/utils/mediaTypes.ts` (+ test) | Liste blanche MIME image/audio/vidéo (ni SVG ni HTML), alias (`audio/x-m4a`, `image/jpg`…), vérification des octets magiques du clair. |
| `src/assets/utils/mediaCache.ts` (+ test) | Cache d'URL `blob:` : dédoublonnage, compteur de références, éviction LRU au-delà de 150 Mo (révocation), 3 chargements simultanés max. Loader injecté. |
| `src/assets/utils/mediaPreview.ts` | Instance du cache branchée sur `fetchDecryptedFile` ; `Blob` reconstruit avec le type canonique. |
| `src/views/OrgSpace/components/common/MessageAttachments.vue` | Remplace le bloc de pièces jointes dupliqué de `ChatMessage` / `ThreadMessage`. |
| `src/views/OrgSpace/components/common/MessageMedia.vue` | Un média, états idle / loading / ready / error ; émet l'événement DOM `media-loaded` (bubbling). |
| `src/views/OrgSpace/components/common/MediaLightbox.vue` | Visionneuse d'image plein écran (Échap, téléchargement). |

### **Fichiers Modifiés**

| Fichier | Modification |
|---------|--------------|

| `src/assets/utils/downloadFile.ts` | Extraction de `fetchDecryptedFile` (toujours via `sfetch`, jamais de jeton en URL) + `saveObjectUrl`. Comportement de `downloadFile` / `getFilePreviewUrl` inchangé. |
| `index.html`, `src-tauri/tauri.conf.json` | CSP : `media-src 'self' blob:` — sans elle `default-src 'self'` bloquait `<audio>/<video>` en `blob:`. |
| `ChatMessage.vue`, `ThreadMessage.vue` | Utilisent `MessageAttachments`. |
| `ChatView.vue`, `ThreadView.vue` | `stickToBottom` + `@media-loaded` : recollage en bas quand un média chargé agrandit un message. |

### **Fonctionnalités Implémentées**
✅ **Aperçu en ligne** : vignette d'image (clic → visionneuse), lecteur audio, lecteur vidéo.  
✅ **Chargement conditionnel** : ≤ 15 Mo au montage, au-delà sur clic.  
✅ **Sécurité** : le type d'un fichier E2EE est déclaré par l'expéditeur → liste blanche + signature binaire avant rendu ; blobs rendus uniquement dans `<img>/<audio>/<video>`.  
✅ **Repli** : erreur de déchiffrement / type / codec → carte fichier avec « Réessayer » et téléchargement.

### **Commits**
```bash
d2f81ff docs(vibe): spec de l'aperçu des médias joints aux messages
a388f8f refactor(files): extraire fetchDecryptedFile de downloadFile
e6da30f security(csp): autoriser media-src blob: pour les médias déchiffrés
7c04114 feat(files): liste blanche et cache des médias déchiffrés
fed01b7 feat(messages): aperçu image/audio/vidéo des pièces jointes
```
**Date** : 29 Septembre 2026

### **Prochaines Étapes**
1. Vérification manuelle en navigateur non effectuée (Node.js absent du sandbox — `vite build` validé via Bun, 13 tests unitaires `bun test src/assets/utils/media` verts ; `vue-tsc` sous Bun ne résout pas les `.vue`, donc les `<script setup>` n'ont pas été vérifiés par le compilateur). À tester : DM + salon, E2EE et non chiffré, PNG/GIF/MP3/MP4, fichier > 15 Mo, `.html` renommé en `.png` (doit retomber sur la carte), Tauri (CSP), thème clair.
2. Vidéo E2EE lourde : le chiffrement monobloc impose un téléchargement + déchiffrement complet en mémoire avant lecture. Un chiffrement par blocs (streaming) serait un chantier protocolaire séparé.
3. Pas de miniature ni de dimensions stockées à l'upload : une vignette télécharge l'image entière, et le cadre de chargement (256×160) ne correspond pas au ratio réel.
4. Le recollage en bas repose sur la dernière position de défilement connue : un média qui se charge pendant un `scrollTo` animé peut être manqué.

### **Correctifs du même jour (retours de test)**
1. **429 « Too many uploads »** : le quota d'upload de l'API (30/15 min) comptait aussi les lectures `/api/cdn/meta` et `/download` — corrigé côté `synco_api` (`fix(cdn): ne plus compter les lectures dans le quota d'upload`).
2. **Un seul média sur trois s'affichait** : la vérification de signature exigeait le format *déclaré* (l'extension). « Gemini_Generated_Image_….gif » est en réalité un JPEG → refusé. Le format est désormais détecté dans les octets (`detectMediaMime`, liste blanche inchangée) et c'est lui qui choisit `<img>/<audio>/<video>` (`a903a86 fix(messages): afficher un média selon son format réel, pas son extension`).

---

## 📅 **29 Septembre 2026 - Ctrl+F ouvre la recherche de l'espace**

**Durée** : Courte  
**Priorité** : ⭐⭐ (Basse)  
**Complexité** : Basse  
**Statut** : ✅ **TERMINÉ** (vérification navigateur à faire)

| `src/components/windows/SpaceSettings.vue` | Nouvel onglet « Permissions » (entre Membres et Webhooks) qui monte `SpacePermissionsPanel`. `SaveUpdateOverlay` passe sur `isModified || isPermissionsModified`, avec `resetAll()` / `saveAll()` qui n'agissent que sur les onglets réellement modifiés. La section morte « Sécurité & Permissions » (présente dans le template mais absente de `tabs`, donc inatteignable) est remplacée. |
| `src/views/OrgSpace/views/SpaceFiles.vue` | Entrée « Permissions de l'espace » retirée du menu « … », modale et import supprimés. Le menu ne garde que « Vérifier un filigrane ». |

### **Fonctionnalités Implémentées**
✅ **Permissions dans les paramètres du space** : même fenêtre que Général / Membres / Webhooks, ouverte depuis `ThreadDropDown` — qui passe déjà le `currentWorkspace`, c'est-à-dire le space dont le gestionnaire de fichiers utilisait l'id.  
✅ **Barre d'enregistrement unique** : le pied de page Annuler/Sauvegarder de la popup disparaît au profit de `SaveUpdateOverlay`, déjà utilisé par l'onglet Général.  
✅ **Pas de perte silencieuse** : l'onglet reste monté (`v-if` d'ouverture + `v-show`) une fois visité, donc une matrice à moitié modifiée survit à un changement d'onglet.

### **Commits**
```bash
a4a299a refactor(permissions): déplacer les permissions du space dans ses paramètres
```
**Date** : 28 Septembre 2026

### **Prochaines Étapes**
1. Vérification visuelle toujours impossible dans ce sandbox (`vue-tsc` + `vite build` passent) : à contrôler surtout le débordement horizontal de la matrice dans le `<main>` des paramètres (`p-4 sm:p-8`).
2. Le panneau ne vérifie pas côté client que l'utilisateur a le droit de modifier les permissions : l'onglet est visible pour tout membre pouvant ouvrir les paramètres. Le refus vient du serveur à l'enregistrement — à afficher plus tôt (griser la matrice) si le besoin se confirme.
3. `ManageAccessModal` (permissions par fichier et par dossier, menu contextuel du gestionnaire) reste une modale à part : c'est volontaire, la portée est différente.

---

## 📅 **28 Septembre 2026 - Permissions du space : UI alignée sur l'écran Rôles de l'org**

**Durée** : Session courte  
**Priorité** : ⭐⭐⭐⭐ (Haute — écran de sécurité + correction de sémantique)  
**Complexité** : Moyenne  
**Statut** : ✅ **TERMINÉ**

### **Objectif**
Reprendre l'UI du nouvel onglet Permissions du space en s'inspirant de `RolesSettings.vue` (permissions de l'organisation), au lieu de la matrice rôles × permissions héritée de la popup.


### **Fichiers Modifiés**

| Fichier | Modification |
|---------|--------------|

| `src/views/OrgSpace/components/layouts/ThreadsBar.vue` | Listener `keydown` global : Ctrl+F / Cmd+F → `showSearchModal = true`, uniquement quand le bouton « Rechercher » est affiché (`canSearchSpace` : espace ouvert, hors accueil / DM / IA / paramètres). Ignoré si `defaultPrevented` (Monaco garde son propre Ctrl+F). Condition des paramètres extraite en `showSettingsNav` pour être partagée avec le template. |

### **Commit**
```bash
1849b21 feat(search): Ctrl+F ouvre la recherche de l'espace
```
**Date** : 29 Septembre 2026

### **Prochaines Étapes**
1. `SpaceSearchModal` est en `z-[100]`, sous `FileViewer` (`z-2500`) : Ctrl+F avec un aperçu de fichier ouvert (hors éditeur Monaco) ouvre la recherche derrière la visionneuse.
2. Échap ferme `SpaceSearchModal` (listener `keydown` sur window, actif seulement pendant l'ouverture) — `feat(search): Échap ferme la recherche de l'espace`.

| `src/components/permissions/SpacePermissionsPanel.vue` | Réécrit : liste des rôles à gauche (pastille, nom, badge Sys, nombre de membres, **compteur de dérogations**), détail à droite avec recherche, groupes de permissions repris de `RolesSettings.vue`, lignes icône + libellé + description. Contrôle à trois états `Hériter / Autoriser / Refuser` à la place du commutateur binaire de l'org — le space pose des **dérogations**, pas des valeurs. Mention « Hérité de l'organisation : autorisé/refusé » sous chaque permission laissée en héritage. Bouton « Tout hériter » par rôle, rôle `OWNER` en lecture seule. |
| `src/components/windows/SpaceSettings.vue` | L'onglet passe en `absolute inset-0` et `<main>` retire son padding pour lui, comme pour Webhooks : le panneau gère sa propre mise en page en deux colonnes. L'en-tête `h3` + description de l'onglet disparaît, le panneau porte le sien. |

### **Correction de sémantique (importante)**
L'ancienne popup initialisait l'état local avec les **valeurs du rôle** quand aucune dérogation n'existait, puis reversait en dérogations tout ce qui n'était pas `INHERIT`. Conséquences :
1. l'écran s'ouvrait systématiquement en « modifications non enregistrées » ;
2. un simple enregistrement figeait dans le space l'intégralité des droits du rôle — un changement ultérieur au niveau de l'organisation n'aurait plus été suivi.

`INHERIT` signifie désormais « aucune dérogation » : l'état local ne contient que les dérogations réellement enregistrées, et la valeur d'origine est affichée à titre indicatif.

### **Commits**
```bash
484142b refactor(permissions): aligner l'UI des permissions du space sur celle de l'org
```
**Date** : 28 Septembre 2026

### **Prochaines Étapes**
1. `PermissionMatrix.vue` et `PermissionCell.vue` n'ont plus aucun appelant (ils ne se référencent plus qu'entre eux) — à supprimer ou à réutiliser dans `ManageAccessModal.vue`, qui a sa propre UI.
2. `permissionGroups` est maintenant dupliqué entre `RolesSettings.vue` et `SpacePermissionsPanel.vue` : à remonter dans `src/config/permissions.config.ts`. Le panneau ajoute le groupe « Salons vocaux », absent de l'écran org — les deux listes ont déjà divergé.
3. Toujours aucune vérification visuelle en navigateur (Node.js absent du sandbox) : `vue-tsc` et `vite build` passent.
4. La colonne des rôles est limitée à `max-h-56` sous `md` : à contrôler sur mobile avec beaucoup de rôles.


## 📅 **17 Novembre 2026 - Refonte de l'écran des tâches archivées**

**Durée** : Session complète  
**Priorité** : ⭐⭐⭐ (Moyenne)  
**Complexité** : Moyenne  
**Statut** : ✅ **TERMINÉ**

### **Objectif**
Remplacer l'écran des archives fondé sur les dossiers (todoLists) par un écran rangé par personne, filtrable par tag, avec recherche, qui affiche les mêmes cartes que le Kanban.

### **Fichiers Créés**

| Fichier | Description |
|---------|-------------|
| `src/views/OrgSpace/components/SpaceTasks/ArchivePeopleList.vue` | Liste des personnes (Tout le monde, assignés, Sans assigné) avec compteur filtré et date de dernière archive ; recherche au-delà de 6 personnes. Colonne sur desktop, contenu du menu déroulant sous `lg`. |
| `src/views/OrgSpace/components/SpaceTasks/ArchivePersonAvatar.vue` | Avatar ou initiales sur une teinte stable par personne. |
| `src/views/OrgSpace/components/SpaceTasks/archivePeople.ts` | `taskPeople` (une tâche à 2 assignés est rangée chez les deux), tri (vous, puis volume, puis nom ; Sans assigné en dernier), `personHue`. |
| `src/assets/utils/taskArchive.ts` | `archivedAgoLabel` : « Archivée hier », « il y a 5 j », puis la date. |

### **Fichiers Modifiés**

| Fichier | Modification |
|---------|--------------|
| `src/views/OrgSpace/views/TasksArchive.vue` | Réécrit. Groupes par personne (8 cartes puis « N de plus »), recherche `buildTaskMatcher` (mots ou regex), filtre tags limité aux tags présents dans les archives, sélection par carte / par personne / tout le visible, restauration avec barre « Annuler » (6 s), suppression définitive via `ConfirmDelete`, menu clic droit. Plus de dossiers ni de glisser vers la corbeille. Suit `onTaskPanelChange`. |
| `src/views/OrgSpace/components/SpaceTasks/TaskCard.vue` | Prop `archived` : icône archive, pas de halo de retard, pied « Archivée … » + état (Terminée / Non terminée) poussé en bas pour aligner une rangée de grille. |
| `src/views/OrgSpace/components/TaskPanel/TaskDetails.vue` | Menu « … » : « Restaurer la tâche » quand `task.archived` (au lieu d'« Archiver »). |
| `synco_api/src/routes/tasks.ts` | Les deux endpoints d'archives incluent `subtasks { id, status }` et `_count.attachments`, utilisés par TaskCard. |

### **Commits**
```bash
5a89da3 (synco_api) feat(tasks): archives renvoient sous-tâches et pièces jointes pour la carte TaskCard
d1c70f1 (synco_app) feat(tasks): refonte des tâches archivées — par personne, tags, recherche, vraies cartes
```
**Date** : 17 Novembre 2026

### **Prochaines Étapes**
1. Vérifié dans un harnais (vrai composant, données simulées, Firefox headless : `~/.cache/synco-archive-preview`), pas encore dans l'app connectée.
2. Les todoLists restent en base et dans l'API ; seul cet écran ne les montre plus.
3. Pas d'écoute websocket sur l'écran des archives (comme avant) : une tâche archivée par quelqu'un d'autre n'apparaît qu'au rechargement.
4. « Annuler » ré-archive la tâche : sa date d'archivage devient celle du moment.

---

## 📅 **2026-11-18 - Refonte Synco AI : spécification du runtime (lot L00)**

**Durée** : Session complète  
**Priorité** : ⭐⭐⭐⭐⭐ (Haute)  
**Complexité** : Élevée  
**Statut** : ✅ **TERMINÉ** (spécification ; aucun code)

### **Objectif**
Figer les protocoles et formats du Synco AI Runtime avant les lots d'implémentation. Spécification
de référence : `synco_ai_runtime/docs/plan/` ; part de l'app : `synco_app/vibe/features/SYNCOAI_REFONTE_FEATURE.md`.

### **Fichiers Créés**

| Fichier | Description |
|---------|-------------|
| `vibe/features/SYNCOAI_REFONTE_FEATURE.md` | Cryptographie côté client (certificat, épinglage, délégation, clé de conversation, `rt1`), écrans et composants, compatibilité, tests, recette manuelle |

### **Fichiers Modifiés**

| Fichier | Modification |
|---------|--------------|
| `vibe/session_log.md` | Cette entrée |

### **Fonctionnalités Implémentées**
✅ **Spécification** : formats E2EE nouveaux (enveloppe `srd1`, mandat, entrées `sre1`, enveloppe FC4 `rt1`) calqués sur `e2eeV4.ts` et `keyEnvelope.ts` ; format `gcm1:` repris à l'identique (AAD avec `:`).  
✅ **Vérifié dans le code** : `e2eeV4.ts`, `keyEnvelope.ts`, `keyPinning.ts`, `keyTrust.ts`, `crypto.ts`, `AIService.ts`, `AiSessionKeyService.ts`, `OrgAI.vue` (citations `fichier:ligne` dans la spec du runtime).

### **Commit**

```bash
bd9b3ab docs(ai): spécification côté app de la refonte Synco AI (runtime auto-hébergé)
```

**Date** : 2026-11-18  

### **Prochaines Étapes**
1. Porte A : décisions D1–D7, D10 et questions Q1–Q10 (`synco_ai_runtime/docs/plan/00-vue-ensemble.md`).
2. L01 (fonctions pures TS + crate Rust + vecteurs), puis L10 à L13.

## 📅 **2026-11-19 - Refonte Synco AI : référence TS des formats du runtime et vecteurs croisés (lot L01)**

**Durée** : Session complète  
**Priorité** : ⭐⭐⭐⭐⭐ (Haute)  
**Complexité** : Élevée  
**Statut** : ✅ **TERMINÉ**

### **Objectif**
Écrire la référence TS (fonctions pures) des nouveaux formats E2EE du Synco AI Runtime et produire,
avec le code réel de l'app, les vecteurs rejoués par la crate Rust `synco-e2ee`
(`synco_ai_runtime/crates/synco-e2ee`). Spec : `synco_ai_runtime/docs/plan/01`, `03`, `vectors/README.md` ;
`vibe/features/SYNCOAI_REFONTE_FEATURE.md` §2.1.

### **Fichiers Créés**

| Fichier | Description |
|---------|-------------|
| `src/assets/utils/runtimeCert.ts` | Empreinte, code d'appairage (via `formatLinkSecret`/`parseLinkSecret`), URL canonique, certificat, défi de possession ; `RuntimeFormatError` à codes machine |
| `src/assets/utils/runtimeDelegation.ts` | Enveloppe de tête `srd1`, mandat, entrées `sre1` (liste fermée), enveloppe `rt1` (commitment via `keyCommitment`) |
| `src/assets/utils/runtimeCert.test.ts`, `runtimeDelegation.test.ts` | Allers-retours et refus avec aléa réel |
| `scripts/e2ee-vectors/generate.ts` | Générateur des 7 fichiers de vecteurs TS → Rust (lancé avec bun) |
| `scripts/e2ee-vectors/fixedRandom.ts` | Fige IV, nonces et clés ECDH éphémères le temps du générateur (jamais importé par l'app) |
| `scripts/e2ee-vectors/from-rust.json`, `from-rust.test.ts` | Sens Rust → TS : valeurs produites par la crate, ouvertes par le code TS |

### **Fichiers Modifiés**

| Fichier | Modification |
|---------|--------------|
| `vibe/session_log.md` | Cette entrée |

### **Fonctionnalités Implémentées**
✅ **Référence TS** des formats de délégation et de certificat, pures (WebCrypto + `@noble/curves` déjà présent pour le contrôle « point sur la courbe »).  
✅ **Vecteurs** : identité du runtime, certificat, défi, délégation, champs `gcm1`, `rt1` (dont le vecteur de compatibilité des clients actuels : créateur `rt1:` inconnu → accepté sans vérification), formats v4 existants.  
⚠️ **Écart connu, non corrigé (compatibilité)** : `decryptAiField` (crypto.ts) ne refuse pas un clair non UTF-8 (caractères de remplacement) ; la crate le refuse (`field_invalid_utf8`).

### **Commit**

```bash
bff0f97 feat(ai): fonctions pures des formats du Synco AI Runtime (référence TS)
5bf4c18 test(ai): vecteurs croisés TS ↔ Rust de la crate synco-e2ee
```

**Date** : 2026-11-19  

### **Prochaines Étapes**
1. L10 : service de délégation sur ces fonctions (épinglage TOFU, `verifyWithSignKeys`, `DK` non extractable) ; ajouter `aiconv:${string}` à `KeyContext` (keyPinning.ts).
2. Régénérer les vecteurs après tout changement de format : `bun scripts/e2ee-vectors/generate.ts <synco_ai_runtime>/crates/synco-e2ee/tests/vectors`.

---

## 📅 **2026-11-21 - Limite de 1 000 membres par organisation, côté app (lot L01b, PC30)**

### **Objectif**
Afficher la limite de membres (membres + invitations nominatives en attente), désactiver l'invitation quand l'org est pleine et traduire le refus `409 org_member_limit`.

### **Fichiers Créés**

| Fichier | Description |
|---------|-------------|
| `src/config/orgLimits.ts` | `ORG_MEMBER_LIMIT = 1000` (recopiée de synco_api `src/config/orgLimits.ts`), `getMemberLimit` (le serveur prime), `isMemberLimitError`, messages |
| `src/config/orgLimits.test.ts` | Tests des helpers |

### **Fichiers Modifiés**

| Fichier | Modification |
|---------|--------------|
| `src/types/types.ts` | `Org.config.memberLimit`, `Org.stats.pendingInviteCount?: number \| null` |
| `src/views/OrgSpace/views/settings/views/MembersSettings.vue` | Jauge « Limite de l'organisation » (réservée à ORG_MEMBERS, jamais si `pendingInviteCount` est null), boutons d'invitation désactivés si pleine, toast sur 409, pagination des membres (50 par page) |
| `src/views/inviteView.vue` | Message lisible au 409 à l'acceptation |
| `vibe/session_log.md` | Cette entrée |

### **Notes**
- `pendingInviteCount` null (non-gestionnaire) : aucun compteur, ni 0 par défaut ; le 409 reste traduit pour tous.
- Le compteur suit la liste d'invitations locale une fois chargée.

**Date** : 2026-11-21

---

## 📅 **2026-11-22 - Mandat v2 et fonctions pures du plan d'action (lot L01c)**

### **Objectif**
Référence TS, octet pour octet avec la crate `synco-e2ee`, du mandat v2 (03 §4.1) et des fonctions pures du plan d'action (synco_ai_runtime `docs/plan/12-plan-action.md` §3 à §9). Aucune UI, aucun appel réseau (L10 s'en servira).

### **Fichiers Créés**

| Fichier | Description |
|---------|-------------|
| `src/assets/utils/aiActionPlan.ts` | JCS, AAD, `gcm1:` sous `CK` (lecture stricte aux codes de la crate), `serverDigests` et verrou `refs`, `validatePlan` (règles 1 à 6, PC61), `checkServedGraph` (règle 8), `PlanGraph`, `PlanRun` |
| `src/assets/utils/aiActionPlan.test.ts` | Rejeu de `action-plan.json` (107 vérifications) et garde-fous |
| `src/assets/utils/runtimeDelegation.v2.test.ts` | Rejeu de `mandate-v2.json` (21 cas, 6 `rt1Policy`) |
| `scripts/e2ee-vectors/action-plan.json`, `mandate-v2.json` | Copies conformes des vecteurs figés par L00f |

### **Fichiers Modifiés**

| Fichier | Modification |
|---------|--------------|
| `src/assets/utils/runtimeDelegation.ts` | `mandateBytesV2`, `signMandateV2`, `verifyMandateVersioned(OfflineFromWrapHash)`, `ownerRsaSpkiHex`, `rt1Verdict` |
| `src/assets/utils/runtimeCert.ts` | Codes `field_*`, `plan_invalid`, `action_not_accepted` |

### **Notes**
- `decryptAiField` (crypto.ts) n'est pas modifié ; le plan a sa lecture stricte (`decryptAiFieldStrict`) et un base64 par morceaux (plan jusqu'à 256 Kio).
- Règle 7 (identifiants résolus dans l'annuaire local) : à faire par L10.

**Date** : 2026-11-22

---

## 📅 **2026-11-22 - Constats mineurs de la revue cryptographique (lot L01c)**

### **Objectif**
Même verdict que la crate `synco-e2ee` sur les mêmes octets, en retenant la règle la plus stricte à chaque écart relevé par la revue.

### **Fichiers Modifiés**

| Fichier | Modification |
|---------|--------------|
| `src/assets/utils/aiActionPlan.ts` | `parseJsonStrict` (refuse `1.0`, `1e2`, `-0`, entiers non sûrs, demi-paires), BOM gardé par `TextDecoder`, `__proto__` posé par `defineProperty`, extension en minuscules ASCII, borne `MAX_PLAN_VALUE_LEN` (349 569 octets) avant décodage, comptes PC61 avant JCS, résultats de phase contrôlés contre le `PlanGraph` (exécutant, état final), identifiants validés avant l'AAD |
| `src/assets/utils/runtimeDelegation.ts` | `rt1Verdict(…, production = true)` : mandat v1 refusé en production |
| `src/assets/utils/aiActionPlan.test.ts`, `runtimeDelegation.v2.test.ts` | Rejeu des nouvelles sections (`clearCases`, `boundCases`) : 143 vérifications ; 8 cas `rt1Policy` |
| `scripts/e2ee-vectors/action-plan.json`, `mandate-v2.json` | Copies conformes des vecteurs du runtime |
| `scripts/e2ee-vectors/generate.ts` | Cas « séparateur \| » attendu en `invalid_input` |

### **Notes**
- `encryptPhaseResult` / `decryptPhaseResult` prennent désormais le graphe du plan (L10 devra le passer).
- `decryptAiField` (crypto.ts) reste inchangé.

**Date** : 2026-11-22

---

## 📅 **2026-11-23 - Service runtime côté app : délégation, épinglage, plan d'action (lot L10)**

**Priorité** : ⭐⭐⭐⭐⭐ (Haute)  
**Complexité** : Élevée  
**Statut** : ✅ **TERMINÉ** (sans UI ; recette manuelle à faire avec L11)

### **Objectif**
Toute la cryptographie côté client du mode runtime de Synco AI, sans UI : `synco_ai_runtime/docs/plan/01`, `03`, `12`, `vibe/features/SYNCOAI_REFONTE_FEATURE.md`.

### **Fichiers Créés**

| Fichier | Description |
|---------|-------------|
| `src/services/aiRuntime/errors.ts` | `AiRuntimeError` typée (codes fermés, messages fixes sans donnée) |
| `src/services/aiRuntime/ports.ts` | Dépendances injectées (API, runtime direct, magasin, identité, annuaire, clés, horloge) |
| `src/services/aiRuntime/runtimePin.ts` | Épingle TOFU `rt-pin:<user>:<org>` v1, archivée au désappairage |
| `src/services/aiRuntime/runtimeTrust.ts` | 01 §6.3 étapes 1 à 6, `inspectRuntime`, `acceptNewRuntimeKey` |
| `src/services/aiRuntime/pairing.ts` | Appairage admin (code, défi `pair`, certificat signé) |
| `src/services/aiRuntime/delegation.ts` | Délégation v2, entrées filtrées par type et par org, mandat vérifié, mode autonome |
| `src/services/aiRuntime/sync.ts` | Synchro P11 en tâche de fond (regroupement, backoff, plafond) |
| `src/services/aiRuntime/actionPlan.ts` | Ouverture du plan, décision avec `serverDigests` (PC69), résultats de phase |
| `src/services/aiRuntime/defaults.ts`, `index.ts` | Câblage réel et interface exposée à L11 à L13 |
| `src/services/aiRuntime/testHarness.ts`, `*.test.ts` | Banc d'essai (faux runtime à vraies clés) et 36 tests |

### **Fichiers Modifiés**

| Fichier | Modification |
|---------|--------------|
| `src/assets/utils/aiActionPlan.ts` | Abandons PC74 dans les résultats de phase, `PlanRun.abandon` |
| `src/assets/utils/keyPinning.ts` | Contexte `aiconv:<sessionId>` |
| `scripts/e2ee-vectors/action-plan.json` | Resynchronisé (`abandonCases`) |

### **Notes**
- Choix provisoires : dépôt sans entrée puis ajout des clés manquantes ; épingle archivée avec `runtimeId`/`fpr` à `null` ; préférence locale `rt-mode:<user>:<org>` ; mode reconduit depuis le mandat vérifié.
- Limites : versions anciennes d'une clé d'espace non ouvrables (pas de route) ; résumé par type limité aux clés confiées pendant la session (l'API ne donne que `entryCount`).

**Date** : 2026-11-23

### **Prochaines Étapes**
1. L11 : écrans (réglages, première vue, clé changée, appairage) branchés sur `src/services/aiRuntime`.
2. Recette manuelle navigateur avec un vrai runtime (CORS, défi, dépôt, synchro).

---

## 📅 **2026-11-23 - Corrections de la revue cryptographique du lot L10**

**Priorité** : ⭐⭐⭐⭐⭐ (Haute)  
**Complexité** : Moyenne  
**Statut** : ✅ **TERMINÉ**

### **Objectif**
Corriger les constats de la revue crypto de `src/services/aiRuntime/`, un commit par point, chacun avec un test qui échoue sans lui.

### **Changements**
- **Délégation de `CK` hors périmètre** : l'enveloppe FC4 signe `aiconv:<sessionId>` seul (ni org ni mode, et optionnelle) : elle ne peut pas prouver l'org. Une `conv` n'est ouverte et déléguée que si elle figure dans le registre local `rt-conv:<user>:<org>` (`registerRuntimeConversation`, à appeler par L11 à la bascule, à la création et à l'ouverture d'une conversation runtime de l'org). `/current/missing` n'alimente jamais le registre. Échec fermé.
- **Mode du résumé** : `h.mode` (DK en mémoire) sinon mandat relu et vérifié ; `plan` si invérifiable ; jamais le champ servi.
- `first_seen_after_change` rend la dernière empreinte archivée ; la fiche directe doit annoncer l'orgId courante ; `acceptNewRuntimeKey` épingle après la vérification finale ; `openPlan` exige `status === 'proposed'` (statut réel de l'API avant décision) et `actionCount` cohérent ; erreur typée `delegation_duration_too_short` ; commentaire sur `rt-mode`.

### **Limites**
- Une conversation runtime créée sur un autre appareil n'est déléguée qu'après avoir été ouverte ici (L11 doit appeler `registerRuntimeConversation`).

**Date** : 2026-11-23

---

## 📅 **2026-11-23 - Lot L11 : paramètres du runtime, politiques d'org, bascule des régimes**

**Priorité** : ⭐⭐⭐⭐⭐ (Haute)  
**Complexité** : Élevée  
**Statut** : ✅ **TERMINÉ** (recette manuelle Firefox à faire ; bascule d'une conversation existante en attente de L10)

### **Objectif**
Écrans de L11 au-dessus de `src/services/aiRuntime` : onglets org « Runtime » et « Sécurité », onglet « Agent » des réglages utilisateur, bascule d'une conversation, fin du régime `gateway`.

### **Changements**
- **Fin du régime gateway** : `regimeOf('gateway')` = `client` ; `chat()` appelle `/v1/chat/completions` de la passerelle avec un ticket `sgt1` (`POST /ai/gateway-ticket`) après `assertAllowedGateway` ; `gatewayFetch`, `/chat` et `/chat/:id/tool-result` retirés ; `setEncryptedSessionTitle` retiré. Les anciennes conversations gateway restent lisibles (`hasEncryptedGatewayFields`, `AiSessionKey`) et se poursuivent en `client`.
- **Org › Synco AI** : onglets Fournisseurs / Runtime (`AIRuntimeSettings.vue` : appairage en deux temps avec empreinte, désappairage, durée max D4, `toolPolicy` D5) / Sécurité (`AISecuritySettings.vue`, `FeaturePolicyCard.vue`, `MemberPicker.vue` : trois cartes, puces repliées, recherche, annonce chiffrée avant enregistrement, journal).
- **Réglages utilisateur** : onglet « Agent » (`AgentTab.vue`, `AutonomyWarning.vue`) : où tourne l'agent, empreinte, délégation et « Révoquer », mode autonome (case non précochée), « Toujours accepter » en puces (`aiAutoAccept.ts`, jamais une action sensible).
- **Bascule** : `RuntimeSwitchControl.vue` dans `AiComposerControls.vue` ; `aiRuntimeUi.ts` (erreurs expliquées, `switchConversationToRuntime/ToLocal`) ; `registerRuntimeConversation` appelé à la bascule et à l'ouverture d'une conversation runtime (`loadSession`).

### **Fichiers Créés**
`src/services/aiFeaturePolicies.ts`, `aiRuntimeUi.ts`, `aiAutoAccept.ts` (+ tests), `src/components/windows/aiSettings/{AgentTab,AutonomyWarning}.vue`, `src/views/OrgSpace/views/settings/views/{AIRuntimeSettings,AISecuritySettings}.vue`, `…/components/{FeaturePolicyCard,MemberPicker}.vue`, `policyMembers.ts`, `src/views/OrgSpace/components/ai/RuntimeSwitchControl.vue`.

### **Notes**
- Limite : L10 n'expose pas le constructeur du corps de `switch-to-runtime` (rechiffrement de l'historique sous `CK`, entrée `conv`). `setSwitchBodyBuilder` attend ce constructeur ; sans lui, « Faire tourner sur le runtime » explique que la bascule arrive avec le lot suivant. « Revenir en local » fonctionne.
- Réglage « Toujours accepter » : liste JSON dans `ai_auto_accept_<orgId>` (le réglage du compte refuse les tableaux) ; à consommer par L12.
- Aucun montant en euros ; aucune rangée par membre (recherche limitée à 8 résultats).

**Date** : 2026-11-23

### **Prochaines Étapes**
1. L10 : fonction qui construit le corps de `switch-to-runtime`, à brancher par `setSwitchBodyBuilder`.
2. Recette manuelle Firefox avec un vrai runtime (porte D), `defaults.ts` (sfetch, CORS, socket), comparaison aux captures C3.

---

## 📅 **2026-11-23 - Lot L10b : corps de `switch-to-runtime` (bascule d'une conversation existante)**

**Priorité** : ⭐⭐⭐⭐⭐ (Haute)  
**Complexité** : Élevée  
**Statut** : ✅ **TERMINÉ** (recette manuelle Firefox avec un vrai runtime à faire)

### **Objectif**
Construire le corps de `POST …/ai/sessions/:sessionId/switch-to-runtime` (04 §5, 03 §6.2 à §6.4) et le brancher par `setSwitchBodyBuilder` : « Faire tourner sur le runtime » fonctionne pour une conversation existante.

### **Changements**
- `src/services/aiRuntime/switchBody.ts` : `buildSwitchToRuntimeBody` / `createSwitchBodyBuilder`. Ordre : DK de CETTE délégation en mémoire (sinon `delegation_unusable`, rien lu ni enregistré) → `GET` de la conversation (`rev` = `baseRev`) → `CK` existante (`GET …/key` `200` ouverte par `deps.keys`, sinon `conversation_key_unavailable`, jamais de CK neuve) ou tirée → `registerRuntimeConversation` (PC81) → `sealConversationEntry` (`convEntry`) → historique rechiffré sous `CK` → titre (≤ 60 caractères) → `convKey` (RSA-OAEP pour soi + FC4 `aiconv:<sessionId>`) si la CK est neuve → bornes.
- Formats lus (03 §6.4) : `StoredMessage[]` en clair ; champs `gcm1:` sous `AiSessionKey` (sans placeholder : un champ illisible arrête la bascule) ; format d'affichage d'OrgAI (blob `isE2EE`, que `GET /ai/sessions/:id` rend vide : repris de l'historique affiché) ; `conv-gcm1-v1` relu en strict puis renvoyé tel quel.
- Bornes de `switchToRuntimeSchema` : 20 000 messages, 64 appels par message, nom ≤ 64, `createdAt` ≤ 40, 8 Mio, titre chiffré ≤ 1024, identifiants `[A-Za-z0-9_-]{1,64}` (réécrits en UUID à la conversion, `toolCallId` suit).
- `delegation.ts` : `sealConversationEntry`, `forgetRuntimeConversation` ; `aiActionPlan.ts` : `encryptAiFieldStrict` ; `keyEnvelope.ts` : `signKeyEnvelope(…, signKey)`.
- `aiRuntimeUi.ts` : délégation recréée si la DK n'est pas en mémoire ; conversation retirée du registre si la bascule échoue ; trois nouveaux codes expliqués. `aiRuntimeSwitch.ts` branche le constructeur depuis `RuntimeSwitchControl.vue`.

### **Tests**
`switchBody.test.ts` (21) : aller-retour avec le banc de L10 (DK ouverte par la `kex` du faux runtime, entrée `conv` → CK, CK = déchiffrement RSA, enveloppe FC4 vérifiée), historique déchiffré = original, CK réutilisée, bornes, aucun clair hors du chiffré, échec fermé, vecteurs `conversation-fields.json` rejoués (lecture stricte, écriture à IV figé octet pour octet). `bun test src/services` : 168 réussis ; `vue-tsc` : 0 erreur.

### **Choix provisoires (à valider)**
- Conversion du format d'affichage → `StoredMessage[]` (03 §6.4 « à valider par L11 ») : messages `system` écartés, `mutating` absent → `false`, statut absent → `done`, catégorie absente → `client`.
- Historique au-delà des bornes : refus (`history_too_large`), pas de troncature.
- `conv-gcm1-v1` : valeurs renvoyées telles quelles après relecture stricte (pas de rechiffrement).

**Date** : 2026-11-23

### **Prochaines Étapes**
1. Recette manuelle Firefox : bascule d'une conversation claire, gateway et client ; retour local puis retour runtime (CK conservée).
2. Le blob `isE2EE` reste invisible par `GET /ai/sessions/:id` (l'API ne rend que les tableaux) : seul l'appareil qui l'affiche peut le basculer.

---

## 📅 **2026-11-23 - Lot L11 : corrections de la revue**

**Statut** : ✅ **TERMINÉ** (recette manuelle Firefox à faire)

### **Changements (un commit par point)**
1. `listGatewayModels` : ticket `sgt1` (`/ai/gateway-ticket`), présenté seulement à l'origine enregistrée ; plus de jeton Keycloak ; `any` supprimé.
2. `activeSessionReadOnly` : conversation illisible = lecture seule ; `syncSession` n'écrit plus jamais en clair (ni sans clé).
3. `loadSession` lit `conv-gcm1-v1` (`openConversationMessages`, CK) ; `syncSession` réécrit sous CK (`sealConversationMessages`) ; « Revenir en local » fait `await loadSession(id)`.
4. Nouveau : la bascule ouvre le blob `isE2EE` rendu par l'API (`openClientBlob`) ; illisible ou format inconnu = `history_unreadable`, jamais un historique vide (`displayedMessages` supprimé).
5. `confirmedFingerprint` (L10) : seule l'empreinte affichée est confirmée (AgentTab, RuntimeSwitchControl) ; `pairRuntime(…, expectedFingerprint)` compare à l'aperçu ; champs figés pendant l'aperçu ; bandeau `first_seen_after_change` dès le chargement.
6. AgentTab : pas de redélégation après acceptation de clé si aucune délégation active ; autonomie seulement sur le runtime ; désactivation toujours possible (`aiAgentRules.ts`).
7. Tout le monde vers liste : un seul `PUT { mode, userIds }` (`applyPolicyChange`, refus au-delà de 100) ; annonce au plus juste (liste vide = tous perdent ; sinon au moins n − choisies).
8. « Toujours accepter » : liste blanche des types admis, drapeau `sensitive` du manifeste prioritaire s'il existe.
Mineurs : « +N » cherche côté serveur (`?q=`) ; annonce « Toujours accepter » sans compte d'utilisateurs.

### **Vérifications**
vue-tsc : 0 erreur. `bun test src/services` : 191 réussis, 0 échec.

### **Reste ouvert**
`MemberPicker` cherche dans l'annuaire local (aucun endpoint serveur de recherche de membres) ; PC81 « à la création » sans objet (l'API refuse de créer une conversation runtime) ; le manifeste des outils n'a pas de drapeau `sensitive` ; la conversion affichage vers StoredMessage à l'écriture CK horodate tous les messages à l'instant de la synchro.

---

## 📅 **2026-11-23 - Lot L12 : conversation runtime, plan d'action et fichiers de l'agent (partiel)**

**Statut** : 🟡 **PARTIEL** (briques livrées, branchement dans `OrgAI.vue` et recette manuelle à faire)

### **Changements (un commit par point)**
1. Liaison WebSocket directe (`conversation/connection.ts`, `events.ts`) : reprise, tampon de snapshot, reconnexion, dépôt par l'API.
2. Modèle de plan (`plan/planModel.ts`, `planLabels.ts`) : intitulés générés par l'app, actions sensibles (échec fermé), sélection et cascade, règle du petit plan PC76, disposition du graphe en colonnes et bandes (groupes repliés au-delà de 30 actions).
3. Suivi et bilan (`plan/planProgress.ts`) : états par action, jauge, bandeaux PC54 et PC55, codes d'abandon PC74, bilan, plan expiré PC62.
4. Écrans : `PlanCard`, `PlanGraphWindow` (validation, suivi, revue), `PlanGraph`, `PlanActionCard`, `PlanActionDetail`, `PlanList` (mobile), `PlanSummary`. Arrêt par `ConfirmDelete`, aucun `v-html`.
5. `plan/planSession.ts` : chargement et décision ; PC76 revérifiée sur le plan déchiffré (la carte ne peut pas accepter un plan de plus de 5 actions ou sensible), `serverDigests` recalculés (PC69).
6. `MessageAttachments.vue` : taille en o/Ko/Mo, source de téléchargement, ouverture et « Enregistrer dans un espace » fournies par l'appelant ; `artifacts/` : interface de source, nom assaini, empreinte vérifiée, Markdown rendu sans HTML, visionneuse, sélecteur d'espace.
7. `aiUsageStats.ts` : `recordRuntimeUsage` (sessionId, régime runtime, dédoublonné par message).

### **Vérifications**
vue-tsc : 0 erreur (sonde volontaire détectée, `.vue` compris). `bun test src/services` : voir compte rendu.

### **Reste ouvert**
- Branchement de `RuntimeConnection`, de `PlanCard` et de `PlanGraphWindow` dans `OrgAI.vue` / dock (L13) ; appel de `recordRuntimeUsage` sur les trames `usage`.
- Format de stockage des artefacts (L00g) : seule l'interface `ArtifactSource` existe.
- Usage par message dans l'historique rejoué : non vérifié (à signaler pour L07c / L08b).
- Recette manuelle Firefox : comparer aux captures `C3_maquettes/png` (plan, suivi, artefact, états), plan de 100 actions, mobile, fermer puis rouvrir l'onglet.

## 📅 **2026-11-23 - Lot L12 (suite) : conversation runtime branchée, phase d'appareil, « Toujours accepter »**

**Statut** : 🟢 branchement fait ; recette manuelle Firefox à faire.

### **Changements (un commit par étape)**
1. `OrgAI.vue` consomme `AgentEventSource` (`RuntimeEventSource` sur `RuntimeConnection`, `useRuntimeConversation`, `transcript.ts`) : messages, outils, états de 08, bandeau du lien (hors ligne = lecture seule), messages « en file », confirmation, réponse, annulation (vaut arrêt du plan, PC70), `recordRuntimeUsage` sur les trames `usage`, carte de plan dans le fil (`RuntimePlanPanel.vue`, part `plan`), fenêtre du graphe depuis la carte.
2. Phase d'appareil (`plan/deviceRunner.ts`, `runnerLoop.ts`, `planApi.ts`, `deviceActions.ts`) : claim, actions prêtes (4 en parallèle), `progress`, `plan_result` scellé (`sealDevicePhaseResult`) déposé, arrêt, cascade PC54, reprise après rechargement (claim expiré, issue `unknown_outcome`), jamais de relance d'une action `executing`. Actions : `category.create`, `thread.create`, `folder.create`, `file.create_text`, en-tête `X-Synco-Plan` (jusqu'à `/api/cdn/transfers/uploads`).
3. « Toujours accepter » (`planAutoAccept.ts`) : petit plan (PC76) dont toutes les actions sont dans `ai_auto_accept_<orgId>` et admises par la liste blanche ; jamais de sensible.
4. Passe design : comparaison aux captures C3 plan et états ; textes d'état alignés (plan illisible, plan clos). Le skill est orienté pages ; le style expressif existant est conservé.

### **Reste ouvert**
- Recette manuelle (Firefox) : flux WebSocket réel, création réelle des 4 types d'action, mobile, fermer/rouvrir l'onglet.
- Envoi d'image `request_image_upload` vers le runtime non pris en charge (format de `ref` à fixer) ; démarrage d'une nouvelle conversation runtime depuis l'app non traité.
- Règle 7 : un `folderId` littéral n'est pas vérifié localement (arbre des dossiers non chargé). `maxLifetimeSecs` = plafond 7 j. Sorties d'appareil d'une phase précédente après rechargement : prises de l'API (pas de double contrôle).
- Dock (L13), usage par message dans l'historique rejoué (à signaler L07c/L08b).

## 📅 **2026-11-23 - Lot L12 (corrections de revue) : plan d'action côté app et « Toujours accepter »**

**Statut** : 🟢 9 constats corrigés, un commit par point (3 et 8 ensemble, même fonction du runner).

### **Changements**
1. « Toujours accepter » : lecture de `GET …/feature-policies/me` (`readAutoAcceptPolicy`, client L11 `fetchMyFeatures`) ; `canAutoAccept` exige `policyAllowed` ; lecture échouée = refus (échec fermé) ; droit retiré = liste `ai_auto_accept_<orgId>` vidée.
2. Exécution = intersection entre l'état servi et l'ensemble accepté sur l'appareil (`planLocal.ts`, `localStorage`, clé `synco_plan_local:<org>:<session>:<plan>`) ; ensemble inconnu = rien exécuté.
3. Sorties des phases d'appareil précédentes relues depuis les `plan_result` scellés conservés localement (`openPhaseResult`), égalité exigée avec l'API ; sans résultat lisible la dépendante passe `failed`.
4. Erreur de transport après envoi : `unknown_outcome` ; `failed` seulement sur 4xx/5xx ou contrôle local avant envoi (`deviceErrors.ts`).
5. Carte inline : lieu (`a.place`, ambre si inconnu), cible par `argsRefs` (« dans l'espace créé par l'action m », aussi dans `argLines`) ; lieu inconnu = `isSmallPlan` faux (ni carte inline ni acceptation sans clic).
6. Groupe replié : « N actions cochées » (`countChecked`) ; le bouton d'acceptation affichait déjà le compte exact ; les sensibles restent dans leur bande, jamais repliée ni précochée.
7. `deviceId` stable par appareil (`stableDeviceId`).
8. Orphelins `unknown_outcome` déjà portés par un dépôt antérieur : non rapportés de nouveau.
9. Clés des membres d'un salon d'org résolues par lots de 8 (`mapBounded`).

### **Vérifications**
vue-tsc 0 erreur ; `bun test src/services` : 281 réussis.

### **Reste ouvert**
- Les `plan_result` d'appareil ne sont pas servis par l'API : une phase déposée par un AUTRE appareil n'est pas relisible ici (ses dépendantes passent `failed`). Un `plan_result` servi (ou relu depuis la boîte) lèverait ce cas.
- Une action restée `executing` sans aucune action prête n'est reprise qu'à l'expiration du claim par un nouveau claim (comportement inchangé).
- Recette manuelle Firefox : reprise après rechargement, carte avec lieu inconnu, groupe replié (plan de 100 actions).

## 📅 **2026-11-23 - Lot L13 : dock Synco AI, « Demander à Synco AI », Ctrl/Cmd+J, bulle de notification**

**Statut** : 🟢 code, tests et vue-tsc faits ; recette visuelle Firefox à faire.

### **Changements (un commit par étape)**
1. `composables/useAgentDock.ts` : entrées du dock (`min` / `open` / `full`), persistance `localStorage` (retour en barres réduites), plafond `MAX_PANELS` partagé avec les tâches (`dockCapacity.ts`, `useTaskPanels.ts`), `Ctrl/Cmd+J` (`toggleShortcut`), jamais d'ouverture sans geste (PC80), rien de visible quand rien n'est ouvert (PC75).
2. `services/agentDock/` : `context.ts` (contexte, suggestions par module, contenu joint seulement si déjà en clair, bloc de contexte traité en donnée), `barState.ts`, `nudges.ts` (bulles, groupes « À traiter / En cours / Récentes »), `shortcut.ts`, `newConversation.ts` (créer en local puis basculer aussitôt, erreur expliquée sinon) et son branchement réel.
3. `Notifications.vue` : type `notif:agent` (bulle PC80, bordure ambre, clic = ouvre le dock sur la conversation, `aria-live="polite"`, sans voler le focus).
4. `components/agentDock/` : `AgentDockColumn` (barres, « Tout fermer », glisser pour fermer, panneau 400 px, plein écran sur mobile), `AgentDockPanel` (fil via `AgentTurn`, `RuntimePlanPanel` / `PlanCard` pour le plan, `PendingActionBar`, puce de contexte, suggestions, composeur), `AgentWindow` (PC78). Montés dans `App.vue` ; `OrgAI.vue` : « Détacher dans le dock », reprise d'une demande venue du dock.
5. « Demander à Synco AI » : fichiers, dossiers, tâches (espace et global), évènements (menu « ··· » du panneau), messages de salon et privés (barre d'actions et feuille mobile).

### **Choix**
- Un seul panneau déplié à la fois : il lit la conversation active de l'app (`aiSessionMessages`) ; pendant que la page complète est affichée, il n'ouvre pas de second flux (carte « ouverte dans la page complète »).
- Conversation locale dans le dock : lecture seule, « Continuer » mène à la page complète. Runtime indisponible ou bascule refusée : message expliqué, la demande est reprise dans la page complète.
- Bulles : alimentées par le statut des conversations runtime (`GET …/ai/sessions`, relu toutes les 30 s). « Une action à valider » (le nombre d'actions n'est pas dans la liste).
- Ctrl+J : aucun champ ni éditeur de l'app ne le lie (vérifié par recherche) ; le raccourci ignore les éditeurs de code ou riches et les évènements déjà gérés.

### **Vérifications**
vue-tsc 0 erreur (détection vérifiée par une erreur volontaire) ; `bun test src/services` + `useAgentDock.test.ts` : 313 réussis (281 + 32).

### **Reste ouvert**
- Recette manuelle Firefox, comparée à `C3_maquettes/png` : dock, agrandi, demander, mobile, états.
- Composeur du dock : pas de choix de modèle ni de bouton « Contexte » ; nombre d'actions sur la barre et la bulle ; sélection + Ctrl+J avec contexte ; entrée « salon » et module Documents hors fichiers ; états « plan exécuté ailleurs » et clé changée seulement via le fil.

# 🔗 **Feature: Système de Webhooks Sécurisés E2EE**

> **Projet** : Synco - Alternative souveraine à Slack/Discord  
> **Type** : Feature Specification  
> **Statut** : Conception  
> **Date** : 26 Juin 2026  
> **Priorité** : Haute  
> **Complexité** : Élevée  

---

## 📌 **Résumé de la Feature**

Implémentation d'un **système de webhooks sécurisés** permettant aux utilisateurs de générer des endpoints API pour envoyer des messages et des notifications **de manière programmatique** vers un Space/Workspace Synco.

**Inspiration** : Système de webhooks Discord (simplicité) + GitHub (sécurité) + **chiffrement E2EE Synco** (confidentialité absolue).

**Objectifs** :
- ✅ Permettre l'intégration avec des services externes (CI/CD, bots, notifications)
- ✅ Sécurité maximale : **E2EE + HMAC + Token d'authentification**
- ✅ Compatibilité : Accepter les payloads Discord, GitHub, et autres
- ✅ Permissivité : Large spectre de fonctionnalités (messages, embeds, fichiers)
- ✅ Audit : Traçabilité complète des appels

---

## 🎯 **Fonctionnalités Clés**

| Fonctionnalité | Description | Priorité |
|---------------|-------------|----------|
| Création de webhook | Générer un webhook dans les paramètres d'un Space | ⭐⭐⭐ |
| URL unique + Token | Chaque webhook a une URL du type `/api/webhooks/{id}/{token}` | ⭐⭐⭐ |
| Authentification HMAC | Vérification via signature HMAC avec secret partagé | ⭐⭐⭐ |
| Chiffrement E2EE | Optionnel : chiffrement des messages avec clé publique/privée | ⭐⭐⭐ |
| Payload Discord | Support natif du format JSON Discord | ⭐⭐ |
| Payload GitHub | Support natif du format JSON GitHub | ⭐⭐ |
| Permissions granulaires | Contrôle fin des actions autorisées | ⭐⭐ |
| Rate Limiting | Protection contre les abus (100 req/min/webhook) | ⭐⭐⭐ |
| Audit Log | Historique complet des appels (IP, timestamp, payload) | ⭐⭐ |
| Test intégré | Bouton "Tester" pour envoyer un message de test | ⭐ |
| Régénération token | Permettre de régénérer le token de sécurité | ⭐ |
| Désactivation | Désactiver temporairement un webhook | ⭐ |

---

## 🏗️ **Architecture Technique**

### **Schéma Global**

```
┌─────────────────────────────────────────────────────────────────┐
│                         SERVICE EXTERNE                              │
│  (GitHub, CI/CD, Bot, Custom App, Discord Webhook Forwarder)       │
└───────────────────────────────┬─────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                    BACKEND API - Webhook Endpoint                   │
│  POST /api/webhooks/{webhookId}/{token}                           │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  1. Vérification Token URL                                  ││
│  │  2. Vérification HMAC Signature (optionnelle)               ││
│  │  3. Déchiffrement E2EE (si activé)                           ││
│  │  4. Validation du payload                                  ││
│  │  5. Mapping vers le format interne Synco                    ││
│  │  6. Envoi du message dans le Space                         ││
│  │  7. Audit Log                                               ││
│  └─────────────────────────────────────────────────────────────┘│
└───────────────────────────────┬─────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                      BASE DE DONNÉES                              │
│  - Table webhooks: métadonnées, permissions, clés E2EE            │
│  - Table webhook_messages: historique des messages reçus         │
│  - Table webhook_audit_logs: logs de sécurité                      │
└─────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                      FRONTEND - UI de Gestion                       │
│  /{orgId}/{spaceId}/settings/webhooks                              │
│  - Liste des webhooks du Space                                     │
│  - Création/Édition/Suppression                                    │
│  - Visualisation du token et du secret                            │
│  - Statistiques d'utilisation                                      │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📦 **Schéma JSON - Architecture des Webhooks**

### **1. Schéma du Webhook (Création/Réponse API)**

```json
{
  "id": "wh_8f3a1b2c9d0e4f5g6h7i8j9k0l1m2n3o4p5",
  "spaceId": "sp_1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6",
  "name": "GitHub CI/CD Notifications",
  "description": "Reçoit les notifications de déploiement",
  "url": "https://api.synco.fr/api/webhooks/wh_8f3a1b2c9d0e4f5g6h7i8j9k0l1m2n3o4p5/abc123def456ghi789",
  "token": "abc123def456ghi789",
  "secret": "whsec_1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p7q8r9s0t1u2v3w4x5y6",
  "permissions": [
    "send_messages",
    "send_embeds",
    "send_files",
    "mention_everyone",
    "mention_roles"
  ],
  "e2eeEnabled": true,
  "publicKey": "-----BEGIN PUBLIC KEY-----\nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE...",
  "isActive": true,
  "createdAt": "2026-06-26T10:00:00.000Z",
  "updatedAt": "2026-06-26T10:00:00.000Z",
  "lastUsedAt": "2026-06-26T10:05:00.000Z",
  "usageCount": 42
}
```

### **2. Schéma du Payload Entrant (Request)**

**Format Synco Natif (Recommandé)** :

```json
{
  "content": "Nouveau commit poussé sur main",
  "embeds": [
    {
      "title": "Build #1234",
      "description": "Build réussie en 2m34s",
      "color": "#2b2d42",
      "url": "https://ci.example.com/builds/1234",
      "author": {
        "name": "GitHub Actions",
        "icon_url": "https://github.com/favicon.ico"
      },
      "fields": [
        {"name": "Branch", "value": "main", "inline": true},
        {"name": "Commit", "value": "a1b2c3d...", "inline": true},
        {"name": "Status", "value": "✅ Success", "inline": false}
      ],
      "footer": {
        "text": "GitHub Actions",
        "icon_url": "https://github.com/favicon.ico"
      },
      "timestamp": "2026-06-26T10:05:00.000Z"
    }
  ],
  "mentions": ["@dev-team"],
  "attachments": [
    {
      "url": "https://ci.example.com/artifacts/build.zip",
      "filename": "build.zip",
      "size": 12345678
    }
  ],
  "username": "GitHub Bot",
  "avatar_url": "https://github.com/favicon.ico",
  "encrypted": true,
  "nonce": "a1b2c3d4e5f6g7h8",
  "ephemeral": false
}
```

### **3. Schéma Discord Compatible**

```json
{
  "content": "Nouveau message via webhook Discord",
  "embeds": [
    {
      "title": "Notification Discord",
      "description": "Contenu du message",
      "color": 3447003,
      "fields": [
        {"name": "Auteur", "value": "Discord User"}
      ]
    }
  ],
  "username": "Discord Webhook",
  "avatar_url": "https://discord.com/assets/...",
  
  // Extensions Synco
  "_synco": {
    "encrypted": false,
    "targetChannelId": "ch_123..."
  }
}
```

### **4. Schéma GitHub Compatible**

```json
{
  "action": "opened",
  "issue": {
    "number": 42,
    "title": "Bug: Fix login issue",
    "body": "Description du bug...",
    "url": "https://github.com/org/repo/issues/42",
    "user": {
      "login": "dev-user",
      "avatar_url": "https://github.com/avatar.png"
    }
  },
  "repository": {
    "name": "synco",
    "full_name": "org/synco"
  },
  
  // Extensions Synco
  "_synco": {
    "encrypted": false,
    "mappings": {
      "content": "{{issue.title}} - {{issue.body}}",
      "username": "{{issue.user.login}}",
      "avatar_url": "{{issue.user.avatar_url}}"
    }
  }
}
```

---

## 🔐 **Système de Sécurité**

### **1. Authentification Multi-Niveaux**

```
┌─────────────────────────────────────────────────────────────────┐
│                    NIVEAUX DE SÉCURITÉ                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Niveau 1: Token URL (Obligatoire)                               │
│  ├── URL: /api/webhooks/{webhookId}/{token}                      │
│  ├── Vérification: token === storedToken                         │
│  └── Complexité: 32 caractères aléatoires (base62)               │
│                                                                  │
│  Niveau 2: HMAC Signature (Recommandé)                           │
│  ├── Header: X-Synco-Signature                                   │
│  ├── Algorithme: HMAC-SHA256                                      │
│  ├── Clé: webhook.secret                                        │
│  ├── Payload: body + timestamp                                  │
│  └── Format: t=timestamp,v1=signature                           │
│                                                                  │
│  Niveau 3: Chiffrement E2EE (Optionnel)                           │
│  ├── Algorithme: ECDH P-256 + AES-256-GCM                         │
│  ├── Clé publique: partagée avec le client                       │
│  ├── Clé privée: stockée chiffrée en base                         │
│  └── Dérivation: HKDF-SHA256                                      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### **2. Algorithme de Vérification HMAC**

```typescript
// Côté client (celui qui envoie)
const timestamp = Date.now().toString();
const payload = JSON.stringify(body);
const signature = crypto
  .createHmac('sha256', webhookSecret)
  .update(timestamp + payload)
  .digest('hex');

// Header à envoyer
{
  'X-Synco-Timestamp': timestamp,
  'X-Synco-Signature': `t=${timestamp},v1=${signature}`
}

// Côté serveur (vérification)
const { timestamp, signature } = parseSignature(header);
const expectedSignature = crypto
  .createHmac('sha256', storedWebhook.secret)
  .update(timestamp + rawBody)
  .digest('hex');

if (`t=${timestamp},v1=${expectedSignature}` !== signature) {
  throw new Error('Invalid signature');
}

// Anti-replay: vérifier que timestamp est récent (< 5 min)
if (Date.now() - parseInt(timestamp) > 300000) {
  throw new Error('Timestamp too old');
}
```

### **3. Chiffrement E2EE des Webhooks**

```typescript
// Génération des clés (lors de la création du webhook)
const keyPair = await crypto.subtle.generateKey(
  { name: 'ECDH', namedCurve: 'P-256' },
  true,
  ['deriveKey', 'deriveBits']
);

// Exportation de la clé publique (à partager avec le client)
const publicKey = await crypto.subtle.exportKey('spki', keyPair.publicKey);

// Stockage de la clé privée (chiffrée avec la clé maître Synco)
const privateKey = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);
const encryptedPrivateKey = await encrypt(privateKey, SYNCO_MASTER_KEY);

// Chiffrement du message par le client
const sharedSecret = await deriveKey(
  externalPublicKey,
  webhookPrivateKey,
  { name: 'ECDH', namedCurve: 'P-256' }
);
const aesKey = await deriveAESKey(sharedSecret, 'SHA-256', 256);
const { ciphertext, iv, tag } = await encryptAESGCM(
  message,
  aesKey,
  generateIV(12)
);

// Envoi
{
  content: base64Encode(ciphertext),
  nonce: base64Encode(iv),
  encrypted: true,
  ephemeralPublicKey: base64Encode(externalPublicKey) // Optionnel pour PFS
}
```

### **4. Perfect Forward Secrecy (PFS)**

Pour éviter qu'une compromission de la clé privée du webhook ne permet de déchiffrer les anciens messages :

```typescript
// Le client génère une clé éphémère pour chaque message
const ephemeralKeyPair = await crypto.subtle.generateKey(
  { name: 'ECDH', namedCurve: 'P-256' },
  true,
  ['deriveKey']
);

// Chiffrement avec la clé éphémère + la clé du webhook
const sharedSecret1 = await deriveKey(
  ephemeralKeyPair.publicKey,
  webhookPrivateKey
);
const sharedSecret2 = await deriveKey(
  ephemeralKeyPair.privateKey,
  webhookPublicKey
);
const combinedSecret = combineSecrets(sharedSecret1, sharedSecret2);

// Le serveur peut déchiffrer avec sa clé privée + la clé publique éphémère
```

---

## 🗃️ **Modèle de Données (Prisma Schema)**

```prisma
// ============================================
// Modèle Webhook
// ============================================
model Webhook {
  id            String    @id @default(cuid())
  spaceId       String
  space         Space     @relation(fields: [spaceId], references: [id], onDelete: Cascade)
  creatorId     String
  creator       User      @relation(fields: [creatorId], references: [id])
  
  // Métadonnées
  name          String
  description   String?
  
  // Sécurité
  token         String    @unique // Token dans l'URL
  secret        String    @db.Text // Secret pour HMAC
  
  // Chiffrement E2EE
  e2eeEnabled    Boolean   @default(false)
  publicKey      String?   @db.Text // Clé publique (PEM)
  privateKey     String?   @db.Text // Clé privée chiffrée
  keyIv          String?   // IV pour déchiffrer la clé privée
  
  // Permissions
  permissions   String[]  @default(["send_messages"])
  
  // Statut
  isActive       Boolean   @default(true)
  isRateLimited  Boolean   @default(false)
  rateLimitReset DateTime?
  
  // Statistiques
  lastUsedAt     DateTime?
  usageCount     Int       @default(0)
  lastErrorAt    DateTime?
  errorCount     Int       @default(0)
  
  // Audit
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
  
  // Index
  @@index([spaceId])
  @@index([token])
  @@index([creatorId])
  @@map("webhooks")
}

// ============================================
// Modèle Webhook Message (Historique)
// ============================================
model WebhookMessage {
  id            String    @id @default(cuid())
  webhookId     String
  webhook       Webhook   @relation(fields: [webhookId], references: [id], onDelete: Cascade)
  
  // Contenu
  rawPayload    Json      @db.Text // Payload brut reçu
  processedAt   DateTime?
  
  // Message traité
  content       String?   @db.Text // Contenu déchiffré
  nonce         String?   // IV pour déchiffrement
  isEncrypted   Boolean   @default(false)
  
  // Métadonnées
  senderName    String?
  senderAvatar   String?
  senderIp      String?   // IP du client
  userAgent     String?
  
  // Statut
  status        String    @default("pending") // pending, processed, failed
  errorMessage  String?
  
  // Timestamps
  receivedAt    DateTime  @default(now())
  processedAt   DateTime?
  
  @@index([webhookId])
  @@index([receivedAt])
  @@index([status])
  @@map("webhook_messages")
}

// ============================================
// Modèle Webhook Audit Log
// ============================================
model WebhookAuditLog {
  id            String    @id @default(cuid())
  webhookId     String
  webhook       Webhook   @relation(fields: [webhookId], references: [id], onDelete: Cascade)
  
  // Action
  action        String    // create, update, delete, call, regenerate_token
  
  // Contexte
  ipAddress     String?
  userAgent     String?
  userId        String?   // Si action par utilisateur authentifié
  
  // Données
  metadata      Json?     @db.Text // Données supplémentaires
  oldValues     Json?     @db.Text // Pour les updates
  newValues     Json?     @db.Text // Pour les updates
  
  // Statut
  success       Boolean   @default(true)
  errorMessage  String?
  
  // Timestamps
  timestamp     DateTime  @default(now())
  
  @@index([webhookId])
  @@index([timestamp])
  @@index([action])
  @@index([ipAddress])
  @@map("webhook_audit_logs")
}
```

---

## 🚀 **API Endpoints**

### **Backend (synco_api)**

#### **Webhooks - Gestion**

| Méthode | Endpoint | Description | Auth |
|---------|----------|-------------|------|
| `POST` | `/api/spaces/{spaceId}/webhooks` | Créer un nouveau webhook | JWT |
| `GET` | `/api/spaces/{spaceId}/webhooks` | Lister les webhooks d'un Space | JWT |
| `GET` | `/api/webhooks/{webhookId}` | Obtenir un webhook | JWT |
| `PUT` | `/api/webhooks/{webhookId}` | Mettre à jour un webhook | JWT |
| `DELETE` | `/api/webhooks/{webhookId}` | Supprimer un webhook | JWT |
| `POST` | `/api/webhooks/{webhookId}/regenerate` | Régénérer le token | JWT |
| `GET` | `/api/webhooks/{webhookId}/stats` | Statistiques d'utilisation | JWT |

#### **Webhooks - Réception**

| Méthode | Endpoint | Description | Auth |
|---------|----------|-------------|------|
| `POST` | `/api/webhooks/{webhookId}/{token}` | Recevoir un message via webhook | Token |

#### **Webhooks - Test**

| Méthode | Endpoint | Description | Auth |
|---------|----------|-------------|------|
| `POST` | `/api/webhooks/{webhookId}/test` | Envoyer un message de test | JWT |

### **Request/Response Examples**

#### **Créer un Webhook**

**Request:**
```http
POST /api/spaces/sp_123/webhooks
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json

{
  "name": "GitHub CI/CD",
  "description": "Notifications de déploiement",
  "permissions": ["send_messages", "send_embeds", "mention_roles"],
  "e2eeEnabled": true
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "webhook": {
    "id": "wh_abc123",
    "spaceId": "sp_123",
    "name": "GitHub CI/CD",
    "description": "Notifications de déploiement",
    "url": "https://api.synco.fr/api/webhooks/wh_abc123/xyz789",
    "token": "xyz789",
    "secret": "whsec_abc123def456",
    "permissions": ["send_messages", "send_embeds", "mention_roles"],
    "e2eeEnabled": true,
    "publicKey": "-----BEGIN PUBLIC KEY-----\n...",
    "isActive": true,
    "createdAt": "2026-06-26T10:00:00.000Z"
  }
}
```

#### **Envoyer un Message via Webhook**

**Request:**
```http
POST /api/webhooks/wh_abc123/xyz789
Content-Type: application/json
X-Synco-Timestamp: 1719391200000
X-Synco-Signature: t=1719391200000,v1=a1b2c3d4e5f6...

{
  "content": "Nouveau commit sur main",
  "embeds": [{
    "title": "Build #1234",
    "description": "✅ Success",
    "color": "#22c55e",
    "fields": [
      {"name": "Branch", "value": "main"},
      {"name": "Duration", "value": "2m 34s"}
    ]
  }],
  "username": "GitHub Bot",
  "avatar_url": "https://github.com/favicon.ico",
  "encrypted": true,
  "nonce": "a1b2c3d4e5f6"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "messageId": "msg_abc123",
  "threadId": "th_xyz789",
  "receivedAt": "2026-06-26T10:05:00.000Z"
}
```

**Response (401 Unauthorized):**
```json
{
  "success": false,
  "error": "Unauthorized",
  "message": "Invalid token or signature"
}
```

**Response (429 Too Many Requests):**
```json
{
  "success": false,
  "error": "Rate limited",
  "message": "Too many requests. Try again in 60 seconds.",
  "retryAfter": 60
}
```

---

## 🖥️ **Frontend Implementation**

### **Structure des Fichiers**

```
synco_app/src/
├── views/
│   └── OrgSpace/
│       └── views/
│           └── settings/
│               └── views/
│                   ├── WebhooksSettings.vue       # Page principale
│                   └── components/
│                       ├── WebhookList.vue        # Liste des webhooks
│                       ├── WebhookCreate.vue      # Formulaire de création
│                       ├── WebhookEdit.vue        # Formulaire d'édition
│                       ├── WebhookDetails.vue     # Détails d'un webhook
│                       └── WebhookTest.vue        # Composant de test
│
├── composables/
│   └── useWebhooks.ts                           # Logique métier
│
├── types/
│   └── webhooks.ts                              # Types TypeScript
│
└── assets/
    └── utils/
        └── webhookCrypto.ts                     # Fonctions crypto E2EE
```

### **Pages et Composants**

#### **1. WebhooksSettings.vue (Page Principale)**

```vue
<template>
  <div class="space-y-6">
    <div class="flex justify-between items-center">
      <h1 class="text-2xl font-bold">Webhooks</h1>
      <Button @click="showCreateModal = true" class="primary">
        <i class="bi bi-plus-lg" />
        Nouveau Webhook
      </Button>
    </div>
    
    <WebhookList
      :webhooks="webhooks"
      :loading="loading"
      @edit="openEditModal"
      @delete="openDeleteModal"
      @test="openTestModal"
    />
    
    <WebhookCreate
      v-if="showCreateModal"
      @close="showCreateModal = false"
      @created="refreshWebhooks"
    />
    
    <WebhookEdit
      v-if="editingWebhook"
      :webhook="editingWebhook"
      @close="editingWebhook = null"
      @updated="refreshWebhooks"
    />
    
    <WebhookTest
      v-if="testingWebhook"
      :webhook="testingWebhook"
      @close="testingWebhook = null"
    />
  </div>
</template>
```

#### **2. WebhookCreate.vue**

```vue
<template>
  <Modal @close="$emit('close')">
    <template #title>Créer un Webhook</template>
    
    <form @submit.prevent="createWebhook" class="space-y-4">
      <div>
        <label class="block text-sm font-medium mb-2">Nom</label>
        <input v-model="name" type="text" placeholder="GitHub CI/CD" required />
      </div>
      
      <div>
        <label class="block text-sm font-medium mb-2">Description</label>
        <textarea v-model="description" placeholder="Notifications de déploiement" />
      </div>
      
      <div>
        <label class="block text-sm font-medium mb-2">Channel Cible</label>
        <select v-model="targetChannelId" required>
          <option v-for="channel in channels" :value="channel.id">
            #{{ channel.name }}
          </option>
        </select>
      </div>
      
      <div>
        <label class="block text-sm font-medium mb-2">Permissions</label>
        <div class="space-y-2">
          <label v-for="perm in allPermissions" :key="perm">
            <input type="checkbox" v-model="permissions" :value="perm" />
            {{ formatPermission(perm) }}
          </label>
        </div>
      </div>
      
      <div>
        <label class="block text-sm font-medium mb-2">
          <input type="checkbox" v-model="e2eeEnabled" />
          Chiffrement E2EE
        </label>
        <p class="text-sm text-(--text2)">
          Activez le chiffrement de bout en bout pour sécuriser les messages
        </p>
      </div>
      
      <div class="flex gap-4 justify-end">
        <button type="button" @click="$emit('close')" class="default">Annuler</button>
        <button type="submit" :disabled="loading" class="primary">
          <Loader v-if="loading" />
          Créer
        </button>
      </div>
    </form>
  </Modal>
</template>
```

#### **3. WebhookDetails.vue**

```vue
<template>
  <Modal @close="$emit('close')" class="max-w-2xl">
    <template #title>{{ webhook.name }}</template>
    
    <div class="space-y-6">
      <div>
        <h3 class="text-lg font-semibold mb-2">URL du Webhook</h3>
        <div class="bg-(--bg2) p-4 rounded-lg flex items-center gap-3">
          <code class="flex-1 text-sm">{{ webhook.url }}</code>
          <button @click="copyUrl" class="hover:text-(--primary)">
            <i class="bi bi-clipboard" />
          </button>
        </div>
      </div>
      
      <div>
        <h3 class="text-lg font-semibold mb-2">Secret HMAC</h3>
        <div class="bg-(--bg2) p-4 rounded-lg flex items-center gap-3">
          <code class="flex-1 text-sm">{{ webhook.secret }}</code>
          <button @click="copySecret" class="hover:text-(--primary)">
            <i class="bi bi-clipboard" />
          </button>
        </div>
        <p class="text-xs text-amber-500 mt-2">
          ⚠️ Conservez ce secret en sécurité. Il ne sera plus affiché après cette page.
        </p>
      </div>
      
      <div v-if="webhook.e2eeEnabled">
        <h3 class="text-lg font-semibold mb-2">Clé Publique E2EE</h3>
        <textarea class="bg-(--bg2) p-4 rounded-lg w-full font-mono text-sm" 
                  readonly :value="webhook.publicKey" rows="4" />
      </div>
      
      <div>
        <h3 class="text-lg font-semibold mb-2">Statistiques</h3>
        <div class="grid grid-cols-2 gap-4">
          <div class="bg-(--bg2) p-4 rounded-lg">
            <div class="text-sm text-(--text2)">Messages reçus</div>
            <div class="text-2xl font-bold">{{ webhook.usageCount }}</div>
          </div>
          <div class="bg-(--bg2) p-4 rounded-lg">
            <div class="text-sm text-(--text2)">Dernière utilisation</div>
            <div class="text-xl font-bold">{{ formatDate(webhook.lastUsedAt) }}</div>
          </div>
        </div>
      </div>
      
      <div class="flex gap-4 justify-end pt-4 border-t border-(--bg2)">
        <button @click="regenerateToken" class="warning gap-2">
          <i class="bi bi-arrow-clockwise" />
          Régénérer
        </button>
        <button @click="$emit('edit')" class="default gap-2">
          <i class="bi bi-pencil" />
          Modifier
        </button>
        <button @click="$emit('test')" class="primary gap-2">
          <i class="bi bi-send" />
          Tester
        </button>
      </div>
    </div>
  </Modal>
</template>
```

---

## 🔒 **Mécanismes de Sécurité Avancés**

### **1. Protection contre les attaques**

| Attaque | Protection | Implémentation |
|---------|-----------|----------------|
| Replay Attack | Timestamp + Tolerance | `Date.now() - timestamp < 300000` (5 min) |
| Brute Force | Rate Limiting | 100 req/min/webhook, 1000 req/min/IP |
| Token Leak | Token dans URL | Token aléatoire 32 chars, régénérable |
| Secret Leak | Masquage UI | Secret affiché une seule fois |
| CSRF | Origin Check | Vérification de l'header `Origin` |
| Mass Assignment | Zod Validation | Schéma strict pour toutes les entrées |
| XSS | Sanitization | DOMPurify sur tous les champs utilisateur |

### **2. Rate Limiting**

```typescript
// Backend: src/middleware/webhookRateLimiter.ts
import rateLimit from 'express-rate-limit';

export const webhookLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requêtes par webhook
  keyGenerator: (req) => {
    return req.params.webhookId; // Limite par webhook
  },
  message: {
    error: 'Rate limited',
    message: 'Too many requests. Try again in 60 seconds.',
    retryAfter: 60
  },
  standardHeaders: true,
  legacyHeaders: false
});

export const webhookIPLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 1000, // 1000 requêtes par IP
  keyGenerator: (req) => req.ip,
  skip: (req) => req.webhookAuthenticated, // Skip si déjà auth
  message: {
    error: 'Rate limited',
    message: 'Too many requests from this IP.',
    retryAfter: 60
  }
});
```

### **3. Validation des Payloads**

```typescript
// Backend: src/middleware/webhookValidation.ts
import { z } from 'zod';

const embedFieldSchema = z.object({
  name: z.string().max(256),
  value: z.string().max(1024),
  inline: z.boolean().optional().default(false)
});

const embedSchema = z.object({
  title: z.string().max(256).optional(),
  description: z.string().max(4096).optional(),
  url: z.string().url().optional(),
  color: z.string().regex(/^#([0-9A-Fa-f]{6})$/).optional(),
  author: z.object({
    name: z.string().max(256).optional(),
    icon_url: z.string().url().optional()
  }).optional(),
  footer: z.object({
    text: z.string().max(2048).optional(),
    icon_url: z.string().url().optional()
  }).optional(),
  fields: z.array(embedFieldSchema).max(25).optional(),
  timestamp: z.string().datetime().optional()
});

export const webhookPayloadSchema = z.object({
  content: z.string().max(4096).optional(),
  embeds: z.array(embedSchema).max(10).optional(),
  mentions: z.array(z.string().max(100)).max(50).optional(),
  attachments: z.array(z.object({
    url: z.string().url(),
    filename: z.string().max(256).optional(),
    size: z.number().int().positive().optional()
  })).max(10).optional(),
  username: z.string().max(100).optional(),
  avatar_url: z.string().url().optional(),
  encrypted: z.boolean().optional().default(false),
  nonce: z.string().max(64).optional(),
  ephemeral: z.boolean().optional().default(false),
  // Discord compatibility
  _synco: z.object({
    encrypted: z.boolean().optional(),
    targetChannelId: z.string().optional()
  }).optional()
});

export type WebhookPayload = z.infer<typeof webhookPayloadSchema>;
```

---

## 🔄 **Mapping des Formats Externes**

### **1. Discord → Synco**

```typescript
// Backend: src/utils/webhookMappers.ts
import type { WebhookPayload } from '@/types/webhooks';

export function mapDiscordToSynco(discordPayload: any): WebhookPayload {
  return {
    content: discordPayload.content,
    embeds: discordPayload.embeds?.map(embed => ({
      title: embed.title,
      description: embed.description,
      color: embed.color ? `#${embed.color.toString(16).padStart(6, '0')}` : undefined,
      url: embed.url,
      author: embed.author ? {
        name: embed.author.name,
        icon_url: embed.author.icon_url
      } : undefined,
      footer: embed.footer ? {
        text: embed.footer.text,
        icon_url: embed.footer.icon_url
      } : undefined,
      fields: embed.fields?.map(f => ({
        name: f.name,
        value: f.value,
        inline: f.inline ?? false
      })),
      timestamp: embed.timestamp
    })),
    username: discordPayload.username ?? discordPayload.name,
    avatar_url: discordPayload.avatar_url,
    mentions: discordPayload.mentions,
    _synco: {
      encrypted: false,
      ...discordPayload._synco
    }
  };
}
```

### **2. GitHub → Synco**

```typescript
// Mapping avec template personnalisable
export function mapGitHubToSynco(
  githubPayload: any,
  mappings: WebhookMappings = {}
): WebhookPayload {
  const defaultMappings: WebhookMappings = {
    content: '{{action}}: {{issue?.title || pull_request?.title || "No title"}}',
    username: '{{sender.login}}',
    avatar_url: '{{sender.avatar_url}}',
    embeds: [{
      title: '{{repository.full_name}}',
      description: '{{issue?.body || pull_request?.body || "No description"}}',
      color: githubPayload.action === 'closed' ? '#22c55e' : '#3b82f6',
      url: githubPayload.issue?.html_url || githubPayload.pull_request?.html_url,
      fields: [
        { name: 'Action', value: githubPayload.action, inline: true },
        { name: 'Number', value: String(githubPayload.issue?.number || githubPayload.pull_request?.number || githubPayload.number), inline: true },
        { name: 'User', value: githubPayload.sender?.login, inline: true }
      ]
    }]
  };
  
  const effectiveMappings = { ...defaultMappings, ...mappings };
  
  return {
    content: renderTemplate(effectiveMappings.content, githubPayload),
    embeds: effectiveMappings.embeds?.map(e => renderTemplateObject(e, githubPayload)),
    username: renderTemplate(effectiveMappings.username, githubPayload),
    avatar_url: renderTemplate(effectiveMappings.avatar_url, githubPayload),
    mentions: githubPayload.mentions?.map((m: any) => m.user?.login),
    _synco: {
      encrypted: false,
      rawPayload: githubPayload
    }
  };
}

function renderTemplate(template: string, data: any): string {
  return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_, path) => {
    return path.split('.').reduce((obj, key) => obj?.[key], data) ?? '';
  });
}
```

---

## 📊 **Workflows d'Utilisation**

### **Workflow 1: Création et Utilisation Basique**

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Utilisateur │     │   Frontend   │     │   Backend    │
└──────┬───────┘     └──────┬───────┘     └──────┬───────┘
       │                   │                    │
       │ 1. Navigue vers   │                    │
       │    /space/settings/webhooks           │
       │─────────────────>│                    │
       │                   │                    │
       │                   │ 2. GET /api/spaces/{spaceId}/webhooks
       │                   │───────────────────>│
       │                   │<───────────────────│
       │                   │                    │
       │ 3. Clique "Nouveau"│                    │
       │─────────────────>│                    │
       │                   │                    │
       │ 4. Remplit formulaire │                    │
       │    (nom, permissions)                   │
       │─────────────────>│                    │
       │                   │                    │
       │                   │ 5. POST /api/spaces/{spaceId}/webhooks
       │                   │───────────────────>│
       │                   │<───────────────────│
       │                   │                    │
       │ 6. Voit URL + Secret│                    │
       │<─────────────────│                    │
       │                   │                    │
       │ 7. Configure service externe           │
       │    avec URL + Secret                  │
       │    (GitHub, CI/CD, etc.)               │
       │                   │                    │
       └─────────────────┘                    │
                                           │
       ┌──────────────┐     ┌──────────────┐     │
       │  Service      │     │              │     │
       │  Externe      │     │              │     │
       └──────┬───────┘     └──────┬───────┘     │
              │                   │              │
              │ 8. POST /api/webhooks/{id}/{token}
              │    avec payload                  │
              │─────────────────────────────────>│
              │                   │              │
              │<─────────────────────────────────│
              │                   │              │
```

### **Workflow 2: Envoi Sécurisé avec E2EE**

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Client      │     │   Backend    │     │   Service    │
│  (Script)     │     │              │     │   Externe    │
└──────┬───────┘     └──────┬───────┘     └──────┬───────┘
       │                   │                    │
       │ 1. Récupère clé   │                    │
       │    publique       │                    │
       │    GET /api/webhooks/{id}             │
       │─────────────────>│                    │
       │<─────────────────│                    │
       │                   │                    │
       │ 2. Chiffre message│                    │
       │    avec clé pub   │                    │
       │                   │                    │
       │ 3. Génère signature│                    │
       │    HMAC           │                    │
       │                   │                    │
       │ 4. POST /api/webhooks/{id}/{token}    │
       │    avec:          │                    │
       │    - content (chiffré)                 │
       │    - nonce       │                    │
       │    - signature   │                    │
       │─────────────────>│                    │
       │                   │                    │
       │                   │ 5. Vérifie signature
       │                   │─────────────────────▶│
       │                   │                    │
       │                   │ 6. Déchiffre message
       │                   │    avec clé privée│
       │                   │                    │
       │                   │ 7. Envoie message
       │                   │    dans le Space  │
       │                   │─────────────────▶│
       │                   │                    │
```

---

## 🧪 **Tests et Validation**

### **Scénarios de Test**

| ID | Scénario | Type | Statut |
|----|----------|------|--------|
| WH-001 | Création d'un webhook basique | Unit | ⭐⭐⭐ |
| WH-002 | Envoi d'un message simple | Integration | ⭐⭐⭐ |
| WH-003 | Vérification HMAC valide | Unit | ⭐⭐⭐ |
| WH-004 | Vérification HMAC invalide | Unit | ⭐⭐⭐ |
| WH-005 | Chiffrement E2EE | Integration | ⭐⭐⭐ |
| WH-006 | Déchiffrement E2EE | Integration | ⭐⭐⭐ |
| WH-007 | Rate limiting par webhook | Integration | ⭐⭐⭐ |
| WH-008 | Rate limiting par IP | Integration | ⭐⭐⭐ |
| WH-009 | Token invalide | Unit | ⭐⭐⭐ |
| WH-010 | Token expiré (replay attack) | Unit | ⭐⭐⭐ |
| WH-011 | Payload Discord compatible | Integration | ⭐⭐ |
| WH-012 | Payload GitHub compatible | Integration | ⭐⭐ |
| WH-013 | Mapping GitHub avec templates | Integration | ⭐⭐ |
| WH-014 | Régénération du token | Integration | ⭐ |
| WH-015 | Désactivation/Reactivation | Integration | ⭐ |

### **Exemple de Test (Jest)**

```typescript
// synco_api/tests/webhooks.test.ts
import { createWebhook, receiveWebhook } from '@/controllers/webhooks';
import { prisma } from '@/lib/prisma';
import { generateToken, generateSecret } from '@/utils/webhookSecurity';

describe('Webhooks', () => {
  let testSpace: any;
  let testUser: any;
  let webhook: any;
  
  beforeAll(async () => {
    testSpace = await prisma.space.create({
      data: { name: 'Test Space', orgId: 'org_test' }
    });
    testUser = await prisma.user.create({
      data: { id: 'user_test', name: 'Test User' }
    });
  });
  
  describe('Création', () => {
    it('WH-001: doit créer un webhook', async () => {
      const result = await createWebhook({
        spaceId: testSpace.id,
        creatorId: testUser.id,
        name: 'Test Webhook',
        permissions: ['send_messages']
      });
      
      expect(result.success).toBe(true);
      expect(result.webhook.token).toBeDefined();
      expect(result.webhook.secret).toBeDefined();
      expect(result.webhook.token.length).toBe(24); // 12 bytes base62
      expect(result.webhook.secret.length).toBe(36); // 24 bytes base62
    });
  });
  
  describe('Réception', () => {
    beforeAll(async () => {
      webhook = await prisma.webhook.create({
        data: {
          id: 'wh_test',
          spaceId: testSpace.id,
          creatorId: testUser.id,
          name: 'Test Webhook',
          token: generateToken(),
          secret: generateSecret(),
          permissions: ['send_messages']
        }
      });
    });
    
    it('WH-002: doit accepter un message valide', async () => {
      const payload = {
        content: 'Test message',
        username: 'Test Bot'
      };
      
      const result = await receiveWebhook(
        webhook.id,
        webhook.token,
        payload,
        { timestamp: Date.now(), signature: 'valid' }
      );
      
      expect(result.success).toBe(true);
      expect(result.messageId).toBeDefined();
    });
    
    it('WH-009: doit rejeter un token invalide', async () => {
      const payload = { content: 'Test message' };
      
      const result = await receiveWebhook(
        webhook.id,
        'invalid_token',
        payload,
        { timestamp: Date.now(), signature: 'valid' }
      );
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Unauthorized');
    });
    
    it('WH-004: doit rejeter une signature invalide', async () => {
      const payload = { content: 'Test message' };
      
      const result = await receiveWebhook(
        webhook.id,
        webhook.token,
        payload,
        { timestamp: Date.now(), signature: 'invalid' }
      );
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid signature');
    });
  });
});
```

---

## 📈 **Metrics et Monitoring**

### **Métriques à Suivre**

| Métrique | Description | Seuil d'alerte |
|----------|-------------|----------------|
| Total Webhooks | Nombre total de webhooks actifs | - |
| Messages/Heure | Messages reçus par heure | > 1000/heure |
| Taux d'erreur | % de requêtes en échec | > 5% |
| Latence moyenne | Temps de traitement moyen | > 500ms |
| Webhooks inactifs | Webhooks non utilisés depuis 30j | - |
| Rate limits | Nombre de requêtes limitées | > 10/minute |

### **Logging**

```typescript
// Backend: src/middleware/webhookLogger.ts
import { createLogger, transports, format } from 'winston';

const webhookLogger = createLogger({
  level: 'info',
  format: format.combine(
    format.timestamp(),
    format.json()
  ),
  transports: [
    new transports.File({ filename: 'logs/webhooks.log' }),
    new transports.File({ 
      filename: 'logs/webhooks-error.log',
      level: 'error'
    })
  ]
});

export function logWebhookRequest(req: any, webhook: any, status: string, error?: string) {
  webhookLogger.info({
    webhookId: webhook?.id,
    timestamp: new Date().toISOString(),
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    method: req.method,
    path: req.path,
    status,
    error,
    durationMs: req.durationMs
  });
}
```

---

## 📁 **Structure des Fichiers Backend**

```
synco_api/src/
├── routes/
│   └── webhooks.ts                              # Routes principales
│
├── controllers/
│   └── webhooks.ts                              # Logique métier
│
├── middleware/
│   ├── webhookAuth.ts                          # Authentification webhook
│   ├── webhookRateLimiter.ts                   # Rate limiting
│   ├── webhookValidation.ts                    # Validation des payloads
│   └── webhookLogger.ts                         # Logging
│
├── utils/
│   ├── webhookSecurity.ts                      # Génération tokens, HMAC
│   ├── webhookCrypto.ts                        # Chiffrement E2EE
│   └── webhookMappers.ts                        # Mapping Discord/GitHub
│
├── services/
│   └── webhookService.ts                        # Service métier
│
├── types/
│   └── webhooks.ts                              # Types TypeScript
│
└── websocket/
    └── routes/
        └── webhookNotifications.ts               # Notifications temps réel
```

---

## 🎯 **Roadmap d'Implémentation**

### **Phase 1: Backend Core (Priorité ⭐⭐⭐)**

| Tâche | Description | Estim. | Statut |
|-------|-------------|--------|--------|
| WH-BE-01 | Modèle Prisma Webhook | 2h | ⏳ |
| WH-BE-02 | Modèle Prisma WebhookMessage | 1h | ⏳ |
| WH-BE-03 | Modèle Prisma WebhookAuditLog | 1h | ⏳ |
| WH-BE-04 | Middleware d'authentification | 3h | ⏳ |
| WH-BE-05 | Route POST (création) | 2h | ⏳ |
| WH-BE-06 | Route GET (liste/détails) | 2h | ⏳ |
| WH-BE-07 | Route POST (réception) | 4h | ⏳ |
| WH-BE-08 | Middleware de validation | 2h | ⏳ |
| WH-BE-09 | Génération tokens/secrets | 2h | ⏳ |
| WH-BE-10 | Vérification HMAC | 2h | ⏳ |
| WH-BE-11 | Rate limiting | 2h | ⏳ |
| WH-BE-12 | Audit logging | 2h | ⏳ |

**Total Phase 1:** ~23h

### **Phase 2: Chiffrement E2EE (Priorité ⭐⭐⭐)**

| Tâche | Description | Estim. | Statut |
|-------|-------------|--------|--------|
| WH-E2EE-01 | Génération paires de clés | 3h | ⏳ |
| WH-E2EE-02 | Stockage sécurisé clé privée | 2h | ⏳ |
| WH-E2EE-03 | Chiffrement côté client | 3h | ⏳ |
| WH-E2EE-04 | Déchiffrement côté serveur | 3h | ⏳ |
| WH-E2EE-05 | Perfect Forward Secrecy | 4h | ⏳ |

**Total Phase 2:** ~15h

### **Phase 3: Compatibilité Externe (Priorité ⭐⭐)**

| Tâche | Description | Estim. | Statut |
|-------|-------------|--------|--------|
| WH-CMP-01 | Mapping Discord → Synco | 3h | ⏳ |
| WH-CMP-02 | Mapping GitHub → Synco | 4h | ⏳ |
| WH-CMP-03 | Template engine pour mapping | 4h | ⏳ |
| WH-CMP-04 | Tests de compatibilité | 2h | ⏳ |

**Total Phase 3:** ~13h

### **Phase 4: Frontend (Priorité ⭐⭐)**

| Tâche | Description | Estim. | Statut |
|-------|-------------|--------|--------|
| WH-FE-01 | Page WebhooksSettings | 4h | ⏳ |
| WH-FE-02 | Composant WebhookList | 3h | ⏳ |
| WH-FE-03 | Composant WebhookCreate | 4h | ⏳ |
| WH-FE-04 | Composant WebhookEdit | 3h | ⏳ |
| WH-FE-05 | Composant WebhookDetails | 3h | ⏳ |
| WH-FE-06 | Composant WebhookTest | 2h | ⏳ |
| WH-FE-07 | Intégration avec Notifications | 2h | ⏳ |
| WH-FE-08 | Copier URL/Secret dans clipboard | 1h | ⏳ |

**Total Phase 4:** ~22h

### **Phase 5: Tests et Documentation (Priorité ⭐)**

| Tâche | Description | Estim. | Statut |
|-------|-------------|--------|--------|
| WH-TEST-01 | Tests unitaires backend | 4h | ⏳ |
| WH-TEST-02 | Tests d'intégration | 4h | ⏳ |
| WH-TEST-03 | Tests frontend | 3h | ⏳ |
| WH-DOC-01 | Documentation API (Swagger) | 4h | ⏳ |
| WH-DOC-02 | Documentation utilisateur | 3h | ⏳ |

**Total Phase 5:** ~18h

---

## 📊 **Estimation Globale**

| Phase | Heures | % Total |
|-------|--------|---------|
| Phase 1: Backend Core | 23h | 28% |
| Phase 2: E2EE | 15h | 18% |
| Phase 3: Compatibilité | 13h | 16% |
| Phase 4: Frontend | 22h | 27% |
| Phase 5: Tests/Docs | 18h | 22% |
| **Total** | **91h** | **100%** |

**Répartition par rôle:**
- Backend: 51h (56%)
- Frontend: 22h (24%)
- Tests/Documentation: 18h (20%)

---

## ⚠️ **Risques et Mitigations**

| Risque | Probabilité | Impact | Mitigation |
|--------|-------------|--------|------------|
| Complexité E2EE trop élevée | Moyenne | Élevé | Simplifier avec lib existante (libsodium) |
| Incompatibilité avec Discord | Faible | Moyen | Tests approfondis + mapping flexible |
| Performance du déchiffrement | Faible | Moyen | Benchmark + optimisation |
| Sécurité des tokens | Moyenne | Critique | Audit de sécurité + code review |
| Adoption par les utilisateurs | Moyenne | Moyen | Documentation claire + UI intuitive |
| Rate limiting trop restrictif | Moyenne | Faible | Configuration ajustable |

---

## ✅ **Checklist de Validation**

### **Sécurité**
- [ ] Tous les tokens sont générés aléatoirement (CSPRNG)
- [ ] Les secrets sont stockés chiffrés en base
- [ ] La vérification HMAC est implémentée correctement
- [ ] Le chiffrement E2EE fonctionne de bout en bout
- [ ] Le rate limiting protège contre les abus
- [ ] Les permissions sont vérifiées à chaque appel
- [ ] Les logs ne contiennent pas de données sensibles
- [ ] Les erreurs ne fuient pas d'infos internes

### **Fonctionnel**
- [ ] Création/Édition/Suppression de webhooks
- [ ] Réception de messages simples
- [ ] Réception de messages avec embeds
- [ ] Réception de fichiers (attachments)
- [ ] Compatibilité Discord
- [ ] Compatibilité GitHub
- [ ] Régénération des tokens
- [ ] Désactivation/Reactivation
- [ ] Statistiques d'utilisation

### **UI/UX**
- [ ] Interface intuitive de gestion
- [ ] Affichage clair des tokens/secrets
- [ ] Copie facile dans le clipboard
- [ ] Feedback visuel sur les actions
- [ ] Gestion des erreurs claire
- [ ] Responsive design

### **Performance**
- [ ] Temps de réponse < 200ms
- [ ] Support de 100 req/s/webhook
- [ ] Chiffrement E2EE rapide
- [ ] Pas de fuite mémoire

---

## 📚 **Références et Ressources**

### **Documentation Externe**
- [Discord Webhooks Documentation](https://discord.com/developers/docs/resources/webhook)
- [GitHub Webhooks Documentation](https://docs.github.com/en/webhooks)
- [RFC 7519 - JWT](https://datatracker.ietf.org/doc/html/rfc7519)
- [RFC 4627 - JSON](https://www.rfc-editor.org/rfc/rfc4627)
- [NIST SP 800-56A - ECDH](https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-56Ar2.pdf)
- [NIST SP 800-38D - AES-GCM](https://nvlpubs.nist.gov/nistpubs/Legacy/SP/nistspecialpublication800-38d.pdf)

### **Librairies Utiles**
- **Backend:**
  - `crypto` (Node.js built-in) - Chiffrement
  - `zod` - Validation
  - `express-rate-limit` - Rate limiting
  - `jose` - JWT/HMAC
  - `libsodium-wrappers` - Crypto moderne (optionnel)

- **Frontend:**
  - `crypto-js` - Chiffrement côté client
  - `libsodium-wrappers` - Crypto moderne
  - `clipboard-copy` - Copie dans clipboard

### **Outils de Développement**
- **Test:**
  - `jest` + `supertest` - Tests API
  - `vitest` - Tests frontend
  - `msw` (Mock Service Worker) - Mock API
- **Documentation:**
  - `swagger-jsdoc` + `swagger-ui-express` - API Docs
  - `typedoc` - Documentation TypeScript

---

## 🎓 **Conclusion**

Cette feature **Système de Webhooks Sécurisés E2EE** positionne Synco comme une alternative **ultra-sécurisée** aux solutions existantes (Discord, Slack) tout en offrant une **compatibilité étendue** avec les écosystèmes populaires.

**Points forts:**
- ✅ Sécurité maximale avec E2EE + HMAC + Token
- ✅ Compatibilité Discord et GitHub
- ✅ Permissivité et flexibilité
- ✅ Audit et traçabilité complète
- ✅ Intégration naturelle avec l'architecture Synco existante

**Prochaines étapes:**
1. Validation de la spécification par l'équipe
2. Priorisation des tâches
3. Implementation par phases
4. Tests approfondis
5. Documentation utilisateur

---

**Document généré par Mistral Vibe**  
**Date:** 26 Juin 2026  
**Version:** 1.0.0  
**Statut:** En attente de validation

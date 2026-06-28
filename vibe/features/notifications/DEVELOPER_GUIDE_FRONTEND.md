# 📖 Système de Notifications - Guide du Développeur (Frontend)

> **Projet** : Synco - Système de notifications push
> **Date** : 28 Juin 2026
> **Version** : 1.0.0
> **Audience** : Développeurs Frontend (Vue 3 + TypeScript)

---

## 🎯 Introduction

Ce guide explique comment **intégrer et utiliser le système de notifications** dans le frontend Synco. Le système permet :
- ✅ Afficher les notifications en temps réel via WebSocket
- ✅ Recevoir des notifications push même quand l'onglet est fermé (via Firebase FCM)
- ✅ Gérer l'historique des notifications
- ✅ Naviguer vers les ressources associées

**Architecture** :
```
Frontend → WebSocket/FCM → Backend → FCM/APNS → Device
                  ↑
            UI Components
```

---

## 🚀 Configuration Préalable

### 1. Installation des Dépendances

```bash
# Dans synco_app/
cd /home/moi/Documents/GitHub/synco_app

# Installer Firebase et Messaging
npm install firebase @firebase/messaging
```

---

### 2. Configuration Firebase

Éditez `.env` dans `synco_app/` :

```env
# ============= FIREBASE WEB CONFIGURATION =============
VITE_FIREBASE_API_KEY=AIzaSyAxxxxxxxxxxxxxxxxxxxxxxxxxxx
VITE_FIREBASE_AUTH_DOMAIN=ton-projet.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=ton-projet-id
VITE_FIREBASE_STORAGE_BUCKET=ton-projet.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=1234567890
VITE_FIREBASE_APP_ID=1:1234567890:web:abcdef123456
VITE_FIREBASE_MEASUREMENT_ID=G-XXXXXXXX
VITE_FIREBASE_VAPID_KEY=BKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
# ===========================================================
```

**Où obtenir ces valeurs ?**

1. Va sur [Firebase Console](https://console.firebase.google.com/)
2. Sélectionne ton projet
3. Clique sur ⚙️ > **Project Settings**
4. Fais défiler vers **Your apps** > **Web app**
5. Copie la configuration **SDK setup and configuration**
6. Pour la **VAPID Key** : Va dans **Cloud Messaging** > **Web configuration** > **Web Push certificates** > **Generate Key Pair**

---

### 3. Enregistrer le Service Worker

Dans ton fichier `src/main.ts` ou `App.vue`, ajoute le code suivant **AVANT** l'initialisation de l'application :

```typescript
// src/main.ts
import { createApp } from 'vue';
import App from './App.vue';

// Enregistrer le Service Worker pour Firebase Messaging
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/firebase-messaging-sw.js')
      .then(registration => {
        console.log('[SW] ServiceWorker registration successful with scope:', registration.scope);
      })
      .catch(err => {
        console.error('[SW] ServiceWorker registration failed:', err);
      });
  });
}

// Créer et monter l'application
const app = createApp(App);
// ... autres configurations
app.mount('#app');
```

> **⚠️ Important** : Le fichier `public/firebase-messaging-sw.js` doit être accessible à la racine de ton application.

---

### 4. Initialiser Keycloak et le Socket

Assure-toi que Keycloak et Socket.IO sont correctement configurés dans ton application.

```typescript
// src/assets/keycloak.ts - Déjà configuré
import Keycloak from 'keycloak-js';

export const keycloak = new Keycloak({
  url: import.meta.env.VITE_KEYCLOAK_URL,
  realm: import.meta.env.VITE_KEYCLOAK_REALM,
  clientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID
});

// src/assets/init.ts - Déjà configuré
import { keycloak } from './keycloak';
import { useUserStore } from '../stores/user';
import { useWSocket } from '../composables/useWSocket';

export async function initApp() {
  // Initialiser Keycloak
  await keycloak.init({ onLoad: 'check-sso' });
  
  // Initialiser le user store
  const userStore = useUserStore();
  userStore.setUser(keycloak);
  
  // Initialiser le socket
  const { socket } = useWSocket();
  
  // ...
}
```

---

## 📡 Composables Disponibles

---

### 1. **useNotification** - Composable Principal

**Fichier** : `src/composables/useNotification.ts`

**Fonction principale** : Gère toutes les fonctionnalités de notification.

#### **Initialisation**

```vue
<script setup lang="ts">
import { onMounted } from 'vue';
import { useNotification } from '@/composables/useNotification';

const {
  init,
  notifications,
  unreadCount,
  isInitialized,
  isGranted
} = useNotification();

// Initialiser à l'ouverture de l'application
onMounted(() => {
  init().catch(console.error);
});
</script>

<template>
  <div v-if="isInitialized">
    <p>Notifications chargées: {{ notifications.length }}</p>
    <p>Non lues: {{ unreadCount }}</p>
    <p>Permission: {{ isGranted ? 'Accordée' : 'Non accordée' }}</p>
  </div>
</template>
```

#### **Propriétés Réactives (State)**

| Propriété | Type | Description |
|-----------|------|-------------|
| `notifications` | `Ref<AppNotification[]>` | Liste de toutes les notifications |
| `permission` | `Ref<NotificationPermission>` | Statut de la permission (`'default'`, `'granted'`, `'denied'`)
| `isGranted` | `Computed<boolean>` | `true` si la permission est accordée |
| `unreadCount` | `Computed<number>` | Nombre de notifications non lues |
| `isInitialized` | `Ref<boolean>` | Indique si le composable est initialisé |

#### **Types Disponibles**

```typescript
// Types importables depuis le composable
type NotificationType = 'MESSAGE' | 'CALL' | 'MENTION' | 'INVITATION' | 'CUSTOM';

interface AppNotification {
  id: string;
  userId: string;
  senderId?: string;
  sender?: {
    id: string;
    email: string;
    username?: string;
    displayName?: string;
  };
  type: NotificationType;
  title: string;
  body: string;
  data?: NotificationData;
  metadata?: Record<string, any>;
  isRead: boolean;
  isSent: boolean;
  createdAt: string;
  timestamp?: string;
}

interface CreateNotificationPayload {
  userId: string;  // Optionnel: si non fourni, utilise l'utilisateur actuel
  type: NotificationType;
  title: string;   // Max 100 caractères
  body: string;    // Max 500 caractères
  data?: NotificationData;
  metadata?: {
    priority?: 'high' | 'normal' | 'low';
    sound?: boolean;
    badge?: number;
  };
}
```

#### **Méthodes Disponibles**

| Méthode | Description | Exemple |
|---------|-------------|---------|
| `init()` | Initialise le composable | `await init()` |
| `loadNotifications(limit, offset, read)` | Charge les notifications | `await loadNotifications(20, 0, false)` |
| `loadMoreNotifications()` | Charge plus de notifications (pagination) | `await loadMoreNotifications()` |
| `requestPermission()` | Demande la permission de notification | `await requestPermission()` |
| `sendNotification(payload)` | Envoie une notification via WebSocket | `await sendNotification({ type: 'MESSAGE', title: '...', body: '...' })` |
| `markAsRead(notificationId)` | Marque une notification comme lue | `await markAsRead('notif-123')` |
| `markAllAsRead()` | Marque toutes les notifications comme lues | `await markAllAsRead()` |
| `removeNotification(notificationId)` | Supprime une notification | `await removeNotification('notif-123')` |

#### **Utilitaires**

| Méthode | Retourne | Description |
|---------|----------|-------------|
| `getUnreadNotifications` | `Computed<AppNotification[]>` | Notifications non lues |
| `getReadNotifications` | `Computed<AppNotification[]>` | Notifications lues |
| `getNotificationsByType(type)` | `Ref<AppNotification[]>` | Notifications filtrées par type |
| `getUnreadCountByType(type)` | `Ref<number>` | Compteur non lues par type |

---

### 2. **useFCM** - Composable Firebase Cloud Messaging

**Fichier** : `src/composables/useFCM.ts`

**Fonction principale** : Gère les notifications push Firebase pour le web.

#### **Initialisation**

Le composable s'initialise automatiquement au montage, mais tu peux aussi l'initialiser manuellement :

```vue
<script setup lang="ts">
import { onMounted } from 'vue';
import { useFCM } from '@/composables/useFCM';

const {
  fcmToken,
  isSupported,
  isRegistered,
  error,
  isLoading,
  init
} = useFCM();

// Optionnel: initialisation manuelle
onMounted(() => {
  if (isSupported.value) {
    init().catch(console.error);
  }
});
</script>

<template>
  <div v-if="isSupported">
    <p v-if="isLoading">Chargement...</p>
    <p v-else-if="isRegistered">
      ✅ FCM activé (Token: {{ fcmToken?.substring(0, 20) }}...)
    </p>
    <p v-else-if="error">
      ❌ Erreur: {{ error }}
    </p>
    <p v-else>
      ⏳ Enregistrement en cours...
    </p>
  </div>
  <div v-else>
    <p>⚠️ FCM non supporté dans ce navigateur</p>
  </div>
</template>
```

#### **Propriétés Réactives (State)**

| Propriété | Type | Description |
|-----------|------|-------------|
| `fcmToken` | `Ref<string \| null>` | Token FCM actuel |
| `isSupported` | `Ref<boolean>` | FCM est supporté dans ce navigateur |
| `isRegistered` | `Ref<boolean>` | FCM est enregistré |
| `error` | `Ref<string \| null>` | Message d'erreur si applicable |
| `isLoading` | `Ref<boolean>` | En cours de chargement |

#### **Méthodes Disponibles**

| Méthode | Description | Retourne |
|---------|-------------|----------|
| `checkSupport()` | Vérifie si FCM est supporté | `boolean` |
| `registerForPushNotifications()` | Enregistre pour les notifications push | `Promise<string \| null>` (token) |
| `registerTokenOnServer(token)` | Enregistre le token sur le serveur backend | `Promise<boolean>` |
| `unregister()` | Désenregistre le token FCM | `Promise<boolean>` |
| `setupForegroundMessageHandler()` | Configure le handler pour les messages en foreground | `void` |
| `refreshTokenIfNeeded()` | Rafraîchit le token si nécessaire | `Promise<string \| null>` |

---

## 🎨 Composants UI Disponibles

---

### 1. **NotificationCenter** - Centre de Notifications

**Fichier** : `src/components/Notifications/NotificationCenter.vue`

**Description** : Composant dropdown complet pour afficher et gérer les notifications.

#### **Utilisation de Base**

```vue
<script setup lang="ts">
import { NotificationCenter } from '@/components/Notifications';
</script>

<template>
  <header>
    <!-- Autres éléments -->
    <NotificationCenter />
  </header>
</template>
```

**Fonctionnalités automatiques** :
- ✅ Affichage du badge avec le nombre de notifications non lues
- ✅ Dropdown avec la liste des notifications
- ✅ Chargement automatique à l'ouverture
- ✅ Pagination infinie (scroll)
- ✅ Bouton "Tout marquer comme lu"
- ✅ Fermeture au clic en dehors
- ✅ Synchronisation en temps réel via WebSocket
- ✅ Affichage des notifications toast

#### **Propriétés (Props)**

Aucune propriété requise. Le composant gère tout automatiquement.

#### **Événements (Emits)**

Aucun événement émis.

#### **Slots**

Tu peux personnaliser certaines parties du composant :

```vue
<NotificationCenter>
  <!-- Slot pour l'icône (par défaut: icône de cloche) -->
  <template #icon>
    <svg class="custom-icon" viewBox="0 0 24 24">
      <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2z"/>
    </svg>
  </template>
  
  <!-- Slot pour l'en-tête -->
  <template #header>
    <h3>Mes Notifications</h3>
  </template>
  
  <!-- Slot pour la liste vide -->
  <template #empty>
    <div class="custom-empty">
      <p>Aucune notification pour le moment</p>
    </div>
  </template>
</NotificationCenter>
```

---

### 2. **NotificationItem** - Item de Notification

**Fichier** : `src/components/Notifications/NotificationItem.vue`

**Description** : Composant pour afficher une notification individuelle.

#### **Utilisation de Base**

```vue
<script setup lang="ts">
import { NotificationItem } from '@/components/Notifications';
import type { AppNotification } from '@/composables/useNotification';

const notification: AppNotification = {
  id: '123',
  userId: 'user-1',
  type: 'MESSAGE',
  title: 'Nouveau message',
  body: 'Tu as un nouveau message de Jean',
  isRead: false,
  createdAt: new Date().toISOString()
};
</script>

<template>
  <NotificationItem
    :notification="notification"
    @click="handleNotificationClick"
  />
</template>
```

#### **Propriétés (Props)**

| Prop | Type | Requis | Description |
|------|------|--------|-------------|
| `notification` | `AppNotification` | ✅ | La notification à afficher |

#### **Événements (Emits)**

| Événement | Payload | Description |
|-----------|---------|-------------|
| `click` | - | Émis quand l'utilisateur clique sur la notification |

#### **Personnalisation**

Tu peux surcharger les styles avec CSS ou utiliser les classes suivantes :
- `.notification-item` - Conteneur principal
- `.notification-item.unread` - Notification non lue
- `.notification-content` - Contenu principal
- `.notification-icon` - Icône de notification
- `.notification-info` - Informations de la notification
- `.notification-sender` - Expéditeur
- `.notification-time` - Date/heure
- `.notification-title` - Titre
- `.notification-body` - Corps
- `.notification-actions` - Boutons d'action
- `.mark-read-button` - Bouton "Marquer comme lu"

---

## 💡 Exemples Complets

---

### 📝 **Exemple 1 : Intégration Complète dans une Application**

```vue
<!-- src/layouts/AppLayout.vue -->
<script setup lang="ts">
import { onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useNotification } from '@/composables/useNotification';
import { useFCM } from '@/composables/useFCM';
import { NotificationCenter } from '@/components/Notifications';
import { useUserStore } from '@/stores/user';

// User store
const userStore = useUserStore();
const user = userStore.user;

// Notification composable
const {
  init: initNotifications,
  notifications,
  unreadCount,
  markAsRead
} = useNotification();

// FCM composable (optionnel)
const {
  isSupported: isFCMSupported,
  isRegistered: isFCMRegistered,
  registerForPushNotifications
} = useFCM();

// Router pour la navigation
const router = useRouter();
const route = useRoute();

// Initialisation
onMounted(async () => {
  // Initialiser les notifications
  await initNotifications();
  
  // Si FCM est supporté, s'enregistrer
  if (isFCMSupported.value) {
    await registerForPushNotifications();
  }
});

// Marquer comme lu quand on navigue vers une page de notification
watch(() => route.path, (newPath) => {
  if (newPath.includes('/notifications')) {
    markAllAsRead();
  }
});

const markAllAsRead = async () => {
  const { markAllAsRead } = useNotification();
  await markAllAsRead();
};
</script>

<template>
  <div class="app-layout">
    <!-- Header -->
    <header class="app-header">
      <div class="header-left">
        <!-- Logo, recherche, etc. -->
      </div>
      
      <div class="header-right">
        <!-- Autres icônes -->
        
        <!-- Centre de notifications -->
        <NotificationCenter />
        
        <!-- Indicateur FCM (optionnel) -->
        <div v-if="isFCMSupported" class="fcm-status">
          <span v-if="isFCMRegistered" title="Notifications push activées">🔔</span>
          <span v-else title="Notifications push non activées">🔕</span>
        </div>
        
        <!-- Menu utilisateur -->
      </div>
    </header>
    
    <!-- Contenu principal -->
    <main class="app-main">
      <router-view />
    </main>
    
    <!-- Footer (optionnel) -->
    <footer class="app-footer">
      <!-- Contenu footer -->
    </footer>
  </div>
</template>

<style scoped>
.app-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  background: var(--bg-primary);
  border-bottom: 1px solid var(--border-primary);
}

.header-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.fcm-status {
  font-size: 20px;
}

.app-main {
  flex: 1;
  padding: 24px;
  overflow-y: auto;
}
</style>
```

---

### 📝 **Exemple 2 : Afficher une Notification Toast Personnalisée**

```vue
<script setup lang="ts">
import { useNotification } from '@/composables/useNotification';
import type { AppNotification } from '@/composables/useNotification';

const { showToastNotification } = useNotification();

function showCustomToast(notification: Partial<AppNotification>) {
  showToastNotification({
    id: 'custom-' + Date.now(),
    userId: 'current-user',
    type: notification.type || 'CUSTOM',
    title: notification.title || 'Nouvelle notification',
    body: notification.body || 'Vous avez une nouvelle notification',
    data: notification.data || {},
    isRead: false,
    createdAt: new Date().toISOString()
  });
}

// Exemple d'utilisation
function handleCustomEvent() {
  showCustomToast({
    type: 'MESSAGE',
    title: 'Message personnalisé',
    body: 'Ceci est une notification toast personnalisée',
    data: {
      customData: 'value',
      actionUrl: '/some-route'
    }
  });
}
</script>

<template>
  <button @click="handleCustomEvent">
    Afficher Notification Toast
  </button>
</template>
```

---

### 📞 **Exemple 3 : Notifications pour les Appels**

```vue
<!-- src/views/CallView.vue -->
<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useWSocket } from '@/composables/useWSocket';
import { useNotification } from '@/composables/useNotification';

const { socket } = useWSocket();
const { sendNotification, markAsRead } = useNotification();
const router = useRouter();

// State
const incomingCall = ref<any>(null);
const callNotifications = ref<any[]>([]);

// Écouter les notifications d'appel
onMounted(() => {
  if (socket.value) {
    socket.value.on('notification:push', (notification) => {
      if (notification.type === 'CALL') {
        // Sauvegarder la notification d'appel
        callNotifications.value.unshift(notification);
        
        // Si c'est une nouvelle notification d'appel, l'afficher
        if (!incomingCall.value) {
          incomingCall.value = notification;
        }
      }
    });
  }
});

// Accepter l'appel
function acceptCall() {
  if (incomingCall.value) {
    // Marquer comme lue
    markAsRead(incomingCall.value.id);
    
    // Naviguer vers la page d'appel
    router.push(`/call/${incomingCall.value.data.callId}`);
    
    // Réinitialiser
    incomingCall.value = null;
  }
}

// Refuser l'appel
function rejectCall() {
  if (incomingCall.value) {
    markAsRead(incomingCall.value.id);
    incomingCall.value = null;
    
    // Envoyer une notification de refus
    sendNotification({
      userId: incomingCall.value.senderId,
      type: 'CALL',
      title: 'Appel refusé',
      body: 'L\'appel a été refusé',
      data: {
        callId: incomingCall.value.data.callId,
        status: 'rejected'
      }
    });
  }
}

// Ignorer l'appel
function ignoreCall() {
  if (incomingCall.value) {
    markAsRead(incomingCall.value.id);
    incomingCall.value = null;
  }
}

// Cleanup
onUnmounted(() => {
  if (socket.value) {
    socket.value.off('notification:push');
  }
});
</script>

<template>
  <div class="call-view">
    <!-- Contenu normal -->
    <div v-if="!incomingCall" class="normal-content">
      <!-- Ton contenu d'appel normal -->
    </div>
    
    <!-- Notification d'appel entrant -->
    <div v-else class="incoming-call-notification">
      <div class="call-info">
        <h3>📞 Appel entrant</h3>
        <p>De: {{ incomingCall.sender?.displayName || incomingCall.senderId }}</p>
        <p v-if="incomingCall.data.callType">
          Type: {{ incomingCall.data.callType }}
        </p>
      </div>
      
      <div class="call-actions">
        <button @click="acceptCall" class="accept-button">
          ✅ Accepter
        </button>
        <button @click="rejectCall" class="reject-button">
          ❌ Refuser
        </button>
        <button @click="ignoreCall" class="ignore-button">
          ⏭️ Ignorer
        </button>
      </div>
    </div>
    
    <!-- Historique des appels -->
    <div v-if="callNotifications.length > 0" class="call-history">
      <h4>Historique des appels</h4>
      <ul>
        <li v-for="call in callNotifications" :key="call.id">
          {{ call.title }} - {{ new Date(call.createdAt).toLocaleString() }}
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.call-view {
  position: relative;
  height: 100%;
}

.incoming-call-notification {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: var(--bg-primary);
  padding: 32px;
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  z-index: 1000;
  text-align: center;
  max-width: 400px;
  width: 100%;
}

.call-info {
  margin-bottom: 24px;
}

.call-actions {
  display: flex;
  gap: 16px;
  justify-content: center;
}

.call-actions button {
  padding: 12px 24px;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.accept-button {
  background: var(--color-success);
  color: white;
}

.accept-button:hover {
  background: var(--color-success-hover);
}

.reject-button {
  background: var(--color-error);
  color: white;
}

.reject-button:hover {
  background: var(--color-error-hover);
}

.ignore-button {
  background: var(--bg-secondary);
  color: var(--text-primary);
}

.ignore-button:hover {
  background: var(--bg-tertiary);
}

.call-history {
  margin-top: 32px;
  padding: 16px;
  background: var(--bg-secondary);
  border-radius: 8px;
}
</style>
```

---

### 👥 **Exemple 4 : Notifications de Mention avec Navigation**

```vue
<!-- src/views/ThreadView.vue -->
<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useWSocket } from '@/composables/useWSocket';
import { useNotification } from '@/composables/useNotification';
import { useUserStore } from '@/stores/user';

const route = useRoute();
const router = useRouter();
const { socket } = useWSocket();
const { notifications, markAsRead } = useNotification();
const userStore = useUserStore();

const threadId = route.params.threadId as string;
const currentUserId = userStore.user?.id;

// Filtrer les notifications de mention pour ce thread
const mentionNotifications = ref<any[]>([]);

// Mettre à jour quand les notifications changent
watch(notifications, (newNotifications) => {
  mentionNotifications.value = newNotifications.filter(n => 
    n.type === 'MENTION' && 
    n.data?.threadId === threadId &&
    !n.isRead
  );
}, { immediate: true });

// Écouter les nouvelles notifications
onMounted(() => {
  if (socket.value) {
    socket.value.on('notification:push', (notification) => {
      if (notification.type === 'MENTION' && 
          notification.data?.threadId === threadId) {
        // Ajouter à la liste si non déjà présente
        if (!mentionNotifications.value.some(n => n.id === notification.id)) {
          mentionNotifications.value.unshift(notification);
        }
      }
    });
  }
});

// Naviguer vers un message mentionné
function goToMentionedMessage(notification: any) {
  markAsRead(notification.id);
  
  // Scroll vers le message
  const messageElement = document.getElementById(`message-${notification.data.messageId}`);
  if (messageElement) {
    messageElement.scrollIntoView({ behavior: 'smooth' });
    messageElement.classList.add('highlight');
    
    // Retirer le surlignage après 3 secondes
    setTimeout(() => {
      messageElement.classList.remove('highlight');
    }, 3000);
  }
}

// Cleanup
onUnmounted(() => {
  if (socket.value) {
    socket.value.off('notification:push');
  }
});
</script>

<template>
  <div class="thread-view">
    <!-- Messages -->
    <div class="messages-container">
      <!-- Tes messages ici -->
    </div>
    
    <!-- Notifications de mention -->
    <div v-if="mentionNotifications.length > 0" class="mention-notifications">
      <div 
        v-for="notification in mentionNotifications" 
        :key="notification.id"
        class="mention-notification"
        @click="goToMentionedMessage(notification)"
      >
        <div class="mention-avatar">
          <img 
            v-if="notification.sender?.avatarUrl" 
            :src="notification.sender.avatarUrl" 
            alt="Avatar"
          />
          <span v-else class="avatar-placeholder">
            {{ notification.sender?.displayName?.charAt(0) || '?' }}
          </span>
        </div>
        <div class="mention-content">
          <strong>{{ notification.sender?.displayName || notification.senderId }}</strong>
          <span> vous a mentionné</span>
          <p class="mention-preview">{{ notification.body }}</p>
        </div>
        <button 
          class="mark-read-button" 
          @click.stop="markAsRead(notification.id)"
        >
          ✓
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.thread-view {
  position: relative;
  display: flex;
  height: 100%;
}

.messages-container {
  flex: 1;
  overflow-y: auto;
}

.mention-notifications {
  position: absolute;
  right: 24px;
  top: 24px;
  width: 300px;
  max-height: 400px;
  overflow-y: auto;
  background: var(--bg-primary);
  border: 1px solid var(--border-primary);
  border-radius: 12px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.1);
  z-index: 10;
}

.mention-notification {
  display: flex;
  align-items: center;
  padding: 12px;
  border-bottom: 1px solid var(--border-primary);
  cursor: pointer;
  transition: background-color 0.2s ease;
}

.mention-notification:last-child {
  border-bottom: none;
}

.mention-notification:hover {
  background: var(--bg-secondary);
}

.mention-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  overflow: hidden;
  flex-shrink: 0;
  margin-right: 12px;
}

.mention-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-primary);
  color: white;
  font-weight: 600;
}

.mention-content {
  flex: 1;
  min-width: 0;
}

.mention-content strong {
  color: var(--text-primary);
  margin-right: 4px;
}

.mention-content span {
  color: var(--text-secondary);
  font-size: 0.9em;
}

.mention-preview {
  color: var(--text-secondary);
  font-size: 0.85em;
  margin: 4px 0 0 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.mark-read-button {
  width: 28px;
  height: 28px;
  border: none;
  background: var(--bg-secondary);
  border-radius: 50%;
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.mark-read-button:hover {
  background: var(--color-primary);
  color: white;
}
</style>
```

---

### 🏢 **Exemple 5 : Page de Notifications Complète**

```vue
<!-- src/views/NotificationsView.vue -->
<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useNotification } from '@/composables/useNotification';
import { NotificationItem } from '@/components/Notifications';

const router = useRouter();
const {
  notifications,
  unreadCount,
  loadNotifications,
  loadMoreNotifications,
  markAsRead,
  markAllAsRead,
  removeNotification,
  getUnreadNotifications,
  getReadNotifications
} = useNotification();

// State
const isLoading = ref(false);
const hasMore = ref(true);
const activeTab = ref<'all' | 'unread' | 'read'>('all');

// Filtrer les notifications
const filteredNotifications = computed(() => {
  switch (activeTab.value) {
    case 'unread':
      return getUnreadNotifications.value;
    case 'read':
      return getReadNotifications.value;
    case 'all':
    default:
      return notifications.value;
  }
});

// Charger les notifications
async function loadNotificationsData() {
  isLoading.value = true;
  try {
    await loadNotifications(20, 0);
  } catch (error) {
    console.error('Erreur de chargement:', error);
  } finally {
    isLoading.value = false;
  }
}

// Charger plus
async function loadMore() {
  if (isLoading.value || !hasMore.value) return;
  
  isLoading.value = true;
  try {
    const currentLength = notifications.value.length;
    await loadMoreNotifications();
    hasMore.value = notifications.value.length > currentLength;
  } catch (error) {
    console.error('Erreur:', error);
  } finally {
    isLoading.value = false;
  }
}

// Marquer tout comme lu
async function handleMarkAllAsRead() {
  await markAllAsRead();
}

// Gérer le clic sur une notification
function handleNotificationClick(notification: any) {
  markAsRead(notification.id);
  
  // Naviguer en fonction du type
  switch (notification.type) {
    case 'MESSAGE':
      if (notification.data?.threadId) {
        router.push(`/chat/thread/${notification.data.threadId}`);
      }
      break;
    case 'CALL':
      if (notification.data?.callId) {
        router.push(`/call/${notification.data.callId}`);
      }
      break;
    case 'MENTION':
      if (notification.data?.threadId) {
        router.push(`/chat/thread/${notification.data.threadId}`);
      }
      break;
    case 'INVITATION':
      if (notification.data?.orgId) {
        router.push(`/org/${notification.data.orgId}/settings/members`);
      }
      break;
  }
}

// Gérer le scroll infini
function handleScroll(event: Event) {
  const target = event.target as HTMLElement;
  if (target.scrollTop + target.clientHeight >= target.scrollHeight - 100) {
    loadMore();
  }
}

// Initialisation
onMounted(() => {
  loadNotificationsData();
});
</script>

<template>
  <div class="notifications-view">
    <div class="notifications-header">
      <h1>Notifications</h1>
      
      <div class="header-actions">
        <button 
          v-if="unreadCount > 0" 
          @click="handleMarkAllAsRead"
          class="mark-all-button"
        >
          Tout marquer comme lu ({{ unreadCount }})
        </button>
      </div>
    </div>
    
    <div class="notifications-tabs">
      <button 
        @click="activeTab = 'all'" 
        :class="{ active: activeTab === 'all' }"
      >
        Toutes ({{ notifications.length }})
      </button>
      <button 
        @click="activeTab = 'unread'" 
        :class="{ active: activeTab === 'unread' }"
      >
        Non lues ({{ unreadCount }})
      </button>
      <button 
        @click="activeTab = 'read'" 
        :class="{ active: activeTab === 'read' }"
      >
        Lues ({{ getReadNotifications.length }})
      </button>
    </div>
    
    <div 
      class="notifications-list" 
      @scroll="handleScroll"
    >
      <div v-if="isLoading && filteredNotifications.length === 0" class="loading">
        <div class="spinner"></div>
        <p>Chargement des notifications...</p>
      </div>
      
      <template v-else>
        <NotificationItem
          v-for="notification in filteredNotifications"
          :key="notification.id"
          :notification="notification"
          @click="handleNotificationClick(notification)"
        />
        
        <div v-if="isLoading" class="loading-more">
          <div class="spinner-small"></div>
          <p>Chargement...</p>
        </div>
        
        <div v-if="!hasMore && filteredNotifications.length > 0" class="no-more">
          <p>Toutes les notifications ont été chargées</p>
        </div>
        
        <div 
          v-if="filteredNotifications.length === 0 && !isLoading" 
          class="empty-state"
        >
          <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          </svg>
          <h3>Aucune notification</h3>
          <p>Tu n'as pas encore de notifications {{ activeTab === 'all' ? '' : activeTab === 'unread' ? 'non lues' : 'lues' }}</p>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.notifications-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 24px;
  max-width: 800px;
  margin: 0 auto;
}

.notifications-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.notifications-header h1 {
  margin: 0;
  font-size: 1.75rem;
  font-weight: 600;
}

.header-actions {
  display: flex;
  gap: 12px;
}

.mark-all-button {
  background: var(--color-primary);
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 0.875rem;
  cursor: pointer;
  transition: background-color 0.2s ease;
}

.mark-all-button:hover {
  background: var(--color-primary-hover);
}

.notifications-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 24px;
  border-bottom: 1px solid var(--border-primary);
}

.notifications-tabs button {
  background: none;
  border: none;
  padding: 12px 16px;
  font-size: 0.9375rem;
  color: var(--text-secondary);
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: all 0.2s ease;
  margin-bottom: -1px;
}

.notifications-tabs button:hover {
  color: var(--text-primary);
}

.notifications-tabs button.active {
  color: var(--color-primary);
  border-bottom-color: var(--color-primary);
  font-weight: 500;
}

.notifications-list {
  flex: 1;
  overflow-y: auto;
  padding-right: 8px;
}

.notifications-list::-webkit-scrollbar {
  width: 6px;
}

.notifications-list::-webkit-scrollbar-track {
  background: transparent;
}

.notifications-list::-webkit-scrollbar-thumb {
  background: var(--border-primary);
  border-radius: 3px;
}

.loading,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 64px 24px;
  color: var(--text-secondary);
  text-align: center;
}

.empty-icon {
  width: 64px;
  height: 64px;
  margin-bottom: 16px;
  opacity: 0.5;
}

.empty-state h3 {
  margin: 0 0 8px 0;
  color: var(--text-primary);
}

.loading-more {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 16px;
  color: var(--text-secondary);
}

.no-more {
  text-align: center;
  padding: 16px;
  color: var(--text-secondary);
  font-size: 0.875rem;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid var(--border-primary);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 16px;
}

.spinner-small {
  width: 20px;
  height: 20px;
  border: 2px solid var(--border-primary);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
```

---

---

## 🎯 **Recettes (Recipes)**

---

### 🔄 **Synchronisation entre Onglets**

Pour synchroniser l'état des notifications entre plusieurs onglets du navigateur :

```vue
<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { useNotification } from '@/composables/useNotification';
import { useWSocket } from '@/composables/useWSocket';

const { notifications, markAsRead } = useNotification();
const { socket } = useWSocket();

// Écouter les événements de synchronisation
onMounted(() => {
  if (socket.value) {
    // Notification marquée comme lue dans un autre onglet
    socket.value.on('notification:read', (data) => {
      const notification = notifications.value.find(n => n.id === data.notificationId);
      if (notification) {
        notification.isRead = true;
      }
    });

    // Toutes les notifications marquées comme lues dans un autre onglet
    socket.value.on('notification:all-read', () => {
      notifications.value.forEach(n => {
        n.isRead = true;
      });
    });
  }
});

// Émettre les événements de synchronisation
function handleMarkAsRead(notificationId: string) {
  markAsRead(notificationId);
  // Le composable émet automatiquement l'événement WebSocket
}
</script>
```

---

### 📊 **Compteur de Notifications dans la Barre de Titre**

```vue
<script setup lang="ts">
import { watch } from 'vue';
import { useNotification } from '@/composables/useNotification';

const { unreadCount } = useNotification();

// Mettre à jour le titre de la page
watch(unreadCount, (newCount) => {
  const baseTitle = 'Synco - Collaboration Sécurisée';
  document.title = newCount > 0 ? `(${newCount}) ${baseTitle}` : baseTitle;
}, { immediate: true });
</script>
```

---

### 🔔 **Son de Notification Personnalisé**

```vue
<script setup lang="ts">
import { onMounted } from 'vue';
import { useNotification } from '@/composables/useNotification';

const { notifications, isGranted } = useNotification();

// Jouer un son pour les nouvelles notifications
onMounted(() => {
  // Charger le son (déjà présent dans public/)
  const notificationSound = new Audio('/callSound.wav');

  // Écouter les nouvelles notifications
  const { setupWebSocketListeners } = useNotification();
  
  // Le composable gère déjà l'affichage des toasts
  // Pour ajouter un son :
  import { useWSocket } from '@/composables/useWSocket';
  const { socket } = useWSocket();
  
  if (socket.value) {
    socket.value.on('notification:push', (notification) => {
      if (isGranted.value && notification.metadata?.sound !== false) {
        notificationSound.currentTime = 0;
        notificationSound.play().catch(console.error);
      }
    });
  }
});
</script>
```

---

### 🎨 **Personnalisation des Icônes par Type**

Tu peux personnaliser les icônes affichées pour chaque type de notification :

```vue
<script setup lang="ts">
import { computed } from 'vue';
import type { NotificationType } from '@/composables/useNotification';

function getNotificationIcon(type: NotificationType) {
  const icons: Record<NotificationType, string> = {
    MESSAGE: '<svg>...</svg>',
    CALL: '<svg>...</svg>',
    MENTION: '<svg>...</svg>',
    INVITATION: '<svg>...</svg>',
    CUSTOM: '<svg>...</svg>'
  };
  return icons[type] || icons.CUSTOM;
}

// Ou utiliser des icônes d'une bibliothèque
import { 
  MessageSquare, 
  Phone, 
  AtSign,
  UserPlus,
  Bell 
} from 'bootstrap-icons-vue';

const iconComponents: Record<NotificationType, any> = {
  MESSAGE: MessageSquare,
  CALL: Phone,
  MENTION: AtSign,
  INVITATION: UserPlus,
  CUSTOM: Bell
};

function getNotificationIconComponent(type: NotificationType) {
  return iconComponents[type] || iconComponents.CUSTOM;
}
</script>

<template>
  <component :is="getNotificationIconComponent(notification.type)" />
</template>
```

---

### 📱 **Détection Mobile pour le FCM**

```vue
<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useFCM } from '@/composables/useFCM';

const {
  isSupported,
  isRegistered,
  fcmToken,
  error,
  init: initFCM
} = useFCM();

const isMobile = ref(false);

// Détecter si c'est un appareil mobile
onMounted(() => {
  const userAgent = navigator.userAgent || navigator.vendor || window.opera;
  isMobile.value = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent.toLowerCase());

  // Initialiser FCM seulement si supporté
  if (isSupported.value) {
    initFCM();
  }
});
</script>

<template>
  <div v-if="isMobile && isSupported">
    <p v-if="isRegistered">FCM activé sur mobile</p>
    <p v-else>FCM non activé: {{ error || 'En attente' }}</p>
  </div>
</template>
```

---

---

## ⚠️ **Problèmes Courants et Solutions**

---

### 🔴 **Problème : Les notifications ne s'affichent pas**

**Symptômes** :
- Pas de badge sur l'icône de notification
- Le dropdown est vide
- Pas de notifications toast

**Solutions** :

1. **Vérifiez que le composable est initialisé** :
   ```vue
   const { isInitialized } = useNotification();
   console.log('Initialisé:', isInitialized.value);
   ```

2. **Vérifiez que l'utilisateur est connecté** :
   ```vue
   const { user } = useUserStore();
   console.log('Utilisateur:', user);
   ```

3. **Vérifiez que WebSocket est connecté** :
   ```vue
   const { socket, isConnected } = useWSocket();
   console.log('WebSocket connecté:', isConnected.value);
   ```

4. **Vérifiez que l'abonnement est actif** :
   ```javascript
   // Le composable doit automatiquement s'abonner via socket.join(userId)
   socket.on('connect', () => {
     console.log('Abonné à:', socket.rooms);
   });
   ```

5. **Vérifiez les notifications dans la base de données** :
   ```bash
   # Dans synco_api
   bun run prisma studio
   ```
   Puis vérifiez la table `Notification` pour voir si les notifications existent.

---

### 🔴 **Problème : Les notifications push ne fonctionnent pas**

**Symptômes** :
- Les notifications fonctionnent dans l'app mais pas quand l'onglet est fermé
- Pas de notification sur mobile

**Solutions** :

1. **Vérifiez que le Service Worker est enregistré** :
   ```javascript
   navigator.serviceWorker.getRegistrations().then(console.log);
   ```

2. **Vérifiez que Firebase est configuré** :
   ```javascript
   import { isFirebaseConfigured } from '@/config/firebase';
   console.log('Firebase configuré:', isFirebaseConfigured());
   ```

3. **Vérifiez que le token FCM est obtenu** :
   ```javascript
   import { useFCM } from '@/composables/useFCM';
   const { fcmToken, isRegistered, error } = useFCM();
   console.log('Token FCM:', fcmToken.value);
   console.log('Erreur:', error.value);
   ```

4. **Vérifiez que le token est enregistré sur le backend** :
   ```bash
   curl -X GET https://api.synco.fr/api/notifications/tokens \
     -H "Authorization: Bearer YOUR_TOKEN"
   ```

5. **Vérifiez les permissions** :
   ```javascript
   Notification.permission; // Doit être 'granted'
   ```

6. **Testez manuellement une notification** :
   ```javascript
   new Notification('Test', {
     body: 'Ceci est un test de notification du navigateur'
   });
   ```

---

### 🔴 **Problème : Les notifications sont en double**

**Symptômes** :
- La même notification apparaît plusieurs fois
- Le compteur de notifications non lues est incorrect

**Solutions** :

1. **Vérifiez que vous ne chargez pas les notifications plusieurs fois** :
   ```vue
   const { loadNotifications } = useNotification();
   
   // Ne pas appeler plusieurs fois
   onMounted(() => {
     loadNotifications();
     // Pas besoin d'appeler loadNotifications() ailleurs
   });
   ```

2. **Vérifiez que le composable gère les doublons** :
   ```typescript
   // Dans useNotification.ts
   socket.value.on('notification:push', (notification: AppNotification) => {
     // Ne pas ajouter les doublons
     const exists = notifications.value.some(n => n.id === notification.id);
     if (!exists) {
       notifications.value.unshift(notification);
     }
   });
   ```

3. **Utilisez des IDs uniques** :
   - Assurez-vous que chaque notification a un ID unique
   - Pour les notifications WebSocket, utilisez un format comme `notif-${Date.now()}-${userId}`

---

### 🔴 **Problème : Les notifications ne sont pas marquées comme lues**

**Symptômes** :
- Le badge de notification ne disparaît pas après avoir cliqué
- Les notifications restent en statut "non lues"

**Solutions** :

1. **Vérifiez que la méthode markAsRead est appelée** :
   ```vue
   <NotificationItem
     :notification="notification"
     @click="markAsRead(notification.id)"
   />
   ```

2. **Vérifiez que l'API retourne une réponse réussie** :
   ```bash
   curl -X PATCH https://api.synco.fr/api/notifications/NOTIFICATION_ID/read \
     -H "Authorization: Bearer YOUR_TOKEN"
   ```

3. **Vérifiez la synchronisation WebSocket** :
   ```javascript
   socket.on('notification:read', (data) => {
     console.log('Notification marquée comme lue:', data);
   });
   ```

4. **Vérifiez que l'ID de notification est correct** :
   ```vue
   <NotificationItem
     v-for="notification in notifications"
     :key="notification.id"
     :notification="notification"
   />
   ```

---

### 🔴 **Problème : Erreur "Firebase not configured"**

**Solution** :
1. Vérifiez que toutes les variables Firebase sont remplies dans `.env` :
   ```env
   VITE_FIREBASE_API_KEY=...
   VITE_FIREBASE_AUTH_DOMAIN=...
   VITE_FIREBASE_PROJECT_ID=...
   VITE_FIREBASE_MESSAGING_SENDER_ID=...
   VITE_FIREBASE_APP_ID=...
   VITE_FIREBASE_VAPID_KEY=...
   ```

2. Redémarrez le serveur de développement :
   ```bash
   npm run dev
   ```

3. Vérifiez que le projet Firebase existe et est correctement configuré

---

### 🔴 **Problème : Erreur "Token already registered"**

**Solution** :
Cela peut arriver si vous appelez `registerForPushNotifications()` plusieurs fois. Utilisez un flag pour éviter cela :

```vue
<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useFCM } from '@/composables/useFCM';

const { registerForPushNotifications } = useFCM();
const isRegistering = ref(false);

async function registerFCM() {
  if (isRegistering.value) return;
  
  isRegistering.value = true;
  try {
    await registerForPushNotifications();
  } finally {
    isRegistering.value = false;
  }
}

onMounted(registerFCM);
</script>
```

---

---

## 📚 **Références**

### Documentation Interne
- [Implementation Status](./IMPLEMENTATION_STATUS.md) - État complet de l'implémentation
- [Notifications Composable Plan](./notifications_composable.md) - Spécifications du composable
- [Notifications FCM Web Plan](./notifications_fcm_web.md) - Configuration FCM pour le web
- [Notifications UI Plan](./notifications_ui.md) - Composants UI

### Documentation Externe
- [Vue 3 Documentation](https://vuejs.org/guide/) - Framework Vue
- [TypeScript Documentation](https://www.typescriptlang.org/docs/) - Typage fort
- [Firebase Documentation](https://firebase.google.com/docs) - Firebase
- [Firebase Messaging Documentation](https://firebase.google.com/docs/cloud-messaging) - FCM
- [Socket.IO Client Documentation](https://socket.io/docs/v4/client-api/) - Client WebSocket

### Types Disponibles

Tous les types sont exportés depuis `@/composables/useNotification` :

```typescript
import {
  useNotification,
  useFCM,
  type AppNotification,
  type CreateNotificationPayload,
  type NotificationType,
  type NotificationPermission,
  type SendNotificationResult
} from '@/composables/useNotification';
```

---

---

## 🎯 **Checklist pour le Déploiement**

- [ ] Installer les dépendances (`npm install firebase @firebase/messaging`)
- [ ] Configurer les variables d'environnement Firebase dans `.env`
- [ ] Enregistrer le Service Worker dans `main.ts` ou `App.vue`
- [ ] Ajouter `NotificationCenter` dans votre layout principal
- [ ] Tester les notifications dans un environnement de développement
- [ ] Vérifier que le Service Worker est bien enregistré
- [ ] Tester que les notifications push fonctionnent (onglet fermé)
- [ ] Vérifier la permission de notification dans le navigateur
- [ ] Tester sur différents navigateurs (Chrome, Firefox, Edge)
- [ ] Tester sur mobile (si applicable)
- [ ] Vérifier que les notifications sont marquées comme lues après clic
- [ ] Vérifier la synchronisation entre onglets

---

---

## 💡 **Bonnes Pratiques**

### 1. **Gestion des Erreurs**

Toujours gérer les erreurs dans les appels asynchrones :

```vue
<script setup lang="ts">
import { useNotification } from '@/composables/useNotification';

const { loadNotifications, markAsRead } = useNotification();

async function refreshNotifications() {
  try {
    await loadNotifications();
  } catch (error) {
    console.error('Erreur de chargement:', error);
    // Afficher une erreur à l'utilisateur
    // Ne pas bloquer l'UI
  }
}

async function handleNotificationClick(notificationId: string) {
  try {
    await markAsRead(notificationId);
    // Naviguer...
  } catch (error) {
    console.error('Erreur:', error);
    // Recharger les notifications ou afficher un message
  }
}
</script>
```

### 2. **Optimistic Updates**

Le composable utilise déjà des optimistic updates. Vous pouvez les étendre :

```vue
<script setup lang="ts">
import { useNotification } from '@/composables/useNotification';

const { notifications, markAsRead } = useNotification();

async function handleNotificationClick(notification: AppNotification) {
  // Optimistic update
  const index = notifications.value.findIndex(n => n.id === notification.id);
  if (index !== -1) {
    notifications.value[index].isRead = true;
  }

  // Appel API
  try {
    await markAsRead(notification.id);
    // Naviguer...
  } catch (error) {
    // Revertir si l'API échoue
    if (index !== -1) {
      notifications.value[index].isRead = false;
    }
  }
}
</script>
```

### 3. **Nettoyage des Écoutes**

Toujours nettoyer les écouteurs d'événements :

```vue
<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { useWSocket } from '@/composables/useWSocket';

const { socket } = useWSocket();

onMounted(() => {
  if (socket.value) {
    socket.value.on('notification:push', handleNotification);
  }
});

onUnmounted(() => {
  if (socket.value) {
    socket.value.off('notification:push', handleNotification);
  }
});

function handleNotification(notification: any) {
  console.log('Notification:', notification);
}
</script>
```

### 4. **Respect des Permissions**

Vérifiez toujours la permission avant d'envoyer des notifications :

```vue
<script setup lang="ts">
import { useNotification } from '@/composables/useNotification';

const { isGranted, requestPermission } = useNotification();

async function sendNotification() {
  if (!isGranted.value) {
    // Demander la permission
    await requestPermission();
    
    if (!isGranted.value) {
      console.log('Permission refusée');
      return;
    }
  }
  
  // Envoyer la notification...
}
</script>
```

### 5. **Personnalisation des Types**

Vous pouvez étendre les types de notification :

```typescript
// Dans votre code
type CustomNotificationType = NotificationType | 'FRIEND_REQUEST' | 'GROUP_INVITE';

interface CustomNotificationData extends NotificationData {
  friendRequestId?: string;
  groupId?: string;
  // ...
}
```

---

---

## 📞 **Support et Contact**

Pour toute question ou problème :
1. Consultez cette documentation
2. Vérifiez les logs dans la console du navigateur
3. Vérifiez que Firebase et le Service Worker sont correctement configurés
4. Testez avec les exemples fournis
5. Contactez l'équipe Synco pour les problèmes persistants

---

---

## ✅ **Résumé**

Le système de notifications frontend de Synco est **complet et prêt pour la production**.

**Ce que vous avez** :
- ✅ Un composable `useNotification` puissant et flexible
- ✅ Un composable `useFCM` pour les notifications push
- ✅ Des composants UI prêts à l'emploi (`NotificationCenter`, `NotificationItem`)
- ✅ Une intégration transparente avec WebSocket
- ✅ La gestion automatique des permissions
- ✅ Le support des notifications push même quand l'onglet est fermé

**Ce que vous devez faire** :
1. Configurer Firebase dans `.env`
2. Enregistrer le Service Worker dans `main.ts`
3. Ajouter `NotificationCenter` dans votre layout
4. Tester dans votre environnement

**Ce qui est géré automatiquement** :
- Chargement des notifications
- Demande de permission
- Abonnement aux événements WebSocket
- Synchronisation entre onglets
- Affichage des notifications toast
- Navigation intelligente

---

*Documentation générée par Mistral Vibe - 28 Juin 2026*
*Projet Synco - Plateforme de collaboration française souveraine*

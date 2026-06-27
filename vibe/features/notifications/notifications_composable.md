# ð¨ Notifications - Vue Composable

> **Projet** : Synco - Système de notifications push
> **Date** : 27 Juin 2026
> **Priorité** : ððððð (Élevée)
> **Statut** : À implémenter
> **Dépendances** : Aucune (mais nécessite useWSocket existant)

---

## ð¯ Contexte

Ce document décrit le **composable Vue 3** `useNotifications` qui fournit une API simple et réactive pour gérer les notifications dans l'application Synco.

**Objectifs :**
- ð¯ **Simplicité** : Une seule fonction pour envoyer des notifications
- ð¯ **Réactivité** : State réactif pour les notifications
- ð¯ **Intégration WebSocket** : Synchronisation temps réel
- ð¯ **Extensibilité** : Support multi-plateformes (Web, Mobile, Desktop)

---

## ð¦ Implémentation du Composable

### **1. Fichier principal**

```typescript
// src/composables/useNotifications.ts
import { ref, computed, type Ref } from 'vue';
import { useWSocket } from './useWSocket';
import { useUserStore } from '../stores/user';
import { useToast } from './useToast';
import { useRouter } from 'vue-router';
import type { NotificationType } from '../types/types';

// Types étendus pour le frontend
export interface NotificationData {
  [key: string]: any;
}

export interface AppNotification {
  id: string;
  userId: string;
  senderId?: string;
  sender?: {
    id: string;
    username: string;
    displayName: string;
  };
  type: NotificationType;
  title: string;
  body: string;
  data?: NotificationData;
  metadata?: Record<string, any>;
  isRead: boolean;
  isSent: boolean;
  createdAt: string;
  timestamp?: string; // Quand la notification a été reçue
}

// Type pour le payload de création
export interface CreateNotificationPayload {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: NotificationData;
  metadata?: {
    priority?: 'high' | 'normal' | 'low';
    sound?: boolean;
    badge?: number;
  };
}

// Type pour les permissions de notification
export type NotificationPermission = 'default' | 'granted' | 'denied';

// Resultat d'envoi
export interface SendNotificationResult {
  success: boolean;
  id?: string;
  error?: string;
}

// Platform de notification
export type NotificationPlatform = 'fcm' | 'apns' | 'tauri';

// Info sur le token
export interface NotificationTokenInfo {
  id: string;
  platform: NotificationPlatform;
  deviceId?: string;
  deviceInfo?: Record<string, any>;
  isActive: boolean;
  createdAt: string;
}

/**
 * Composable pour gérer les notifications
 * @returns Object avec state et méthodes pour les notifications
 */
export function useNotifications() {
  const { socket } = useWSocket();
  const userStore = useUserStore();
  const toast = useToast();
  const router = useRouter();

  // ==================== STATE ====================

  // Liste des notifications
  const notifications = ref<AppNotification[]>([]);
  
  // Permission de notification
  const permission = ref<NotificationPermission>('default');
  
  // Est-ce que la permission est accordée
  const isGranted = computed(() => permission.value === 'granted');
  
  // Compteur de notifications non lues
  const unreadCount = computed(() => {
    return notifications.value.filter(n => !n.isRead).length;
  });

  // Est-ce que le composable est initialisé
  const isInitialized = ref(false);

  // ==================== MÉTHODES ====================

  /**
   * Initialiser le composable
   * - Charger les notifications depuis l'API
   * - Demander la permission
   * - Configurer les listeners WebSocket
   * - Initialiser les services plateforme (FCM, Capacitor, Tauri)
   */
  const init = async (): Promise<void> => {
    if (isInitialized.value) return;

    try {
      // Charger les notifications existantes
      await loadNotifications();
      
      // Demander la permission
      await requestPermission();
      
      // Configurer les listeners WebSocket
      setupWebSocketListeners();
      
      // Initialiser les services plateforme
      await initPlatformServices();

      isInitialized.value = true;
    } catch (error) {
      console.error('[Notifications] Initialization error:', error);
      throw error;
    }
  };

  /**
   * Charger les notifications depuis l'API
   */
  const loadNotifications = async (
    limit: number = 20,
    offset: number = 0,
    read?: boolean
  ): Promise<void> => {
    try {
      const queryParams = new URLSearchParams({
        limit: limit.toString(),
        offset: offset.toString()
      });
      
      if (read !== undefined) {
        queryParams.append('read', read.toString());
      }

      const response = await window.sfetch<{
        notifications: AppNotification[];
        total: number;
        unreadCount: number;
      }>(`/api/notifications?${queryParams.toString()}`);

      // Remplacer les notifications (ou fusionner pour pagination)
      if (offset === 0) {
        notifications.value = response.notifications;
      } else {
        notifications.value = [...notifications.value, ...response.notifications];
      }
    } catch (error) {
      console.error('[Notifications] Failed to load notifications:', error);
      toast.error('Échec du chargement des notifications');
    }
  };

  /**
   * Charger plus de notifications (pour la pagination)
   */
  const loadMoreNotifications = async (): Promise<void> => {
    await loadNotifications(20, notifications.value.length);
  };

  /**
   * Demander la permission de notification
   */
  const requestPermission = async (): Promise<void> => {
    if (!('Notification' in window)) {
      console.warn('[Notifications] Browser does not support notifications');
      return;
    }

    try {
      permission.value = await Notification.requestPermission();
      
      // Si accordée, initialiser les services FCM
      if (permission.value === 'granted') {
        await initFCMService();
      }
    } catch (error) {
      console.error('[Notifications] Permission request error:', error);
      permission.value = 'denied';
    }
  };

  /**
   * Envoyer une notification via WebSocket
   * @param payload - Données de la notification
   * @returns Promise avec le résultat
   */
  const sendNotification = async (
    payload: Omit<CreateNotificationPayload, 'userId'> & { userId?: string }
  ): Promise<SendNotificationResult> => {
    // Si un userId est fourni, l'utiliser, sinon utiliser le userId du store
    const targetUserId = payload.userId || userStore.user?.id;
    
    if (!targetUserId) {
      return {
        success: false,
        error: 'No user ID specified'
      };
    }

    if (!socket.value) {
      return {
        success: false,
        error: 'WebSocket not connected'
      };
    }

    return new Promise((resolve) => {
      socket.value?.emit(
        'notification:send',
        {
          userId: targetUserId,
          type: payload.type,
          title: payload.title,
          body: payload.body,
          data: payload.data,
          metadata: payload.metadata
        },
        (response: SendNotificationResult) => {
          resolve(response);
        }
      );
    });
  };

  /**
   * Marquer une notification comme lue
   */
  const markAsRead = async (notificationId: string): Promise<void> => {
    try {
      // Optimistic update
      const notification = notifications.value.find(n => n.id === notificationId);
      if (notification) {
        notification.isRead = true;
      }

      // Appel API
      await window.sfetch(`/api/notifications/${notificationId}/read`, {
        method: 'PATCH'
      });

      // Notifier via WebSocket pour synchroniser les autres onglets
      socket.value?.emit('notification:read', { notificationId });
    } catch (error) {
      console.error('[Notifications] Failed to mark as read:', error);
      toast.error('Échec de la mise à jour');
      
      // Revertir si l'API échoue
      const notification = notifications.value.find(n => n.id === notificationId);
      if (notification) {
        notification.isRead = false;
      }
    }
  };

  /**
   * Marquer toutes les notifications comme lues
   */
  const markAllAsRead = async (): Promise<void> => {
    try {
      // Optimistic update
      notifications.value.forEach(n => {
        n.isRead = true;
      });

      // Appel API
      await window.sfetch('/api/notifications/read-all', {
        method: 'PATCH'
      });
    } catch (error) {
      console.error('[Notifications] Failed to mark all as read:', error);
      toast.error('Échec de la mise à jour');
      
      // Recharger les notifications pour revertir
      await loadNotifications();
    }
  };

  /**
   * Supprimer une notification
   */
  const removeNotification = async (notificationId: string): Promise<void> => {
    try {
      await window.sfetch(`/api/notifications/${notificationId}`, {
        method: 'DELETE'
      });

      // Supprimer du state local
      notifications.value = notifications.value.filter(n => n.id !== notificationId);
    } catch (error) {
      console.error('[Notifications] Failed to delete notification:', error);
      toast.error('Échec de la suppression');
    }
  };

  // ==================== WEB SOCKET ====================

  /**
   * Configurer les listeners WebSocket
   */
  const setupWebSocketListeners = (): void => {
    if (!socket.value) return;

    // Nouvelle notification push reçue
    socket.value.on('notification:push', (notification: AppNotification) => {
      // Ne pas ajouter les doublons
      const exists = notifications.value.some(n => n.id === notification.id);
      if (!exists) {
        notifications.value.unshift(notification);
      }
      
      // Afficher une toast notification
      showToastNotification(notification);
    });

    // Notification marquée comme lue (synchronisation entre onglets)
    socket.value.on('notification:read', (data: { notificationId: string; isRead: boolean }) => {
      const notification = notifications.value.find(n => n.id === data.notificationId);
      if (notification) {
        notification.isRead = data.isRead;
      }
    });
  };

  /**
   * Afficher une notification toast
   */
  const showToastNotification = (notification: AppNotification): void => {
    toast.show({
      title: notification.title,
      message: notification.body,
      type: getToastType(notification.type),
      duration: 8000,
      action: {
        label: 'Voir',
        onClick: () => {
          handleNotificationClick(notification);
        }
      },
      onClose: () => {
        // Optionnel : marquer comme lue après affichage
        // markAsRead(notification.id);
      }
    });
  };

  /**
   * Obtenir le type de toast en fonction du type de notification
   */
  const getToastType = (type: NotificationType): 'info' | 'success' | 'warning' | 'error' => {
    switch (type) {
      case 'MESSAGE':
        return 'info';
      case 'CALL':
        return 'success';
      case 'MENTION':
        return 'warning';
      case 'INVITATION':
        return 'info';
      case 'CUSTOM':
      default:
        return 'info';
    }
  };

  /**
   * Gérer le clic sur une notification
   */
  const handleNotificationClick = (notification: AppNotification): void => {
    // Marquer comme lue
    markAsRead(notification.id);

    // Naviguer en fonction du type et des données
    navigateFromNotification(notification);
  };

  /**
   * Naviguer en fonction du type de notification
   */
  const navigateFromNotification = (notification: AppNotification): void => {
    if (!notification.data) return;

    switch (notification.type) {
      case 'MESSAGE':
        if (notification.data.threadId) {
          router.push(`/chat/thread/${notification.data.threadId}`);
        } else if (notification.data.senderId) {
          router.push(`/chat/dm/${notification.data.senderId}`);
        }
        break;
      
      case 'CALL':
        if (notification.data.callId) {
          router.push(`/call/${notification.data.callId}`);
        }
        break;
      
      case 'MENTION':
        if (notification.data.threadId) {
          router.push(`/chat/thread/${notification.data.threadId}`);
        }
        break;
      
      case 'INVITATION':
        if (notification.data.orgId) {
          router.push(`/org/${notification.data.orgId}/invitations`);
        } else if (notification.data.spaceId) {
          router.push(`/org/${notification.data.orgId}/space/${notification.data.spaceId}/invitations`);
        }
        break;
      
      case 'CUSTOM':
        if (notification.data.url) {
          router.push(notification.data.url);
        }
        break;
    }
  };

  // ==================== TOKENS ====================

  /**
   * Enregistrer un token de notification (FCM/APNS/Tauri)
   */
  const registerToken = async (
    token: string,
    platform: NotificationPlatform,
    deviceId?: string,
    deviceInfo?: Record<string, any>
  ): Promise<NotificationTokenInfo> => {
    try {
      const response = await window.sfetch<NotificationTokenInfo>('/api/notifications/tokens', {
        method: 'POST',
        body: JSON.stringify({
          token,
          platform,
          deviceId,
          deviceInfo
        })
      });

      return response;
    } catch (error) {
      console.error('[Notifications] Failed to register token:', error);
      throw error;
    }
  };

  /**
   * Supprimer un token de notification
   */
  const unregisterToken = async (tokenId: string): Promise<void> => {
    try {
      await window.sfetch(`/api/notifications/tokens/${tokenId}`, {
        method: 'DELETE'
      });
    } catch (error) {
      console.error('[Notifications] Failed to unregister token:', error);
      throw error;
    }
  };

  /**
   * Lister les tokens de l'utilisateur
   */
  const listTokens = async (): Promise<NotificationTokenInfo[]> => {
    try {
      const response = await window.sfetch<{ tokens: NotificationTokenInfo[] }>(
        '/api/notifications/tokens'
      );
      return response.tokens;
    } catch (error) {
      console.error('[Notifications] Failed to list tokens:', error);
      return [];
    }
  };

  // ==================== PLATEFORME ====================

  /**
   * Initialiser les services plateforme
   */
  const initPlatformServices = async (): Promise<void> => {
    // Détecter la plateforme
    const isMobile = isMobileDevice();
    const isDesktop = isDesktopApp();

    // Initialiser FCM pour Web
    if ('Notification' in window && permission.value === 'granted') {
      await initFCMService();
    }

    // Initialiser Capacitor pour Mobile
    if (isMobile && 'PushNotifications' in window) {
      await initCapacitorPushNotifications();
    }

    // Initialiser Tauri pour Desktop
    if (isDesktop) {
      await initTauriNotifications();
    }
  };

  /**
   * Vérifier si l'appareil est mobile
   */
  const isMobileDevice = (): boolean => {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    );
  };

  /**
   * Vérifier si c'est une application desktop (Tauri)
   */
  const isDesktopApp = (): boolean => {
    return 'tauri' in window || '__TAURI__' in window;
  };

  // ==================== FCM SERVICE ====================

  /**
   * Initialiser le service FCM pour Web
   */
  const initFCMService = async (): Promise<void> => {
    try {
      // Importer dynamiquement pour éviter des erreurs si Firebase n'est pas chargé
      const { registerFCMServiceWorker } = await import('../assets/firebaseInit');
      await registerFCMServiceWorker();
    } catch (error) {
      console.warn('[Notifications] FCM not available or failed to initialize:', error);
    }
  };

  // ==================== CAPACITOR ====================

  /**
   * Initialiser les notifications push Capacitor
   */
  const initCapacitorPushNotifications = async (): Promise<void> => {
    try {
      const { initCapacitorPushNotifications: initCap } = await import('../assets/capacitorInit');
      await initCap();
    } catch (error) {
      console.warn('[Notifications] Capacitor Push Notifications not available:', error);
    }
  };

  // ==================== TAURI ====================

  /**
   * Initialiser les notifications Tauri
   */
  const initTauriNotifications = async (): Promise<void> => {
    try {
      const { initTauriNotifications: initTauri } = await import('../assets/tauriInit');
      await initTauri();
    } catch (error) {
      console.warn('[Notifications] Tauri notifications not available:', error);
    }
  };

  // ==================== RETOUR ====================

  return {
    // State
    notifications,
    permission,
    isGranted,
    unreadCount,
    isInitialized,

    // Méthodes principales
    init,
    loadNotifications,
    loadMoreNotifications,
    requestPermission,
    
    // Envoi et gestion
    sendNotification,
    markAsRead,
    markAllAsRead,
    removeNotification,
    handleNotificationClick,
    
    // Tokens
    registerToken,
    unregisterToken,
    listTokens,
    
    // Plateforme
    isMobileDevice,
    isDesktopApp
  };
}
```

---

## ð Types TypeScript

Ajouter dans `src/types/types.ts` :

```typescript
// Types pour les notifications
export type NotificationType = 
  | 'MESSAGE'      // Nouveau message (DM/Thread)
  | 'CALL'         // Appel entrant
  | 'MENTION'      // Mention @utilisateur
  | 'INVITATION'   // Invitation organisation/espace
  | 'CUSTOM';      // Notification personnalisée

// Interface de base pour une notification
export interface BaseNotification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
}

// Données supplémentaires pour les notifications
export interface NotificationMetadata {
  priority?: 'high' | 'normal' | 'low';
  sound?: boolean;
  badge?: number;
}

// Données contextuelles (ex: threadId, orgId, etc.)
export interface NotificationContext {
  threadId?: string;
  senderId?: string;
  senderName?: string;
  orgId?: string;
  spaceId?: string;
  callId?: string;
  url?: string;
  [key: string]: any;
}
```

---

## ð¯ Utilisation

### **1. Initialisation dans App.vue**

```vue
<!-- src/App.vue -->
<script setup lang="ts">
import { onMounted } from 'vue';
import { useNotifications } from './composables/useNotifications';
import NotificationContainer from './components/common/NotificationContainer.vue';
import NotificationCenter from './components/common/NotificationCenter.vue';

const { init } = useNotifications();

onMounted(() => {
  init();
});
</script>

<template>
  <NotificationContainer />
  <NotificationCenter />
  <router-view />
</template>
```

---

### **2. Envoyer une notification**

```vue
<script setup lang="ts">
import { useNotifications } from '../composables/useNotifications';

const { sendNotification } = useNotifications();

const sendNewMessageNotification = async () => {
  const result = await sendNotification({
    type: 'MESSAGE',
    title: 'Nouveau message',
    body: 'Vous avez reçu un nouveau message',
    data: {
      threadId: 'thread-123',
      senderId: 'user-456',
      senderName: 'John Doe'
    },
    metadata: {
      priority: 'high',
      sound: true
    }
  });

  if (result.success) {
    console.log('Notification envoyée:', result.id);
  } else {
    console.error('Erreur:', result.error);
  }
};
</script>
```

---

### **3. Afficher le compteur de notifications non lues**

```vue
<script setup lang="ts">
import { useNotifications } from '../composables/useNotifications';

const { unreadCount } = useNotifications();
</script>

<template>
  <button class="notification-button">
    <span class="notification-icon">ð</span>
    <span v-if="unreadCount > 0" class="notification-badge">
      {{ unreadCount > 99 ? '99+' : unreadCount }}
    </span>
  </button>
</template>
```

---

### **4. Lister les notifications**

```vue
<script setup lang="ts">
import { onMounted } from 'vue';
import { useNotifications } from '../composables/useNotifications';

const { notifications, loadNotifications, markAsRead } = useNotifications();

onMounted(() => {
  loadNotifications();
});
</script>

<template>
  <div class="notification-list">
    <div 
      v-for="notification in notifications" 
      :key="notification.id"
      class="notification-item"
      :class="{ 'unread': !notification.isRead }"
      @click="markAsRead(notification.id)"
    >
      <div class="notification-title">{{ notification.title }}</div>
      <div class="notification-body">{{ notification.body }}</div>
    </div>
  </div>
</template>
```

---

## ð Intégration avec le store User

Vérifier que le store user expose bien `user?.id` :

```typescript
// src/stores/user.ts
import { defineStore } from 'pinia';

export const useUserStore = defineStore('user', {
  state: () => ({
    user: null as User | null
  }),
  getters: {
    userId: (state) => state.user?.id
  }
});
```

---

## ð Sécurité

### **1. Validation côté client**
- Valider les payloads avant envoi
- Limiter la taille des champs `title` et `body`
- Vérifier que l'utilisateur est bien connecté

### **2. Gestion des erreurs**
- Toujours catcher les erreurs
- Ne pas exposer les erreurs sensibles
- Afficher des messages d'erreur génériques

### **3. WebSocket**
- Vérifier que le socket est bien connecté
- Gérer les reconnexions
- Valider les données reçues

---

## ð§ª Tests à implémenter

1. ✅ Test de l'initialisation du composable
2. ✅ Test de `loadNotifications()`
3. ✅ Test de `sendNotification()`
4. ✅ Test de `markAsRead()`
5. ✅ Test de `markAllAsRead()`
6. ✅ Test de `registerToken()`
7. ✅ Test de la gestion des erreurs
8. ✅ Test de la synchronisation WebSocket
9. ✅ Test du computed `unreadCount`
10. ✅ Test de la navigation depuis une notification

---

## ð Dépendances nécessaires

- ✅ `vue` 3.x (déjà présent)
- ✅ `pinia` (déjà présent)
- ✅ `vue-router` (déjà présent)
- ✅ `useWSocket` (existant dans le projet)
- ✅ `useToast` (existant dans le projet)

---

## ð Liens vers les autres documents

- [Notifications - UI Components](./notifications_ui.md)
- [Notifications - FCM Web Configuration](./notifications_fcm_web.md)
- [Notifications - Capacitor Mobile Configuration](./notifications_capacitor_mobile.md)
- [Notifications - Tauri Desktop Configuration](./notifications_tauri_desktop.md)

---

## ð Avantages de cette implémentation

1. **Simplicité** : Une seule ligne pour envoyer une notification
   ```typescript
   await sendNotification({ type: 'MESSAGE', title: 'Hello', body: 'World' });
   ```

2. **Réactivité** : State automatiquement mis à jour
   - `notifications` : Liste complète
   - `unreadCount` : Compteur calculé
   - `isGranted` : Statut des permissions

3. **Intégration WebSocket** : Synchronisation temps réel
   - Nouvelle notification → ajout automatique
   - Notification lue → mise à jour automatique

4. **Multi-plateformes** : Fonctionne sur Web, Mobile et Desktop

5. **Extensible** : Facile d'ajouter de nouveaux types de notifications

6. **Sécurisé** : Gestion des erreurs et validation intégrées

7. **Optimisé** : Chargement paresseux des services plateforme

---

## ð Checklist d'implémentation

- [ ] Créer `src/composables/useNotifications.ts`
- [ ] Ajouter les types dans `src/types/types.ts`
- [ ] Intégrer dans `src/App.vue`
- [ ] Vérifier que `useWSocket` est disponible
- [ ] Vérifier que `useToast` est disponible
- [ ] Vérifier que `useUserStore` est disponible
- [ ] Tester toutes les méthodes
- [ ] Vérifier l'intégration WebSocket
- [ ] Vérifier la réactivité du state

---

> **â ï¸ IMPORTANT** : Ce composable est la **pierre angulaire** du système de notifications frontend. Il doit être implémenté **avant** les composants UI et les configurations plateforme spécifiques.

---

*Document généré pour le projet Synco - 27 Juin 2026*
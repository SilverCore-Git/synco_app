import { ref, computed, type Ref } from 'vue';
import useWSocket from './useWSocket';
import { user } from '../assets/var';
import { useToast } from './useToast';
import { useRouter } from 'vue-router';
import sfetch from '../assets/utils/sfetch';
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

// ==================== STATE (partagé entre tous les appels) ====================
// Ces refs vivent au niveau module (et non dans useNotification()) pour que tous
// les composants qui appellent useNotification() lisent/écrivent le même état —
// sinon chaque appel créait sa propre liste vide et les badges de non-lus
// (SpaceBar, UsersBar, Category...) restaient bloqués à 0 tant que leur propre
// instance n'avait pas elle-même appelé init()/loadNotifications().

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

/**
 * Composable pour gérer les notifications
 * @returns Object avec state et méthodes pour les notifications
 */
export function useNotification() {
  let socket: Ref<any> | null = null;
  const toast = useToast();
  const router = useRouter();

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
      // Get socket instance
      socket = await useWSocket();

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

      const response = await sfetch(`/api/notifications?${queryParams.toString()}`)
        .then(res => res.json()) as {
          notifications: AppNotification[];
          total: number;
          unreadCount: number;
        };

      // Remplacer les notifications (ou fusionner pour pagination)
      if (offset === 0) {
        notifications.value = response.notifications;
      } else {
        notifications.value = [...notifications.value, ...response.notifications];
      }
    } catch (error) {
      console.error('[Notifications] Failed to load notifications:', error);
      toast.show('Échec du chargement des notifications', 'error');
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
    const targetUserId = payload.userId || user.value?.id;

    if (!targetUserId) {
      return {
        success: false,
        error: 'No user ID specified'
      };
    }

    if (!socket?.value) {
      return {
        success: false,
        error: 'WebSocket not connected'
      };
    }

    return new Promise((resolve) => {
      socket?.value?.emit(
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
      await sfetch(`/api/notifications/${notificationId}/read`, {
        method: 'PATCH'
      });

      // Notifier via WebSocket pour synchroniser les autres onglets
      socket?.value?.emit('notification:mark-read', { notificationId });
    } catch (error) {
      console.error('[Notifications] Failed to mark as read:', error);
      toast.show('Échec de la mise à jour', 'error');

      // Revertir si l'API échoue
      const notification = notifications.value.find(n => n.id === notificationId);
      if (notification) {
        notification.isRead = false;
      }
    }
  };

  /**
   * Marquer toutes les notifications d'un salon comme lues
   */
  const markThreadAsRead = async (threadId: string): Promise<void> => {
    try {
      // Optimistic update (local cache may not be populated yet, so this
      // is best-effort — the actual persistence happens server-side below
      // regardless of whether anything matched locally)
      notifications.value.forEach(n => {
        if (!n.isRead && n.data?.threadId === threadId) {
          n.isRead = true;
        }
      });

      // Toujours notifier via WebSocket : le serveur recalcule lui-même
      // les notifications non lues à partir de la BDD, donc ce n'est pas
      // conditionné par le cache local de notifications.value.
      socket?.value?.emit('notification:mark-read-by-thread', { threadId });
    } catch (error) {
      console.error('[Notifications] Failed to mark thread as read:', error);
      // Recharger les notifications pour revertir
      await loadNotifications();
    }
  };

  /**
   * Marquer toutes les notifications d'un DM comme lues
   */
  const markDMAsRead = async (dmUserId: string): Promise<void> => {
    try {
      // Optimistic update (best-effort, le cache local peut être vide)
      notifications.value.forEach(n => {
        if (!n.isRead && n.data?.dmUserId === dmUserId) {
          n.isRead = true;
        }
      });

      // Toujours notifier via WebSocket : le serveur recalcule lui-même
      // les notifications non lues à partir de la BDD.
      socket?.value?.emit('notification:mark-read-by-dm', { dmUserId });
    } catch (error) {
      console.error('[Notifications] Failed to mark DM as read:', error);
      await loadNotifications();
    }
  };

  /**
   * Marquer toutes les notifications de tâches comme lues
   */
  const markTasksAsRead = async (): Promise<void> => {
    try {
      let markedCount = 0;
      const promises: Promise<void>[] = [];

      // Optimistic update
      notifications.value.forEach(n => {
        if (!n.isRead && n.type === 'CUSTOM' && n.data?.type === 'TASK_UPDATE') {
          n.isRead = true;
          markedCount++;
          // We can use the existing read API per notification
          promises.push(
            sfetch(`/api/notifications/${n.id}/read`, { method: 'PATCH' }).then(() => { })
          );
        }
      });

      if (markedCount > 0) {
        await Promise.allSettled(promises);
      }
    } catch (error) {
      console.error('[Notifications] Failed to mark tasks as read:', error);
      await loadNotifications();
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
      await sfetch('/api/notifications/read-all', {
        method: 'PATCH'
      });

      // Notifier via WebSocket
      socket?.value?.emit('notification:mark-all-read');
    } catch (error) {
      console.error('[Notifications] Failed to mark all as read:', error);
      toast.show('Échec de la mise à jour', 'error');

      // Recharger les notifications pour revertir
      await loadNotifications();
    }
  };

  /**
   * Supprimer une notification
   */
  const removeNotification = async (notificationId: string): Promise<void> => {
    try {
      await sfetch(`/api/notifications/${notificationId}`, {
        method: 'DELETE'
      });

      // Supprimer du state local
      notifications.value = notifications.value.filter(n => n.id !== notificationId);
    } catch (error) {
      console.error('[Notifications] Failed to delete notification:', error);
      toast.show('Échec de la suppression', 'error');
    }
  };

  // ==================== WEB SOCKET ====================

  /**
   * Configurer les listeners WebSocket
   */
  const setupWebSocketListeners = (): void => {
    if (!socket?.value) return;

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

    // Toutes les notifications marquées comme lues
    socket.value.on('notification:all-read', () => {
      notifications.value.forEach(n => {
        n.isRead = true;
      });
    });
  };

  /**
   * Afficher une notification toast
   */
  const showToastNotification = (notification: AppNotification): void => {
    toast.show(notification.body, getToastType(notification.type), 8000);
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
        return 'success';
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
    switch (notification.type) {
      case 'MESSAGE':
        if (notification.data?.threadId) {
          router.push(`/chat/thread/${notification.data.threadId}`);
        } else if (notification.data?.dmUserId) {
          router.push(`/chat/dm/${notification.data.dmUserId}`);
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
      case 'CUSTOM':
        if (notification.data?.route) {
          router.push(notification.data.route);
        }
        break;
    }
  };

  // ==================== SERVICES PLATEFORME ====================

  /**
   * Initialiser les services plateforme
   */
  const initPlatformServices = async (): Promise<void> => {
    // FCM pour le web
    if ('firebase' in window) {
      await initFCMService();
    }

    // Capacitor pour le mobile (sera implémenté séparément)
    if ('Capacitor' in window) {
      await initCapacitorService();
    }

    // Tauri pour le desktop (sera implémenté séparément)
    if ('__TAURI__' in window) {
      await initTauriService();
    }
  };

  /**
   * Initialiser FCM pour le web
   */
  const initFCMService = async (): Promise<void> => {
    try {
      // Ce sera géré par le composable useFCM.ts séparé
      console.log('[Notifications] FCM service initialization (handled by useFCM)');
    } catch (error) {
      console.error('[Notifications] FCM initialization error:', error);
    }
  };

  /**
   * Initialiser Capacitor pour le mobile
   */
  const initCapacitorService = async (): Promise<void> => {
    try {
      // À implémenter dans notifications_capacitor_mobile.md
      console.log('[Notifications] Capacitor service initialization');
    } catch (error) {
      console.error('[Notifications] Capacitor initialization error:', error);
    }
  };

  /**
   * Initialiser Tauri pour le desktop
   */
  const initTauriService = async (): Promise<void> => {
    try {
      // À implémenter dans notifications_tauri_desktop.md
      console.log('[Notifications] Tauri service initialization');
    } catch (error) {
      console.error('[Notifications] Tauri initialization error:', error);
    }
  };

  // ==================== UTILITAIRES ====================

  /**
   * Obtenir les notifications non lues
   */
  const getUnreadNotifications = computed(() => {
    return notifications.value.filter(n => !n.isRead);
  });

  /**
   * Obtenir les notifications lues
   */
  const getReadNotifications = computed(() => {
    return notifications.value.filter(n => n.isRead);
  });

  /**
   * Filtrer les notifications par type
   */
  const getNotificationsByType = (type: NotificationType): Ref<AppNotification[]> => {
    return computed(() => {
      return notifications.value.filter(n => n.type === type);
    });
  };

  /**
   * Obtenir le nombre de notifications non lues par type
   */
  const getUnreadCountByType = (type: NotificationType): Ref<number> => {
    return computed(() => {
      return notifications.value.filter(n => n.type === type && !n.isRead).length;
    });
  };

  /**
   * Obtenir le nombre de notifications non lues par espace (workspace)
   */
  const getUnreadCountBySpaceId = (spaceId: string): Ref<number> => {
    return computed(() => {
      return notifications.value.filter(n => !n.isRead && n.data?.spaceId === spaceId).length;
    });
  };

  /**
   * Obtenir le nombre de notifications non lues par salon (thread)
   */
  const getUnreadCountByThreadId = (threadId: string): Ref<number> => {
    return computed(() => {
      return notifications.value.filter(n => !n.isRead && n.data?.threadId === threadId).length;
    });
  };

  /**
   * Obtenir le nombre de notifications non lues par message privé (DM)
   */
  const getUnreadCountByDMUserId = (dmUserId: string): Ref<number> => {
    return computed(() => {
      return notifications.value.filter(n => !n.isRead && n.data?.dmUserId === dmUserId).length;
    });
  };

  /**
   * Obtenir le nombre de notifications non lues pour les tâches
   */
  const getUnreadCountForTasks = computed(() => {
    return notifications.value.filter(n => !n.isRead && n.type === 'CUSTOM' && n.data?.type === 'TASK_UPDATE').length;
  });

  /**
   * Obtenir le nombre de notifications non lues pour tous les messages privés
   */
  const getUnreadCountForDMs = computed(() => {
    return notifications.value.filter(n => !n.isRead && n.type === 'MESSAGE' && n.data?.dmUserId).length;
  });

  // ==================== RETURN ====================

  return {
    // State
    notifications,
    permission,
    isGranted,
    unreadCount,
    isInitialized,
    getUnreadNotifications,
    getReadNotifications,
    getNotificationsByType,
    getUnreadCountByType,
    getUnreadCountBySpaceId,
    getUnreadCountByThreadId,
    getUnreadCountByDMUserId,
    getUnreadCountForTasks,
    getUnreadCountForDMs,

    // Méthodes
    init,
    loadNotifications,
    loadMoreNotifications,
    requestPermission,
    sendNotification,
    markAsRead,
    markThreadAsRead,
    markDMAsRead,
    markTasksAsRead,
    markAllAsRead,
    removeNotification,
    setupWebSocketListeners,
    showToastNotification,
    handleNotificationClick,

    // Services plateforme
    initPlatformServices,
    initFCMService,
    initCapacitorService,
    initTauriService
  };
}

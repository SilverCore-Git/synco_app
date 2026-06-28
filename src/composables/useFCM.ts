import { ref, onMounted, onUnmounted } from 'vue';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import { initializeFirebase, isFirebaseConfigured, getVapidKey, getFirebaseMessaging } from '../config/firebase';
import { useUserStore } from '../stores/user';
import { useNotification } from './useNotification';
import sfetch from '../assets/utils/sfetch';
import type { AppNotification } from './useNotification';

/**
 * Composable pour gérer Firebase Cloud Messaging (FCM) pour le web
 * Permet de recevoir des notifications push même quand l'onglet est fermé
 */
export function useFCM() {
  const userStore = useUserStore();
  const { sendNotification, markAsRead } = useNotification();
  
  // State
  const fcmToken = ref<string | null>(null);
  const isSupported = ref<boolean>(false);
  const isRegistered = ref<boolean>(false);
  const error = ref<string | null>(null);
  const isLoading = ref<boolean>(false);

  // Vérifier si FCM est supporté
  const checkSupport = (): boolean => {
    return 'firebase' in window && 
           'serviceWorker' in navigator && 
           'PushManager' in window &&
           isFirebaseConfigured();
  };

  /**
   * Demander la permission et s'enregistrer pour les notifications push
   */
  const registerForPushNotifications = async (): Promise<string | null> => {
    if (!checkSupport()) {
      error.value = 'FCM is not supported in this browser';
      isSupported.value = false;
      return null;
    }

    isSupported.value = true;
    isLoading.value = true;
    error.value = null;

    try {
      // Initialiser Firebase
      initializeFirebase();
      const messaging = getFirebaseMessaging();
      
      if (!messaging) {
        throw new Error('Firebase Messaging not initialized');
      }

      // Demander la permission
      const permission = await Notification.requestPermission();
      
      if (permission !== 'granted') {
        throw new Error('Notification permission denied');
      }

      // Obtenir le token FCM
      const vapidKey = getVapidKey();
      if (!vapidKey) {
        throw new Error('VAPID key is required');
      }

      const token = await getToken(messaging, {
        vapidKey: vapidKey
      });

      if (!token) {
        throw new Error('No FCM token received');
      }

      // Sauvegarder le token
      fcmToken.value = token;
      
      // Enregistrer le token sur le serveur backend
      if (userStore.user?.id) {
        await registerTokenOnServer(token);
      }

      isRegistered.value = true;
      isLoading.value = false;
      
      return token;

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      error.value = errorMessage;
      isRegistered.value = false;
      isLoading.value = false;
      console.error('[FCM] Registration error:', err);
      return null;
    }
  };

  /**
   * Enregistrer le token FCM sur le serveur backend
   */
  const registerTokenOnServer = async (token: string): Promise<boolean> => {
    try {
      if (!userStore.user?.id) {
        console.warn('[FCM] No user ID, cannot register token on server');
        return false;
      }

      // Enregistrer le token via l'API
      await sfetch('/api/notifications/tokens', {
        method: 'POST',
        body: JSON.stringify({
          token: token,
          platform: 'fcm',
          deviceId: generateDeviceId(),
          deviceInfo: getDeviceInfo()
        })
      });

      return true;
    } catch (err) {
      console.error('[FCM] Failed to register token on server:', err);
      return false;
    }
  };

  /**
   * Générer un ID unique pour le device
   */
  const generateDeviceId = (): string => {
    const existingId = localStorage.getItem('fcm-device-id');
    if (existingId) {
      return existingId;
    }

    const newId = crypto.randomUUID();
    localStorage.setItem('fcm-device-id', newId);
    return newId;
  };

  /**
   * Obtenir les infos du device
   */
  const getDeviceInfo = () => {
    return {
      os: 'Web',
      version: navigator.userAgent,
      browser: navigator.userAgent,
      platform: navigator.platform
    };
  };

  /**
   * Désenregistrer le token FCM
   */
  const unregister = async (): Promise<boolean> => {
    try {
      if (!fcmToken.value) {
        return false;
      }

      // Supprimer le token du serveur
      const tokensResponse = await sfetch('/api/notifications/tokens');
      const tokens = await tokensResponse.json() as { tokens: Array<{ id: string; token: string }> };
      
      const tokenToDelete = tokens.tokens.find(t => t.token === fcmToken.value);
      if (tokenToDelete) {
        await sfetch(`/api/notifications/tokens/${tokenToDelete.id}`, {
          method: 'DELETE'
        });
      }

      // Révoquer le token localement
      const messaging = getFirebaseMessaging();
      if (messaging) {
        // Note: Firebase ne fournit pas de méthode directe pour supprimer un token
        // On peut juste le désenregistrer localement
        fcmToken.value = null;
        isRegistered.value = false;
      }

      return true;
    } catch (err) {
      console.error('[FCM] Failed to unregister:', err);
      return false;
    }
  };

  /**
   * Écouter les messages FCM en foreground (quand l'app est ouverte)
   */
  const setupForegroundMessageHandler = (): void => {
    const messaging = getFirebaseMessaging();
    if (!messaging) {
      console.warn('[FCM] Messaging not initialized');
      return;
    }

    onMessage(messaging, (payload) => {
      console.log('[FCM] Message received in foreground:', payload);

      const notification = {
        id: payload.data?.id || crypto.randomUUID(),
        userId: userStore.user?.id || '',
        type: payload.data?.type as any || 'CUSTOM',
        title: payload.notification?.title || payload.data?.title || 'Nouvelle notification',
        body: payload.notification?.body || payload.data?.body || 'Vous avez une nouvelle notification',
        data: payload.data,
        isRead: false,
        createdAt: new Date().toISOString(),
        timestamp: new Date().toISOString()
      };

      // Afficher la notification via le système de notifications
      // Note: En foreground, on peut aussi afficher une toast
      sendNotification(notification);
    });
  };

  /**
   * Vérifier et rafraîchir le token si nécessaire
   */
  const refreshTokenIfNeeded = async (): Promise<string | null> => {
    const messaging = getFirebaseMessaging();
    if (!messaging) {
      return null;
    }

    // Vérifier si le token a changé
    const vapidKey = getVapidKey();
    if (!vapidKey) {
      return null;
    }

    try {
      const currentToken = await getToken(messaging, { vapidKey });
      
      if (currentToken && currentToken !== fcmToken.value) {
        console.log('[FCM] Token refreshed');
        fcmToken.value = currentToken;
        
        // Mettre à jour le token sur le serveur
        if (userStore.user?.id) {
          await registerTokenOnServer(currentToken);
        }
        
        return currentToken;
      }
      
      return fcmToken.value;
    } catch (err) {
      console.error('[FCM] Failed to refresh token:', err);
      return null;
    }
  };

  /**
   * Initialiser FCM automatiquement
   */
  const init = async (): Promise<void> => {
    if (!checkSupport()) {
      isSupported.value = false;
      return;
    }

    isSupported.value = true;
    
    try {
      // S'enregistrer pour les notifications push
      await registerForPushNotifications();
      
      // Configurer le handler pour les messages foreground
      setupForegroundMessageHandler();
      
      // Vérifier le token périodiquement
      setupTokenRefresh();
    } catch (err) {
      console.error('[FCM] Initialization error:', err);
    }
  };

  /**
   * Configurer le rafraîchissement automatique du token
   */
  const setupTokenRefresh = (): void => {
    // Rafraîchir le token toutes les 24 heures
    const refreshInterval = 24 * 60 * 60 * 1000; // 24 hours
    
    const refreshHandler = async () => {
      await refreshTokenIfNeeded();
    };

    // Premier rafraîchissement après 1 heure
    setTimeout(refreshHandler, 60 * 60 * 1000);
    
    // Puis toutes les 24 heures
    const intervalId = setInterval(refreshHandler, refreshInterval);

    // Nettoyer à la destruction
    onUnmounted(() => {
      clearInterval(intervalId);
    });
  };

  // Auto-initialisation au montage
  onMounted(() => {
    if (checkSupport()) {
      init();
    }
  });

  // Nettoyage à la destruction
  onUnmounted(() => {
    // À implémenter si nécessaire
  });

  return {
    // State
    fcmToken,
    isSupported,
    isRegistered,
    error,
    isLoading,

    // Méthodes
    checkSupport,
    registerForPushNotifications,
    unregister,
    registerTokenOnServer,
    refreshTokenIfNeeded,
    init,
    setupForegroundMessageHandler
  };
}

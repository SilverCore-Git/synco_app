// Service Worker pour Firebase Messaging
// Gère les notifications push quand l'onglet est fermé

importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

// Ce fichier vit dans public/ et n'est pas traité par Vite : import.meta.env
// n'existe pas ici, donc la config ne peut pas être injectée au build. Avant
// ce correctif `self.importScripts['FIREBASE_API_KEY']` indexait la fonction
// importScripts elle-même (toujours undefined) — la config était donc
// systématiquement vide et le SW était enregistré pour tout le monde sans
// jamais fonctionner (audit FX10). La config (non secrète côté web — une clé
// API Firebase web est un identifiant public, protégé par les règles
// Firebase/App Check, pas un secret) est maintenant passée en query string
// lors de l'enregistrement (voir main.ts), lu ici via self.location.
const params = new URL(self.location.href).searchParams;
const firebaseConfig = {
  apiKey: params.get('apiKey') || '',
  authDomain: params.get('authDomain') || '',
  projectId: params.get('projectId') || '',
  storageBucket: params.get('storageBucket') || '',
  messagingSenderId: params.get('messagingSenderId') || '',
  appId: params.get('appId') || ''
};

const isConfigured = !!(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.messagingSenderId);

if (isConfigured) {
  firebase.initializeApp(firebaseConfig);
  const messaging = firebase.messaging();

  // Gestionnaire des messages en arrière-plan
  messaging.onBackgroundMessage((payload) => {
    console.log('[firebase-messaging-sw.js] Received background message ', payload);

    // Personnaliser l'affichage de la notification
    const notificationTitle = payload.notification?.title || payload.data?.title || 'Nouvelle notification';
    const notificationOptions = {
      body: payload.notification?.body || payload.data?.body || 'Vous avez une nouvelle notification',
      icon: payload.notification?.icon || payload.data?.icon || '/favicon.ico',
      badge: payload.notification?.badge || payload.data?.badge || '/favicon.ico',
      image: payload.notification?.image || payload.data?.image,
      data: payload.data || {},
      actions: [
        {
          action: 'open',
          title: 'Ouvrir'
        }
      ]
    };

    // Afficher la notification
    return self.registration.showNotification(notificationTitle, notificationOptions);
  });

  // Écouter les messages foreground (pour le debug)
  // Note: Les messages foreground sont gérés par l'application, pas par le SW
  // Mais on peut les intercepté ici si nécessaire
  messaging.onMessage((payload) => {
    console.log('[firebase-messaging-sw.js] Message received in service worker:', payload);
  });

  console.log('[firebase-messaging-sw.js] Service Worker initialisé');
} else {
  console.warn('[firebase-messaging-sw.js] Configuration Firebase absente (paramètres de requête manquants) — notifications désactivées.');
}

// Résout une cible de notification vers un chemin interne à l'app, ou "/"
// par défaut. Le payload provient du backend Synco (seul détenteur de la clé
// serveur FCM), mais clients.openWindow ne doit pas ouvrir une URL absolue
// arbitraire sans vérifier qu'elle reste sur cette origine (audit FX10).
function resolveSameOriginTarget(raw) {
  try {
    const resolved = new URL(raw || '/', self.location.origin);
    if (resolved.origin === self.location.origin) {
      return resolved.pathname + resolved.search + resolved.hash;
    }
  } catch {
    // URL invalide — repli sur /
  }
  return '/';
}

// Gestionnaire du clic sur la notification
self.addEventListener('notificationclick', (event) => {
  const notification = event.notification;

  // Fermer la notification
  notification.close();

  // Ouvrir l'URL correspondante — le reste de l'app (routes/notifications
  // in-app) utilise la clé `route`, pas `url` : sans ce fallback, cliquer
  // une notification desktop/web n'amenait jamais qu'à la racine de l'app.
  const target = notification.data && (notification.data.route || notification.data.url);
  event.waitUntil(clients.openWindow(resolveSameOriginTarget(target)));
});

// Gestionnaire de l'erreur de push
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    Promise.all([
      Promise.resolve(event.oldSubscription?.unsubscribe()),
      Promise.resolve(event.newSubscription)
    ]).then(() => {
      console.log('[firebase-messaging-sw.js] Push subscription changed');
    })
  );
});

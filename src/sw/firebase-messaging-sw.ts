// Service Worker pour Firebase Messaging : notifications push quand l'onglet est fermé.
//
// Compilé par le plugin firebaseSwPlugin (vite.config.ts) et servi sous
// /firebase-messaging-sw.js. Le SDK Firebase est embarqué dans le bundle : plus aucun
// importScripts() vers gstatic.com, donc plus de script tiers non vérifiable (audit FX10).
//
// La config Firebase (identifiants publics, pas des secrets) est passée en query string à
// l'enregistrement (cf. main.ts) et lue ici via self.location.
import { initializeApp } from 'firebase/app';
import { getMessaging, onBackgroundMessage } from 'firebase/messaging/sw';

const sw = self as unknown as {
  location: Location;
  registration: ServiceWorkerRegistration;
  clients: { openWindow(url: string): Promise<unknown> };
  addEventListener(type: string, listener: (event: any) => void): void;
};

const params = new URL(sw.location.href).searchParams;
const firebaseConfig = {
  apiKey: params.get('apiKey') || '',
  authDomain: params.get('authDomain') || '',
  projectId: params.get('projectId') || '',
  storageBucket: params.get('storageBucket') || '',
  messagingSenderId: params.get('messagingSenderId') || '',
  appId: params.get('appId') || '',
};

const isConfigured = !!(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.messagingSenderId);

if (isConfigured) {
  const messaging = getMessaging(initializeApp(firebaseConfig));

  onBackgroundMessage(messaging, (payload) => {
    const notificationTitle = payload.notification?.title || payload.data?.title || 'Nouvelle notification';
    const notificationOptions = {
      body: payload.notification?.body || payload.data?.body || 'Vous avez une nouvelle notification',
      icon: payload.notification?.icon || payload.data?.icon || '/favicon.ico',
      badge: payload.data?.badge || '/favicon.ico',
      image: payload.notification?.image || payload.data?.image,
      data: payload.data || {},
      actions: [{ action: 'open', title: 'Ouvrir' }],
    };
    return sw.registration.showNotification(notificationTitle, notificationOptions);
  });
} else {
  console.warn('[firebase-messaging-sw] Configuration Firebase absente (paramètres de requête manquants) — notifications désactivées.');
}

// Résout une cible de notification vers un chemin interne à l'app, ou "/" par défaut. Le payload
// vient du backend Synco, mais clients.openWindow ne doit pas ouvrir une URL absolue arbitraire
// sans vérifier qu'elle reste sur cette origine (audit FX10).
function resolveSameOriginTarget(raw: unknown): string {
  try {
    const resolved = new URL(typeof raw === 'string' && raw ? raw : '/', sw.location.origin);
    if (resolved.origin === sw.location.origin) {
      return resolved.pathname + resolved.search + resolved.hash;
    }
  } catch {
    // URL invalide — repli sur /
  }
  return '/';
}

sw.addEventListener('notificationclick', (event) => {
  const notification = event.notification;
  notification.close();

  // Le reste de l'app (routes/notifications in-app) utilise la clé `route`, pas `url`.
  const target = notification.data && (notification.data.route || notification.data.url);
  event.waitUntil(sw.clients.openWindow(resolveSameOriginTarget(target)));
});

sw.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    Promise.all([
      Promise.resolve(event.oldSubscription?.unsubscribe()),
      Promise.resolve(event.newSubscription),
    ])
  );
});

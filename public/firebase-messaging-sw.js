// Service Worker pour Firebase Messaging
// Gère les notifications push quand l'onglet est fermé

importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

// Configuration Firebase - sera injectée lors du build
const firebaseConfig = {
  apiKey: self.importScripts ? self.importScripts['FIREBASE_API_KEY'] : '',
  authDomain: self.importScripts ? self.importScripts['FIREBASE_AUTH_DOMAIN'] : '',
  projectId: self.importScripts ? self.importScripts['FIREBASE_PROJECT_ID'] : '',
  storageBucket: self.importScripts ? self.importScripts['FIREBASE_STORAGE_BUCKET'] : '',
  messagingSenderId: self.importScripts ? self.importScripts['FIREBASE_MESSAGING_SENDER_ID'] : '',
  appId: self.importScripts ? self.importScripts['FIREBASE_APP_ID'] : '',
  measurementId: self.importScripts ? self.importScripts['FIREBASE_MEASUREMENT_ID'] : ''
};

// Initialiser Firebase
const firebaseApp = firebase.initializeApp(firebaseConfig);
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

// Gestionnaire du clic sur la notification
self.addEventListener('notificationclick', (event) => {
  const notification = event.notification;
  const action = event.action;

  // Fermer la notification
  notification.close();

  // Ouvrir l'URL correspondante — le reste de l'app (routes/notifications
  // in-app) utilise la clé `route`, pas `url` : sans ce fallback, cliquer
  // une notification desktop/web n'amenait jamais qu'à la racine de l'app.
  const target = (notification.data && (notification.data.route || notification.data.url));
  if (target) {
    clients.openWindow(target);
  } else {
    // Ouvrir l'application par défaut
    clients.openWindow('/');
  }
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

// Écouter les messages foreground (pour le debug)
// Note: Les messages foreground sont gérés par l'application, pas par le SW
// Mais on peut les intercepté ici si nécessaire
messaging.onMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Message received in service worker:', payload);
});

console.log('[firebase-messaging-sw.js] Service Worker initialisé');

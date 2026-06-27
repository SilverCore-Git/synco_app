# ð Notifications - FCM for Web

> **Projet** : Synco - Système de notifications push
> **Date** : 27 Juin 2026
> **Priorité** : ðððð (Élevée)
> **Statut** : À implémenter
> **Dépendances** : [Composable Vue](./notifications_composable.md)

---

## ð¯ Contexte

Ce document décrit la **configuration FCM pour les navigateurs web** (Chrome, Firefox, Edge). Cela permet d'envoyer des notifications push **même quand l'onglet est fermé** ou que le navigateur est en arrière-plan.

**Fonctionnement** :
```
Backend (Firebase) → FCM → Service Worker → Navigateur → Affichage notification
```

---

## ð¦ Configuration Firebase pour Web

### **1. Installation des packages**

```bash
# Dans synco_app/
npm install firebase @firebase/messaging
```

---

### **2. Configuration Firebase**

Créer le fichier de configuration Firebase :

```typescript
// src/config/firebase.ts
import { initializeApp } from 'firebase/app';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import { env } from '../assets/var';

// Configuration Firebase pour le web
const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
  measurementId: env.VITE_FIREBASE_MEASUREMENT_ID
};

// Initialiser Firebase
let firebaseApp: any = null;
let messaging: any = null;

/**
 * Initialiser Firebase et Messaging
 */
export function initializeFirebase() {
  if (!firebaseApp) {
    firebaseApp = initializeApp(firebaseConfig);
    messaging = getMessaging(firebaseApp);
  }
  return { firebaseApp, messaging };
}

/**
 * Obtenir l'instance Messaging
 */
export function getFirebaseMessaging() {
  if (!messaging) {
    initializeFirebase();
  }
  return messaging;
}

/**
 * Obtenir les fonctions Firebase
 */
export { getToken, onMessage };
```

---

### **3. Variables d'environnement**

Ajouter dans `.env` :

```env
# ============= FIREBASE WEB CONFIGURATION =============
# Récupérer depuis Firebase Console > Project Settings > General > Your apps > Web app

# Clé API
VITE_FIREBASE_API_KEY=AIzaSyAxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Domaine d'authentification
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com

# Identifiant du projet
VITE_FIREBASE_PROJECT_ID=your-project-id

# Bucket de stockage
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com

# ID de l'expéditeur de messages
VITE_FIREBASE_MESSAGING_SENDER_ID=1234567890

# ID de l'application
VITE_FIREBASE_APP_ID=1:1234567890:web:abcdef123456

# ID de mesure (optionnel)
VITE_FIREBASE_MEASUREMENT_ID=G-XXXXXXXX

# Clé VAPID pour les notifications web (à générer dans Firebase Console)
VITE_FIREBASE_VAPID_KEY=BKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# ===========================================================
```

**Comment obtenir ces informations :**
1. Aller sur [Firebase Console](https://console.firebase.google.com/)
2. Sélectionner votre projet
3. Cliquer sur ⚙️ > **Project Settings**
4. Faire défiler vers **Your apps**
5. Cliquer sur **Add app** > **Web** si pas encore ajouté
6. Suivre les instructions et copier la configuration
7. Pour la **VAPID Key** : Aller dans **Cloud Messaging** > **Web configuration** > **Web Push certificates**

---

## ð§ Service Worker

Les notifications push dans le navigateur **nécessitent un Service Worker**. Ce fichier gère les notifications **en arrière-plan** (quand l'onglet est fermé).

### **1. Créer le Service Worker**

```javascript
// public/firebase-messaging-sw.js
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

// Configuration Firebase (doit correspondre à celle dans src/config/firebase.ts)
const firebaseConfig = {
  apiKey: self.importScripts ? self.importScripts['FIREBASE_API_KEY'] : '',
  authDomain: self.importScripts ? self.importScripts['FIREBASE_AUTH_DOMAIN'] : '',
  projectId: self.importScripts ? self.importScripts['FIREBASE_PROJECT_ID'] : '',
  storageBucket: self.importScripts ? self.importScripts['FIREBASE_STORAGE_BUCKET'] : '',
  messagingSenderId: self.importScripts ? self.importScripts['FIREBASE_MESSAGING_SENDER_ID'] : '',
  appId: self.importScripts ? self.importScripts['FIREBASE_APP_ID'] : ''
};

// Initialiser Firebase
const firebaseApp = firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// Enregistrer le service worker pour les notifications en arrière-plan
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);

  // Extraire les données de la notification
  const notificationTitle = payload.notification?.title || 'Synco - Nouvelle notification';
  const notificationOptions = {
    body: payload.notification?.body || 'Vous avez une nouvelle notification',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/badge-72x72.png',
    data: payload.data || {},
    actions: [
      { action: 'open', title: 'Ouvrir' },
      { action: 'close', title: 'Fermer' }
    ]
  };

  // Afficher la notification
  self.registration.showNotification(notificationTitle, notificationOptions);
});

// Gérer le clic sur la notification
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  // Vérifier si l'utilisateur a cliqué sur une action
  if (event.action === 'open') {
    // Ouvrir l'application ou une URL spécifique
    const url = event.notification.data?.url || '/notifications';
    clients.openWindow(url);
  }
});

// Gérer la fermeture de la notification
self.addEventListener('notificationclose', (event) => {
  // Optionnel : marquer la notification comme lue dans le backend
  // (Nécessite de stocker le notificationId dans les données)
});

// Précacher les ressources pour le mode hors ligne (optionnel)
if (self.__WB_MANIFEST) {
  self.addEventListener('install', (event: any) => {
    event.waitUntil(
      caches.open('firebase-assets').then((cache) => {
        return cache.addAll([
          '/icons/icon-192x192.png',
          '/icons/badge-72x72.png'
        ]);
      })
    );
  });
}
```

---

### **2. Passer la configuration au Service Worker**

Pour que le Service Worker ait accès à la configuration Firebase :

```typescript
// src/assets/firebaseInit.ts
import { env } from './var';

/**
 * Enregistrer la configuration Firebase dans le Service Worker
 */
export function registerFirebaseConfigInSW() {
  if ('serviceWorker' in navigator) {
    const script = document.createElement('script');
    script.textContent = `
      self.importScripts = self.importScripts || {};
      self.importScripts['FIREBASE_API_KEY'] = '${env.VITE_FIREBASE_API_KEY}';
      self.importScripts['FIREBASE_AUTH_DOMAIN'] = '${env.VITE_FIREBASE_AUTH_DOMAIN}';
      self.importScripts['FIREBASE_PROJECT_ID'] = '${env.VITE_FIREBASE_PROJECT_ID}';
      self.importScripts['FIREBASE_STORAGE_BUCKET'] = '${env.VITE_FIREBASE_STORAGE_BUCKET}';
      self.importScripts['FIREBASE_MESSAGING_SENDER_ID'] = '${env.VITE_FIREBASE_MESSAGING_SENDER_ID}';
      self.importScripts['FIREBASE_APP_ID'] = '${env.VITE_FIREBASE_APP_ID}';
    `;
    
    // Injecter le script dans le service worker
    // (Cette méthode a des limitations, voir alternative ci-dessous)
  }
}
```

**Alternative recommandée** : Utiliser des variables d'environnement dans le Service Worker via Vite :

```typescript
// vite.config.ts
import { defineConfig, loadEnv } from 'vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  
  return {
    // ...
    define: {
      'import.meta.env.FIREBASE_API_KEY': JSON.stringify(env.VITE_FIREBASE_API_KEY),
      'import.meta.env.FIREBASE_AUTH_DOMAIN': JSON.stringify(env.VITE_FIREBASE_AUTH_DOMAIN),
      'import.meta.env.FIREBASE_PROJECT_ID': JSON.stringify(env.VITE_FIREBASE_PROJECT_ID),
      'import.meta.env.FIREBASE_MESSAGING_SENDER_ID': JSON.stringify(env.VITE_FIREBASE_MESSAGING_SENDER_ID),
      'import.meta.env.FIREBASE_APP_ID': JSON.stringify(env.VITE_FIREBASE_APP_ID),
      'import.meta.env.FIREBASE_VAPID_KEY': JSON.stringify(env.VITE_FIREBASE_VAPID_KEY)
    }
  };
});
```

Puis dans le Service Worker :
```javascript
const firebaseConfig = {
  apiKey: import.meta.env.FIREBASE_API_KEY,
  authDomain: import.meta.env.FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.FIREBASE_PROJECT_ID,
  messagingSenderId: import.meta.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.FIREBASE_APP_ID
};
```

---

## ð¥ Initialisation FCM

Créer un fichier pour initialiser le Service Worker et récupérer le token FCM :

```typescript
// src/assets/firebaseInit.ts
import { getToken, getFirebaseMessaging, onMessage } from '../config/firebase';
import { useNotifications } from '../composables/useNotifications';

/**
 * Enregistrer le Service Worker FCM
 * Doit être appelé après que la permission soit accordée
 */
export async function registerFCMServiceWorker(): Promise<string | null> {
  if (!('serviceWorker' in navigator)) {
    console.warn('[FCM] Service Worker not supported');
    return null;
  }

  if (!('Notification' in window)) {
    console.warn('[FCM] Notifications not supported');
    return null;
  }

  try {
    // Enregistrer le Service Worker
    const registration = await navigator.serviceWorker.register(
      '/firebase-messaging-sw.js',
      { scope: '/' }
    );

    console.log('[FCM] Service Worker registered with scope:', registration.scope);

    // Attendre que le Service Worker soit prêt
    await navigator.serviceWorker.ready;
    console.log('[FCM] Service Worker ready');

    // Demander la permission (déjà faite dans le composable, mais on vérifie)
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.log('[FCM] Notification permission not granted');
      return null;
    }

    // Récupérer le token FCM
    const messaging = getFirebaseMessaging();
    const token = await getToken(messaging, {
      vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
      serviceWorkerRegistration: registration
    });

    if (!token) {
      console.log('[FCM] No token received');
      return null;
    }

    console.log('[FCM] FCM Token:', token.substring(0, 20) + '...');

    // Enregistrer le token dans le backend
    const { registerToken } = useNotifications();
    await registerToken(token, 'fcm', 'web-browser', {
      os: 'Web',
      version: navigator.userAgent,
      model: navigator.platform
    });

    // Écouter les messages en premier plan
    onMessage(messaging, (payload) => {
      console.log('[FCM] Message received in foreground:', payload);
      
      const { showToastNotification } = useNotifications();
      
      // Convertir le payload en notification pour le frontend
      const notification: any = {
        id: Date.now().toString(),
        userId: payload.data?.userId || '',
        type: payload.data?.type || 'CUSTOM',
        title: payload.notification?.title || 'Notification',
        body: payload.notification?.body || 'Nouvelle notification',
        data: payload.data,
        isRead: false,
        isSent: true,
        createdAt: new Date().toISOString(),
        timestamp: new Date().toISOString()
      };

      showToastNotification(notification);
    });

    // Écouter les erreurs de token
    messaging.onTokenRefresh(() => {
      console.log('[FCM] Token refresh');
      // Le token a changé, il faut le réenregistrer
      refreshFCMToken(registration);
    });

    return token;

  } catch (error) {
    console.error('[FCM] Error registering Service Worker:', error);
    return null;
  }
}

/**
 * Rafraîchir le token FCM
 */
async function refreshFCMToken(registration: ServiceWorkerRegistration): Promise<void> {
  try {
    const messaging = getFirebaseMessaging();
    const newToken = await getToken(messaging, {
      vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
      serviceWorkerRegistration: registration
    });

    if (newToken) {
      console.log('[FCM] New token:', newToken.substring(0, 20) + '...');
      
      const { registerToken, listTokens } = useNotifications();
      
      // Désactiver les anciens tokens web pour cet utilisateur
      const tokens = await listTokens();
      for (const token of tokens.filter(t => t.platform === 'fcm' && t.deviceId === 'web-browser')) {
        // Dans une vraie implé, on appellerait /api/notifications/tokens/:id avec DELETE
        // Mais ici on va juste enregistrer le nouveau token
        // Le backend gérera la désactivation des anciens
      }
      
      // Enregistrer le nouveau token
      await registerToken(newToken, 'fcm', 'web-browser', {
        os: 'Web',
        version: navigator.userAgent,
        model: navigator.platform
      });
    }
  } catch (error) {
    console.error('[FCM] Error refreshing token:', error);
  }
}

/**
 * Vérifier si FCM est supporté
 */
export function isFCMSupported(): boolean {
  return 'Notification' in window && 'serviceWorker' in navigator;
}
```

---

## ð Intégration avec le composable

Le composable `useNotifications` appelle déjà `initFCMService()` quand la permission est accordée. Mais on peut l'améliorer :

```typescript
// src/composables/useNotifications.ts (extrait)
const initFCMService = async (): Promise<void> => {
  try {
    const { registerFCMServiceWorker, isFCMSupported } = await import('../assets/firebaseInit');
    
    if (!isFCMSupported()) {
      console.warn('[Notifications] FCM not supported in this browser');
      return;
    }

    await registerFCMServiceWorker();
  } catch (error) {
    console.warn('[Notifications] FCM initialization failed:', error);
  }
};
```

---

## ð Configuration Vite

Ajouter la configuration dans `vite.config.ts` :

```typescript
// vite.config.ts
import { defineConfig, loadEnv } from 'vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  
  return {
    // ...
    
    // Pass through env variables to client
    define: {
      'import.meta.env.VITE_FIREBASE_VAPID_KEY': JSON.stringify(env.VITE_FIREBASE_VAPID_KEY)
    },
    
    // Assurer que le Service Worker est copié
    build: {
      rollupOptions: {
        external: ['firebase/app', 'firebase/messaging']
      }
    },
    
    // Plugins pour copier le Service Worker
    plugins: [
      // ...
    ]
  };
});
```

---

## ð Structure des fichiers

```
synco_app/
├── public/
│   └── firebase-messaging-sw.js    # Service Worker pour FCM
├── src/
│   ├── assets/
│   │   ├── firebase.ts             # Configuration Firebase
│   │   └── firebaseInit.ts         # Initialisation Service Worker
│   ├── composables/
│   │   └── useNotifications.ts     # Composable principal
│   ├── types/
│   │   └── types.ts               # Types TypeScript
│   └── App.vue                    # Intégration
└── .env                           # Variables d'environnement
```

---

## ð Sécurité

### **1. HTTPS obligatoire**
- Les notifications push **nécessitent HTTPS** (sauf localhost)
- Firebase va **bloquer** les requêtes en HTTP
- Utiliser un certificat valide pour le développement

### **2. VAPID Key**
- La clé VAPID identifie votre application auprès des navigateurs
- Elle est **publique** et peut être incluse dans le frontend
- Ne pas la confondre avec la clé privée Firebase (qui elle est secrète)

### **3. Scope du Service Worker**
- Le Service Worker doit être à la **racine** du domaine (`/`)
- Le fichier doit s'appeler `firebase-messaging-sw.js` ou être configuré correctement

### **4. Validation des tokens**
- Toujours vérifier que le token est valide avant de l'utiliser
- Gérer les erreurs de rafraîchissement de token
- Ne pas exposer le token dans les logs

---

## ð§ª Tests à implémenter

1. ✅ Test de l'initialisation Firebase
2. ✅ Test de l'enregistrement du Service Worker
3. ✅ Test de la récupération du token FCM
4. ✅ Test de l'envoi d'une notification en arrière-plan
5. ✅ Test de l'affichage de la notification en premier plan
6. ✅ Test du clic sur la notification
7. ✅ Test du rafraîchissement du token
8. ✅ Test avec permission refusée
9. ✅ Test avec navigateur non compatible

---

## ð¡ Dépannage

### **Problème : Service Worker non enregistré**
**Symptômes** : 
- `ServiceWorker registration failed`
- Le Service Worker n'apparaît pas dans DevTools

**Solutions** :
1. Vérifier que le fichier `firebase-messaging-sw.js` existe dans `/public/`
2. Vérifier que l'URL est correcte : `/firebase-messaging-sw.js`
3. Vérifier que le scope est correct : `{ scope: '/' }`
4. Vérifier qu'il n'y a pas d'erreurs dans le Service Worker

---

### **Problème : Permission refusée**
**Symptômes** :
- `Notification permission denied`
- Les notifications ne s'affichent pas

**Solutions** :
1. Vérifier que l'utilisateur a accordé la permission
2. Vérifier que le site est en HTTPS (sauf localhost)
3. Vérifier qu'il n'y a pas de bloqueur de notifications dans le navigateur
4. Essayer dans un onglet privé (pour éviter les extensions qui bloquent)

---

### **Problème : Token non reçu**
**Symptômes** :
- `No token received` ou token est `null`
- Les notifications ne sont pas envoyées

**Solutions** :
1. Vérifier que la permission est accordée
2. Vérifier que le Service Worker est bien enregistré
3. Vérifier que la VAPID Key est correcte
4. Vérifier que Firebase est bien configuré
5. Essayer avec un projet Firebase différent

---

### **Problème : Notifications non affichées**
**Symptômes** :
- Le token est valide mais les notifications ne s'affichent pas
- Les notifications apparaissent dans la console Firebase mais pas dans le navigateur

**Solutions** :
1. Vérifier que le payload contient bien `notification` (et pas seulement `data`)
2. Vérifier que le navigateur supporte les notifications
3. Vérifier qu'il n'y a pas de bloqueur (uBlock Origin, etc.)
4. Tester avec un payload simple : `{ notification: { title: 'Test', body: 'Test' } }`

---

### **Problème : Notifications en double**
**Symptômes** :
- Les notifications s'affichent deux fois

**Solutions** :
1. Vérifier que le Service Worker et le code frontend ne gèrent pas la même notification
2. Utiliser un système de déduplication (ex: vérifier `notification.id`)
3. Dans le composable, vérifier que la notification n'existe pas déjà avant de l'ajouter

---

## ð Conseils

1. **Tester sur Chrome** : Les notifications push sont les mieux supportées sur Chrome
2. **Utiliser localhost** : Pour le développement, `http://localhost` fonctionne sans HTTPS
3. **Vérifier DevTools** :
   - Application > Service Workers (pour voir le Service Worker)
   - Application > Notifications (pour tester manuellement)
   - Console (pour les erreurs)
4. **Tester avec Firebase Console** :
   - Aller dans Cloud Messaging
   - Envoyer une notification test à votre token
5. **Gérer les erreurs** : Toujours catcher les erreurs, surtout pour FCM

---

## ð Liens utiles

- [Firebase Cloud Messaging Documentation](https://firebase.google.com/docs/cloud-messaging)
- [Firebase Web Setup](https://firebase.google.com/docs/web/setup)
- [MDN - Service Workers](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)
- [MDN - Notifications API](https://developer.mozilla.org/en-US/docs/Web/API/Notification)
- [Firebase Messaging API Reference](https://firebase.google.com/docs/reference/js/v8/firebase.messaging)

---

## ð Checklist d'implémentation

- [ ] Ajouter `firebase` et `@firebase/messaging` dans `package.json`
- [ ] Créer `src/config/firebase.ts` avec la configuration Firebase
- [ ] Ajouter les variables d'environnement dans `.env`
- [ ] Créer `public/firebase-messaging-sw.js` (Service Worker)
- [ ] Créer `src/assets/firebaseInit.ts` pour l'initialisation
- [ ] Configurer Vite pour passer les variables Firebase
- [ ] Intégrer avec le composable `useNotifications`
- [ ] Tester l'enregistrement du Service Worker
- [ ] Tester la récupération du token
- [ ] Tester l'envoi d'une notification
- [ ] Tester le clic sur une notification
- [ ] Vérifier la sécurité (HTTPS, permissions, etc.)

---

> **â ï¸ IMPORTANT** : Les notifications FCM Web **nécessitent HTTPS** en production. Utiliser un certificat valide pour le développement.

---

*Document généré pour le projet Synco - 27 Juin 2026*
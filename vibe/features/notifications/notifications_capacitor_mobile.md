# 📱 Notifications - Capacitor Mobile (Android & iOS)

> **Projet** : Synco - Système de notifications push
> **Date** : 27 Juin 2026
> **Priorité** : ⭐⭐⭐⭐⭐ (Critique - Mobile)
> **Statut** : À implémenter
> **Dépendances** : [Composable Vue](./notifications_composable.md)

---

## 🎯 Contexte

Ce document décrit la **configuration Capacitor** pour les notifications push **Android** et **iOS**. Capacitor permet d'emballer l'application Vue comme une application mobile native.

**Fonctionnement** :
```
Backend → FCM/APNS → Device → Capacitor Plugin → JavaScript → Composable
```

**Priorité** : Les notifications mobile sont **critiques** pour l'expérience utilisateur. Android utilise **FCM** et iOS utilise **APNS** via Capacitor.

---

## 📦 Installation

### **1. Installer le plugin Capacitor Push Notifications**

```bash
# Dans synco_app/
npm install @capacitor/push-notifications @capacitor/core
npx cap sync
```

---

### **2. Installer Capacitor (si pas déjà installé)**

```bash
# Installer Capacitor CLI
npm install -D @capacitor/cli @capacitor/core

# Initialiser Capacitor
npx cap init
```

**Configuration Capacitor** (`capacitor.config.ts`) :

```typescript
// capacitor.config.ts
import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.synco.app',
  appName: 'synco',
  webDir: 'dist',
  server: {
    cleartext: false,
    androidScheme: 'https'
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert']
    }
  }
};

export default config;
```

---

## 🤖 Configuration Android

### **1. Ajouter Firebase à l'application Android**

#### a. Récupérer `google-services.json`

1. Aller sur [Firebase Console](https://console.firebase.google.com/)
2. Sélectionner votre projet
3. Cliquer sur **Add app** > **Android**
4. Entrer :
   - **Android package name** : `com.synco.app` (doit correspondre à `appId` dans capacitor.config.ts)
   - **SHA-1** : Obtenir avec `keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android`
5. Télécharger `google-services.json`
6. Placer le fichier dans `android/app/google-services.json`

#### b. Modifier `android/app/build.gradle`

```gradle
// android/app/build.gradle
plugins {
  id 'com.android.application'
  id 'org.jetbrains.kotlin.android'
  id 'com.google.gms.google-services' // Ajouter cette ligne
}

dependencies {
  implementation fileTree(dir: 'libs', include: ['*.jar'])
  implementation project(':capacitor-cordova-android-plugins')
  
  // Ajouter Firebase
  implementation platform('com.google.firebase:firebase-bom:32.7.0')
  implementation 'com.google.firebase:firebase-analytics-ktx'
  implementation 'com.google.firebase:firebase-messaging-ktx'
}
```

#### c. Modifier `android/build.gradle`

```gradle
// android/build.gradle
buildscript {
  dependencies {
    classpath 'com.google.gms:google-services:4.4.0' // Ajouter cette ligne
  }
}
```

---

### **2. Configurer le Manifest Android**

Ajouter dans `android/app/src/main/AndroidManifest.xml` :

```xml
<!-- Dans la balise <application> -->
<application
  android:name=".MainApplication"
  ...>
  
  <!-- Service pour Firebase Messaging -->
  <service
    android:name=".MyFirebaseMessagingService"
    android:exported="false">
    <intent-filter>
      <action android:name="com.google.firebase.MESSAGING_EVENT" />
    </intent-filter>
  </service>
  
  <!-- Permissions -->
  <uses-permission android:name="android.permission.INTERNET" />
  <uses-permission android:name="android.permission.VIBRATE" />
  <uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
  <uses-permission android:name="android.permission.WAKE_LOCK" />
  
  <!-- Notification channels (Android 8.0+) -->
  <meta-data
    android:name="com.google.firebase.messaging.default_notification_channel_id"
    android:value="@string/default_notification_channel_id" />
</application>
```

---

### **3. Créer le Service Firebase Messaging**

Créer le fichier `android/app/src/main/java/com/synco/app/MyFirebaseMessagingService.java` :

```java
package com.synco.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.os.Build;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

public class MyFirebaseMessagingService extends FirebaseMessagingService {

    private static final String TAG = "SyncoFCM";
    private static final String CHANNEL_ID = "synco_notifications";

    @Override
    public void onNewToken(@NonNull String token) {
        super.onNewToken(token);
        Log.d(TAG, "Refreshed token: " + token);
        
        // Envoyer le token au backend
        // Note: Dans Capacitor, le token sera aussi récupéré côté JS
        // mais c'est une bonne pratique de l'envoyer depuis ici aussi
    }

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        super.onMessageReceived(remoteMessage);
        
        Log.d(TAG, "Message received: " + remoteMessage);

        // Extraire les données
        String title = remoteMessage.getNotification() != null
            ? remoteMessage.getNotification().getTitle()
            : "Nouvelle notification";
        String body = remoteMessage.getNotification() != null
            ? remoteMessage.getNotification().getBody()
            : "Vous avez une nouvelle notification";

        // Afficher la notification
        showNotification(title, body, remoteMessage.getData());
    }

    private void showNotification(String title, String body, java.util.Map<String, String> data) {
        NotificationManager notificationManager =
            (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);

        // Créer le channel de notification (requis pour Android 8.0+)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Synco Notifications",
                NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription("Notifications Synco");
            channel.setShowBadge(true);
            channel.enableLights(true);
            channel.enableVibration(true);
            notificationManager.createNotificationChannel(channel);
        }

        // Builder de notification
        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(body)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true);

        // Ajouter les données comme extras (optionnel)
        if (data != null && !data.isEmpty()) {
            for (String key : data.keySet()) {
                builder.addExtrasBundleKey(key);
            }
        }

        // Afficher la notification
        notificationManager.notify(1, builder.build());
    }
}
```

---

### **4. Modifier MainActivity.java**

```java
// android/app/src/main/java/com/synco/app/MainActivity.java
package com.synco.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Plugin;
import java.util.ArrayList;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);

    // Register the plugin
    this.init(savedInstanceState, new ArrayList<Class<? extends Plugin>>() {{
      add(com.getcapacitor.plugin.PushNotifications.class);
    }});
  }
}
```

---

### **5. Créer les ressources Android**

#### a. Icône de notification
Placer une icône dans `android/app/src/main/res/drawable/` :
- `ic_notification.png` (recommandé : 24x24, blanc sur transparent)

#### b. Chaîne de caractères
Ajouter dans `android/app/src/main/res/values/strings.xml` :

```xml
<resources>
    <string name="default_notification_channel_id">synco_notifications</string>
</resources>
```

---

## 🍎 Configuration iOS

### **1. Configurer l'App ID dans Apple Developer Portal**

1. Aller sur [Apple Developer Portal](https://developer.apple.com/account/)
2. Aller dans **Certificates, Identifiers & Profiles**
3. Sélectionner votre **App ID** (ex: `com.synco.app`)
4. Vérifier que **Push Notifications** est activé
5. Activer **Background Modes** > **Remote notifications**

### **2. Créer un Provisioning Profile**

1. Aller dans **Profiles**
2. Cliquer sur **+** pour créer un nouveau profile
3. Sélectionner **App ID** avec Push Notifications activé
4. Sélectionner le **Development Certificate** (pour le dev)
5. Sélectionner les devices de test
6. Donner un nom (ex: `Synco Dev Profile`)
7. Télécharger le profile `.mobileprovision`

---

### **3. Configurer dans Xcode**

1. Ouvrir le projet iOS dans Xcode :
   ```bash
   npx cap open ios
   ```

2. Aller dans **Signing & Capabilities**
3. Sélectionner le **Team**
4. Ajouter le **Provisioning Profile** téléchargé
5. Vérifier que **Push Notifications** est activé
6. Ajouter **Background Modes** > **Remote notifications**

---

### **4. Configurer AppDelegate.swift**

Modifier `ios/App/App/AppDelegate.swift` :

```swift
// ios/App/App/AppDelegate.swift
import UIKit
import Capacitor
import FirebaseMessaging
import UserNotifications

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Override point for customization after application launch.
        
        // Firebase
        FirebaseApp.configure()
        
        // Notifications
        UNUserNotificationCenter.current().delegate = self as? UNUserNotificationCenterDelegate
        
        let authOptions: UNAuthorizationOptions = [.alert, .badge, .sound]
        UNUserNotificationCenter.current().requestAuthorization(
          options: authOptions,
          completionHandler: { granted, error in
            if granted {
              DispatchQueue.main.async {
                application.registerForRemoteNotifications()
              }
            }
          }
        )

        // Capacitor
        return super.application(application, didFinishLaunchingWithOptions: launchOptions)
    }

    func application(_ application: UIApplication,
                     didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        Messaging.messaging().apnsToken = deviceToken
        super.application(application, didRegisterForRemoteNotificationsWithDeviceToken: deviceToken)
    }

    func application(_ application: UIApplication,
                     didFailToRegisterForRemoteNotificationsWithError error: Error) {
        print("Failed to register for notifications: ", error)
    }
}

// Extension pour UNUserNotificationCenterDelegate
extension AppDelegate: UNUserNotificationCenterDelegate {
    func userNotificationCenter(_ center: UNUserNotificationCenter,
                              willPresent notification: UNNotification,
                              withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .sound, .badge])
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter,
                              didReceive response: UNNotificationResponse,
                              withCompletionHandler completionHandler: @escaping () -> Void) {
        completionHandler()
    }
}

// Extension pour MessagingDelegate
extension AppDelegate: MessagingDelegate {
    func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
        print("Firebase registration token: ", fcmToken ?? "")
        // Le token sera aussi récupéré côté JS
    }

    func messaging(_ messaging: Messaging, didRefreshRegistrationToken fcmToken: String) {
        print("Firebase token refreshed: ", fcmToken)
    }
}
```

---

## 🔌 Initialisation côté JavaScript

Créer le fichier d'initialisation Capacitor :

```typescript
// src/assets/capacitorInit.ts
import { PushNotifications } from '@capacitor/push-notifications';
import { useNotifications } from '../composables/useNotifications';

/**
 * Initialiser les notifications push Capacitor
 */
export async function initCapacitorPushNotifications(): Promise<void> {
  if (!('PushNotifications' in window)) {
    console.warn('[Capacitor] Push Notifications plugin not available');
    return;
  }

  try {
    // Demander la permission
    const { permission } = await PushNotifications.requestPermissions();

    if (permission === 'granted') {
      console.log('[Capacitor] Notification permission granted');

      // Enregistrer pour les notifications push
      await PushNotifications.register();

      // Écouter le token (FCM sur Android, APNS sur iOS)
      PushNotifications.addListener('registration', (token) => {
        console.log('[Capacitor] Registration token: ', token.value);
        registerCapacitorToken(token.value);
      });

      // Écouter les notifications push reçues
      PushNotifications.addListener('pushReceived', (notification) => {
        console.log('[Capacitor] Push received: ', notification);
        handleCapacitorPush(notification);
      });

      // Écouter le clic sur une notification
      PushNotifications.addListener('notificationActionPerformed', (notification) => {
        console.log('[Capacitor] Notification action performed: ', notification);
        handleCapacitorAction(notification);
      });

      // Écouter les erreurs
      PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
        console.log('[Capacitor] Push notification action performed: ', notification);
      });

    } else {
      console.log('[Capacitor] Notification permission denied');
    }

  } catch (error) {
    console.error('[Capacitor] Push Notifications error:', error);
  }
}

/**
 * Enregistrer le token Capacitor dans le backend
 */
async function registerCapacitorToken(token: string): Promise<void> {
  try {
    const { registerToken } = useNotifications();
    
    // Détecter la plateforme
    const platform = isAndroid() ? 'fcm' : 'apns';
    const deviceId = getDeviceId();
    
    await registerToken(token, platform, deviceId, {
      os: isAndroid() ? 'Android' : 'iOS',
      version: getOSVersion(),
      model: getDeviceModel()
    });

    console.log('[Capacitor] Token registered in backend');
  } catch (error) {
    console.error('[Capacitor] Failed to register token:', error);
  }
}

/**
 * Gérer une notification push reçue
 */
function handleCapacitorPush(notification: any): void {
  try {
    const { showToastNotification } = useNotifications();
    
    // Convertir la notification Capacitor en notification app
    const appNotification: any = {
      id: notification.id || Date.now().toString(),
      userId: notification.data?.userId || '',
      type: notification.data?.type || 'CUSTOM',
      title: notification.title || 'Notification',
      body: notification.body || 'Nouvelle notification',
      data: notification.data,
      isRead: false,
      isSent: true,
      createdAt: new Date().toISOString(),
      timestamp: new Date().toISOString()
    };

    showToastNotification(appNotification);
  } catch (error) {
    console.error('[Capacitor] Failed to handle push:', error);
  }
}

/**
 * Gérer une action sur une notification
 */
function handleCapacitorAction(notification: any): void {
  try {
    const { handleNotificationClick } = useNotifications();
    
    // Convertir en notification app
    const appNotification: any = {
      id: notification.notification.id,
      userId: notification.notification.data?.userId || '',
      type: notification.notification.data?.type || 'CUSTOM',
      title: notification.notification.title,
      body: notification.notification.body,
      data: notification.notification.data,
      isRead: false,
      isSent: true,
      createdAt: new Date().toISOString()
    };

    handleNotificationClick(appNotification);
  } catch (error) {
    console.error('[Capacitor] Failed to handle action:', error);
  }
}

/**
 * Utilitaires pour détecter la plateforme
 */
function isAndroid(): boolean {
  return /Android/i.test(navigator.userAgent);
}

function isIOS(): boolean {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function getDeviceId(): string {
  // Essayer de récupérer un ID unique du device
  // Dans une vraie implé, utiliser un package comme uuid
  return 'device-' + Math.random().toString(36).substring(2, 11);
}

function getOSVersion(): string {
  const userAgent = navigator.userAgent;
  
  if (isAndroid()) {
    const match = userAgent.match(/Android\s+([0-9.]+)/);
    return match ? match[1] : 'Unknown';
  }
  
  if (isIOS()) {
    const match = userAgent.match(/OS\s+(\d+_\d+)/);
    return match ? match[1].replace('_', '.') : 'Unknown';
  }
  
  return 'Unknown';
}

function getDeviceModel(): string {
  const userAgent = navigator.userAgent;
  
  if (isAndroid()) {
    const match = userAgent.match(/;\s*([^;)]+)\)|;\s*([^;)]+)\)|Build\/([^;)]+)/);
    return match ? (match[1] || match[2] || match[3] || 'Unknown') : 'Unknown';
  }
  
  if (isIOS()) {
    if (/iPhone/i.test(userAgent)) return 'iPhone';
    if (/iPad/i.test(userAgent)) return 'iPad';
    if (/iPod/i.test(userAgent)) return 'iPod';
  }
  
  return 'Unknown';
}
```

---

## 🔄 Intégration avec le Composable

Le composable `useNotifications` appelle déjà `initCapacitorPushNotifications()` :

```typescript
// src/composables/useNotifications.ts (extrait existant)
const initCapacitorPushNotifications = async (): Promise<void> => {
  try {
    const { initCapacitorPushNotifications: initCap } = await import('../assets/capacitorInit');
    await initCap();
  } catch (error) {
    console.warn('[Notifications] Capacitor Push Notifications not available:', error);
  }
};
```

---

## 📁 Structure des fichiers

```
synco_app/
├── android/                    # Code natif Android
│   ├── app/
│   │   ├── src/main/java/com/synco/app/
│   │   │   ├── MyFirebaseMessagingService.java
│   │   │   └── MainActivity.java
│   │   ├── build.gradle
│   │   └── google-services.json
│   └── build.gradle
├── ios/                       # Code natif iOS
│   └── App/
│       └── AppDelegate.swift
├── capacitor.config.ts         # Configuration Capacitor
├── src/
│   ├── assets/
│   │   └── capacitorInit.ts    # Initialisation Capacitor
│   └── composables/
│       └── useNotifications.ts # Composable principal
└── package.json
```

---

## 🧪 Tests sur appareil réel

### **1. Android**

1. Brancher un appareil Android en mode **développement**
2. Activer **USB Debugging** dans les options développeur
3. Exécuter :
   ```bash
   npx cap sync android
   npx cap run android
   ```
4. Vérifier que l'app s'installe et se lance
5. Vérifier dans les logs (Android Studio > Logcat) que le token FCM est reçu

### **2. iOS**

1. Ouvrir le projet dans Xcode :
   ```bash
   npx cap open ios
   ```
2. Sélectionner votre **Team** et **Provisioning Profile**
3. Brancher un iPhone/iPad
4. Exécuter l'app depuis Xcode (⌘ + R)
5. Vérifier dans la console Xcode que le token APNS est reçu

---

### **3. Envoyer une notification test**

#### Via Firebase Console :
1. Aller sur [Firebase Console](https://console.firebase.google.com/)
2. Sélectionner votre projet
3. Aller dans **Cloud Messaging**
4. Cliquer sur **Send your first message**
5. Entrer :
   - **Title** : Test Synco
   - **Text** : C'est un test de notification
   - **Topic** : (laisser vide)
   - **Device token** : (coller le token récupéré dans les logs)
6. Cliquer sur **Send test message**

#### Via le Backend :
Utiliser l'API ou WebSocket pour envoyer une notification :

```typescript
// Exemple via WebSocket
socket.emit('notification:send', {
  userId: 'votre-user-id',
  type: 'MESSAGE',
  title: 'Test Mobile',
  body: 'Ceci est un test de notification mobile',
  data: {
    threadId: 'test-123'
  }
});
```

---

## 💡 Dépannage

### **Problème : Token FCM non reçu (Android)**

**Symptômes** :
- Pas de logs avec le token
- `onNewToken` n'est pas appelé

**Solutions** :
1. Vérifier que `google-services.json` est dans le bon dossier
2. Vérifier que Firebase est bien initialisé dans `MainActivity`
3. Vérifier que le **package name** correspond
4. Vérifier que les dépendances Firebase sont dans `build.gradle`
5. Essayer sur un appareil physique (pas d'émulateur)
6. Vérifier les permissions dans `AndroidManifest.xml`

---

### **Problème : Token APNS non reçu (iOS)**

**Symptômes** :
- Pas de logs avec le token
- Le provisioning profile n'a pas Push Notifications activé

**Solutions** :
1. Vérifier que l'**App ID** a Push Notifications activé
2. Vérifier que le **Provisioning Profile** inclut Push Notifications
3. Vérifier que le **certificat** est valide
4. Vérifier que `didRegisterForRemoteNotificationsWithDeviceToken` est appelé
5. Essayer sur un appareil physique (pas de simulateur)

---

### **Problème : Notifications ne s'affichent pas**

**Symptômes** :
- Le token est reçu mais les notifications ne s'affichent pas

**Solutions** :
1. Vérifier que la permission est accordée (`permission === 'granted'`)
2. Vérifier que le payload contient bien `notification` (et pas seulement `data`)
3. Vérifier que l'app est en **foreground** (les notifications en arrière-plan nécessitent un Service Worker)
4. Vérifier les logs du device pour les erreurs

---

### **Problème : Notifications en double**

**Symptômes** :
- Les notifications s'affichent deux fois

**Solutions** :
1. Vérifier que le Service Worker et le code natif ne gèrent pas la même notification
2. Utiliser un système de déduplication (ex: vérifier `notification.id`)
3. Dans le composable, vérifier que la notification n'existe pas déjà avant de l'ajouter

---

### **Problème : Badge ne s'affiche pas**

**Symptômes** :
- Le badge de notification ne s'affiche pas sur l'icône de l'app

**Solutions** :
- **Android** : Vérifier que `setShowBadge(true)` est appelé dans le channel
- **iOS** : Vérifier que `badge` est inclus dans le payload
- **Capacitor** : Vérifier que le plugin Push Notifications est bien configuré

---

## 📌 Bonnes pratiques

1. **Tester sur appareils réels** : Les notifications push ne fonctionnent pas sur les émulateurs/simulateurs
2. **Utiliser des tokens de test** : Générer des tokens de développement pour le dev
3. **Gérer les erreurs** : Toujours catcher les erreurs, surtout pour les notifications
4. **Ne pas spammer** : Limiter les notifications pour ne pas énerver les utilisateurs
5. **Demander la permission au bon moment** : Ne pas demander dès le premier lancement
6. **Expliquer l'utilité** : Expliquer pourquoi vous avez besoin des notifications

---

## 🔗 Liens utiles

- [Capacitor Push Notifications Documentation](https://capacitorjs.com/docs/apis/push-notifications)
- [Firebase Cloud Messaging for Android](https://firebase.google.com/docs/cloud-messaging/android/client)
- [Firebase Cloud Messaging for iOS](https://firebase.google.com/docs/cloud-messaging/ios/client)
- [Apple Push Notification Service](https://developer.apple.com/documentation/usernotifications)
- [Android Notifications](https://developer.android.com/guide/topics/ui/notifiers/notifications)

---

## ✅ Checklist d'implémentation

### **Configuration Générale**
- [ ] Ajouter `@capacitor/push-notifications` dans `package.json`
- [ ] Configurer `capacitor.config.ts`
- [ ] Exécuter `npx cap sync`

### **Android**
- [ ] Ajouter Firebase à l'application Android
- [ ] Placer `google-services.json` dans `android/app/`
- [ ] Modifier `android/app/build.gradle`
- [ ] Modifier `android/build.gradle`
- [ ] Configurer `AndroidManifest.xml`
- [ ] Créer `MyFirebaseMessagingService.java`
- [ ] Modifier `MainActivity.java`
- [ ] Ajouter l'icône de notification
- [ ] Ajouter la chaîne de caractères

### **iOS**
- [ ] Configurer l'App ID dans Apple Developer Portal
- [ ] Créer un Provisioning Profile
- [ ] Configurer dans Xcode
- [ ] Modifier `AppDelegate.swift`

### **JavaScript**
- [ ] Créer `src/assets/capacitorInit.ts`
- [ ] Intégrer avec le composable `useNotifications`

### **Tests**
- [ ] Tester sur appareil Android
- [ ] Tester sur appareil iOS
- [ ] Vérifier la réception du token
- [ ] Vérifier l'affichage des notifications
- [ ] Vérifier le clic sur les notifications
- [ ] Vérifier le badge et le son

---

> **⚠️ IMPORTANT** : Les notifications mobile **nécessitent des tests sur appareils réels**. Les émulateurs/simulateurs ne supportent pas toujours les notifications push correctement.

---

*Document généré pour le projet Synco - 27 Juin 2026*
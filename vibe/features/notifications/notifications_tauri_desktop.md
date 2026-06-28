# 💻 Notifications - Tauri Desktop

> **Projet** : Synco - Système de notifications push
> **Date** : 27 Juin 2026
> **Priorité** : ⭐⭐⭐ (Moyenne)
> **Statut** : À implémenter
> **Dépendances** : [Composable Vue](./notifications_composable.md)

---

## 🎯 Contexte

Ce document décrit la **configuration Tauri** pour les notifications **desktop** (Windows, macOS, Linux). Tauri permet d'emballer l'application Vue comme une application desktop native.

**Fonctionnement** :
```
Backend → Tauri Plugin → System Notifications → User
```

**Important** : Tauri utilise les **notifications système natives** de chaque OS. Contrairement à FCM/APNS, il n'y a pas de service externe nécessaire.

**Limitations** :
- ❌ Pas de notifications **push** quand l'app est fermée (contrairement à FCM/APNS)
- ✅ Notifications quand l'app est ouverte/minimisée
- ⚠️ Pas de callback de clic sur toutes les plateformes

---

## 📦 Installation

### **1. Installer le plugin Tauri Notifications**

```bash
# Dans synco_app/
npm install @tauri-apps/plugin-notification
```

---

### **2. Configurer Tauri**

Modifier `tauri.conf.json` :

```json
{
  "tauri": {
    "allowlist": {
      "notification": {
        "all": true
      }
    },
    "plugins": {
      "notification": {
        "allow": true
      }
    },
    "bundle": {
      "macOS": {
        "entitlements": {
          "com.apple.security.cs.allow-unsigned-executable-memory": true
        }
      }
    }
  }
}
```

---

### **3. Enregistrer le plugin dans main.rs**

```rust
// src-tauri/src/main.rs
use tauri::Manager;
use tauri_plugin_notification::NotificationExt;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            // Optionnel : configuration supplémentaire
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

---

## 🎛️ Service Tauri Notifications

Créer un fichier dédié pour gérer les notifications Tauri :

```typescript
// src/assets/tauriNotifications.ts
import { isTauri } from '@tauri-apps/api/core';
import {
  Notification,
  isPermissionGranted,
  requestPermission,
  sendNotification
} from '@tauri-apps/plugin-notification';
import { useNotifications } from '../composables/useNotifications';

/**
 * Initialiser les notifications Tauri
 */
export async function initTauriNotifications(): Promise<void> {
  if (!await isTauri()) {
    console.warn('[Tauri] Not a Tauri application');
    return;
  }

  try {
    // Vérifier et demander la permission
    let permissionGranted = await isPermissionGranted();
    
    if (!permissionGranted) {
      const permission = await requestPermission();
      permissionGranted = permission === 'granted';
    }

    if (permissionGranted) {
      console.log('[Tauri] Notification permission granted');
      
      // Enregistrer un device ID unique pour Tauri
      const deviceId = await getTauriDeviceId();
      const { registerToken } = useNotifications();
      
      await registerToken(deviceId, 'tauri', 'desktop', {
        os: getOS(),
        version: getOSVersion(),
        model: 'Desktop'
      });

      console.log('[Tauri] Device registered for notifications');
    } else {
      console.log('[Tauri] Notification permission denied');
    }

  } catch (error) {
    console.error('[Tauri] Initialization error:', error);
  }
}

/**
 * Obtenir un identifiant unique pour l'installation Tauri
 */
async function getTauriDeviceId(): Promise<string> {
  const { invoke } = await import('@tauri-apps/api/core');
  
  try {
    // Essayer d'obtenir un ID existant ou en générer un
    const deviceId = await invoke<string>('get_device_id');
    return deviceId;
  } catch (error) {
    // Générer un ID unique
    const crypto = await import('crypto');
    const randomBytes = crypto.randomBytes(16).toString('hex');
    return `tauri-${randomBytes}`;
  }
}

/**
 * Obtenir le système d'exploitation
 */
function getOS(): string {
  const { platform } = require('os');
  
  if (platform() === 'win32') return 'Windows';
  if (platform() === 'darwin') return 'macOS';
  if (platform() === 'linux') return 'Linux';
  return 'Unknown';
}

/**
 * Obtenir la version de l'OS
 */
function getOSVersion(): string {
  const { platform, release } = require('os');
  return release();
}

/**
 * Afficher une notification Tauri
 */
export async function showTauriNotification(
  title: string,
  body: string,
  data?: Record<string, any>
): Promise<void> {
  if (!await isTauri()) return;

  try {
    await sendNotification({
      title,
      body,
      // Optionnel : icône
      icon: 'tauri://localhost/icons/icon.png',
      // Optionnel : son
      // sound: 'default'
    });

    // Comme Tauri ne supporte pas les callbacks de clic, 
    // on affiche aussi une toast dans l'app
    const { showToastNotification } = useNotifications();
    showToastNotification({
      id: Date.now().toString(),
      userId: '',
      type: 'CUSTOM',
      title,
      body,
      data,
      isRead: false,
      isSent: true,
      createdAt: new Date().toISOString(),
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[Tauri] Failed to show notification:', error);
  }
}
```

---

## 🔌 Backend Rust (Command pour Device ID)

Ajouter dans `src-tauri/src/main.rs` :

```rust
use tauri::Manager;
use std::sync::Mutex;
use lazy_static::lazy_static;

// Stockage simple des device IDs (pour démo)
lazy_static! {
    static ref DEVICE_IDS: Mutex<std::collections::HashMap<String, String>> = 
        Mutex::new(std::collections::HashMap::new());
}

#[tauri::command]
fn get_device_id() -> String {
    // Dans une vraie implé, utiliser un fichier de config ou un UUID
    // Pour l'instant, retourner un ID basé sur l'application
    "synco-desktop".to_string()
}

#[tauri::command]
fn set_device_id(id: String) {
    let mut ids = DEVICE_IDS.lock().unwrap();
    ids.insert("default".to_string(), id);
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![
            get_device_id,
            set_device_id
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

---

## 🔄 Intégration avec le Composable

Le composable `useNotifications` appelle déjà `initTauriNotifications()` :

```typescript
// src/composables/useNotifications.ts (extrait existant)
const initTauriNotifications = async (): Promise<void> => {
  try {
    const { initTauriNotifications: initTauri } = await import('../assets/tauriNotifications');
    await initTauri();
  } catch (error) {
    console.warn('[Notifications] Tauri notifications not available:', error);
  }
};
```

**Amélioration** : Ajouter un wrapper pour afficher les notifications :

```typescript
// Dans useNotifications.ts, modifier showToastNotification
const showToastNotification = (notification: AppNotification): void => {
  // Afficher via useToast
  toast.show({ ... });
  
  // Afficher aussi via Tauri
  if (isDesktopApp()) {
    showTauriNotification(notification.title, notification.body, notification.data);
  }
};
```

---

## 📦 Dépendances

```bash
# Pour le frontend
npm install @tauri-apps/plugin-notification

# Pour le backend Rust (si nécessaire)
cargo add lazy_static
cargo add tauri-plugin-notification
```

---

## 🧪 Tests

### **1. Tester la permission**
```typescript
const permission = await isPermissionGranted();
console.log('Permission:', permission); // 'granted' | 'denied' | 'default'
```

### **2. Tester une notification simple**
```typescript
await sendNotification({
  title: 'Test Tauri',
  body: 'Ceci est une notification de test'
});
```

### **3. Tester avec des options**
```typescript
await sendNotification({
  title: 'Notification avec icône',
  body: 'Contenu de la notification',
  icon: 'tauri://localhost/icons/icon-192x192.png'
});
```

---

## 💡 Limitations et Workarounds

### **1. Pas de notifications push quand l'app est fermée**

**Problème** : Tauri ne peut pas afficher de notifications quand l'application est complètement fermée.

**Solutions** :
- ✅ Utiliser un **système de polling** au démarrage (charger les notifications non lues)
- ❌ Pas de solution parfaite sans service externe
- ⚠️ **Alternative** : Utiliser FCM pour desktop (mais complexe à configurer)

### **2. Pas de callback de clic**

**Problème** : Tauri ne supporte pas encore les callbacks de clic sur les notifications.

**Workaround** :
```rust
// Dans main.rs - Solution alternative avec événement personnalisé
use tauri::{Manager, Window};

#[tauri::command]
async fn show_notification_with_action(
    window: Window,
    title: String,
    body: String,
    data: serde_json::Value
) {
    let notification = Notification::new(&title)
        .body(&body)
        .icon("tauri://localhost/icons/icon.png");

    window.app_handle().notify(notification).unwrap();
    
    // Émettre un événement personnalisé
    window.emit_all("notification_shown", data).unwrap();
}
```

**Frontend** :
```typescript
// Écouter l'événement
await listen('notification_shown', (event) => {
  console.log('Notification shown:', event.payload);
  // Afficher une toast avec action cliquable
});
```

---

## 🔐 Sécurité

1. **Permissions** : Toujours demander la permission avant d'afficher
2. **Données** : Ne pas inclure d'informations sensibles dans les notifications
3. **Device ID** : Ne pas utiliser d'informations personnelles pour le device ID

---

## 📌 Checklist d'implémentation

### **Backend (Rust)**
- [ ] Ajouter `tauri-plugin-notification` dans `Cargo.toml`
- [ ] Configurer `tauri.conf.json`
- [ ] Enregistrer le plugin dans `main.rs`
- [ ] Ajouter les commands pour device ID

### **Frontend (TypeScript)**
- [ ] Ajouter `@tauri-apps/plugin-notification` dans `package.json`
- [ ] Créer `src/assets/tauriNotifications.ts`
- [ ] Intégrer avec le composable `useNotifications`

### **Tests**
- [ ] Tester sur Windows
- [ ] Tester sur macOS
- [ ] Tester sur Linux
- [ ] Vérifier l'affichage des notifications
- [ ] Vérifier les permissions

---

## 🔗 Liens utiles

- [Tauri Notifications Plugin](https://github.com/tauri-apps/plugins/tree/dev/plugins/notification)
- [Tauri Documentation](https://tauri.app/v2/)
- [System Notifications API](https://developer.mozilla.org/en-US/docs/Web/API/Notification)

---

> **⚠️ IMPORTANT** : Tauri est **complémentaire** aux notifications Web (FCM). Pour une expérience optimale, combiner Tauri (quand l'app est ouverte) avec FCM Web (pour les notifications push même quand l'onglet est fermé).

---

*Document généré pour le projet Synco - 27 Juin 2026*
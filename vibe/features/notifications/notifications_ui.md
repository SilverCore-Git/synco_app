# 🎨 Notifications - UI Components

> **Projet** : Synco - Système de notifications push
> **Date** : 27 Juin 2026
> **Priorité** : ⭐⭐⭐⭐ (Élevée)
> **Statut** : À implémenter
> **Dépendances** : [Composable Vue](./notifications_composable.md)

---

## 🎯 Contexte

Ce document décrit les **composants Vue** pour l'affichage des notifications dans l'application Synco. Ces composants fournissent une interface utilisateur cohérente pour :
- Afficher les notifications en temps réel
- Gérer l'historique des notifications
- Naviguer vers les ressources associées

---

## 📦 Structure des composants

```
synco_app/src/components/common/
├── NotificationCenter.vue      # Centre de notifications (dropdown)
├── NotificationItem.vue        # Notification individuelle
├── NotificationToast.vue       # Toast notification temporaire
└── NotificationContainer.vue   # Conteneur pour les toasts
```

---

## 🎨 1. NotificationCenter.vue

Composant principal du centre de notifications (dropdown).

```vue
<!-- src/components/common/NotificationCenter.vue -->
<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { useNotifications } from '../../composables/useNotifications';
import NotificationItem from './NotificationItem.vue';

const { 
  notifications, 
  unreadCount, 
  loadNotifications, 
  markAllAsRead,
  isInitialized 
} = useNotifications();

const isOpen = ref(false);
const dropdownRef = ref<HTMLElement | null>(null);

// Charger les notifications à l'ouverture
const toggleCenter = async () => {
  isOpen.value = !isOpen.value;
  if (isOpen.value && isInitialized.value) {
    await loadNotifications();
  }
};

// Fermer si clic en dehors
const handleClickOutside = (event: MouseEvent) => {
  if (dropdownRef.value && !dropdownRef.value.contains(event.target as Node)) {
    isOpen.value = false;
  }
};

// Gérer le scroll infini
const handleScroll = async (event: Event) => {
  const target = event.target as HTMLElement;
  if (target.scrollTop + target.clientHeight >= target.scrollHeight - 100) {
    // Charger plus de notifications
    await loadNotifications(20, notifications.value.length);
  }
};

onMounted(() => {
  document.addEventListener('click', handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside);
});
</script>

<template>
  <div class="notification-center" ref="dropdownRef">
    <!-- Bouton du centre de notifications -->
    <button 
      @click="toggleCenter"
      class="notification-button"
      aria-label="Notifications"
      :class="{ 'has-unread': unreadCount > 0 }"
    >
      <svg class="notification-icon" viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
        <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2zm-6-7h2v2h-2v-2z"/>
      </svg>
      <span v-if="unreadCount > 0" class="notification-badge">
        {{ unreadCount > 99 ? '99+' : unreadCount }}
      </span>
    </button>

    <!-- Dropdown -->
    <Transition name="fade">
      <div 
        v-if="isOpen" 
        class="notification-dropdown"
        @click.stop
      >
        <div class="notification-header">
          <h3 class="notification-title">Notifications</h3>
          <button 
            v-if="unreadCount > 0"
            @click="markAllAsRead"
            class="mark-all-button"
          >
            Tout marquer comme lu
          </button>
        </div>
        
        <div 
          class="notification-list"
          @scroll="handleScroll"
        >
          <NotificationItem 
            v-for="notification in notifications" 
            :key="notification.id" 
            :notification="notification"
          />
          
          <div v-if="notifications.length === 0" class="notification-empty">
            <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
            <p>Aucune notification</p>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.notification-center {
  position: relative;
  display: inline-block;
}

.notification-button {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  cursor: pointer;
  padding: 8px;
  color: var(--text-primary);
  border-radius: 8px;
  transition: background-color 0.2s ease;
}

.notification-button:hover {
  background-color: var(--bg-secondary);
}

.notification-button.has-unread {
  background-color: rgba(63, 102, 245, 0.1);
}

.notification-icon {
  width: 24px;
  height: 24px;
}

.notification-badge {
  position: absolute;
  top: 4px;
  right: 4px;
  background: var(--color-primary);
  color: white;
  border-radius: 50%;
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 600;
  line-height: 1;
}

.notification-dropdown {
  position: absolute;
  right: 0;
  top: calc(100% + 8px);
  width: 380px;
  max-height: 500px;
  overflow-y: auto;
  background: var(--bg-primary);
  border: 1px solid var(--border-primary);
  border-radius: 12px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
  z-index: 1000;
  animation: slideDown 0.2s ease-out;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes fade {
  from { opacity: 0; }
  to { opacity: 1; }
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.notification-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-primary);
}

.notification-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.mark-all-button {
  background: none;
  border: none;
  color: var(--color-primary);
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  padding: 4px 8px;
  border-radius: 4px;
  transition: background-color 0.2s;
}

.mark-all-button:hover {
  background: var(--bg-secondary);
}

.notification-list {
  padding: 8px 0;
  max-height: 400px;
  overflow-y: auto;
}

.notification-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  color: var(--text-secondary);
  text-align: center;
}

.empty-icon {
  width: 48px;
  height: 48px;
  margin-bottom: 12px;
  opacity: 0.5;
}

.notification-empty p {
  margin: 0;
  font-size: 14px;
}

@media (max-width: 768px) {
  .notification-dropdown {
    width: 100vw;
    max-width: 100%;
    margin-top: 0;
    border-radius: 0 0 12px 12px;
    box-shadow: 0 5px 20px rgba(0, 0, 0, 0.1);
  }
  
  .notification-button {
    padding: 12px;
  }
}
</style>
```

---

## 🎨 2. NotificationItem.vue

Composant pour afficher une notification individuelle.

```vue
<!-- src/components/common/NotificationItem.vue -->
<script setup lang="ts">
import { useRouter } from 'vue-router';
import type { AppNotification } from '../../types/types';
import { useNotifications } from '../../composables/useNotifications';

const props = defineProps<{
  notification: AppNotification;
}>();

const router = useRouter();
const { markAsRead, handleNotificationClick } = useNotifications();

const getIcon = (type: string) => {
  switch (type) {
    case 'MESSAGE': return '💬';
    case 'CALL': return '📞';
    case 'MENTION': return '🔤';
    case 'INVITATION': return '👥';
    default: return '🔔';
  }
};

const getTypeLabel = (type: string) => {
  switch (type) {
    case 'MESSAGE': return 'Message';
    case 'CALL': return 'Appel';
    case 'MENTION': return 'Mention';
    case 'INVITATION': return 'Invitation';
    default: return 'Notification';
  }
};

const formatTime = (dateString: string) => {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `il y a ${days}j`;
  if (hours > 0) return `il y a ${hours}h`;
  if (minutes > 0) return `il y a ${minutes}min`;
  if (seconds > 30) return `il y a ${seconds}s`;
  return 'à l\'instant';
};

const handleClick = () => {
  handleNotificationClick(props.notification);
};
</script>

<template>
  <div 
    :class="['notification-item', { 'unread': !notification.isRead }]"
    @click="handleClick"
  >
    <div class="notification-icon">
      {{ getIcon(notification.type) }}
    </div>
    
    <div class="notification-content">
      <div class="notification-header">
        <span class="notification-sender" v-if="notification.sender">
          {{ notification.sender.displayName || notification.sender.username }}
        </span>
        <span v-else class="notification-type">
          {{ getTypeLabel(notification.type) }}
        </span>
        <span class="notification-time">
          {{ formatTime(notification.createdAt) }}
        </span>
      </div>
      
      <div class="notification-body">
        {{ notification.body }}
      </div>
      
      <div class="notification-preview" v-if="notification.data">
        <span v-if="notification.data.threadName" class="thread-name">
          {{ notification.data.threadName }}
        </span>
        <span v-if="notification.data.orgName" class="org-name">
          {{ notification.data.orgName }}
        </span>
      </div>
    </div>
    
    <div v-if="!notification.isRead" class="notification-dot" />
  </div>
</template>

<style scoped>
.notification-item {
  display: flex;
  align-items: flex-start;
  padding: 12px 16px;
  cursor: pointer;
  transition: background-color 0.2s ease;
  border-bottom: 1px solid var(--border-secondary);
  position: relative;
}

.notification-item:hover {
  background: var(--bg-secondary);
}

.notification-item.unread {
  background: rgba(0, 0, 0, 0.02);
}

.notification-icon {
  font-size: 20px;
  margin-right: 12px;
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.notification-content {
  flex: 1;
  min-width: 0;
}

.notification-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.notification-sender,
.notification-type {
  font-weight: 600;
  font-size: 14px;
  color: var(--text-primary);
}

.notification-time {
  font-size: 12px;
  color: var(--text-secondary);
  margin-left: 8px;
}

.notification-body {
  font-size: 14px;
  color: var(--text-primary);
  margin-bottom: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.notification-preview {
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.notification-dot {
  position: absolute;
  top: 16px;
  right: 16px;
  width: 8px;
  height: 8px;
  background: var(--color-primary);
  border-radius: 50%;
  flex-shrink: 0;
}
</style>
```

---

## 🎨 3. NotificationToast.vue

Composant pour afficher des notifications toast (temporaires).

```vue
<!-- src/components/common/NotificationToast.vue -->
<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import type { AppNotification } from '../../types/types';
import { useNotifications } from '../../composables/useNotifications';

const props = defineProps<{
  notification: AppNotification;
  duration?: number;
}>();

const emit = defineEmits(['close']);
const isVisible = ref(false);
const progress = ref(0);

const { markAsRead } = useNotifications();

const getToastIcon = (type: string) => {
  switch (type) {
    case 'MESSAGE': return '💬';
    case 'CALL': return '📞';
    case 'MENTION': return '🔤';
    case 'INVITATION': return '👥';
    default: return '🔔';
  }
};

const getToastColor = (type: string) => {
  switch (type) {
    case 'MESSAGE': return 'var(--color-primary)';
    case 'CALL': return 'var(--color-success)';
    case 'MENTION': return 'var(--color-warning)';
    case 'INVITATION': return 'var(--color-info)';
    default: return 'var(--color-primary)';
  }
};

const handleAction = () => {
  markAsRead(props.notification.id);
  emit('close');
  // La navigation est gérée par handleNotificationClick dans le composable
};

// Démarrer le timer de progression
let timer: ReturnType<typeof setInterval>;

onMounted(() => {
  isVisible.value = true;
  
  const step = 100 / ((props.duration || 8000) / 100);
  timer = setInterval(() => {
    progress.value += step;
    if (progress.value >= 100) {
      emit('close');
    }
  }, 100);
});

onUnmounted(() => {
  clearInterval(timer);
});
</script>

<template>
  <Transition name="slide">
    <div 
      v-if="isVisible" 
      class="notification-toast"
      :style="{ '--toast-color': getToastColor(notification.type) }"
    >
      <div class="toast-icon">
        {{ getToastIcon(notification.type) }}
      </div>
      
      <div class="toast-content">
        <div class="toast-title">{{ notification.title }}</div>
        <div class="toast-body">{{ notification.body }}</div>
      </div>
      
      <button class="toast-action" @click="handleAction">
        Voir
      </button>
      
      <button class="toast-close" @click="$emit('close')">
        ×
      </button>
      
      <div class="toast-progress" :style="{ width: progress + '%' }"></div>
    </div>
  </Transition>
</template>

<style scoped>
.notification-toast {
  position: relative;
  display: flex;
  align-items: center;
  padding: 12px 16px;
  margin-bottom: 8px;
  background: var(--bg-primary);
  border-left: 4px solid var(--toast-color);
  border-radius: 0 8px 8px 0;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  min-width: 320px;
  max-width: 400px;
  overflow: hidden;
}

.slide-enter-active,
.slide-leave-active {
  transition: all 0.3s ease;
}

.slide-enter-from {
  transform: translateX(100%);
  opacity: 0;
}

.slide-leave-to {
  transform: translateX(100%);
  opacity: 0;
}

.slide-leave-active {
  position: absolute;
}

.toast-icon {
  font-size: 20px;
  margin-right: 12px;
  display: flex;
  align-items: center;
}

.toast-content {
  flex: 1;
  min-width: 0;
  margin-right: 8px;
}

.toast-title {
  font-weight: 600;
  font-size: 14px;
  color: var(--text-primary);
  margin-bottom: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.toast-body {
  font-size: 13px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.toast-action {
  background: var(--toast-color);
  color: white;
  border: none;
  border-radius: 4px;
  padding: 6px 12px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s;
  margin-right: 4px;
}

.toast-action:hover {
  opacity: 0.9;
}

.toast-close {
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 18px;
  padding: 0;
  line-height: 1;
  transition: color 0.2s;
}

.toast-close:hover {
  color: var(--text-primary);
}

.toast-progress {
  position: absolute;
  bottom: 0;
  left: 0;
  height: 2px;
  background: var(--toast-color);
  opacity: 0.7;
  transition: width 0.1s linear;
}
</style>
```

---

## 🎨 4. NotificationContainer.vue

Conteneur pour gérer l'affichage des notifications toast.

```vue
<!-- src/components/common/NotificationContainer.vue -->
<script setup lang="ts">
import { ref, watch } from 'vue';
import NotificationToast from './NotificationToast.vue';
import { useNotifications } from '../../composables/useNotifications';
import type { AppNotification } from '../../types/types';

const { notifications } = useNotifications();
const toasts = ref<AppNotification[]>([]);

// Filtrer les notifications non lues pour les toasts
const unreadNotifications = ref<AppNotification[]>([]);

// Watcher pour les nouvelles notifications non lues
watch(() => notifications.value, (newNotifications) => {
  const newUnread = newNotifications.filter(
    n => !n.isRead && !toasts.value.some(t => t.id === n.id)
  );
  
  if (newUnread.length > 0) {
    // Ajouter les nouvelles notifications non lues
    toasts.value.unshift(...newUnread);
    // Limiter à 3 toasts maximum
    if (toasts.value.length > 3) {
      toasts.value = toasts.value.slice(0, 3);
    }
  }
}, { deep: true });

// Supprimer un toast
const removeToast = (index: number) => {
  toasts.value.splice(index, 1);
};

// Marquer comme lue quand on clique sur "Voir"
const handleToastAction = (notification: AppNotification) => {
  const { markAsRead } = useNotifications();
  markAsRead(notification.id);
};
</script>

<template>
  <div class="notification-container">
    <NotificationToast
      v-for="(notification, index) in toasts"
      :key="notification.id"
      :notification="notification"
      @close="removeToast(index)"
    />
  </div>
</template>

<style scoped>
.notification-container {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  pointer-events: none;
}

.notification-container > * {
  pointer-events: auto;
}

@media (max-width: 768px) {
  .notification-container {
    top: 16px;
    right: 16px;
    left: 16px;
    align-items: center;
  }
  
  .notification-container > * {
    max-width: calc(100vw - 32px);
  }
}
</style>
```

---

## 🔗 Intégration dans App.vue

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

## 🎨 Styles globaux (optionnel)

Ajouter dans `src/assets/css/main.css` :

```css
/* Variables pour les notifications */
:root {
  --notification-message: var(--color-primary);
  --notification-call: var(--color-success);
  --notification-mention: var(--color-warning);
  --notification-invitation: var(--color-info);
}

/* Animations */
@keyframes slideIn {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
```

---

## 📱 Responsive Design

Tous les composants sont **responsive** et s'adaptent :
- **Desktop** : Dropdown à droite, toasts en haut à droite
- **Mobile** : Dropdown plein écran, toasts centrés

---

## ♿ Accessibilité

- Tous les boutons ont `aria-label`
- Navigation au clavier supportée
- Contraste des couleurs respecté
- `role="status"` pour les notifications

---

## 🧪 Tests à implémenter

1. ✅ Test de l'affichage du NotificationCenter
2. ✅ Test de l'ouverture/fermeture du dropdown
3. ✅ Test du clic sur une notification
4. ✅ Test du marquage comme lue
5. ✅ Test de "Marquer tout comme lu"
6. ✅ Test de l'affichage des toasts
7. ✅ Test du scroll infini
8. ✅ Test du responsive (mobile/desktop)
9. ✅ Test de l'accessibilité

---

## 🔐 Sécurité

1. **XSS** : Toujours utiliser `textContent` ou `v-text` (pas `v-html`)
2. **Validation** : Valider les données avant affichage
3. **Sanitization** : Nettoyer les inputs utilisateur

---

## 📌 Dépendances

- ✅ Vue 3 (déjà présent)
- ✅ TypeScript (déjà présent)
- ✅ Tailwind CSS ou styles personnalisés

---

## 🔗 Liens vers les autres documents

- [Notifications - Vue Composable](./notifications_composable.md)
- [Notifications - FCM Web Configuration](./notifications_fcm_web.md)
- [Notifications - Capacitor Mobile Configuration](./notifications_capacitor_mobile.md)
- [Notifications - Tauri Desktop Configuration](./notifications_tauri_desktop.md)

---

## ✅ Checklist d'implémentation

- [ ] Créer `NotificationCenter.vue`
- [ ] Créer `NotificationItem.vue`
- [ ] Créer `NotificationToast.vue`
- [ ] Créer `NotificationContainer.vue`
- [ ] Intégrer dans `App.vue`
- [ ] Ajouter les styles globaux
- [ ] Tester l'affichage
- [ ] Tester le responsive
- [ ] Tester l'accessibilité

---

> **✨ CONSEIL** : Ces composants sont **réutilisables** pour d'autres fonctionnalités de l'application. Les styles peuvent être adaptés pour correspondre au design system existant de Synco.

---

*Document généré pour le projet Synco - 27 Juin 2026*
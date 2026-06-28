<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { useNotification } from '../../composables/useNotification';
import NotificationItem from './NotificationItem.vue';

const { 
  notifications, 
  unreadCount, 
  loadNotifications, 
  markAllAsRead,
  isInitialized 
} = useNotification();

const isOpen = ref(false);
const dropdownRef = ref<HTMLElement | null>(null);
const isLoading = ref(false);

// Charger les notifications à l'ouverture
const toggleCenter = async () => {
  isOpen.value = !isOpen.value;
  if (isOpen.value && isInitialized.value) {
    isLoading.value = true;
    await loadNotifications();
    isLoading.value = false;
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
    if (!isLoading.value) {
      isLoading.value = true;
      await loadNotifications(20, notifications.value.length);
      isLoading.value = false;
    }
  }
};

// Initialiser les notifications au montage
onMounted(async () => {
  document.addEventListener('click', handleClickOutside);
  if (!isInitialized.value) {
    await useNotification().init();
  }
});

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside);
});

// Marquer tout comme lu
const handleMarkAllAsRead = async () => {
  await markAllAsRead();
};

// Fermer le dropdown
const closeDropdown = () => {
  isOpen.value = false;
};
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
            @click="handleMarkAllAsRead"
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
            @click="closeDropdown"
          />
          
          <div v-if="isLoading" class="notification-loading">
            <div class="spinner"></div>
            <p>Chargement...</p>
          </div>
          
          <div v-if="notifications.length === 0 && !isLoading" class="notification-empty">
            <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
            <p>Aucune notification</p>
          </div>
        </div>
        
        <div class="notification-footer">
          <button @click="closeDropdown" class="close-button">Fermer</button>
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
  background: var(--bg-primary);
  border: 1px solid var(--border-primary);
  border-radius: 12px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.1);
  overflow: hidden;
  z-index: 1000;
  display: flex;
  flex-direction: column;
}

.notification-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid var(--border-primary);
}

.notification-title {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--text-primary);
}

.mark-all-button {
  background: none;
  border: none;
  color: var(--color-primary);
  font-size: 0.875rem;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: background-color 0.2s ease;
}

.mark-all-button:hover {
  background-color: var(--bg-secondary);
}

.notification-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  max-height: 400px;
}

.notification-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 16px;
  color: var(--text-secondary);
}

.spinner {
  width: 20px;
  height: 20px;
  border: 2px solid var(--border-primary);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.notification-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px 16px;
  color: var(--text-secondary);
  text-align: center;
}

.empty-icon {
  width: 48px;
  height: 48px;
  margin-bottom: 8px;
  opacity: 0.5;
}

.notification-footer {
  padding: 12px 16px;
  border-top: 1px solid var(--border-primary);
  display: flex;
  justify-content: flex-end;
}

.close-button {
  background: none;
  border: none;
  color: var(--text-secondary);
  font-size: 0.875rem;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: color 0.2s ease;
}

.close-button:hover {
  color: var(--text-primary);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(10px);
}
</style>

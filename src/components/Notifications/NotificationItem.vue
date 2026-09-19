<script setup lang="ts">
import { computed, type PropType } from 'vue';
import { useNotification } from '../../composables/useNotification';
import type { AppNotification } from '../../composables/useNotification';

const props = defineProps({
  notification: {
    type: Object as PropType<AppNotification>,
    required: true
  }
});

const emit = defineEmits(['click']);

const { markAsRead } = useNotification();

// Les icônes sont maintenant gérées directement dans le template avec v-if

// Obtenir la couleur en fonction du type
const getNotificationColor = (type: string) => {
  switch (type) {
    case 'MESSAGE':
      return 'var(--text-secondary)';
    case 'CALL':
      return 'var(--color-success)';
    case 'MENTION':
      return 'var(--color-warning)';
    case 'INVITATION':
      return 'var(--color-primary)';
    case 'CUSTOM':
    default:
      return 'var(--text-secondary)';
  }
};

// Obtenir la couleur de fond en fonction du type
const getNotificationBgColor = (type: string) => {
  switch (type) {
    case 'MESSAGE':
      return 'rgba(63, 102, 245, 0.1)';
    case 'CALL':
      return 'rgba(16, 185, 129, 0.1)';
    case 'MENTION':
      return 'rgba(245, 158, 11, 0.1)';
    case 'INVITATION':
      return 'rgba(63, 102, 245, 0.1)';
    case 'CUSTOM':
    default:
      return 'rgba(63, 102, 245, 0.1)';
  }
};

// Formater la date
const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

  if (diffInHours < 1) {
    const diffInMinutes = Math.floor(diffInHours * 60);
    return `Il y a ${diffInMinutes}m`;
  } else if (diffInHours < 24) {
    return `Il y a ${Math.floor(diffInHours)}h`;
  } else if (diffInHours < 48) {
    return 'Hier';
  } else {
    return date.toLocaleDateString('fr-FR', { 
      day: 'numeric', 
      month: 'short' 
    });
  }
};

// Marquer comme lu
const handleMarkAsRead = async (e: Event) => {
  e.stopPropagation();
  await markAsRead(props.notification.id);
};

// Gérer le clic sur la notification
const handleClick = () => {
  emit('click');
};

// Navigation basée sur le type
const getActionText = (type: string, data: any) => {
  switch (type) {
    case 'MESSAGE':
      if (data?.threadId) return 'Voir le message';
      if (data?.dmUserId) return 'Voir la discussion';
      return 'Voir';
    case 'CALL':
      if (data?.callId) return 'Rejoindre l\'appel';
      return 'Voir';
    case 'MENTION':
      return 'Voir la mention';
    case 'INVITATION':
      return 'Voir l\'invitation';
    case 'CUSTOM':
      return data?.actionText || 'Voir';
    default:
      return 'Voir';
  }
};

// Afficher l'expéditeur — createAndSendNotification() ne fait jamais
// d'include Prisma sur `sender` (seule la route GET /notifications le fait,
// et sans displayName/username), donc pour une notification reçue en direct
// via le socket, `sender` est quasi toujours vide : on retombe alors sur
// `metadata.senderName`, déjà rempli côté backend pour les messages.
const displaySender = computed(() => {
  if (props.notification.sender) {
    return props.notification.sender.displayName ||
           props.notification.sender.username ||
           props.notification.sender.id;
  }
  return props.notification.metadata?.senderName || 'Système';
});

const senderAvatar = computed(() => props.notification.metadata?.senderAvatar as string | undefined);
</script>

<template>
  <div 
    class="notification-item"
    :class="{ 'unread': !props.notification.isRead }"
    @click="handleClick"
  >
    <div class="notification-content">
      <img
        v-if="senderAvatar"
        :src="senderAvatar"
        :alt="displaySender"
        class="notification-avatar"
      />
      <div v-else class="notification-icon" :style="{ color: getNotificationColor(props.notification.type) }">
        <svg v-if="props.notification.type === 'MESSAGE'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        <svg v-else-if="props.notification.type === 'CALL'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
        </svg>
        <svg v-else-if="props.notification.type === 'MENTION'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
        <svg v-else-if="props.notification.type === 'INVITATION'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
          <line x1="16" y1="2" x2="16" y2="6"/>
          <line x1="8" y1="2" x2="8" y2="6"/>
          <line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
        <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="16" x2="12" y2="12"/>
          <line x1="12" y1="8" x2="12.01" y2="8"/>
        </svg>
      </div>
      
      <div class="notification-info">
        <div class="notification-header">
          <span class="notification-sender">{{ displaySender }}</span>
          <span class="notification-time">{{ formatDate(props.notification.createdAt) }}</span>
        </div>
        
        <h4 class="notification-title">{{ props.notification.title }}</h4>
        <p class="notification-body">{{ props.notification.body }}</p>
      </div>
    </div>

    <div class="notification-actions">
      <button 
        v-if="!props.notification.isRead"
        @click="handleMarkAsRead"
        class="mark-read-button"
        title="Marquer comme lu"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </button>
      
      <span class="action-text">{{ getActionText(props.notification.type, props.notification.data) }}</span>
    </div>

    <div class="notification-status" 
         :style="{ backgroundColor: getNotificationBgColor(props.notification.type) }"
    />
  </div>
</template>

<style scoped>
.notification-item {
  position: relative;
  display: flex;
  align-items: center;
  padding: 12px;
  margin-bottom: 4px;
  background: var(--bg-primary);
  border-radius: 8px;
  cursor: pointer;
  transition: background-color 0.2s ease;
  border: 1px solid transparent;
  overflow: hidden;
}

.notification-item:hover {
  background: var(--bg-secondary);
}

.notification-item.unread {
  border-color: var(--border-primary);
}

.notification-content {
  flex: 1;
  display: flex;
  gap: 12px;
  min-width: 0;
}

.notification-icon {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
}

.notification-avatar {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  object-fit: cover;
}

.notification-icon :deep(svg) {
  width: 24px;
  height: 24px;
}

.notification-info {
  flex: 1;
  min-width: 0;
}

.notification-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.notification-sender {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-primary);
}

.notification-time {
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.notification-title {
  margin: 0 0 4px 0;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.notification-body {
  margin: 0;
  font-size: 0.8125rem;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.notification-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-left: 12px;
}

.mark-read-button {
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  padding: 4px;
  cursor: pointer;
  color: var(--text-secondary);
  border-radius: 4px;
  transition: color 0.2s ease, background-color 0.2s ease;
}

.mark-read-button:hover {
  color: var(--color-primary);
  background: var(--bg-secondary);
}

.mark-read-button :deep(svg) {
  width: 16px;
  height: 16px;
}

.action-text {
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.notification-status {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  border-radius: 0 3px 3px 0;
}

.notification-item.unread .notification-status {
  background-color: var(--color-primary) !important;
}
</style>

<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue';
import { useToast } from '@/composables/useToast';
import useWSocket from '@/composables/useWSocket';
import { user } from '@/assets/var';

export interface ReactionGroup {
  emoji: string;
  count: number;
  users: Array<{ id: string; name: string; avatarUrl?: string }>;
  hasReacted: boolean;
}

const props = defineProps<{
  messageId: string;
  reactions?: Record<string, { count: number; users: Array<{ id: string; name: string; avatarUrl?: string }> }>;
  isDM?: boolean;
}>();

const emit = defineEmits(['reaction-updated']);

const toast = useToast();
const socket = await useWSocket();

const currentUserId = computed(() => user.value?.id);

const showReactionPicker = ref(false);
const reactionButtonRef = ref<HTMLButtonElement | null>(null);

// Available emojis for reactions
const availableEmojis = [
  '👍', '❤️', '🔥', '😂', '😢', '👏', '🎉', '🚀',
  '✨', '💯', '🔥', '😮', '😎', '🤔', '🎯', '✅'
];

const formattedReactions = computed<ReactionGroup[]>(() => {
  if (!props.reactions) return [];
  
  return Object.entries(props.reactions).map(([emoji, data]) => ({
    emoji,
    count: data.count,
    users: data.users || [],
    hasReacted: data.users?.some(u => u.id === currentUserId.value) || false
  }));
});

const toggleReaction = async (emoji: string) => {
  if (!props.messageId) return;

  try {
    const eventName = props.isDM ? 'add-dm-reaction' : 'add-message-reaction';
    const endpoint = props.isDM 
      ? `/api/reactions/dm/${props.messageId}/reactions`
      : `/api/reactions/messages/${props.messageId}/reactions`;

    // Optimistic update
    const currentReactions = props.reactions || {};
    const reactionKey = emoji;
    const userId = currentUserId.value;
    
    if (!userId) {
      toast.show('Veuillez vous connecter pour ajouter une réaction', 'error');
      return;
    }
    
    // Check if user already reacted with this emoji
    const hasReacted = currentReactions[reactionKey]?.users?.some(u => u.id === userId);
    
    // Update local reactions optimistically
    const newReactions = { ...currentReactions };
    if (hasReacted) {
      // Remove reaction
      if (newReactions[reactionKey]) {
        newReactions[reactionKey] = {
          ...newReactions[reactionKey],
          count: newReactions[reactionKey].count - 1,
          users: newReactions[reactionKey].users?.filter(u => u.id !== userId) || []
        };
        if (newReactions[reactionKey].count <= 0) {
          delete newReactions[reactionKey];
        }
      }
    } else {
      // Add reaction
      newReactions[reactionKey] = {
        count: (newReactions[reactionKey]?.count || 0) + 1,
        users: [
          ...(newReactions[reactionKey]?.users || []),
          { 
            id: userId, 
            name: user.value?.name || 'Anonyme', 
            avatarUrl: user.value?.avatarUrl 
          }
        ]
      };
    }

    // Emit update event for optimistic UI
    emit('reaction-updated', newReactions);

    // Send to server
    socket.value?.emit(eventName, { 
      messageId: props.messageId, 
      emoji 
    }, (response: any) => {
      if (response.error) {
        toast.show(response.error, 'error');
        // Revert optimistic update on error
        emit('reaction-updated', props.reactions);
      }
      // On success, the socket will receive the update via broadcast
    });

  } catch (error) {
    console.error('Error toggling reaction:', error);
    toast.show('Erreur lors de l\'ajout de la réaction', 'error');
  } finally {
    showReactionPicker.value = false;
  }
};

// Handle socket events for reaction updates
const handleReactionUpdate = (data: { messageId: string; reactions: Record<string, { count: number; users: any[] }> }) => {
  if (data.messageId === props.messageId) {
    emit('reaction-updated', data.reactions);
  }
};

// Register socket listeners
if (socket.value) {
  socket.value.on('message-reaction-updated', handleReactionUpdate);
  socket.value.on('dm-reaction-updated', handleReactionUpdate);
}

// Cleanup on unmount
onUnmounted(() => {
  if (socket.value) {
    socket.value.off('message-reaction-updated', handleReactionUpdate);
    socket.value.off('dm-reaction-updated', handleReactionUpdate);
  }
});
</script>

<template>
  <div class="flex items-center gap-2 mt-1">
    <!-- Display existing reactions -->
    <div v-if="formattedReactions.length > 0" class="flex items-center gap-1">
      <button
        v-for="reaction in formattedReactions"
        :key="reaction.emoji"
        @click="toggleReaction(reaction.emoji)"
        class="flex items-center gap-1 px-2 py-1 bg-(--bg2)/50 hover:bg-(--bg2)/80 rounded-full text-sm transition-colors"
        :class="reaction.hasReacted ? 'ring-1 ring-(--primary)' : ''"
      >
        <span class="text-lg">{{ reaction.emoji }}</span>
        <span class="text-xs text-(--text)/60">{{ reaction.count }}</span>
      </button>
    </div>

    <!-- Add reaction button -->
    <button
      ref="reactionButtonRef"
      @click="showReactionPicker = !showReactionPicker"
      class="p-1.5 rounded-full hover:bg-(--bg2)/50 transition-colors text-(--text)/40 hover:text-(--text)/80"
    >
      <i class="bi bi-plus-lg text-lg" />
    </button>

    <!-- Emoji picker dropdown -->
    <div
      v-if="showReactionPicker"
      @click.away="showReactionPicker = false"
      class="absolute z-50 bg-(--bg) border border-white/5 rounded-xl shadow-xl p-2 mt-8"
      :style="{
        left: reactionButtonRef ? `${reactionButtonRef.getBoundingClientRect().left}px` : '0',
        top: reactionButtonRef ? `${reactionButtonRef.getBoundingClientRect().bottom + window.scrollY}px` : '0'
      }"
    >
      <button
        v-for="emoji in availableEmojis"
        :key="emoji"
        @click="toggleReaction(emoji)"
        class="text-2xl p-1 rounded-lg hover:bg-white/10 transition-colors"
      >
        {{ emoji }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useToast } from '@/composables/useToast';
import { user } from '@/assets/var';
import EmojiPicker from './EmojiPicker.vue';
import type { ReactionUser } from '@/types/types';

export interface ReactionGroup {
  emoji: string;
  count: number;
  users: ReactionUser[];
  hasReacted: boolean;
}

const props = defineProps<{
  messageId: string;
  reactions?: Record<string, { count: number; users: ReactionUser[] }>;
  isDm?: boolean;
  showReactionPicker: boolean;
  alignRight?: boolean;
  isReadOnly?: boolean;
  pickerCoords?: { x: number; y: number } | null;
}>();

const emit = defineEmits(['reaction-updated', 'add-reaction', 'reaction-picker-closed']);

const toast = useToast();
const currentUserId = computed(() => user.value?.id);

const internalShowReactionPicker = ref<boolean>(false);

// Watch for prop changes
watch(() => props.showReactionPicker, (val) => {
    internalShowReactionPicker.value = val;
});

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
  if (props.isReadOnly) return;
  if (!props.messageId) return;

  emit('reaction-picker-closed');

  try {
    const userId = currentUserId.value;
    
    if (!userId) {
      toast.show('Veuillez vous connecter pour ajouter une réaction', 'error');
      return;
    }

    // Optimistic update
    const currentReactions = props.reactions || {};
    const reactionKey = emoji;
    
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
    
    // Emit event to parent to send to server
    emit('add-reaction', { 
      messageId: props.messageId,
      emoji,
      isDM: props.isDm
    });

  } catch (error) {
    console.error('Error toggling reaction:', error);
    toast.show('Erreur lors de l\'ajout de la réaction', 'error');
  } finally {
    internalShowReactionPicker.value = false;
  }
};

// No socket handling here - parent component handles it
</script>

<template>
  <div class="flex items-center gap-2 mt-1">
    <!-- Display existing reactions -->
    <div v-if="formattedReactions.length > 0" class="flex flex-wrap items-center gap-2">
      <button
        v-for="reaction in formattedReactions"
        :key="reaction.emoji"
        @click="!isReadOnly && toggleReaction(reaction.emoji)"
        class="flex items-center gap-1 px-2 py-1 rounded-xl text-sm transition-colors"
        :class="[
          reaction.hasReacted ? 'ring-1 ring-(--primary-dark)' : '',
          isReadOnly ? 'bg-(--bg2)/20 cursor-default opacity-70' : 'bg-(--bg2)/50 hover:bg-(--bg2)/80'
        ]"
      >
        <span class="text-lg">{{ reaction.emoji }}</span>
        <span class="text-xs text-(--text)/60">{{ reaction.count }}</span>
      </button>
    </div>

    <!-- Emoji picker dropdown -->
     <Transition name="fade" mode="out-in">
      <div v-if="internalShowReactionPicker" 
           class="fixed z-[100]"
           :style="pickerCoords ? {
             top: (pickerCoords.y - 320) + 'px',
             left: Math.max(10, pickerCoords.x - 280) + 'px'
           } : {
             top: '50%',
             left: '50%',
             transform: 'translate(-50%, -50%)'
           }"
      >
        <EmojiPicker @select="toggleReaction" />
      </div>
    </Transition>

    <div class=" fixed inset-0 z-90" v-if="internalShowReactionPicker" @click="emit('reaction-picker-closed')" />

  </div>
</template>

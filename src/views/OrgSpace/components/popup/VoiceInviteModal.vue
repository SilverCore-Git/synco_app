<template>
  <Popup :is-open="isOpen" @close="closeModal">
    <template #title>Inviter dans « {{ thread.name }} »</template>

    <div class="space-y-4">

      <input
        v-model="searchQuery"
        type="text"
        placeholder="Rechercher un membre..."
        class="w-full bg-(--bg2) border border-(--border-color) rounded-xl px-3 py-2 text-sm text-(--text) focus:outline-none focus:border-(--primary)"
      />

      <div v-if="filteredMembers.length === 0" class="text-sm text-(--text2) bg-(--bg2) border border-(--border-color) p-4 rounded-xl text-center">
        Aucun membre trouvé.
      </div>

      <div v-else class="space-y-1 max-h-72 overflow-y-auto">
        <button
          v-for="member in filteredMembers"
          :key="member.userId"
          type="button"
          @click="toggleMember(member.userId)"
          class="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-(--text)/5 transition-colors text-left"
        >
          <img
            :src="member.user?.avatarUrl || defaultAvatar(member.user?.name)"
            class="w-8 h-8 rounded-full object-cover shrink-0"
          />
          <span class="flex-1 min-w-0 truncate text-sm text-(--text)">
            {{ member.user?.name || 'Anonyme' }}
          </span>
          <i
            class="bi text-lg shrink-0"
            :class="selectedIds.has(member.userId) ? 'bi-check-circle-fill text-(--primary)' : 'bi-circle text-(--text2)'"
          />
        </button>
      </div>

    </div>

    <template #footer>
      <button class="default" @click="closeModal" :disabled="sending">Annuler</button>
      <button class="primary" @click="sendInvites" :disabled="selectedIds.size === 0 || sending">
        <i v-if="sending" class="bi bi-arrow-repeat animate-spin" />
        Envoyer{{ selectedIds.size > 0 ? ` (${selectedIds.size})` : '' }}
      </button>
    </template>
  </Popup>
</template>

<script setup lang="ts">
import { defaultAvatar } from '@/assets/utils/defaultAvatar';
import { computed, ref } from 'vue';
import Popup from '@/components/Popup.vue';
import type { Thread } from '@/types/types';
import { openedOrg, user } from '@/assets/var';
import useWSocket, { waitForSocketConnection } from '@/composables/useWSocket';
import { useToast } from '@/composables/useToast';

const props = defineProps<{
  thread: Thread;
}>();

const isOpen = ref(false);
const searchQuery = ref('');
const selectedIds = ref<Set<string>>(new Set());
const sending = ref(false);
const toast = useToast();

const filteredMembers = computed(() => {
  let members = (openedOrg.value?.members || []).filter(m => m.userId !== user.value?.id);

  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase();
    members = members.filter(m =>
      m.user?.name?.toLowerCase().includes(q) ||
      m.user?.pseudo?.toLowerCase().includes(q)
    );
  }

  return members;
});

const toggleMember = (userId: string) => {
  const next = new Set(selectedIds.value);
  if (next.has(userId)) next.delete(userId);
  else next.add(userId);
  selectedIds.value = next;
};

const openModal = () => {
  searchQuery.value = '';
  selectedIds.value = new Set();
  isOpen.value = true;
};

const closeModal = () => {
  isOpen.value = false;
};

const sendInvites = async () => {
  if (selectedIds.value.size === 0) return;

  sending.value = true;
  try {
    const socketRef = await useWSocket();
    const connected = await waitForSocketConnection(socketRef, 15000);
    if (!connected || !socketRef.value) {
      toast.show('Connexion au serveur impossible.', 'error');
      return;
    }

    for (const recipientId of selectedIds.value) {
      socketRef.value.emit('dm:send-voice-invite', {
        recipientId,
        threadId: props.thread.id
      });
    }

    toast.show(`Invitation envoyée à ${selectedIds.value.size} membre(s).`, 'success');
    closeModal();
  } catch (e) {
    toast.show("Erreur lors de l'envoi de l'invitation.", 'error');
  } finally {
    sending.value = false;
  }
};

defineExpose({ openModal });
</script>

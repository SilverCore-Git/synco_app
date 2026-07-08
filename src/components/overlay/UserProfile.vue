<template>

  <Teleport to="body">

    <Transition name="fade">

      <div
        v-if="isOpen"
        class="fixed inset-0 z-200 flex"
        :class="!profilePosition ? 'items-center justify-center p-4 bg-black/70 backdrop-blur-md' : ''"
        @click.self="emit('close')"
        @contextmenu.prevent.self="emit('close')"
      >

        <Transition :name="profilePosition ? 'slide-fade' : 'pop'" appear>

          <div
            v-if="isOpen && profileUser"
            class="bg-(--bg) border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
            :class="profilePosition ? 'absolute w-[320px] max-h-[calc(100vh-40px)]' : 'w-full max-w-sm relative'"
            :style="profilePosition ? { top: `${profilePosition.top}px`, left: `${profilePosition.left}px` } : {}"
            @click.stop
          >

            <!-- Header avec bannière -->
            <div class="relative h-32 bg-gradient-to-r from-(--primary) to-(--primary-dark)/70">
              <button
                @click="emit('close')"
                class="
                  absolute top-4 right-4 z-10
                  p-2 rounded-lg hover:bg-white/20
                  text-white hover:text-white
                  active:scale-90 transition-all duration-200
                "
              >
                <i class="bi bi-x-lg text-xl" />
              </button>
            </div>

            <!-- Avatar et infos principales -->
            <div class="relative px-6 -mt-16 mb-4">
              <div class="flex justify-center">
                <img
                  :src="u.avatarUrl || `https://ui-avatars.com/api/?name=${u.name}&background=128a60&color=fff`"
                  :alt="u.name"
                  @error="(e: any) => e.target.src = `https://ui-avatars.com/api/?name=${u.name}&background=128a60&color=fff`"
                  class="w-28 h-28 rounded-full border-4 border-(--bg) object-cover ring-2 ring-(--primary)/30"
                />
              </div>
            </div>

            <!-- Nom et statut -->
            <div class="px-6 text-center mb-6">
              <h2 class="text-xl font-bold text-(--text) tracking-tight">
                {{ u.name }}
              </h2>
              <p v-if="u.data?.status" class="text-sm text-(--text)/50 mt-1">
                {{ getStatusText(u.data.status || '') }}
              </p>
            </div>

            <!-- Section Infos -->
            <div class="px-6 py-4 border-t border-white/5">
              
              <!-- Email -->
              <div v-if="u.email" class="flex items-center gap-3 p-3 rounded-lg hover:bg-white/5 transition-colors">
                <i class="bi bi-envelope text-(--text)/40 text-lg" />
                <span class="text-sm text-(--text)/80 truncate">{{ u.email }}</span>
              </div>

              <!-- ID Utilisateur -->
              <div class="flex items-center gap-3 p-3 rounded-lg hover:bg-white/5 transition-colors">
                <i class="bi bi-person text-(--text)/40 text-lg" />
                <span class="text-sm text-(--text)/80 truncate">ID: {{ u.id.substring(0, 8) + '...' }}</span>
              </div>

              <!-- Date d'inscription -->
              <div v-if="u.createdAt" class="flex items-center gap-3 p-3 rounded-lg hover:bg-white/5 transition-colors">
                <i class="bi bi-calendar text-(--text)/40 text-lg" />
                <span class="text-sm text-(--text)/80 truncate">
                  Membre depuis {{ formatDate(u.createdAt) }}
                </span>
              </div>

            </div>

            <!-- Actions (si ce n'est pas l'utilisateur courant) -->
            <div v-if="u.id !== user?.id" class="px-6 py-4 border-t border-white/5">
              <div class="flex gap-3">
                <button
                  @click="sendMessage"
                  class="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-(--primary)/20 hover:bg-(--primary)/30 text-(--primary) font-medium transition-colors"
                >
                  <i class="bi bi-chat-dots" />
                  Envoyer un message
                </button>
              </div>
            </div>

            <!-- Section E2EE (si clé publique disponible) -->
            <div v-if="u.publicKey" class="px-6 py-4 border-t border-white/5">
              <div class="flex items-center gap-2 text-green-400 text-xs">
                <i class="bi bi-shield-check" />
                <span>Chiffrement E2EE disponible</span>
              </div>
            </div>

            <!-- Footer -->
            <div class="px-6 py-3 border-t border-white/5 text-center">
              <span class="text-[10px] text-(--text)/30">
                SilverTeams - Profil Utilisateur
              </span>
            </div>

          </div>

        </Transition>

      </div>

    </Transition>

  </Teleport>

</template>

<script setup lang="ts">

import { computed } from 'vue';
import type { User } from '@/types/types';
import { user } from '@/assets/var';
import { profilePosition } from '@/composables/useProfile';

const props = defineProps<{
  isOpen: boolean;
  profileUser: User | null;
}>();

// Helper to safely access profileUser (guarded by v-if="isOpen && profileUser")
const u = computed(() => props.profileUser!);

const emit = defineEmits(['close', 'send-message']);

const sendMessage = () => {
  emit('send-message', u.value);
  emit('close');
};

const getStatusText = (status: string) => {
  const statusMap: Record<string, string> = {
    online: 'En ligne',
    idle: 'Inactif',
    dnd: 'Ne pas déranger',
    offline: 'Hors ligne',
  };
  return statusMap[status] || status;
};

const formatDate = (date: string | Date) => {
  const dateObj = date instanceof Date ? date : new Date(date);
  return dateObj.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
};

</script>

<style scoped>

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.pop-enter-active,
.pop-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.pop-enter-from,
.pop-leave-to {
  opacity: 0;
  transform: scale(0.9) translateY(-20px);
}

.slide-fade-enter-active,
.slide-fade-leave-active {
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.slide-fade-enter-from,
.slide-fade-leave-to {
  opacity: 0;
  transform: translateY(-10px) scale(0.98);
}

</style>

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
            class="bg-(--bg) rounded-xl shadow-2xl overflow-hidden flex flex-col font-sans"
            :class="profilePosition ? 'absolute w-[340px] max-h-[calc(100vh-40px)]' : 'w-full max-w-sm relative'"
            :style="profilePosition ? { top: `${profilePosition.top}px`, left: `${profilePosition.left}px` } : {}"
            @click.stop
          >

            <!-- Banner -->
            <div class="h-[100px] bg-gradient-to-tr from-(--primary-dark) to-(--primary) w-full relative z-0">
                <button
                    @click="emit('close')"
                    class="absolute top-3 right-3 w-7 h-7 rounded-full bg-black/30 hover:bg-black/50 flex items-center justify-center text-white transition-colors"
                >
                    <i class="bi bi-x" />
                </button>
            </div>

            <!-- Avatar overlapping banner (Outside scrolling container to prevent clipping) -->
            <div class="absolute top-[48px] left-4 p-1.5 bg-(--bg) rounded-full z-10">
                <div class="relative">
                    <img
                        :src="u.avatarUrl || `https://ui-avatars.com/api/?name=${u.name}&background=128a60&color=fff`"
                        :alt="u.name"
                        @error="(e: any) => e.target.src = `https://ui-avatars.com/api/?name=${u.name}&background=128a60&color=fff`"
                        class="w-[84px] h-[84px] rounded-full object-cover"
                    />
                    <!-- Status indicator -->
                    <div class="absolute bottom-0 right-0 w-6 h-6 rounded-full border-[4px] border-(--bg) flex items-center justify-center" :class="statusColorClass">
                    </div>
                </div>
            </div>

            <!-- Content container -->
            <div class="px-4 relative flex-1 overflow-y-auto z-0">
                <!-- Spacer for the avatar overlapping -->
                <div class="h-[46px]"></div>

                <!-- Content Card -->
                <div class="bg-(--bg2) rounded-lg p-4 mb-4 mt-3 border border-white/5 shadow-inner">
                    <!-- Name -->
                    <h2 class="text-xl font-bold text-(--text) leading-tight">{{ u.name }}</h2>
                    <p class="text-sm text-(--text)/60 mb-3">{{ u.email }}</p>
                    
                    <div class="w-full h-px bg-white/5 my-3"></div>

                    <!-- Role Section -->
                    <div class="mb-4">
                        <h3 class="text-[11px] font-bold text-(--text)/50 uppercase tracking-wide mb-2">Rôles</h3>
                        <div class="flex flex-wrap gap-1.5">
                            <span 
                                class="flex items-center gap-1.5 px-2 py-1 rounded bg-(--bg) border border-white/5 text-xs font-medium text-(--text)/90 shadow-sm"
                            >
                                <div class="w-2.5 h-2.5 rounded-full shadow-sm" :class="roleColorClass"></div>
                                {{ translatedRole }}
                            </span>
                            <span v-if="u.id === user?.id" class="flex items-center gap-1.5 px-2 py-1 rounded bg-(--bg) border border-white/5 text-xs font-medium text-(--text)/90 shadow-sm">
                                Vous
                            </span>
                        </div>
                    </div>

                    <div class="w-full h-px bg-white/5 my-3"></div>

                    <!-- Membre depuis -->
                    <div>
                        <h3 class="text-[11px] font-bold text-(--text)/50 uppercase tracking-wide mb-2">Membre depuis</h3>
                        <p class="text-sm text-(--text)/90 flex items-center gap-2">
                            <i class="bi bi-calendar3 text-(--text)/50"></i>
                            {{ formatDate(u.createdAt) }}
                        </p>
                    </div>

                </div>

                <!-- Action Button -->
                <div v-if="u.id !== user?.id" class="mb-4">
                    <button
                        @click="sendMessage"
                        class="w-full py-2.5 rounded-md text-sm font-semibold bg-(--primary) hover:bg-(--primary-dark) text-white transition-colors flex items-center justify-center gap-2 shadow-lg shadow-(--primary)/20"
                    >
                        <i class="bi bi-chat-left-text-fill"></i>
                        Envoyer un message
                    </button>
                </div>
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
import { user, openedOrg } from '@/assets/var';
import { profilePosition } from '@/composables/useProfile';

const props = defineProps<{
  isOpen: boolean;
  profileUser: User | null;
}>();

const u = computed(() => props.profileUser!);

const role = computed(() => {
    if (!openedOrg.value?.members || !u.value?.id) return 'member';
    const member = openedOrg.value.members.find(m => m.userId === u.value.id);
    return member?.role || 'member';
});

const translatedRole = computed(() => {
    if (role.value === 'owner' || role.value === 'ADMIN' || role.value === 'admin') return 'Administrateur';
    return 'Membre';
});

const roleColorClass = computed(() => {
    if (role.value === 'owner' || role.value === 'ADMIN' || role.value === 'admin') return 'bg-orange-500';
    return 'bg-(--primary)';
});

const userStatus = computed(() => {
    if (!openedOrg.value?.members || !u.value?.id) return u.value?.data?.status || 'offline';
    const member = openedOrg.value.members.find(m => m.userId === u.value.id);
    return member?.user?.data?.status || u.value?.data?.status || 'offline';
});

const statusColorClass = computed(() => {
    switch (userStatus.value) {
        case 'online': return 'bg-green-500';
        case 'idle': return 'bg-yellow-500';
        case 'dnd': return 'bg-red-500';
        default: return 'bg-gray-500';
    }
});

const emit = defineEmits(['close', 'send-message']);

const sendMessage = () => {
  emit('send-message', u.value);
  emit('close');
};

const formatDate = (date: string | Date) => {
  const dateObj = date instanceof Date ? date : new Date(date);
  return dateObj.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
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

/* Scrollbar minimale pour le panneau intérieur si jamais ça déborde sur petit écran */
.overflow-y-auto::-webkit-scrollbar {
    width: 6px;
}
.overflow-y-auto::-webkit-scrollbar-track {
    background: transparent;
}
.overflow-y-auto::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 10px;
}
.overflow-y-auto:hover::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.2);
}

</style>

<template>

  <Teleport to="body">

    <Transition name="fade">

      <div
        v-if="isOpen"
        class="fixed inset-0 z-[3000] flex"
        :class="!profilePosition ? 'items-center justify-center p-4 bg-black/70 backdrop-blur-md' : ''"
        @click.self="emit('close')"
        @contextmenu.prevent.self="emit('close')"
      >

        <Transition :name="profilePosition ? 'slide-fade' : 'pop'" appear>

          <div
            v-if="isOpen && profileUser"
            class="rounded-2xl shadow-2xl overflow-hidden flex flex-col font-sans border border-(--border-color) bg-(--bg)"
            :class="profilePosition ? 'absolute w-[360px] max-h-[calc(100vh-40px)]' : 'w-full max-w-sm relative max-h-[calc(100vh-32px)]'"
            :style="profilePosition ? { top: `${profilePosition.top}px`, left: `${profilePosition.left}px` } : {}"
            @click.stop
          >
            <ProfileCard
              class="flex-1"
              :user="u"
              :profile="orgProfile"
              :headline="headline"
              :roles="roles"
              :status="userStatus"
              :is-self="u.id === user?.id"
            >
              <template #banner-actions>
                <button
                  @click="emit('close')"
                  class="w-7 h-7 rounded-full bg-black/30 hover:bg-black/50 flex items-center justify-center text-white transition-colors"
                  title="Fermer"
                >
                  <i class="bi bi-x-lg text-xs" />
                </button>
              </template>
              <template v-if="u.id !== user?.id" #footer>
                <button
                  @click="sendMessage"
                  class="primary w-full flex items-center justify-center gap-2 text-sm"
                >
                  <i class="bi bi-chat-left-text-fill"></i>
                  Envoyer un message
                </button>
              </template>
            </ProfileCard>
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
import { profileForOrg } from '@/assets/utils/userProfile';
import ProfileCard from '@/components/profile/ProfileCard.vue';

const props = defineProps<{
  isOpen: boolean;
  profileUser: User | null;
}>();

const u = computed(() => props.profileUser!);

const orgMember = computed(() => {
    if (!openedOrg.value?.members || !u.value?.id) return null;
    return openedOrg.value.members.find(m => m.userId === u.value.id) || null;
});

// Le serveur ne sert dans `openedOrg.members` que les blocs visibles dans
// cette org, et le poste principal correspondant. L'utilisateur courant a
// en revanche son profil complet : on le filtre ici pour montrer la même
// chose que ce que voient ses collègues.
const orgProfile = computed(() => {
    if (u.value?.id === user.value?.id) return profileForOrg(user.value?.profile, openedOrg.value?.id ?? null);
    return orgMember.value?.user?.profile ?? u.value?.profile ?? null;
});

const headline = computed(() => orgMember.value?.user?.job ?? u.value?.job);

// Sans rôle attribué : « Membre », comme avant.
const roles = computed(() => {
    const list = (orgMember.value?.memberRoles || []).filter((mr: any) => mr.role).map((mr: any) => mr.role);
    if (list.length === 0 && orgMember.value) return [{ id: 'member', name: 'Membre', color: null }];
    return list;
});

const userStatus = computed(() => {
    if (!openedOrg.value?.members || !u.value?.id) return u.value?.data?.status || 'offline';
    const member = openedOrg.value.members.find(m => m.userId === u.value.id);
    return member?.user?.data?.status || u.value?.data?.status || 'offline';
});

const emit = defineEmits(['close', 'send-message']);

const sendMessage = () => {
  emit('send-message', u.value);
  emit('close');
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

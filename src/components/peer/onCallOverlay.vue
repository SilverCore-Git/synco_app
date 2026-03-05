<template>

    <Teleport to="body">

        <Transition name="slide-fade">

            <div 
                v-if="haveCallingEnter !== 'no'"
                class="
                    fixed top-6 right-6 
                    z-200 w-80 bg-(--bg2) 
                    border border-(--white)/10 
                    rounded-2xl shadow-2xl p-4 
                    backdrop-blur-xl
                "
            >

                <div class="flex items-center gap-3">

                    <div class="relative">
                        <img 
                            :src="(haveCallingEnter as any).user?.avatarUrl || ''"
                            class="w-10 h-10 rounded-full "
                        />
                    </div>

                    <div class="flex-1 overflow-hidden">
                        <p class="text-xs font-bold text-primary uppercase tracking-wider mb-1">Appel entrant</p>
                        <h4 class="text-white font-semibold truncate">{{ (haveCallingEnter as any).user?.name || 'Utilisateur inconnu' }}</h4>
                    </div>

                </div>

                <div class="flex gap-3 mt-5">

                    <button 
                        @click="handleReject"
                        class="flex-1 py-2.5 rounded-xl bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white transition-all font-medium text-sm flex items-center justify-center gap-2 border border-red-500/20"
                    >
                        <i class="bi bi-x-lg" />
                        Refuser
                    </button>
                    
                    <button 
                        @click="handleAnswer"
                        class="flex-1 py-2.5 rounded-xl bg-green-500 hover:bg-green-600 text-white shadow-lg shadow-green-500/20 transition-all font-medium text-sm flex items-center justify-center gap-2"
                    >
                        <i class="bi bi-telephone-fill animate-bounce" />
                        Répondre
                    </button>

                </div>

            </div>

        </Transition>

    </Teleport>

</template>

<script lang="ts" setup>

import usePeer from '@/composables/usePeer';

const { 
    haveCallingEnter,
    isCalling,
} = usePeer();

const handleAnswer = async () => {
    haveCallingEnter.value = 'accept';
};

const handleReject = () => {
    haveCallingEnter.value = 'reject';
};

</script>

<style scoped>
.slide-fade-enter-active {
  transition: all 0.3s ease-out;
}

.slide-fade-leave-active {
  transition: all 0.2s cubic-bezier(1, 0.5, 0.8, 1);
}

.slide-fade-enter-from {
  transform: translateX(50px);
  opacity: 0;
}

.slide-fade-leave-to {
  transform: scale(0.9);
  opacity: 0;
}
</style>
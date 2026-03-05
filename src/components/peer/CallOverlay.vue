<template>

    <Teleport to="body">
            
        <Transition name="fade">

            <div v-if="isCalling || remoteStream">

                <DraggableWindow 
                    :initialX="initialX"
                    :initialY="initialY"
                    :active="isMinimized"
                >
                <template #header>

                    <div 
                        class="
                            z-1000 justify-center 
                            flex flex-col items-center group
                        "
                        :class="
                            isMinimized 
                                ? 'bottom-8 right-8 w-100' 
                                : 'fixed inset-0 p-6  bg-(--black)/95'
                            "
                    >

                        <div class="fixed top-6 left-6" ><button class="default">
                            <i class="text-2xl bi bi-arrows-angle-contract" @click="isMinimized = !isMinimized" />
                        </button></div>
                        
                        <div 
                            class="
                                relative w-full max-w-6xl 
                                aspect-video bg-(--white)/5 
                                rounded-3xl overflow-hidden 
                                shadow-2xl border border-(--white)/10
                            "
                            :class="{ 
                                'ring-2 ring-(--primary)': remoteIsSpeaking
                            }"
                        >
                            
                            <video 
                                v-if="remoteStream"
                                :srcObject="remoteStream"
                                autoplay 
                                class="w-full h-full object-cover bg-(--black)"
                            />
                            
                            <div v-else class="w-full h-full flex flex-col items-center justify-center gap-4 text-(--white)/20">
                                <div class="w-24 h-24 rounded-full bg-(--white)/5 flex items-center justify-center animate-pulse">
                                    <i class="bi bi-person-fill text-5xl"></i>
                                </div>
                                <p class="text-lg font-medium animate-pulse">Appel en cours...</p>
                            </div>

                            <div 
                                class="
                                    aspect-video  overflow-hidden absolute
                                    border-2 border-(--white)/20 shadow-xl bg-(--black)
                                "
                                :class="
                                    isMinimized 
                                        ? ' bottom-2 right-2 w-35 rounded-2xl '
                                        : ' bottom-6 right-6 w-48 rounded-xl '
                                "
                            >
                                <video 
                                    v-if="localStream"
                                    :srcObject="localStream" 
                                    autoplay 
                                    muted 
                                    class="w-full h-full object-cover mirror"
                                />
                            </div>

                        </div>

                        <div 
                            class="
                                absolute left-1/2 -translate-x-1/2 flex
                                items-center bg-(--black)/40 border-(--white)/10
                                backdrop-blur-xl rounded-full border-t 
                                transition-all duration-200
                            "
                            :class="
                                isMinimized
                                    ? '-bottom-10 gap-3 px-4 py-2 opacity-0 group-hover:bottom-0 group-hover:opacity-100'
                                    : 'bottom-25 gap-6 px-8 py-4 '
                            "
                        >
                                
                            <button 
                                :class="isMinimized ? 'w-10 h-10 text-lg' : 'w-12 h-12 text-xl'" 
                                class=" rounded-full bg-(--white)/10 hover:bg-(--white)/20 text-(--white) transition-all">
                                <i class="bi bi-mic-fill" />
                            </button>

                            <button 
                                :class="isMinimized ? 'w-10 h-10 text-lg' : 'w-12 h-12 text-xl'" 
                                class=" rounded-full bg-(--white)/10 hover:bg-(--white)/20 text-(--white) transition-all">
                                <i class="bi bi-camera-video-fill" />
                            </button>

                            <button 
                                @click="handleEndCall"
                                :class="isMinimized ? 'w-12 h-12 text-xl' : 'w-14 h-14 text-2xl'" 
                                class="rounded-full bg-red-500 hover:bg-red-600 text-(--white) shadow-lg shadow-red-500/20 transition-all hover:scale-110 flex items-center justify-center"
                            >
                                <i class="bi bi-telephone-x-fill" />
                            </button>

                        </div>

                    </div>

                </template>
                </DraggableWindow>

            </div>

        </Transition>

    </Teleport>

</template>

<script setup lang="ts">

import usePeer from '@/composables/usePeer';
import { onUnmounted, ref } from 'vue';
import DraggableWindow from '../common/DraggableWindow.vue';

const isMinimized = ref<boolean>(false);
const initialX = ref<number>(window.innerWidth - 400 - 32);
const initialY = ref<number>(window.innerHeight - 200 - 32);


const { 
    isCalling, 
    remoteStream, 
    localStream, 
    remoteIsSpeaking,
    isSpeaking,
    endCall 
} = usePeer();

const handleEndCall = () => {
    endCall();
};

onUnmounted(() => {
    endCall();
});

</script>

<style scoped>

.mirror {
    transform: scaleX(-1);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

</style>
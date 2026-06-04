<template>

    <Teleport to="body">
            
        <Transition name="fade">

            <div v-if="isCalling || remoteStreams.size">

                <DraggableWindow 
                    :initialX="initialX"
                    :initialY="initialY"
                    :active="isMinimized"
                >
                <template #header>

                    <div 
                        class="
                            z-100 justify-center 
                            flex flex-col items-center group
                        "
                        :class="
                            isMinimized 
                                ? 'bottom-8 right-8 w-100' 
                                : 'fixed inset-0 p-6  bg-(--black)/95'
                            "
                    >
                        
                        <div 
                            class="
                                relative w-full max-w-6xl 
                                aspect-video bg-(--white)/5 
                                rounded-3xl overflow-hidden 
                                shadow-2xl border border-(--white)/10
                            "
                        >

                            <!-- Security Status Badge -->
                            <div 
                                v-if="!isMinimized && securityStatus"
                                class="absolute top-4 left-4 z-20 flex items-center gap-2 px-3 py-1.5 rounded-full backdrop-blur-md border"
                                :class="securityStatus.encrypted 
                                    ? 'bg-green-500/20 border-green-500/30 text-green-400' 
                                    : 'bg-yellow-500/20 border-yellow-500/30 text-yellow-400'"
                            >
                                <i class="bi" :class="securityStatus.encrypted ? 'bi-shield-check-fill' : 'bi-shield-exclamation'"></i>
                                <span class="text-xs font-medium">
                                    {{ securityStatus.encrypted ? 'E2EE Activé' : 'Chiffrement en cours...' }}
                                </span>
                            </div>

                            <!-- Fingerprint for SAS verification -->
                            <div 
                                v-if="!isMinimized && securityStatus?.fingerprint"
                                class="absolute top-4 right-4 z-20 px-3 py-1.5 rounded-full bg-(--white)/10 backdrop-blur-md border border-(--white)/20"
                            >
                                <div class="flex items-center gap-2">
                                    <span class="text-xs text-(--white)/60">SAS:</span>
                                    <span class="text-xs font-mono text-(--white) tracking-wider">{{ securityStatus.fingerprint }}</span>
                                </div>
                            </div>

                            <div 
                                class="
                                    absolute top-0 left-0 
                                    transition-all duration-200
                                "
                            ><button class="default">
                                <i 
                                    class="text-2xl bi" 
                                    :class="
                                        isMinimized
                                            ? 'bi-arrows-angle-expand opacity-0 group-hover:opacity-100 '
                                            : 'bi-arrows-angle-contract'
                                    "
                                    @click="isMinimized = !isMinimized" 
                                />
                            </button></div>
                            
                            <div v-if="remoteStreams.size" class="grid flex-1 gap-4">
                                <video 
                                    v-for="[id, stream] of remoteStreams"
                                    :key="id"
                                    :srcObject="stream" 
                                    autoplay 
                                    class="w-full h-full object-cover bg-(--black)"
                                />
                            </div>
                            
                            <div v-else class="w-full h-full flex flex-col items-center justify-center gap-4 text-(--white)/20">
                                <div class="w-24 h-24 rounded-full bg-(--white)/5 flex items-center justify-center animate-pulse">
                                    <i class="bi bi-person-fill text-5xl"></i>
                                </div>
                                <p class="text-lg font-medium animate-pulse">Appel en cours...</p>
                                <div v-if="securityStatus?.encrypted" class="flex items-center gap-2 text-green-400/60 text-sm">
                                    <i class="bi bi-lock-fill"></i>
                                    <span>Appel sécurisé E2EE</span>
                                </div>
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
                                @click="toggleMic"
                                :class="[
                                    isMinimized ? 'w-10 h-10 text-lg' : 'w-12 h-12 text-xl',
                                    !isMicOn ? 'bg-red-500/50 text-red-200' : ''
                                ]" 
                                class="rounded-full bg-(--white)/10 hover:bg-(--white)/20 text-(--white) transition-all"
                                :title="isMicOn ? 'Couper le micro' : 'Activer le micro'"
                            >
                                <i class="bi" :class="isMicOn ? 'bi-mic-fill' : 'bi-mic-mute-fill'" />
                            </button>

                            <button 
                                @click="toggleCam"
                                :class="[
                                    isMinimized ? 'w-10 h-10 text-lg' : 'w-12 h-12 text-xl',
                                    !isCamOn ? 'bg-(--white)/5 text-(--white)/50' : ''
                                ]" 
                                class="rounded-full bg-(--white)/10 hover:bg-(--white)/20 text-(--white) transition-all"
                                :title="isCamOn ? 'Désactiver la caméra' : 'Activer la caméra'"
                            >
                                <i class="bi" :class="isCamOn ? 'bi-camera-video-fill' : 'bi-camera-video-off-fill'" />
                            </button>

                            <button 
                                @click="handleEndCall"
                                :class="isMinimized ? 'w-12 h-12 text-xl' : 'w-14 h-14 text-2xl'" 
                                class="rounded-full bg-red-500 hover:bg-red-600 text-(--white) shadow-lg shadow-red-500/20 transition-all hover:scale-110 flex items-center justify-center"
                                title="Raccrocher"
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

import useSecurePeer from '@/composables/useSecurePeer';
import { computed, onUnmounted, ref } from 'vue';
import DraggableWindow from '../common/DraggableWindow.vue';

const isMinimized = ref<boolean>(false);
const initialX = ref<number>(window.innerWidth - 400 - 32);
const initialY = ref<number>(window.innerHeight - 200 - 32);

const { 
    isCalling, 
    remoteStreams, 
    localStream,
    isMicOn,
    isCamOn,
    endCall,
    toggleMic,
    toggleCam,
    getCallSecurityStatus,
    callSecurityStatus
} = useSecurePeer();

// Compute security status for display
const securityStatus = computed(() => {
    if (remoteStreams.value.size > 0) {
        const firstPeerId = remoteStreams.value.keys().next().value;
        if (firstPeerId) {
            return getCallSecurityStatus(firstPeerId);
        }
    }
    return null;
});

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
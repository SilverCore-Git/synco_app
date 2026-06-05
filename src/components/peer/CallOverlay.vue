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

                            <!-- Call Status Info -->
                            <div 
                                v-if="!isMinimized && callStatus"
                                class="absolute top-4 left-1/2 -translate-x-1/2 z-20 px-4 py-2 rounded-full bg-(--black)/50 backdrop-blur-md border border-(--white)/20"
                            >
                                <span class="text-sm font-medium text-(--white)">{{ callStatus }}</span>
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
                            
                            <!-- Remote Video Streams -->
                            <div v-if="remoteStreams.size" class="grid flex-1 gap-4 p-4">
                                <div 
                                    v-for="[id, stream] of remoteStreams"
                                    :key="id"
                                    class="relative bg-(--black) rounded-xl overflow-hidden"
                                >
                                    <video 
                                        :srcObject="stream" 
                                        autoplay 
                                        class="w-full h-full object-cover"
                                    />
                                    <!-- Participant name overlay -->
                                    <div class="absolute bottom-2 left-2 bg-(--black)/70 px-2 py-1 rounded">
                                        <span class="text-xs text-(--white) font-medium">{{ getParticipantName(id) }}</span>
                                    </div>
                                </div>
                            </div>
                            
                            <!-- Waiting/Connecting State -->
                            <div v-else class="w-full h-full flex flex-col items-center justify-center gap-4 text-(--white)/20">
                                <div class="w-24 h-24 rounded-full bg-(--white)/5 flex items-center justify-center animate-pulse">
                                    <i class="bi bi-person-fill text-5xl"></i>
                                </div>
                                <p class="text-lg font-medium animate-pulse">{{ callStateText }}</p>
                                <div v-if="securityStatus?.encrypted" class="flex items-center gap-2 text-green-400/60 text-sm">
                                    <i class="bi bi-lock-fill"></i>
                                    <span>Appel sécurisé E2EE</span>
                                </div>
                            </div>

                            <!-- Local Video Preview -->
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
                                <div v-else class="w-full h-full flex items-center justify-center bg-(--black)/50">
                                    <i class="bi bi-camera-video-off-fill text-(--white)/30 text-2xl" />
                                </div>
                            </div>

                            <!-- Call Timer -->
                            <div 
                                v-if="!isMinimized && isCalling && callTimer"
                                class="absolute bottom-20 left-1/2 -translate-x-1/2 z-20 px-4 py-2 rounded-full bg-(--black)/50 backdrop-blur-md"
                            >
                                <span class="text-lg font-mono text-(--white)">{{ callTimer }}</span>
                            </div>

                        </div>

                        <!-- Call Controls -->
                        <CallControls
                            :isMinimized="isMinimized"
                            :isMicOn="isMicOn"
                            :isCamOn="isCamOn"
                            :isScreenSharing="isScreenSharing"
                            @toggleMic="toggleMic"
                            @toggleCam="toggleCam"
                            @toggleScreenShare="toggleScreenShare"
                            @endCall="handleEndCall"
                        />

                    </div>

                </template>
                </DraggableWindow>

            </div>

        </Transition>

    </Teleport>

</template>

<script setup lang="ts">

import useSecurePeer from '@/composables/useSecurePeer';
import { computed, onUnmounted, ref, watch } from 'vue';
import DraggableWindow from '../common/DraggableWindow.vue';
import CallControls from './CallControls.vue';
import { openedOrg } from '@/assets/var';

const isMinimized = ref<boolean>(false);
const initialX = ref<number>(window.innerWidth - 400 - 32);
const initialY = ref<number>(window.innerHeight - 200 - 32);

const { 
    isCalling, 
    remoteStreams, 
    localStream,
    isMicOn,
    isCamOn,
    isScreenSharing,
    endCall,
    toggleMic,
    toggleCam,
    toggleScreenShare,
    getCallSecurityStatus
} = useSecurePeer();

// Call timer
const callStartTime = ref<number | null>(null);
const callTimer = ref<string>('');

// Call status
const callStatus = ref<string>('');

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

// Get participant name by peer ID
const getParticipantName = (peerId: string): string => {
    if (!openedOrg.value?.members) return 'Utilisateur';
    const member = openedOrg.value.members.find(m => m.user?.id === peerId);
    return member?.user?.name || peerId.substring(0, 8);
};

// Call state text
const callStateText = computed(() => {
    if (isCalling.value) {
        if (remoteStreams.value.size > 0) {
            return 'Appel en cours';
        }
        return 'Connecting...';
    }
    return 'Appel en cours...';
});

// Start call timer when call begins
watch(() => isCalling.value, (newVal) => {
    if (newVal && !callStartTime.value) {
        callStartTime.value = Date.now();
        updateTimer();
        const timerInterval = setInterval(updateTimer, 1000);
        
        onUnmounted(() => {
            clearInterval(timerInterval);
        });
    } else if (!newVal) {
        callStartTime.value = null;
        callTimer.value = '';
    }
}, { immediate: true });

const updateTimer = () => {
    if (!callStartTime.value) {
        callTimer.value = '';
        return;
    }
    
    const seconds = Math.floor((Date.now() - callStartTime.value) / 1000);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    callTimer.value = [
        hours.toString().padStart(2, '0'),
        minutes.toString().padStart(2, '0'),
        secs.toString().padStart(2, '0')
    ].join(':');
};

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
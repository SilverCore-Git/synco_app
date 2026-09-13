<template>
    <Teleport to="body">
        
        <!-- Fullscreen Call Mode -->
        <Transition name="fade">
            <div 
                v-if="isCalling && !isMinimized"
                class="fixed inset-0 z-[1000] bg-(--black)/95 flex items-center justify-center p-4"
                @click.self="isMinimized = true"
            >
                    <div 
                        class="
                            relative w-full max-w-6xl aspect-video 
                            bg-(--bg2) rounded-3xl overflow-hidden 
                            shadow-2xl border border-(--white)/10
                        "
                    >
                        <!-- Header with controls -->
                        <div class="absolute top-4 left-4 right-4 z-20 flex items-center justify-between">
                            <!-- Security Status -->
                            <button
                                v-if="securityStatus"
                                @click="securityStatus.encrypted && !isCurrentPeerVerified ? openVerifyPanel() : undefined"
                                class="flex items-center gap-2 px-3 py-1.5 rounded-full backdrop-blur-md border"
                                :class="[
                                    !securityStatus.encrypted
                                        ? 'bg-yellow-500/20 border-yellow-500/30 text-yellow-400'
                                        : isCurrentPeerVerified
                                            ? 'bg-green-500/20 border-green-500/30 text-green-400'
                                            : 'bg-blue-500/20 border-blue-500/30 text-blue-300 hover:bg-blue-500/30 cursor-pointer'
                                ]"
                                :title="securityStatus.encrypted && !isCurrentPeerVerified ? 'Vérifier le code de sécurité' : ''"
                            >
                                <i
                                    class="bi text-sm"
                                    :class="!securityStatus.encrypted
                                        ? 'bi-shield-exclamation'
                                        : isCurrentPeerVerified ? 'bi-shield-check-fill' : 'bi-shield-lock'"
                                />
                                <span class="text-xs font-medium">
                                    {{ !securityStatus.encrypted
                                        ? 'Chiffrement...'
                                        : isCurrentPeerVerified ? 'E2EE vérifié' : 'E2EE — non vérifié' }}
                                </span>
                            </button>

                            <!-- Timer and Minimize Button -->
                            <div class="flex items-center gap-4">
                                <div v-if="callTimer" class="px-3 py-1.5 rounded-full bg-(--black)/50 backdrop-blur-md">
                                    <span class="text-sm font-mono text-(--white)">{{ callTimer }}</span>
                                </div>
                                <button 
                                    @click="isMinimized = true"
                                    class="default hover:bg-(--white)/10 rounded-full p-1.5"
                                    title="Minimiser"
                                >
                                    <i class="bi bi-arrows-angle-contract text-xl" />
                                </button>
                            </div>
                        </div>

                        <!-- Video Area -->
                        <div class="w-full h-full relative">
                            
                            <!-- Remote Streams -->
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
                                    <div class="absolute bottom-2 left-2 bg-(--black)/70 px-2 py-1 rounded">
                                        <span class="text-xs text-(--white) font-medium">{{ getParticipantName(id) }}</span>
                                    </div>
                                </div>
                            </div>
                            
                            <!-- Waiting State -->
                            <div v-else class="w-full h-full flex flex-col items-center justify-center gap-4 text-(--white)/40">
                                <div class="w-24 h-24 rounded-full bg-(--white)/5 flex items-center justify-center animate-pulse">
                                    <i class="bi bi-person-fill text-5xl" />
                                </div>
                                <p class="text-lg font-medium animate-pulse">Appel en cours...</p>
                                <div v-if="securityStatus?.encrypted" class="flex items-center gap-2 text-green-400/60 text-sm">
                                    <i class="bi bi-lock-fill" />
                                    <span>Appel sécurisé E2EE</span>
                                </div>
                            </div>

                            <!-- Local Video Preview -->
                            <div 
                                class="
                                    absolute bottom-6 right-6 w-48 aspect-video 
                                    overflow-hidden border-2 border-(--white)/20 
                                    shadow-xl bg-(--black) rounded-xl
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

                        </div>

                        <!-- Call Controls -->
                        <div 
                            class="
                                absolute left-1/2 -translate-x-1/2 bottom-25 
                                flex items-center bg-(--black)/60 border-(--white)/10
                                backdrop-blur-xl rounded-full border-t p-2
                            "
                        >
                            <button
                                @click="toggleScreenShare"
                                :class="isScreenSharing ? 'bg-(--primary)/30 text-(--primary)' : ''"
                                class="rounded-full bg-(--white)/10 hover:bg-(--white)/20 text-(--white) transition-all w-12 h-12 text-xl mx-1"
                                title="Partager l'écran"
                            >
                                <i class="bi" :class="isScreenSharing ? 'bi-stop-circle-fill' : 'bi-display-fill'" />
                            </button>

                            <button
                                @click="toggleMic"
                                :class="!isMicOn ? 'bg-red-500/50 text-red-200' : ''"
                                class="rounded-full bg-(--white)/10 hover:bg-(--white)/20 text-(--white) transition-all w-12 h-12 text-xl mx-1"
                                :title="isMicOn ? 'Couper le micro' : 'Activer le micro'"
                            >
                                <i class="bi" :class="isMicOn ? 'bi-mic-fill' : 'bi-mic-mute-fill'" />
                            </button>

                            <button
                                @click="toggleCam"
                                :class="!isCamOn ? 'bg-(--white)/5 text-(--white)/50' : ''"
                                class="rounded-full bg-(--white)/10 hover:bg-(--white)/20 text-(--white) transition-all w-12 h-12 text-xl mx-1"
                                :title="isCamOn ? 'Désactiver la caméra' : 'Activer la caméra'"
                            >
                                <i class="bi" :class="isCamOn ? 'bi-camera-video-fill' : 'bi-camera-video-off-fill'" />
                            </button>

                            <button
                                @click="handleEndCall"
                                class="rounded-full bg-red-500 hover:bg-red-600 text-(--white) shadow-lg shadow-red-500/20 transition-all hover:scale-110 flex items-center justify-center w-14 h-14 text-2xl mx-1"
                                title="Raccrocher"
                            >
                                <i class="bi bi-telephone-x-fill" />
                            </button>
                        </div>

                    </div>
                </div>
        </Transition>

        <!-- SAS / Fingerprint Verification Panel -->
        <Transition name="fade">
            <div
                v-if="showVerifyPanel"
                class="fixed inset-0 z-[1100] bg-(--black)/70 flex items-center justify-center p-4"
                @click.self="showVerifyPanel = false"
            >
                <div class="w-full max-w-sm bg-(--bg2) rounded-2xl p-6 shadow-2xl border border-(--white)/10">

                    <div class="flex items-center gap-3 text-blue-400 mb-3">
                        <i class="bi bi-shield-lock text-2xl" />
                        <h3 class="text-lg font-bold text-(--text)">Vérifier l'appel</h3>
                    </div>

                    <p class="text-sm text-(--text2) mb-4 leading-relaxed">
                        Lisez ce code à voix haute à votre interlocuteur, et demandez-lui de lire le sien.
                        S'ils correspondent, l'appel n'est pas intercepté.
                    </p>

                    <div class="mb-4 px-4 py-3 rounded-xl bg-(--bg)/60 border border-(--white)/10 text-center">
                        <span class="text-xl font-mono tracking-[0.2em] text-(--text)">{{ localFingerprint }}</span>
                    </div>

                    <label class="text-xs text-(--text2) mb-2 block">Code lu par votre interlocuteur :</label>
                    <input
                        v-model="fingerprintInput"
                        type="text"
                        maxlength="16"
                        placeholder="Ex: 1A2B3C4D5E6F7890"
                        class="w-full bg-black/20 border rounded-lg px-4 py-2 text-sm text-(--text) outline-none transition-all mb-2 font-mono uppercase"
                        :class="verifyError ? 'border-red-500/60' : 'border-(--text)/10 focus:border-(--primary)/50'"
                        @keydown.enter="confirmFingerprint"
                    />
                    <p v-if="verifyError" class="text-xs text-red-400 mb-4">
                        Ce code ne correspond pas — l'appel pourrait être intercepté. Ne confirmez que si les deux codes sont réellement identiques.
                    </p>
                    <p v-else class="text-xs text-transparent mb-4 select-none">.</p>

                    <div class="flex justify-end gap-3">
                        <button @click="showVerifyPanel = false" class="default">Plus tard</button>
                        <button @click="confirmFingerprint" :disabled="!fingerprintInput.trim()" class="primary" :class="{ 'opacity-40 cursor-not-allowed': !fingerprintInput.trim() }">
                            Confirmer
                        </button>
                    </div>

                </div>
            </div>
        </Transition>

        <!-- Minimized Floating Window (16:9) - Only one instance per call -->
        <Transition name="slide-fade">
            <DraggableWindow 
                v-if="isCalling && isMinimized"
                :initialX="windowX"
                :initialY="windowY"
                :active="true"
                width="320px"
                height="180px"
                class="z-[1001]"
                :key="remoteStreams.size > 0 ? `call-${Array.from(remoteStreams.keys())[0]}` : 'call-waiting'"
            >
                <template #header>
                    <div 
                        class="
                            relative w-full h-full bg-(--bg2) rounded-2xl 
                            overflow-hidden shadow-2xl border border-(--white)/10
                            group
                        "
                    >
                        <!-- Header with close/minimize and timer -->
                        <div class="absolute top-2 left-2 right-2 z-10 flex items-center justify-between">
                            <button 
                                @click="handleEndCall"
                                class="rounded-full bg-red-500/80 hover:bg-red-500 p-1.5 text-white transition-colors"
                                title="Raccrocher"
                            >
                                <i class="bi bi-telephone-x-fill text-sm" />
                            </button>
                            
                            <div v-if="callTimer" class="px-2 py-1 rounded bg-(--black)/40">
                                <span class="text-xs font-mono text-(--white)">{{ callTimer }}</span>
                            </div>

                            <button 
                                @click="isMinimized = false"
                                class="rounded-full bg-(--primary)/80 hover:bg-(--primary) p-1.5 text-white transition-colors"
                                title="Plein écran"
                            >
                                <i class="bi bi-arrows-angle-expand text-sm" />
                            </button>
                        </div>

                        <!-- Video Content -->
                        <div class="w-full h-full relative pt-8">
                            
                            <!-- Remote Streams -->
                            <div v-if="remoteStreams.size" class="w-full h-full">
                                <video 
                                    :srcObject="Array.from(remoteStreams.values())[0] as MediaStream" 
                                    autoplay 
                                    class="w-full h-full object-cover"
                                />
                                <div class="absolute bottom-1 left-1 bg-(--black)/70 px-1.5 py-0.5 rounded text-[10px]">
                                    <span class="text-(--white) font-medium truncate max-w-[120px] block">{{ getParticipantName(Array.from(remoteStreams.keys())[0] as string) }}</span>
                                </div>
                            </div>
                            
                            <!-- Waiting State - Minimal, timer shows call is active -->
                            <div v-else class="w-full h-full flex items-center justify-center">
                                <div class="w-10 h-10 rounded-full bg-(--white)/5 flex items-center justify-center animate-pulse">
                                    <i class="bi bi-person-fill text-xl" />
                                </div>
                            </div>

                            <!-- Local Video Preview (small) -->
                            <div 
                                v-if="localStream && isCamOn" 
                                class="
                                    absolute bottom-2 right-2 w-20 aspect-video 
                                    overflow-hidden border border-(--white)/20 
                                    shadow-lg bg-(--black) rounded-lg
                                "
                            >
                                <video 
                                    :srcObject="localStream" 
                                    autoplay 
                                    muted 
                                    class="w-full h-full object-cover mirror"
                                />
                            </div>

                            <!-- Security Badge (minimized) -->
                            <button
                                v-if="securityStatus?.encrypted"
                                @click="!isCurrentPeerVerified ? openVerifyPanel() : undefined"
                                class="absolute bottom-2 left-2 px-2 py-0.5 rounded-full text-[10px] font-medium"
                                :class="isCurrentPeerVerified ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-300'"
                            >
                                <i class="bi text-xs" :class="isCurrentPeerVerified ? 'bi-shield-check-fill' : 'bi-shield-lock'" />
                                <span class="ml-0.5">E2EE</span>
                            </button>

                        </div>

                        <!-- Hover Controls (minimized) -->
                        <div 
                            class="
                                absolute left-1/2 -translate-x-1/2 -bottom-10 
                                flex items-center bg-(--black)/60 border-(--white)/10
                                backdrop-blur-xl rounded-full border-t p-1.5
                                opacity-0 group-hover:opacity-100 group-hover:-bottom-2
                                transition-all duration-200
                            "
                        >
                            <button
                                @click="toggleMic"
                                :class="!isMicOn ? 'bg-red-500/50 text-red-200' : ''"
                                class="rounded-full bg-(--white)/10 hover:bg-(--white)/20 text-(--white) transition-all w-9 h-9 text-lg mx-1"
                            >
                                <i class="bi" :class="isMicOn ? 'bi-mic-fill' : 'bi-mic-mute-fill'" />
                            </button>

                            <button
                                @click="toggleCam"
                                :class="!isCamOn ? 'bg-(--white)/5 text-(--white)/50' : ''"
                                class="rounded-full bg-(--white)/10 hover:bg-(--white)/20 text-(--white) transition-all w-9 h-9 text-lg mx-1"
                            >
                                <i class="bi" :class="isCamOn ? 'bi-camera-video-fill' : 'bi-camera-video-off-fill'" />
                            </button>
                        </div>

                    </div>
                </template>
            </DraggableWindow>
        </Transition>

    </Teleport>
</template>

<script setup lang="ts">

import useSecurePeer from '@/composables/useSecurePeer';
import { computed, onUnmounted, ref, watch } from 'vue';
import DraggableWindow from '../common/DraggableWindow.vue';
import { openedOrg } from '@/assets/var';

const isMinimized = ref<boolean>(false);
const windowX = ref<number>(window.innerWidth - 350);
const windowY = ref<number>(window.innerHeight - 220);

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
    getCallSecurityStatus,
    verifySecurityFingerprint
} = useSecurePeer();

// Get the current call's peer id — mirrors `securityStatus` below, so both
// stay in sync with whichever remote participant is currently connected.
const currentPeerId = computed<string | null>(() => {
    if (remoteStreams.value.size === 0) return null;
    return (remoteStreams.value.keys().next().value as string) ?? null;
});

// SAS verification: two peers only share the exact same fingerprint if
// their ECDH key exchange wasn't intercepted (cf. useSecurePeer.ts
// generateFingerprint). Tracked per-peerId, in-memory only, and reset on
// call end — verifying today says nothing about tomorrow's call.
const verifiedPeers = ref<Set<string>>(new Set());
const showVerifyPanel = ref<boolean>(false);
const fingerprintInput = ref<string>('');
const verifyError = ref<boolean>(false);

const isCurrentPeerVerified = computed<boolean>(() =>
    currentPeerId.value !== null && verifiedPeers.value.has(currentPeerId.value)
);

const localFingerprint = computed<string>(() => {
    if (!currentPeerId.value) return '';
    return getCallSecurityStatus(currentPeerId.value).fingerprint;
});

const openVerifyPanel = () => {
    fingerprintInput.value = '';
    verifyError.value = false;
    showVerifyPanel.value = true;
};

const confirmFingerprint = () => {
    if (!currentPeerId.value) return;
    const ok = verifySecurityFingerprint(currentPeerId.value, fingerprintInput.value.trim());
    if (ok) {
        verifiedPeers.value = new Set(verifiedPeers.value).add(currentPeerId.value);
        showVerifyPanel.value = false;
    } else {
        verifyError.value = true;
    }
};

// Call timer
const callStartTime = ref<number | null>(null);
const callTimer = ref<string>('');

// Compute security status for display
const securityStatus = computed(() => {
    return currentPeerId.value ? getCallSecurityStatus(currentPeerId.value) : null;
});

// Get participant name by peer ID
const getParticipantName = (peerId: string): string => {
    if (!openedOrg.value?.members) return 'Utilisateur';
    const member = openedOrg.value.members.find(m => m.user?.id === peerId);
    return member?.user?.name || peerId.substring(0, 8);
};

// Start call timer when call begins
const startTimer = () => {
    if (callStartTime.value) return;
    callStartTime.value = Date.now();
    updateTimer();
    const timerInterval = setInterval(updateTimer, 1000);
    
    onUnmounted(() => {
        clearInterval(timerInterval);
    });
};

const stopTimer = () => {
    callStartTime.value = null;
    callTimer.value = '';
};

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
    stopTimer();
    isMinimized.value = false;
    verifiedPeers.value = new Set();
    showVerifyPanel.value = false;
};

// Watch for call state changes to manage timer
watch(() => isCalling.value, (newVal) => {
    if (newVal && remoteStreams.value.size > 0) {
        startTimer();
    } else {
        stopTimer();
    }
}, { immediate: true });

// Also watch remote streams
watch(() => remoteStreams.value.size, (newSize) => {
    if (newSize > 0 && isCalling.value) {
        startTimer();
    }
});

// Cleanup on unmount
onUnmounted(() => {
    stopTimer();
    endCall();
});

</script>

<style scoped>

.mirror {
    transform: scaleX(-1);
}

.fade-enter-active,
.fade-leave-active {
    transition: opacity 0.3s ease, transform 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
    opacity: 0;
    transform: scale(0.95);
}

.slide-fade-enter-active {
    transition: all 0.3s ease-out;
}

.slide-fade-leave-active {
    transition: all 0.2s cubic-bezier(1.0, 0.5, 0.8, 1.0);
}

.slide-fade-enter-from,
.slide-fade-leave-to {
    transform: translateX(20px);
    opacity: 0;
}

</style>

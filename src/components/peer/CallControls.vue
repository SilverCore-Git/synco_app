<template>
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
                : 'bottom-25 gap-6 px-8 py-4'
        "
    >
        
        <!-- Screen Share Button -->
        <button
            v-if="!isMinimized"
            @click="toggleScreenShare"
            :class="[
                isMinimized ? 'w-10 h-10 text-lg' : 'w-12 h-12 text-xl',
                isScreenSharing ? 'bg-(--primary)/30 text-(--primary)' : ''
            ]"
            class="rounded-full bg-(--white)/10 hover:bg-(--white)/20 text-(--white) transition-all"
            :title="isScreenSharing ? 'Arrêter le partage d\'écran' : 'Partager l\'écran'"
        >
            <i class="bi" :class="isScreenSharing ? 'bi-stop-circle-fill' : 'bi-display-fill'" />
        </button>

        <!-- Mic Button -->
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

        <!-- Camera Button -->
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

        <!-- End Call Button -->
        <button
            @click="handleEndCall"
            :class="isMinimized ? 'w-12 h-12 text-xl' : 'w-14 h-14 text-2xl'"
            class="rounded-full bg-red-500 hover:bg-red-600 text-(--white) shadow-lg shadow-red-500/20 transition-all hover:scale-110 flex items-center justify-center"
            title="Raccrocher"
        >
            <i class="bi bi-telephone-x-fill" />
        </button>

    </div>
</template>

<script setup lang="ts">

interface Props {
    isMinimized?: boolean;
    isMicOn: boolean;
    isCamOn: boolean;
    isScreenSharing: boolean;
}

const props = defineProps<Props>();

const emit = defineEmits(['toggleMic', 'toggleCam', 'toggleScreenShare', 'endCall']);

const toggleMic = () => emit('toggleMic');
const toggleCam = () => emit('toggleCam');
const toggleScreenShare = () => emit('toggleScreenShare');
const handleEndCall = () => emit('endCall');

</script>

<template>
    <div
        class="
            absolute left-1/2 -translate-x-1/2 bottom-25 flex
            items-center gap-6 px-8 py-4
            bg-(--black)/40 border-(--white)/10
            backdrop-blur-xl rounded-full border-t
            transition-all duration-200
        "
    >

        <!-- Screen Share Button -->
        <button
            @click="toggleScreenShare"
            :class="isScreenSharing ? 'bg-(--primary)/30 text-(--primary)' : ''"
            class="rounded-full w-12 h-12 text-xl bg-(--white)/10 hover:bg-(--white)/20 text-(--white) transition-all"
            :title="isScreenSharing ? 'Arrêter le partage d\'écran' : 'Partager l\'écran'"
        >
            <i class="bi" :class="isScreenSharing ? 'bi-stop-circle-fill' : 'bi-display-fill'" />
        </button>

        <!-- Camera Button -->
        <button
            @click="toggleCam"
            :class="!isCamOn ? 'bg-(--white)/5 text-(--white)/50' : ''"
            class="rounded-full w-12 h-12 text-xl bg-(--white)/10 hover:bg-(--white)/20 text-(--white) transition-all"
            :title="isCamOn ? 'Désactiver la caméra' : 'Activer la caméra'"
        >
            <i class="bi" :class="isCamOn ? 'bi-camera-video-fill' : 'bi-camera-video-off-fill'" />
        </button>

        <!-- Mic Button -->
        <button
            @click="toggleMic"
            :class="!isMicOn ? 'bg-red-500/50 text-red-200' : ''"
            class="rounded-full w-12 h-12 text-xl bg-(--white)/10 hover:bg-(--white)/20 text-(--white) transition-all"
            :title="isMicOn ? 'Couper le micro' : 'Activer le micro'"
        >
            <i class="bi" :class="isMicOn ? 'bi-mic-fill' : 'bi-mic-mute-fill'" />
        </button>

        <!-- Deafen Button -->
        <button
            @click="toggleDeafen"
            :class="isDeafened ? 'bg-red-500/50 text-red-200' : ''"
            class="rounded-full w-12 h-12 text-xl bg-(--white)/10 hover:bg-(--white)/20 text-(--white) transition-all"
            :title="isDeafened ? 'Réactiver le son' : 'Couper le son'"
        >
            <i class="bi" :class="isDeafened ? 'bi-volume-mute-fill' : 'bi-volume-up-fill'" />
        </button>

        <!-- Invite Button -->
        <button
            @click="handleInvite"
            class="rounded-full w-12 h-12 text-xl bg-(--white)/10 hover:bg-(--white)/20 text-(--white) transition-all"
            title="Inviter un membre"
        >
            <i class="bi bi-person-plus-fill" />
        </button>

        <!-- End Call Button -->
        <button
            @click="handleEndCall"
            class="rounded-full w-14 h-14 text-2xl bg-red-500 hover:bg-red-600 text-(--white) shadow-lg shadow-red-500/20 transition-all hover:scale-110 flex items-center justify-center"
            title="Raccrocher"
        >
            <i class="bi bi-telephone-x-fill" />
        </button>

    </div>
</template>

<script setup lang="ts">

interface Props {
    isMicOn: boolean;
    isCamOn: boolean;
    isScreenSharing: boolean;
    isDeafened?: boolean;
}

const props = defineProps<Props>();

const emit = defineEmits(['toggleMic', 'toggleCam', 'toggleScreenShare', 'toggleDeafen', 'endCall', 'invite']);

const toggleMic = () => emit('toggleMic');
const toggleCam = () => emit('toggleCam');
const toggleScreenShare = () => emit('toggleScreenShare');
const toggleDeafen = () => emit('toggleDeafen');
const handleEndCall = () => emit('endCall');
const handleInvite = () => emit('invite');

</script>

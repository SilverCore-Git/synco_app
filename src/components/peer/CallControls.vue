<template>
    <div
        class="
            flex items-center gap-3 px-6 py-3
            bg-(--black)/40 border-(--white)/10
            backdrop-blur-xl rounded-2xl border-t
            transition-all duration-200
        "
    >

        <!-- Screen Share -->
        <div class="flex items-stretch rounded-xl overflow-hidden bg-(--white)/10">
            <button
                @click="toggleScreenShare"
                :class="isScreenSharing ? 'bg-(--primary)/30 text-(--primary)' : 'hover:bg-(--white)/10'"
                class="w-12 h-12 text-xl text-(--white) transition-all flex items-center justify-center"
                :title="isScreenSharing ? 'Arrêter le partage d\'écran' : 'Partager l\'écran'"
            >
                <i class="bi" :class="isScreenSharing ? 'bi-stop-circle-fill' : 'bi-display-fill'" />
            </button>
            <DropDown align="top" contentInerTW="!w-64">
                <template #trigger>
                    <button class="w-6 h-12 flex items-center justify-center text-(--white)/60 hover:text-(--white) hover:bg-(--white)/10 border-l border-(--white)/10 transition-colors">
                        <i class="bi bi-chevron-up text-[10px]" />
                    </button>
                </template>
                <template #content>
                    <div class="px-3 py-2 text-xs font-semibold text-(--text2)">Partage d'écran</div>
                    <div class="px-3 pb-2 flex gap-2" @click.stop>
                        <select v-model="screenResolutionKey" @change="onScreenQualityChange" class="voice-select">
                            <option v-for="k in resolutionKeys" :key="k" :value="k">{{ k }}</option>
                        </select>
                        <select v-model.number="prefs.screenFrameRate" @change="onScreenQualityChange" class="voice-select">
                            <option v-for="fr in frameRates" :key="fr" :value="fr">{{ fr }} fps</option>
                        </select>
                    </div>
                </template>
            </DropDown>
        </div>

        <!-- Camera -->
        <div class="flex items-stretch rounded-xl overflow-hidden bg-(--white)/10">
            <button
                @click="toggleCam"
                :class="!isCamOn ? 'text-(--white)/50' : 'hover:bg-(--white)/10'"
                class="w-12 h-12 text-xl text-(--white) transition-all flex items-center justify-center"
                :title="isCamOn ? 'Désactiver la caméra' : 'Activer la caméra'"
            >
                <i class="bi" :class="isCamOn ? 'bi-camera-video-fill' : 'bi-camera-video-off-fill'" />
            </button>
            <DropDown align="top" contentInerTW="!w-64">
                <template #trigger>
                    <button class="w-6 h-12 flex items-center justify-center text-(--white)/60 hover:text-(--white) hover:bg-(--white)/10 border-l border-(--white)/10 transition-colors">
                        <i class="bi bi-chevron-up text-[10px]" />
                    </button>
                </template>
                <template #content>
                    <div class="px-3 py-2 text-xs font-semibold text-(--text2)">Caméra</div>
                    <div class="px-3 pb-2 flex flex-col gap-2" @click.stop>
                        <select v-model="prefs.camDeviceId" @change="onCamDeviceChange" class="voice-select w-full">
                            <option :value="undefined">Par défaut</option>
                            <option v-for="d in camDevices" :key="d.deviceId" :value="d.deviceId">{{ d.label || 'Caméra' }}</option>
                        </select>
                        <div class="flex gap-2">
                            <select v-model="camResolutionKey" @change="onCamQualityChange" class="voice-select flex-1">
                                <option v-for="k in resolutionKeys" :key="k" :value="k">{{ k }}</option>
                            </select>
                            <select v-model.number="prefs.camFrameRate" @change="onCamQualityChange" class="voice-select flex-1">
                                <option v-for="fr in frameRates" :key="fr" :value="fr">{{ fr }} fps</option>
                            </select>
                        </div>
                        <div class="grid grid-cols-4 gap-1">
                            <button
                                v-for="mode in qualityModes"
                                :key="mode.value"
                                @click="onQualityModeChange(mode.value)"
                                class="text-[10px] py-1.5 rounded-md border transition-all"
                                :class="prefs.qualityMode === mode.value
                                    ? 'bg-(--primary)/20 border-(--primary) text-(--primary)'
                                    : 'border-(--border-color) text-(--text2) hover:text-(--text)'"
                            >
                                {{ mode.label }}
                            </button>
                        </div>
                    </div>
                </template>
            </DropDown>
        </div>

        <!-- Mic -->
        <div class="flex items-stretch rounded-xl overflow-hidden bg-(--white)/10">
            <button
                @click="toggleMic"
                :class="!isMicOn ? 'bg-red-500/50 text-red-200' : 'hover:bg-(--white)/10'"
                class="w-12 h-12 text-xl text-(--white) transition-all flex items-center justify-center"
                :title="isMicOn ? 'Couper le micro' : 'Activer le micro'"
            >
                <i class="bi" :class="isMicOn ? 'bi-mic-fill' : 'bi-mic-mute-fill'" />
            </button>
            <DropDown align="top" contentInerTW="!w-64">
                <template #trigger>
                    <button class="w-6 h-12 flex items-center justify-center text-(--white)/60 hover:text-(--white) hover:bg-(--white)/10 border-l border-(--white)/10 transition-colors">
                        <i class="bi bi-chevron-up text-[10px]" />
                    </button>
                </template>
                <template #content>
                    <div class="px-2 py-1.5 text-xs font-semibold text-(--text2)">Microphone</div>
                    <button
                        v-for="d in micDevices"
                        :key="d.deviceId"
                        @click="selectMic(d.deviceId)"
                        class="dropdown-item-style dropdown-item-annimate justify-between gap-2"
                    >
                        <span class="truncate">{{ d.label || 'Microphone' }}</span>
                        <i v-if="prefs.micDeviceId === d.deviceId" class="bi bi-check text-(--primary)" />
                    </button>
                </template>
            </DropDown>
        </div>

        <!-- Deafen / Speaker -->
        <div class="flex items-stretch rounded-xl overflow-hidden bg-(--white)/10">
            <button
                @click="toggleDeafen"
                :class="isDeafened ? 'bg-red-500/50 text-red-200' : 'hover:bg-(--white)/10'"
                class="w-12 h-12 text-xl text-(--white) transition-all flex items-center justify-center"
                :title="isDeafened ? 'Réactiver le son' : 'Couper le son'"
            >
                <i class="bi" :class="isDeafened ? 'bi-volume-mute-fill' : 'bi-volume-up-fill'" />
            </button>
            <DropDown align="top" contentInerTW="!w-64">
                <template #trigger>
                    <button class="w-6 h-12 flex items-center justify-center text-(--white)/60 hover:text-(--white) hover:bg-(--white)/10 border-l border-(--white)/10 transition-colors">
                        <i class="bi bi-chevron-up text-[10px]" />
                    </button>
                </template>
                <template #content>
                    <div class="px-2 py-1.5 text-xs font-semibold text-(--text2)">Enceinte</div>
                    <button
                        v-for="d in speakerDevices"
                        :key="d.deviceId"
                        @click="selectSpeaker(d.deviceId)"
                        class="dropdown-item-style dropdown-item-annimate justify-between gap-2"
                    >
                        <span class="truncate">{{ d.label || 'Enceinte' }}</span>
                        <i v-if="prefs.speakerDeviceId === d.deviceId" class="bi bi-check text-(--primary)" />
                    </button>
                    <p v-if="!speakerDevices.length" class="px-3 py-2 text-[11px] text-(--text2) leading-relaxed">
                        {{ supportsSinkId
                            ? "Aucune enceinte détectée."
                            : "Votre navigateur ne permet pas de choisir l'enceinte de sortie (non supporté par Firefox/Safari — essayez Chrome ou Edge)." }}
                    </p>
                </template>
            </DropDown>
        </div>

        <!-- Invite Button -->
        <button
            v-if="showInvite"
            @click="handleInvite"
            class="rounded-xl w-12 h-12 text-xl bg-(--white)/10 hover:bg-(--white)/20 text-(--white) transition-all"
            title="Inviter un membre"
        >
            <i class="bi bi-person-plus-fill" />
        </button>

        <!-- End Call Button -->
        <button
            @click="handleEndCall"
            class="rounded-xl w-14 h-14 text-2xl bg-red-500 hover:bg-red-600 text-(--white) shadow-lg shadow-red-500/20 transition-all hover:scale-105 flex items-center justify-center"
            title="Raccrocher"
        >
            <i class="bi bi-telephone-x-fill" />
        </button>

    </div>
</template>

<script setup lang="ts">

import { onMounted, onUnmounted, ref } from 'vue';
import DropDown from '@/components/DropDown.vue';
import {
    getVoicePrefs,
    saveVoicePrefs,
    resolveCameraCaptureOptions,
    RESOLUTION_PRESETS,
    FRAMERATE_PRESETS,
    type VideoQualityMode,
} from '@/assets/utils/voicePrefs';

interface Props {
    isMicOn: boolean;
    isCamOn: boolean;
    isScreenSharing: boolean;
    isDeafened?: boolean;
    // Partagé par useLiveKit.ts (vocal threads) et useSecurePeer.ts (appels
    // privés) — chacun a sa propre implémentation, donc ce composant les
    // reçoit en props plutôt que d'importer l'un des deux composables
    // directement, ce qui le rendrait inutilisable par l'autre système.
    switchDevice: (kind: MediaDeviceKind, deviceId: string) => void | Promise<void>;
    applyVideoQuality: (
        source: 'camera' | 'screenshare',
        options: { resolution: { width: number; height: number }; frameRate: number }
    ) => void | Promise<void>;
    showInvite?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
    showInvite: true,
});

const emit = defineEmits(['toggleMic', 'toggleCam', 'toggleScreenShare', 'toggleDeafen', 'endCall', 'invite']);

const toggleMic = () => emit('toggleMic');
const toggleCam = () => emit('toggleCam');
const toggleScreenShare = () => emit('toggleScreenShare');
const toggleDeafen = () => emit('toggleDeafen');
const handleEndCall = () => emit('endCall');
const handleInvite = () => emit('invite');

const prefs = ref(getVoicePrefs());
const micDevices = ref<MediaDeviceInfo[]>([]);
const camDevices = ref<MediaDeviceInfo[]>([]);
const speakerDevices = ref<MediaDeviceInfo[]>([]);

// Firefox et Safari n'implémentent pas HTMLMediaElement.setSinkId — enumerateDevices()
// n'y remonte alors jamais de device 'audiooutput', ce qui faisait disparaître le
// sélecteur d'enceinte sans explication. On distingue "pas de device" de
// "navigateur non supporté" pour donner un message utile plutôt qu'un vide silencieux.
const supportsSinkId = typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;

const resolutionKeys = Object.keys(RESOLUTION_PRESETS) as Array<keyof typeof RESOLUTION_PRESETS>;
const frameRates = FRAMERATE_PRESETS;
const qualityModes: { value: VideoQualityMode; label: string }[] = [
    { value: 'auto', label: 'Auto' },
    { value: 'low', label: 'Basse' },
    { value: 'medium', label: 'Moyenne' },
    { value: 'high', label: 'Haute' },
];

const findResolutionKey = (res: { width: number; height: number }) =>
    resolutionKeys.find(k => RESOLUTION_PRESETS[k].width === res.width && RESOLUTION_PRESETS[k].height === res.height) || '720p';

const camResolutionKey = ref(findResolutionKey(prefs.value.camResolution));
const screenResolutionKey = ref(findResolutionKey(prefs.value.screenResolution));

const loadDevices = async () => {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        micDevices.value = devices.filter(d => d.kind === 'audioinput');
        camDevices.value = devices.filter(d => d.kind === 'videoinput');
        speakerDevices.value = devices.filter(d => d.kind === 'audiooutput');
    } catch (e) {
        console.error('[CallControls] enumerateDevices a échoué:', e);
    }
};

onMounted(() => {
    loadDevices();
    navigator.mediaDevices?.addEventListener?.('devicechange', loadDevices);
});
onUnmounted(() => {
    navigator.mediaDevices?.removeEventListener?.('devicechange', loadDevices);
});

const selectMic = (deviceId: string) => {
    prefs.value.micDeviceId = deviceId;
    saveVoicePrefs({ micDeviceId: deviceId });
    props.switchDevice('audioinput', deviceId);
};

const selectSpeaker = (deviceId: string) => {
    prefs.value.speakerDeviceId = deviceId;
    saveVoicePrefs({ speakerDeviceId: deviceId });
    props.switchDevice('audiooutput', deviceId);
};

const onCamDeviceChange = () => {
    saveVoicePrefs({ camDeviceId: prefs.value.camDeviceId });
    if (prefs.value.camDeviceId) props.switchDevice('videoinput', prefs.value.camDeviceId);
};

const onCamQualityChange = () => {
    const resolution = RESOLUTION_PRESETS[camResolutionKey.value as keyof typeof RESOLUTION_PRESETS];
    prefs.value.camResolution = resolution;
    saveVoicePrefs({ camResolution: resolution, camFrameRate: prefs.value.camFrameRate });
    if (props.isCamOn) {
        props.applyVideoQuality('camera', { resolution, frameRate: prefs.value.camFrameRate });
    }
};

const onScreenQualityChange = () => {
    const resolution = RESOLUTION_PRESETS[screenResolutionKey.value as keyof typeof RESOLUTION_PRESETS];
    prefs.value.screenResolution = resolution;
    saveVoicePrefs({ screenResolution: resolution, screenFrameRate: prefs.value.screenFrameRate });
    if (props.isScreenSharing) {
        props.applyVideoQuality('screenshare', { resolution, frameRate: prefs.value.screenFrameRate });
    }
};

const onQualityModeChange = (mode: VideoQualityMode) => {
    prefs.value.qualityMode = mode;
    saveVoicePrefs({ qualityMode: mode });
    const { resolution, frameRate } = resolveCameraCaptureOptions(prefs.value);
    if (props.isCamOn) {
        props.applyVideoQuality('camera', { resolution, frameRate });
    }
};

</script>

<style scoped>
@reference "@/style.css";

.voice-select {
    @apply bg-(--bg2) border border-(--border-color) rounded-lg px-2 py-1.5 text-xs text-(--text) outline-none focus:border-(--primary)/50 transition-colors;
}
</style>

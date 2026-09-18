<template>

    <Popup :isOpen="isOpen" @close="emit('close')">

        <template #title>Réglages du salon vocal</template>

        <div class="flex flex-col gap-6">

            <!-- Microphone -->
            <section>
                <h4 class="text-sm font-semibold text-(--text) mb-2 flex items-center gap-2">
                    <i class="bi bi-mic" /> Microphone
                </h4>
                <select v-model="prefs.micDeviceId" @change="onMicChange" class="voice-select">
                    <option :value="undefined">Par défaut</option>
                    <option v-for="d in micDevices" :key="d.deviceId" :value="d.deviceId">
                        {{ d.label || 'Microphone' }}
                    </option>
                </select>
            </section>

            <!-- Enceinte -->
            <section v-if="speakerDevices.length">
                <h4 class="text-sm font-semibold text-(--text) mb-2 flex items-center gap-2">
                    <i class="bi bi-volume-up" /> Enceinte
                </h4>
                <select v-model="prefs.speakerDeviceId" @change="onSpeakerChange" class="voice-select">
                    <option :value="undefined">Par défaut</option>
                    <option v-for="d in speakerDevices" :key="d.deviceId" :value="d.deviceId">
                        {{ d.label || 'Enceinte' }}
                    </option>
                </select>
            </section>

            <!-- Caméra -->
            <section>
                <h4 class="text-sm font-semibold text-(--text) mb-2 flex items-center gap-2">
                    <i class="bi bi-camera-video" /> Caméra
                </h4>
                <div class="flex flex-col gap-2">
                    <select v-model="prefs.camDeviceId" @change="onCamDeviceChange" class="voice-select">
                        <option :value="undefined">Par défaut</option>
                        <option v-for="d in camDevices" :key="d.deviceId" :value="d.deviceId">
                            {{ d.label || 'Caméra' }}
                        </option>
                    </select>
                    <div class="flex gap-2">
                        <select v-model="camResolutionKey" @change="onCamQualityChange" class="voice-select flex-1">
                            <option v-for="k in resolutionKeys" :key="k" :value="k">{{ k }}</option>
                        </select>
                        <select v-model.number="prefs.camFrameRate" @change="onCamQualityChange" class="voice-select flex-1">
                            <option v-for="fr in frameRates" :key="fr" :value="fr">{{ fr }} fps</option>
                        </select>
                    </div>
                </div>
            </section>

            <!-- Partage d'écran -->
            <section>
                <h4 class="text-sm font-semibold text-(--text) mb-2 flex items-center gap-2">
                    <i class="bi bi-display" /> Partage d'écran
                </h4>
                <div class="flex gap-2">
                    <select v-model="screenResolutionKey" @change="onScreenQualityChange" class="voice-select flex-1">
                        <option v-for="k in resolutionKeys" :key="k" :value="k">{{ k }}</option>
                    </select>
                    <select v-model.number="prefs.screenFrameRate" @change="onScreenQualityChange" class="voice-select flex-1">
                        <option v-for="fr in frameRates" :key="fr" :value="fr">{{ fr }} fps</option>
                    </select>
                </div>
            </section>

            <!-- Qualité vidéo -->
            <section>
                <h4 class="text-sm font-semibold text-(--text) mb-2 flex items-center gap-2">
                    <i class="bi bi-speedometer2" /> Qualité vidéo
                </h4>
                <div class="grid grid-cols-4 gap-2">
                    <button
                        v-for="mode in qualityModes"
                        :key="mode.value"
                        @click="onQualityModeChange(mode.value)"
                        class="text-xs py-2 rounded-lg border transition-all"
                        :class="prefs.qualityMode === mode.value
                            ? 'bg-(--primary)/20 border-(--primary) text-(--primary)'
                            : 'border-(--border-color) text-(--text2) hover:text-(--text)'"
                    >
                        {{ mode.label }}
                    </button>
                </div>
                <p class="text-[11px] text-(--text2) mt-2 leading-relaxed">
                    "Auto" adapte la résolution initiale à votre connexion. Le flux est aussi automatiquement
                    dégradé pour chaque spectateur selon sa propre bande passante.
                </p>
            </section>

        </div>

    </Popup>

</template>

<script setup lang="ts">

import { computed, ref, watch } from 'vue';
import { Track } from 'livekit-client';
import Popup from '@/components/Popup.vue';
import useLiveKit from '@/composables/useLiveKit';
import {
    getVoicePrefs,
    saveVoicePrefs,
    resolveCameraCaptureOptions,
    RESOLUTION_PRESETS,
    FRAMERATE_PRESETS,
    type VideoQualityMode,
} from '@/assets/utils/voicePrefs';

const props = defineProps<{
    isOpen: boolean;
}>();

const emit = defineEmits(['close']);

const { switchDevice, applyVideoQuality, isCameraEnabled, isScreenShareEnabled } = useLiveKit();

const prefs = ref(getVoicePrefs());
const micDevices = ref<MediaDeviceInfo[]>([]);
const camDevices = ref<MediaDeviceInfo[]>([]);
const speakerDevices = ref<MediaDeviceInfo[]>([]);

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
        console.error('[VoiceSettingsModal] enumerateDevices a échoué:', e);
    }
};

watch(() => props.isOpen, (open) => {
    if (open) {
        prefs.value = getVoicePrefs();
        camResolutionKey.value = findResolutionKey(prefs.value.camResolution);
        screenResolutionKey.value = findResolutionKey(prefs.value.screenResolution);
        loadDevices();
    }
});

const onMicChange = () => {
    saveVoicePrefs({ micDeviceId: prefs.value.micDeviceId });
    if (prefs.value.micDeviceId) switchDevice('audioinput', prefs.value.micDeviceId);
};

const onSpeakerChange = () => {
    saveVoicePrefs({ speakerDeviceId: prefs.value.speakerDeviceId });
    if (prefs.value.speakerDeviceId) switchDevice('audiooutput', prefs.value.speakerDeviceId);
};

const onCamDeviceChange = () => {
    saveVoicePrefs({ camDeviceId: prefs.value.camDeviceId });
    if (prefs.value.camDeviceId) switchDevice('videoinput', prefs.value.camDeviceId);
};

const onCamQualityChange = () => {
    const resolution = RESOLUTION_PRESETS[camResolutionKey.value as keyof typeof RESOLUTION_PRESETS];
    prefs.value.camResolution = resolution;
    saveVoicePrefs({ camResolution: resolution, camFrameRate: prefs.value.camFrameRate });
    if (isCameraEnabled.value) {
        applyVideoQuality(Track.Source.Camera, { resolution, frameRate: prefs.value.camFrameRate });
    }
};

const onScreenQualityChange = () => {
    const resolution = RESOLUTION_PRESETS[screenResolutionKey.value as keyof typeof RESOLUTION_PRESETS];
    prefs.value.screenResolution = resolution;
    saveVoicePrefs({ screenResolution: resolution, screenFrameRate: prefs.value.screenFrameRate });
    if (isScreenShareEnabled.value) {
        applyVideoQuality(Track.Source.ScreenShare, { resolution, frameRate: prefs.value.screenFrameRate });
    }
};

const onQualityModeChange = (mode: VideoQualityMode) => {
    prefs.value.qualityMode = mode;
    saveVoicePrefs({ qualityMode: mode });
    const { resolution, frameRate } = resolveCameraCaptureOptions(prefs.value);
    if (isCameraEnabled.value) {
        applyVideoQuality(Track.Source.Camera, { resolution, frameRate });
    }
};

</script>

<style scoped>

.voice-select {
    @apply w-full bg-(--bg2) border border-(--border-color) rounded-lg px-3 py-2 text-sm text-(--text) outline-none focus:border-(--primary)/50 transition-colors;
}

</style>

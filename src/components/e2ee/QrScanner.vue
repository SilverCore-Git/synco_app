<template>

    <div class="flex flex-col items-center gap-3">

        <div v-if="state !== 'error'" class="relative w-64 h-64 rounded-xl overflow-hidden bg-black">
            <video ref="video" class="w-full h-full object-cover" muted playsinline autoplay />
            <div class="absolute inset-6 border-2 border-white/70 rounded-lg pointer-events-none" />
            <div v-if="state === 'starting'" class="absolute inset-0 flex items-center justify-center text-white/80 text-sm">
                <i class="bi bi-camera-video mr-2" /> Ouverture de la caméra…
            </div>
        </div>

        <p v-if="state === 'error'" class="text-sm text-(--text2) text-center max-w-xs">
            <i class="bi bi-camera-video-off mr-1" />
            {{ errorMessage }}
        </p>

    </div>

</template>

<script setup lang="ts">

import { onMounted, onUnmounted, ref } from 'vue';

/**
 * Lecture d'un QR code par la caméra : BarcodeDetector natif quand il existe (Chrome, Edge,
 * Android), sinon jsQR (Firefox, Safari, WebKitGTK), chargé à la demande. Rien n'est envoyé : le
 * texte lu est émis tel quel au parent, qui le valide.
 */
const emit = defineEmits<{ result: [text: string]; unavailable: [] }>();

const video = ref<HTMLVideoElement | null>(null);
const state = ref<'starting' | 'scanning' | 'error'>('starting');
const errorMessage = ref('');

let stream: MediaStream | null = null;
let stopped = false;
let timer: ReturnType<typeof setTimeout> | null = null;

type Detector = { detect(source: CanvasImageSource): Promise<Array<{ rawValue: string }>> };

async function makeDecoder(): Promise<(v: HTMLVideoElement) => Promise<string | null>> {
    const BD = (window as unknown as { BarcodeDetector?: { new(o: { formats: string[] }): Detector; getSupportedFormats?: () => Promise<string[]> } }).BarcodeDetector;
    const formats: string[] = (await BD?.getSupportedFormats?.().catch(() => [] as string[])) ?? [];
    if (BD && formats.includes('qr_code')) {
        const detector = new BD({ formats: ['qr_code'] });
        return async (v) => (await detector.detect(v).catch(() => []))[0]?.rawValue ?? null;
    }
    const { default: jsQR } = await import('jsqr');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    return async (v) => {
        if (!ctx || !v.videoWidth) return null;
        const scale = Math.min(1, 640 / v.videoWidth);
        canvas.width = Math.round(v.videoWidth * scale);
        canvas.height = Math.round(v.videoHeight * scale);
        ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        return jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' })?.data ?? null;
    };
}

function stop() {
    stopped = true;
    if (timer) clearTimeout(timer);
    stream?.getTracks().forEach(t => t.stop());
    stream = null;
}

onMounted(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
        state.value = 'error';
        errorMessage.value = "La caméra n'est pas disponible ici. Saisissez le code à la main.";
        emit('unavailable');
        return;
    }
    try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        if (stopped) { stop(); return; }
        video.value!.srcObject = stream;
        await video.value!.play().catch(() => {});
        const decode = await makeDecoder();
        state.value = 'scanning';
        const tick = async () => {
            if (stopped || !video.value) return;
            const text = await decode(video.value);
            if (text && !stopped) {
                stop();
                emit('result', text);
                return;
            }
            timer = setTimeout(tick, 250);
        };
        tick();
    } catch (e) {
        state.value = 'error';
        errorMessage.value = (e as DOMException)?.name === 'NotAllowedError'
            ? "L'accès à la caméra a été refusé. Saisissez le code à la main."
            : "Impossible d'ouvrir la caméra. Saisissez le code à la main.";
        emit('unavailable');
    }
});

onUnmounted(stop);

</script>

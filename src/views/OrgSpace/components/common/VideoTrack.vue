<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { Participant, Track } from 'livekit-client';

const props = defineProps<{ participant: Participant }>();
const videoEl = ref<HTMLVideoElement | null>(null);

const updateTrack = () => {
    const trackPub = props.participant.getTrackPublication(Track.Source.ScreenShare) || 
                     props.participant.getTrackPublication(Track.Source.Camera);
    
    if (trackPub?.track && videoEl.value) {
        trackPub.track.attach(videoEl.value);
    }
};

onMounted(updateTrack);
watch(() => [props.participant.isCameraEnabled, props.participant.isScreenShareEnabled], updateTrack);

onUnmounted(() => {
    const trackPub = props.participant.getTrackPublication(Track.Source.ScreenShare) || 
                     props.participant.getTrackPublication(Track.Source.Camera);
    if (trackPub?.track && videoEl.value) {
        trackPub.track.detach(videoEl.value);
    }
});
</script>

<template>
    <video ref="videoEl" autoplay playsinline class="bg-black" />
</template>
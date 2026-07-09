<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { Participant, Track, TrackPublication } from 'livekit-client';

const props = defineProps<{ 
    participant: Participant;
    source?: Track.Source;
}>();

const videoEl = ref<HTMLVideoElement | null>(null);
let currentTrackPub: TrackPublication | undefined = undefined;

const updateTrack = () => {
    
    if (currentTrackPub?.track && videoEl.value) {
        currentTrackPub.track.detach(videoEl.value);
    }

    const trackPub = props.source 
        ? props.participant.getTrackPublication(props.source)
        : (props.participant.getTrackPublication(Track.Source.ScreenShare) || props.participant.getTrackPublication(Track.Source.Camera));
    
    if (trackPub?.track && videoEl.value) {
        trackPub.track.attach(videoEl.value);
        currentTrackPub = trackPub;
    }
};

onMounted(updateTrack);

// The tracks might not be immediately available or might change, so we can listen to participant events or watch properties.
// Since we don't have direct reactivity on LiveKit classes, we watch the boolean flags provided by the getters.
watch(() => [props.participant.isCameraEnabled, props.participant.isScreenShareEnabled, props.source], updateTrack);

onUnmounted(() => {
    if (currentTrackPub?.track && videoEl.value) {
        currentTrackPub.track.detach(videoEl.value);
    }
});
</script>

<template>
    <video ref="videoEl" autoplay playsinline class="bg-black" />
</template>
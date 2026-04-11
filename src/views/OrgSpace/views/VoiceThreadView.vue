<template>

    <div v-if="isConnected" class="flex-1 overflow-hidden">
            
        <div 
            class="
                flex flex-wrap justify-center items-center 
                gap-4 h-full w-full transition-all duration-500
            "
        >
                
            <div 
                v-for="p in [ ...allParticipants, ...allParticipants, ...allParticipants ]" 
                :key="p.identity"
                class="
                    relative bg-(--bg2) rounded-2xl 
                    overflow-hidden border border-white/5
                    flex items-center justify-center group
                    w-lg h-70
                "
            >
                    
                <VideoTrack 
                    v-if="p.isCameraEnabled || p.isScreenShareEnabled"
                    :participant="p"
                    class="w-full h-full object-contain"
                />

                <div v-else class="flex flex-col items-center gap-4">

                    <div class="relative">
                        
                        <img 
                            :src="getMeta(p).avatarUrl || `https://ui-avatars.com/api/?name=${getMeta(p).name}`" 
                            class="w-24 h-24 rounded-full border-4 transition-all duration-300"
                            :class="p.isSpeaking ? 'border-(--primary) scale-110 shadow-[0_0_20px_rgba(var(--primary-rgb),0.4)]' : 'border-transparent'"
                        />

                    </div>

                </div>

                <div 
                    class="
                        absolute bottom-3 left-3 
                        flex items-center gap-2 
                        bg-black/60 backdrop-blur-md 
                        px-3 py-1.5 rounded-lg border 
                        border-white/10
                    "
                >

                    <i v-if="p.isScreenShareEnabled" class="bi bi-display text-blue-400 text-xs" />
                    <span class="text-xs font-bold text-white">{{ getMeta(p).name || 'Anonyme' }}</span>
                    <i v-if="!p.isMicrophoneEnabled" class="bi bi-mic-mute-fill text-red-500 text-xs" />

                </div>

                <div class="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div class="bg-black/40 p-1.5 rounded-md text-[10px] text-white/60">
                        {{ p.connectionQuality }}
                    </div>
                </div>

            </div>

        </div>

    </div>
    
</template>


<script setup lang="ts">

import { computed } from 'vue';
import useLiveKit from '@/composables/useLiveKit';
import VideoTrack from '../components/common/VideoTrack.vue';
import type { Thread } from '@/types/types';

const { room, isConnected } = useLiveKit();


defineProps<{
    thread?: Thread;
}>();


const allParticipants = computed(() => {
    if (!room.value) return [];
    return [room.value.localParticipant, ...Array.from(room.value.remoteParticipants.values())];
});


const gridClass = computed(() => {
    const count = allParticipants.value.length;
    if (count <= 1) return 'grid-cols-1';
    if (count <= 2) return 'grid-cols-1 md:grid-cols-2';
    if (count <= 4) return 'grid-cols-2';
    return 'grid-cols-2 lg:grid-cols-3';
});

const getMeta = (p: any) => {
    try { return JSON.parse(p.metadata || '{}'); } catch { return {}; }
};

</script>
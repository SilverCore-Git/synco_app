<template>

    <div 
        v-if="isConnected" 
        class="w-full h-full flex justify-center items-center overflow-hidden"
    >
            
        <div 
            v-if="userFocused"
            class="
                flex flex-col justify-center items-center p-5 xl:p-10
                gap-5 xl:gap-10 transition-all duration-500 h-full w-full
            "
        >
               
            <div
                :key="userFocused.identity"
                @click="userFocused = null"
                class="
                    relative bg-(--bg2) rounded-2xl 
                    overflow-hidden border border-white/5
                    flex items-center justify-center group
                    w-full aspect-video
                "
            >
                    
                <div v-if="userFocused.isCameraEnabled || userFocused.isScreenShareEnabled" class="w-full h-full flex flex-col xl:flex-row bg-black">
                    <VideoTrack 
                        v-if="userFocused.isScreenShareEnabled"
                        :participant="userFocused"
                        :source="Track.Source.ScreenShare"
                        class="w-full h-full object-contain flex-1"
                    />
                    <VideoTrack 
                        v-if="userFocused.isCameraEnabled"
                        :participant="userFocused"
                        :source="Track.Source.Camera"
                        class="object-cover"
                        :class="userFocused.isScreenShareEnabled ? 'absolute bottom-4 right-4 w-48 xl:w-64 aspect-video rounded-xl border border-white/20 shadow-2xl z-20' : 'w-full h-full flex-1'"
                    />
                </div>

                <div v-else class="flex flex-col items-center gap-4">

                    <div class="relative">
                        
                        <img 
                            :src="getMeta(userFocused).avatarUrl || `https://ui-avatars.com/api/?name=${getMeta(userFocused).name}`" 
                            class="w-24 h-24 rounded-full border-4 transition-all duration-300"
                            :class="userFocused.isSpeaking ? 'border-(--primary) scale-110 shadow-[0_0_20px_rgba(var(--primary-rgb),0.4)]' : 'border-transparent'"
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

                    <i v-if="userFocused.isScreenShareEnabled" class="bi bi-display text-blue-400 text-xs" />
                    <span class="text-xs font-bold text-white">{{ getMeta(userFocused).name || 'Anonyme' }}</span>
                    <i v-if="!userFocused.isMicrophoneEnabled" class="bi bi-mic-mute-fill text-red-500 text-xs" />

                </div>

                <div class="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div class="bg-black/40 p-1.5 rounded-md text-[10px] text-white/60">
                        {{ userFocused.connectionQuality }}
                    </div>
                </div>

            </div>

            <div class="grid grid-cols-2 xl:flex justify-center items-center gap-4 xl:flex-wrap">

                <div 
                    v-for="p in allParticipants" 
                    :key="p.identity"
                    @click="userFocused = p"
                    class="
                        relative bg-(--bg2) rounded-2xl 
                        overflow-hidden border border-white/5
                        flex items-center justify-center group
                        w-full xl:w-xs aspect-video
                    "
                >
                        
                    <div v-if="p.isCameraEnabled || p.isScreenShareEnabled" class="w-full h-full flex flex-col bg-black">
                        <VideoTrack 
                            v-if="p.isScreenShareEnabled"
                            :participant="p"
                            :source="Track.Source.ScreenShare"
                            class="w-full h-full object-contain flex-1"
                        />
                        <VideoTrack 
                            v-if="p.isCameraEnabled"
                            :participant="p"
                            :source="Track.Source.Camera"
                            class="object-cover"
                            :class="p.isScreenShareEnabled ? 'absolute bottom-2 right-2 w-24 aspect-video rounded-lg border border-white/20 shadow-2xl z-20' : 'w-full h-full flex-1'"
                        />
                    </div>

                    <div v-else class="flex flex-col items-center gap-4">

                        <div class="relative">
                            
                            <img 
                                :src="getMeta(p).avatarUrl || `https://ui-avatars.com/api/?name=${getMeta(p).name}`" 
                                class="w-14 h-14 rounded-full border-4 transition-all duration-300"
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
                        <span class="text-xs font-bold text-(--text)">{{ getMeta(p).name || 'Anonyme' }}</span>
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

        <div 
            v-else
            class="
                grid grid-cols-1 lg:grid-cols-2 xl:flex xl:flex-wrap 
                justify-center items-center p-4
                gap-4 transition-all duration-500 w-full h-full
            "
        >
                
            <div 
                v-for="p in allParticipants" 
                :key="p.identity"
                @click="userFocused = p.identity"
                class="
                    relative bg-(--bg2) rounded-2xl 
                    overflow-hidden border border-white/5
                    flex items-center justify-center group
                    max-w-xs 2xl:max-w-100 max-h-100 w-full aspect-video
                "
            >
                    
                <div v-if="p.isCameraEnabled || p.isScreenShareEnabled" class="w-full h-full flex flex-col bg-black">
                    <VideoTrack 
                        v-if="p.isScreenShareEnabled"
                        :participant="p"
                        :source="Track.Source.ScreenShare"
                        class="w-full h-full object-contain flex-1"
                    />
                    <VideoTrack 
                        v-if="p.isCameraEnabled"
                        :participant="p"
                        :source="Track.Source.Camera"
                        class="object-cover"
                        :class="p.isScreenShareEnabled ? 'absolute bottom-3 right-3 w-32 aspect-video rounded-xl border border-white/20 shadow-2xl z-20' : 'w-full h-full flex-1'"
                    />
                </div>

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

    <div v-else class="flex justify-center items-center flex-col h-[80%]">

        <div class="relative mb-6">
            <div class="absolute inset-0 bg-red-500/20 blur-3xl rounded-full"></div>
            <div class="relative w-20 h-20 bg-(--bg) border border-white/10 rounded-3xl flex items-center justify-center shadow-2xl">
                <i class="bi bi-telephone-x-fill text-3xl text-red-500"></i>
            </div>
        </div>

        <h2 class="text-xl font-bold text-(--text) mb-2">La réunion est terminé !</h2>
        <p class="text-sm text-(--text)/40 max-w-70 mb-8">
            De nouveau dans la solitude.
        </p>

    </div>
    
</template>


<script setup lang="ts">

import useLiveKit from '@/composables/useLiveKit';
import VideoTrack from '../components/common/VideoTrack.vue';
import type { Thread } from '@/types/types';
import { ref } from 'vue';
import { openedOrg } from '@/assets/var';
import { Track } from 'livekit-client';

const { allParticipants, isConnected } = useLiveKit();


defineProps<{
    thread?: Thread;
}>();

const userFocused = ref<any>(null);

const getMeta = (p: any): any => {
    if (!openedOrg.value?.members) return {};
    const member = openedOrg.value.members.find(m => String(m.user?.id) === String(p.identity));
    return member?.user || {};
};

</script>
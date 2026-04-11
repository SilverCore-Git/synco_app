<template>

    <div class="absolute bottom-1 left-1 w-75 flex flex-col gap-1">

        <Transition name="fade-slide-in-up">
            
            <div 
                v-if="isConnected"
                class="
                    flex flex-col gap-2 p-2 bg-(--bg) rounded-xl 
                    border border-white/5 shadow-2xl
                    animate-in fade-in slide-in-from-bottom-2 duration-300
                "
            >

                <div class="flex items-center justify-between px-1">

                    <div class="flex flex-col overflow-hidden">
                        <span class="text-[10px] font-bold uppercase leading-none flex items-center gap-1.5" :class="connectionColor">
                            <span class="relative flex h-2 w-2">
                                <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                <span class="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                            </span>
                            Vocal connecté
                        </span>
                        <span class="text-[9px] text-(--text)/40 truncate font-medium mt-0.5">
                            {{ ping }}ms • {{ room?.name }}
                        </span>
                    </div>

                    <button 
                        @click="leaveRoom" 
                        class="p-2 w-9 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white rounded-lg transition-all active:scale-90"
                        title="Déconnecter le vocal"
                    >
                        <i class="bi bi-telephone-x-fill text-xs" />
                    </button>

                </div>

                <div class="grid grid-cols-2 gap-2 border-t border-white/5 pt-2">

                    <button 
                        @click="toggleCamera(!isCameraEnabled)"
                        class="flex items-center justify-center gap-2 py-1.5 rounded-lg transition-all text-[10px] font-bold uppercase tracking-wider"
                        :class="isCameraEnabled ? 'bg-(--primary)/20 text-(--primary)' : 'bg-white/5 text-(--text)/40 hover:bg-white/10'"
                    >
                        <i class="bi" :class="isCameraEnabled ? 'bi-camera-video-fill' : 'bi-camera-video-off-fill'" />
                        Vidéo
                    </button>

                    <button 
                        @click="toggleScreenShare(!isScreenShareEnabled)"
                        class="flex items-center justify-center gap-2 py-1.5 rounded-lg transition-all text-[10px] font-bold uppercase tracking-wider"
                        :class="isScreenShareEnabled ? 'bg-blue-500/20 text-blue-500' : 'bg-white/5 text-(--text)/40 hover:bg-white/10'"
                    >
                        <i class="bi bi-display" />
                        Écran
                    </button>

                </div>

            </div>

        </Transition>

        <div
            class="
                h-14 bg-(--bg) rounded-xl
                border border-white/5
                p-1 flex items-center shadow-xl
            "
        >

            <UserDropDown :user="user?.user" class="w-full">

                <template #trigger>

                    <div class="flex items-center w-full gap-2 p-2 rounded-lg hover:bg-(--primary)/5 transition-colors group">
                       
                        <div class="relative flex items-center justify-center">
                            <img :src="user?.user?.avatarUrl" :alt="user?.user?.name" class="w-8 h-8 rounded-full object-cover" />
                            <div 
                                v-if="user && user.user?.data.status"
                                class="absolute -bottom-0.5 -right-0.5 w-3 h-3 border-2 border-(--bg) rounded-full z-10" 
                                :class="getColorByStatus(user.user.data.status)"
                            />
                        </div>

                        <div class="flex flex-col min-w-0 flex-1 leading-tight select-none">
                            <span class="text-sm font-bold text-(--text) truncate">
                                {{ user?.user?.name || 'Chargement...' }}
                            </span>
                            <span class="text-[10px] text-(--text)/40 truncate font-medium uppercase tracking-wider">
                                {{ user?.user?.data?.username || user?.role }}
                            </span>
                        </div>

                        <div class="flex items-center gap-0.5">

                            <button 
                                @click.stop="toggleMicrophone(!isMicEnabled)" 
                                class="p-1.5 rounded-md transition-all active:scale-90"
                                :class="isMicEnabled ? 'text-(--text)/40 hover:bg-(--primary)/10 hover:text-(--primary)' : 'text-red-500 bg-red-500/10'"
                            >
                                <i class="bi" :class="isMicEnabled ? 'bi-mic-fill' : 'bi-mic-mute-fill'" />
                            </button>

                            <button @click.stop="" class="p-1.5 rounded-md hover:bg-(--primary)/10 active:scale-90 text-(--text)/40 hover:text-(--text) transition-all">
                                <i class="bi bi-headphones text-sm" />
                            </button>

                            <button @click.stop="" class="p-1.5 rounded-md hover:bg-(--primary)/10 active:scale-90 text-(--text)/40 hover:text-(--text) transition-all group/settings">
                                <i class="bi bi-gear-fill text-sm group-hover/settings:rotate-45 transition-transform duration-300" />
                            </button>

                        </div>

                    </div>

                </template>

            </UserDropDown>

        </div>

    </div>

</template>

<script setup lang="ts">

import getColorByStatus from '@/assets/utils/getColorByStatus';
import type { OrgMember } from '@/types/types';
import { onMounted, ref, computed, onUnmounted } from 'vue';
import UserDropDown from '../dropdown/UserDropDown.vue';
import { openedOrg } from '@/assets/var';
import { useUser } from '@clerk/vue';
import useLiveKit from '@/composables/useLiveKit';
import { ConnectionQuality } from 'livekit-client';

const { user: ClerkUser } = useUser();
const { 
    room, 
    isConnected, 
    leaveRoom, 
    toggleMicrophone, 
    toggleCamera, 
    toggleScreenShare 
} = useLiveKit();

const user = ref<OrgMember | undefined>(undefined);
const ping = ref<number>(-1);

const isMicEnabled = computed(() => room.value?.localParticipant.isMicrophoneEnabled ?? false);
const isCameraEnabled = computed(() => room.value?.localParticipant.isCameraEnabled ?? false);
const isScreenShareEnabled = computed(() => room.value?.localParticipant.isScreenShareEnabled ?? false);

const connectionColor = computed(() => {
    const quality = room.value?.localParticipant.connectionQuality;
    if (quality === ConnectionQuality.Excellent || quality === ConnectionQuality.Good) return 'text-green-500';
    if (quality === ConnectionQuality.Poor) return 'text-yellow-500';
    return 'text-red-500';
});

let pingInterval: any;
onMounted(async () => {

    user.value = openedOrg.value?.members?.find(member => member.user?.clerkId == ClerkUser.value?.id);
    
    pingInterval = setInterval(async () => {

        if (isConnected.value && room.value) 
        {
            ping.value = room.value.localParticipant.engine.client?.rtt || 1;
        }
        
    }, 2000);

});

onUnmounted(() => clearInterval(pingInterval));

</script>

<style scoped>
.bi-reception-4 {
    transition: color 0.3s ease;
}
</style>
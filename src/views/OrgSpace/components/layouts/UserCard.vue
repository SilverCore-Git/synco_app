<template>

    <div
        ref="cardRootEl"
        class="absolute bottom-1 left-1 z-30 flex flex-col gap-1"
        :class="isLittleScreen ? 'w-full' : 'w-75'"
    >

        <Transition name="fade-slide-in-up">

            <div
                v-if="isConnected"
                class="
                    flex flex-col gap-2 p-2.5 bg-(--bg) rounded-xl
                    border border-(--border-color) shadow-2xl
                    animate-in fade-in slide-in-from-bottom-2 duration-300
                "
            >

                <div class="flex items-center gap-2 px-1 min-w-0">

                    <span class="relative flex h-2 w-2 shrink-0">
                        <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                        <span class="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                    </span>

                    <div class="flex flex-col min-w-0 flex-1">
                        <span class="text-[10px] font-bold uppercase leading-none text-green-500 truncate">
                            En vocal
                        </span>
                        <span class="text-[9px] text-(--text2) truncate font-medium mt-0.5">
                            {{ activeThreadName || room?.name }} • <span :class="connectionColor">{{ ping }}ms</span>
                        </span>
                    </div>

                    <button
                        @click="leaveRoom(String(room?.name), String(route.params.spaceId))"
                        class="shrink-0 w-8 h-8 flex items-center justify-center bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white rounded-lg transition-all active:scale-90"
                        title="Raccrocher"
                    >
                        <i class="bi bi-telephone-x-fill text-xs" />
                    </button>

                </div>

                <div class="grid grid-cols-4 gap-1.5 border-t border-(--text)/5 pt-2">

                    <button
                        @click="toggleCamera(!isCameraEnabled)"
                        class="flex flex-col items-center justify-center gap-1 py-1.5 rounded-lg transition-all text-[9px] font-bold uppercase tracking-wider"
                        :class="isCameraEnabled ? 'bg-(--primary)/20 text-(--primary)' : 'bg-(--text)/5 text-(--text2) hover:bg-(--text)/10'"
                        :title="isCameraEnabled ? 'Désactiver la caméra' : 'Activer la caméra'"
                    >
                        <i class="bi text-sm" :class="isCameraEnabled ? 'bi-camera-video-fill' : 'bi-camera-video-off-fill'" />
                        Vidéo
                    </button>

                    <button
                        @click="toggleScreenShare(!isScreenShareEnabled)"
                        class="flex flex-col items-center justify-center gap-1 py-1.5 rounded-lg transition-all text-[9px] font-bold uppercase tracking-wider"
                        :class="isScreenShareEnabled ? 'bg-(--primary)/20 text-(--primary)' : 'bg-(--text)/5 text-(--text2) hover:bg-(--text)/10'"
                        :title="isScreenShareEnabled ? 'Arrêter le partage' : 'Partager l\'écran'"
                    >
                        <i class="bi bi-display text-sm" />
                        Écran
                    </button>

                    <button
                        @click="toggleMicrophone(!isMicEnabled)"
                        class="flex flex-col items-center justify-center gap-1 py-1.5 rounded-lg transition-all text-[9px] font-bold uppercase tracking-wider"
                        :class="isMicEnabled ? 'bg-(--text)/5 text-(--text2) hover:bg-(--text)/10' : 'bg-red-500/20 text-red-500'"
                        :title="isMicEnabled ? 'Couper le micro' : 'Activer le micro'"
                    >
                        <i class="bi text-sm" :class="isMicEnabled ? 'bi-mic-fill' : 'bi-mic-mute-fill'" />
                        Micro
                    </button>

                    <button
                        @click="toggleDeafen(!isDeafened)"
                        class="flex flex-col items-center justify-center gap-1 py-1.5 rounded-lg transition-all text-[9px] font-bold uppercase tracking-wider"
                        :class="isDeafened ? 'bg-red-500/20 text-red-500' : 'bg-(--text)/5 text-(--text2) hover:bg-(--text)/10'"
                        :title="isDeafened ? 'Réactiver le son' : 'Couper le son'"
                    >
                        <i class="bi text-sm" :class="isDeafened ? 'bi-volume-mute-fill' : 'bi-volume-up-fill'" />
                        Son
                    </button>

                </div>

            </div>

        </Transition>

        <div
            class="
                h-14 bg-(--bg) rounded-xl
                border border-(--border-color)
                p-1 flex items-center shadow-xl
            "
        >

            <UserDropDown :user="user?.user" class="w-full">

                <template #trigger>

                    <div class="flex items-center w-full gap-2 p-2 rounded-lg transition-colors group ">
                       
                        <div
                            v-if="openedOrg == null"
                        >
                            <div class=" rounded-full bg-(--text)/6 h-9 w-9 animate-pulse" />
                        </div>

                        <div v-else class="relative flex items-center justify-center animate-app-reveal">
                            <img 
                                :src="user?.user?.avatarUrl || `https://ui-avatars.com/api/?name=${$p(user?.user?.name)}&background=128a60&color=fff`" 
                                :alt="$p(user?.user?.name)" 
                                class="w-8 h-8 rounded-full object-cover"
                                @error="(e: any) => e.target.src = `https://ui-avatars.com/api/?name=${$p(user?.user?.name)}&background=128a60&color=fff`"
                            />
                            <div 
                                v-if="user && user.user?.data?.status"
                                class="absolute -bottom-0.5 -right-0.5 w-3 h-3 border-2 border-(--bg) rounded-full z-10" 
                                :class="getColorByStatus(user.user.data.status)"
                            />
                        </div>

                        <div
                            class="flex flex-col min-w-0 flex-1 leading-tight select-none"
                            :class="openedOrg == null ? 'bg-(--text)/8 rounded-lg animate-pulse' : 'animate-app-reveal'"
                        >
                            <span 
                                class="text-sm font-bold truncate"
                                :class="openedOrg == null ? 'text-transparent' : 'text-(--text)'"
                            >
                                {{ $p(user?.user?.name) || 'Chargement...' }}
                            </span>
                            <span 
                                class="text-[10px] truncate font-medium uppercase tracking-wider"
                                :class="openedOrg == null ? 'text-transparent' : 'text-(--text2)'"
                            >
                                {{ getMemberRoleNames(user) }}
                            </span>
                        </div>

                        <div class="flex items-center gap-0.5">

                            <button @click.stop="showUserSettings = !showUserSettings" class="p-1.5 rounded-md active:scale-90 transition-all group/settings text-(--text) hover:text-(--primary) hover:rotate-45">
                                <i class="bi bi-gear-fill text-md group-hover/settings:rotate-45 transition-transform duration-300" />
                            </button>

                        </div>

                    </div>

                </template>

            </UserDropDown>

        </div>

    </div>

    <UserSettings 
        :isOpen="showUserSettings"
        @close="showUserSettings = false" 
    />

</template>

<script setup lang="ts">

import getColorByStatus from '@/assets/utils/getColorByStatus';
import type { OrgMember } from '@/types/types';
import { onMounted, ref, computed, onUnmounted } from 'vue';
import UserDropDown from '../dropdown/UserDropDown.vue';
import { openedOrg, userCardHeight } from '@/assets/var';
import useLiveKit from '@/composables/useLiveKit';
import { ConnectionQuality } from 'livekit-client';
import { useRoute } from 'vue-router';
import UserSettings from '@/components/windows/UserSettings.vue';
import { keycloak } from '@/assets/keycloak';

defineProps<{
    isLittleScreen: boolean;
}>();

const route = useRoute();
const {
    room,
    isConnected,
    leaveRoom,
    toggleMicrophone,
    toggleCamera,
    toggleScreenShare,
    toggleDeafen,
    isCameraEnabled,
    isMicEnabled,
    isScreenShareEnabled,
    isDeafened,
} = useLiveKit();

// room.name est le threadId LiveKit (cf. /api/livekit/token) : on retrouve
// le nom lisible du salon plutôt que d'afficher cet identifiant brut.
const activeThreadName = computed(() => {
    const threadId = room.value?.name;
    if (!threadId || !openedOrg.value) return '';
    for (const space of openedOrg.value.spaces || []) {
        const t = space.threads?.find(th => th.id === threadId);
        if (t) return t.name;
    }
    return openedOrg.value.home?.threads?.find(th => th.id === threadId)?.name || '';
});


const user = computed<OrgMember | undefined>(() => {

    if (!openedOrg.value?.members) return undefined;
    
    const myId = keycloak.subject || keycloak.userInfo?.sub;

    return openedOrg.value.members.find(member => 
        String(member.user?.id) === String(myId)
    );

});

const getMemberRoleNames = (member: any) => {
    if (!member?.memberRoles || member.memberRoles.length === 0) return 'Membre';
    return member.memberRoles.map((mr: any) => mr.role?.name).filter(Boolean).join(', ');
};

const ping = ref<number>(-1);
const showUserSettings = ref<boolean>(false);

const connectionColor = computed(() => {
    const quality = room.value?.localParticipant.connectionQuality;
    if (quality === ConnectionQuality.Excellent || quality === ConnectionQuality.Good) return 'text-green-500';
    if (quality === ConnectionQuality.Poor) return 'text-yellow-500';
    return 'text-red-500';
});

let pingInterval: any;
onMounted(async () => {

    pingInterval = setInterval(async () => {

        if (isConnected.value && room.value)
        {
            ping.value = room.value.localParticipant.engine.client?.rtt || 1;
        }

    }, 2000);

});

onUnmounted(() => clearInterval(pingInterval));

// Les barres qui scrollent (ThreadsBar...) réservent exactement cette
// hauteur en bas plutôt qu'une marge fixe devinée, puisque la carte grandit
// quand le cadre d'appel apparaît.
const cardRootEl = ref<HTMLElement | null>(null);
let cardResizeObserver: ResizeObserver | null = null;

onMounted(() => {
    if (!cardRootEl.value) return;
    cardResizeObserver = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (entry) userCardHeight.value = Math.ceil(entry.target.getBoundingClientRect().height);
    });
    cardResizeObserver.observe(cardRootEl.value);
});

onUnmounted(() => {
    cardResizeObserver?.disconnect();
    userCardHeight.value = 0;
});

</script>

<style scoped>
.bi-reception-4 {
    transition: color 0.3s ease;
}
</style>
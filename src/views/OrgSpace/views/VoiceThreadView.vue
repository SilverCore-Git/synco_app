<template>

    <div
        v-if="isConnected"
        class="relative w-full h-full flex flex-col overflow-hidden"
    >

        <div class="flex-1 min-h-0 overflow-y-auto">

        <div
            v-if="userFocused"
            class="
                flex flex-col justify-center items-center p-5 xl:p-10
                gap-5 xl:gap-10 transition-all duration-500 min-h-full w-full
            "
        >
               
            <!-- Focused User -->
            <div
                :key="userFocused.identity"
                :ref="getTileRefSetter(userFocused.identity)"
                @click="userFocused = null"
                @contextmenu.prevent.stop="onTileContextMenu($event, userFocused)"
                class="
                    relative bg-(--bg2) rounded-3xl
                    overflow-hidden border border-(--border-color)
                    flex items-center justify-center group
                    w-full max-h-[70vh] aspect-video
                    shadow-2xl cursor-pointer
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
                            class="w-32 h-32 rounded-full border-4 transition-all duration-300"
                            :class="userFocused.isSpeaking ? 'border-(--primary) scale-110 shadow-[0_0_30px_rgba(var(--primary-rgb),0.5)]' : 'border-transparent'"
                        />
                    </div>

                </div>

                <div 
                    class="
                        absolute bottom-4 left-4 
                        flex items-center gap-2 
                        bg-black/60 backdrop-blur-md 
                        px-4 py-2 rounded-xl border 
                        border-white/10 shadow-lg
                    "
                >
                    <i v-if="userFocused.isScreenShareEnabled" class="bi bi-display text-blue-400 text-sm" />
                    <span class="text-sm font-bold text-white">{{ getMeta(userFocused).name || 'Anonyme' }}</span>
                    <i v-if="!userFocused.isMicrophoneEnabled" class="bi bi-mic-mute-fill text-red-500 text-sm" />
                </div>

                <div class="absolute top-4 right-4 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div class="bg-black/50 backdrop-blur-md px-2 py-1 rounded-md text-xs font-medium text-white/80 border border-white/10">
                        {{ userFocused.connectionQuality }}
                    </div>
                    <button
                        @click.stop="toggleFullscreen(userFocused.identity)"
                        class="bg-black/50 hover:bg-black/70 backdrop-blur-md w-7 h-7 flex items-center justify-center rounded-md text-white border border-white/10 transition-colors"
                        title="Plein écran"
                    >
                        <i class="bi" :class="fullscreenIdentity === userFocused.identity ? 'bi-fullscreen-exit' : 'bi-arrows-fullscreen'" />
                    </button>
                </div>

            </div>
            <VoiceParticipantMenu
                :ref="getMenuRefSetter(userFocused.identity)"
                :participant="userFocused"
                :threadId="props.thread?.id || ''"
                :isSelf="userFocused.identity === ownIdentity"
                :canMute="canMuteOthers"
                :canDisconnect="canDisconnectOthers"
                :getName="getParticipantName"
            />

            <!-- Other Participants Grid -->
            <div class="grid gap-4 w-full max-w-6xl grid-cols-[repeat(auto-fill,minmax(11rem,1fr))]">
                <template v-for="p in allParticipants" :key="p.identity">
                <div
                    v-show="p.identity !== userFocused.identity"
                    @click="userFocused = p"
                    @contextmenu.prevent.stop="onTileContextMenu($event, p)"
                    class="
                        relative bg-(--bg2) rounded-2xl
                        overflow-hidden border border-(--border-color)
                        flex items-center justify-center group
                        w-full aspect-video cursor-pointer hover:border-white/20
                        transition-colors shadow-lg
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
                            :class="p.isScreenShareEnabled ? 'absolute bottom-2 right-2 w-16 aspect-video rounded border border-white/20 shadow-2xl z-20' : 'w-full h-full flex-1'"
                        />
                    </div>

                    <div v-else class="flex flex-col items-center gap-4">
                        <div class="relative">
                            <img 
                                :src="getMeta(p).avatarUrl || `https://ui-avatars.com/api/?name=${getMeta(p).name}`" 
                                class="w-12 h-12 rounded-full border-2 transition-all duration-300"
                                :class="p.isSpeaking ? 'border-(--primary) scale-110 shadow-[0_0_15px_rgba(var(--primary-rgb),0.5)]' : 'border-transparent'"
                            />
                        </div>
                    </div>

                    <div 
                        class="
                            absolute bottom-2 left-2 
                            flex items-center gap-1.5 
                            bg-black/60 backdrop-blur-md 
                            px-2 py-1 rounded-lg border 
                            border-white/10 max-w-[90%]
                        "
                    >
                        <i v-if="p.isScreenShareEnabled" class="bi bi-display text-blue-400 text-[10px]" />
                        <span class="text-[10px] font-bold text-white truncate">{{ getMeta(p).name || 'Anonyme' }}</span>
                        <i v-if="!p.isMicrophoneEnabled" class="bi bi-mic-mute-fill text-red-500 text-[10px]" />
                    </div>

                </div>
                <VoiceParticipantMenu
                    :ref="getMenuRefSetter(p.identity)"
                    :participant="p"
                    :threadId="props.thread?.id || ''"
                    :isSelf="p.identity === ownIdentity"
                    :canMute="canMuteOthers"
                    :canDisconnect="canDisconnectOthers"
                    :getName="getParticipantName"
                />
                </template>
            </div>

        </div>

        <div
            v-else
            class="
                grid grid-cols-[repeat(auto-fill,minmax(18rem,1fr))]
                justify-center justify-items-center items-center p-4 xl:p-10
                gap-6 transition-all duration-500 w-full min-h-full
            "
        >
                
            <template v-for="p in allParticipants" :key="p.identity">
            <div
                :ref="getTileRefSetter(p.identity)"
                @click="userFocused = p"
                @contextmenu.prevent.stop="onTileContextMenu($event, p)"
                class="
                    relative bg-(--bg2) rounded-3xl
                    overflow-hidden border border-(--border-color)
                    flex items-center justify-center group
                    w-full max-w-sm 2xl:max-w-lg max-h-80 aspect-video
                    shadow-xl cursor-pointer hover:border-white/10 transition-all
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
                            :class="p.isSpeaking ? 'border-(--primary) scale-110 shadow-[0_0_25px_rgba(var(--primary-rgb),0.5)]' : 'border-transparent'"
                        />
                    </div>
                </div>

                <div 
                    class="
                        absolute bottom-4 left-4 
                        flex items-center gap-2 
                        bg-black/60 backdrop-blur-md 
                        px-3 py-1.5 rounded-xl border 
                        border-white/10
                    "
                >
                    <i v-if="p.isScreenShareEnabled" class="bi bi-display text-blue-400 text-xs" />
                    <span class="text-xs font-bold text-white">{{ getMeta(p).name || 'Anonyme' }}</span>
                    <i v-if="!p.isMicrophoneEnabled" class="bi bi-mic-mute-fill text-red-500 text-xs" />
                </div>

                <div class="absolute top-4 right-4 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div class="bg-black/50 backdrop-blur-md px-2 py-1 rounded-md text-[10px] font-medium text-white/80 border border-white/10">
                        {{ p.connectionQuality }}
                    </div>
                    <button
                        @click.stop="toggleFullscreen(p.identity)"
                        class="bg-black/50 hover:bg-black/70 backdrop-blur-md w-6 h-6 flex items-center justify-center rounded-md text-white border border-white/10 transition-colors"
                        title="Plein écran"
                    >
                        <i class="bi text-xs" :class="fullscreenIdentity === p.identity ? 'bi-fullscreen-exit' : 'bi-arrows-fullscreen'" />
                    </button>
                </div>

            </div>
            <VoiceParticipantMenu
                :ref="getMenuRefSetter(p.identity)"
                :participant="p"
                :threadId="props.thread?.id || ''"
                :isSelf="p.identity === ownIdentity"
                :canMute="canMuteOthers"
                :canDisconnect="canDisconnectOthers"
                :getName="getParticipantName"
            />
            </template>

        </div>

        </div>

        <!-- Call Controls -->
        <div class="flex justify-center py-4 shrink-0">
            <CallControls
                :isMicOn="isMicEnabled"
                :isCamOn="isCameraEnabled"
                :isScreenSharing="isScreenShareEnabled"
                :isDeafened="isDeafened"
                :switchDevice="switchDevice"
                :applyVideoQuality="(source, opts) => applyVideoQuality(source === 'camera' ? Track.Source.Camera : Track.Source.ScreenShare, opts)"
                @toggleMic="toggleMicrophone(!isMicEnabled)"
                @toggleCam="onToggleCam"
                @toggleScreenShare="onToggleScreenShare"
                @toggleDeafen="toggleDeafen(!isDeafened)"
                @endCall="leaveRoom(props.thread?.id || '', String(route.params.spaceId))"
                @invite="voiceInviteModalRef?.openModal()"
            />
        </div>

        <VoiceInviteModal v-if="props.thread" ref="voiceInviteModalRef" :thread="props.thread" />

    </div>

    <!-- Not Connected State -->
    <div v-else class="flex justify-center items-center flex-col h-full w-full bg-(--bg)">

        <div class="relative mb-8 group">
            <div class="absolute inset-0 bg-(--primary)/20 blur-3xl rounded-full opacity-50 group-hover:opacity-100 transition-opacity duration-500"></div>
            <div class="relative w-24 h-24 bg-(--bg2) border border-white/10 rounded-full flex items-center justify-center shadow-2xl">
                <i class="bi bi-mic-fill text-4xl text-(--primary)"></i>
            </div>
        </div>

        <h2 class="text-2xl font-bold text-(--text) mb-3 tracking-wide">
            {{ props.thread?.name || 'Salon vocal' }}
        </h2>
        <p class="text-sm text-(--text2) max-w-md text-center mb-10 leading-relaxed">
            Rejoignez ce salon pour discuter de vive voix, activer votre caméra ou partager votre écran avec les autres membres.
        </p>

        <button 
            @click="joinCall"
            :disabled="isConnecting"
            class="
                flex items-center justify-center gap-3
                bg-(--primary) hover:bg-(--primary)/90 text-white
                px-8 py-3.5 rounded-2xl font-bold text-lg
                transition-all duration-300 hover:scale-105 active:scale-95
                shadow-[0_0_20px_rgba(var(--primary-rgb),0.3)]
                hover:shadow-[0_0_30px_rgba(var(--primary-rgb),0.5)]
                disabled:opacity-50 disabled:pointer-events-none
            "
        >
            <i class="bi bi-telephone-fill" v-if="!isConnecting"></i>
            <i class="bi bi-arrow-repeat animate-spin" v-else></i>
            {{ isConnecting ? 'Connexion...' : 'Rejoindre l\'appel' }}
        </button>

    </div>
    
</template>


<script setup lang="ts">

import { computed, onMounted, onUnmounted, ref, type ComponentPublicInstance } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Track } from 'livekit-client';
import useLiveKit from '@/composables/useLiveKit';
import VideoTrack from '../components/common/VideoTrack.vue';
import CallControls from '@/components/peer/CallControls.vue';
import VoiceInviteModal from '../components/popup/VoiceInviteModal.vue';
import VoiceParticipantMenu from '../components/dropdown/VoiceParticipantMenu.vue';
import type { Thread } from '@/types/types';
import { openedOrg, user } from '@/assets/var';
import sfetch from '@/assets/utils/sfetch';
import { useToast } from '@/composables/useToast';
import { usePermissions } from '@/composables/usePermissions';
import { getVoicePrefs, resolveCameraCaptureOptions } from '@/assets/utils/voicePrefs';

const props = defineProps<{
    thread?: Thread;
}>();

const route = useRoute();
const router = useRouter();
const toast = useToast();
const voiceInviteModalRef = ref<any>(null);

const orgId = computed(() => String(route.params.orgId || ''));
const spaceId = computed(() => String(route.params.spaceId || ''));
const ownIdentity = computed(() => user.value?.id || '');

const { can, fetchPermissions } = usePermissions(orgId);
const canMuteOthers = computed(() => can('VOICE_MUTE_OTHERS', spaceId.value));
const canDisconnectOthers = computed(() => can('VOICE_DISCONNECT', spaceId.value));

const {
    allParticipants,
    isConnected,
    isMicEnabled,
    isCameraEnabled,
    isScreenShareEnabled,
    isDeafened,
    connectToRoom,
    leaveRoom,
    toggleMicrophone,
    toggleCamera,
    toggleScreenShare,
    toggleDeafen,
    switchDevice,
    applyVideoQuality
} = useLiveKit();

const userFocused = ref<any>(null);
const isConnecting = ref(false);

// Permet de mettre n'importe quelle tuile (partage d'écran, caméra, avatar)
// en plein écran natif sans dupliquer un <video> dédié : on demande le plein
// écran sur la tuile elle-même (conserve le nom/l'icône affichés dessus).
const tileRefs = new Map<string, HTMLElement>();
const fullscreenIdentity = ref<string | null>(null);

const setTileRef = (identity: string, el: Element | ComponentPublicInstance | null) => {
    if (el) tileRefs.set(identity, el as HTMLElement);
    else tileRefs.delete(identity);
};

// Une fonction inline différente à chaque rendu pour `:ref` force Vue à
// débrancher/rebrancher la ref sur CHAQUE mise à jour (même sans rapport),
// ce qui devient très fréquent une fois ActiveSpeakersChanged écouté. On
// mémorise une fonction stable par participant pour éviter ce churn.
const tileRefSetters = new Map<string, (el: Element | ComponentPublicInstance | null) => void>();
const getTileRefSetter = (identity: string) => {
    let setter = tileRefSetters.get(identity);
    if (!setter) {
        setter = (el: Element | ComponentPublicInstance | null) => setTileRef(identity, el);
        tileRefSetters.set(identity, setter);
    }
    return setter;
};

// Menu contextuel par participant : la tuile déclenche l'ouverture via son
// propre @contextmenu (cf. FileCard.vue, le pattern déjà utilisé ailleurs
// dans l'app), plutôt que de faire de VoiceParticipantMenu un wrapper autour
// de la tuile — ça évite de perturber la mise en page grid/flex des tuiles.
const menuRefs = new Map<string, { open: (e: MouseEvent) => void }>();
const menuRefSetters = new Map<string, (el: any) => void>();
const getMenuRefSetter = (identity: string) => {
    let setter = menuRefSetters.get(identity);
    if (!setter) {
        setter = (el: any) => { if (el) menuRefs.set(identity, el); else menuRefs.delete(identity); };
        menuRefSetters.set(identity, setter);
    }
    return setter;
};
const onTileContextMenu = (e: MouseEvent, p: any) => {
    menuRefs.get(p.identity)?.open(e);
};

const onFullscreenChange = () => {
    const fsEl = document.fullscreenElement;
    fullscreenIdentity.value = fsEl
        ? ([...tileRefs.entries()].find(([, el]) => el === fsEl)?.[0] ?? null)
        : null;
};

const toggleFullscreen = async (identity: string) => {
    const tile = tileRefs.get(identity);
    if (!tile) return;
    try {
        if (document.fullscreenElement === tile) {
            await document.exitFullscreen();
        } else {
            await tile.requestFullscreen();
        }
    } catch (e) {
        toast.show("Impossible de passer en plein écran", "error");
    }
};

onMounted(() => {
    document.addEventListener('fullscreenchange', onFullscreenChange);

    // Chargé ici (pas seulement dans joinCall) car ce composant peut monter
    // alors qu'on est déjà connecté au salon (navigation vers un onglet vocal
    // actif) — sans ça, canMuteOthers/canDisconnectOthers restaient bloqués
    // à false tant que fetchPermissions n'avait jamais été déclenché pour cet
    // espace sur cette session.
    fetchPermissions(spaceId.value);
});

onUnmounted(() => {
    document.removeEventListener('fullscreenchange', onFullscreenChange);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
});

const getMeta = (p: any): any => {
    if (!openedOrg.value?.members) return {};
    const member = openedOrg.value.members.find(m => String(m.user?.id) === String(p.identity));
    return member?.user || {};
};

const getParticipantName = (p: any): string => getMeta(p).name || '';

// Applique le device + la résolution/framerate choisis dans les réglages
// vocaux uniquement à l'activation (pas de changement de constraints si on
// désactive) — évite de republier une track qu'on est en train de couper.
const onToggleCam = () => {
    if (isCameraEnabled.value) { toggleCamera(false); return; }
    const prefs = getVoicePrefs();
    const { resolution, frameRate } = resolveCameraCaptureOptions(prefs);
    toggleCamera(true, { deviceId: prefs.camDeviceId, resolution, frameRate });
};

const onToggleScreenShare = () => {
    if (isScreenShareEnabled.value) { toggleScreenShare(false); return; }
    const prefs = getVoicePrefs();
    // ScreenShareCaptureOptions ne porte pas de frameRate au premier niveau
    // (contrairement à VideoCaptureOptions) — il se règle via resolution.frameRate.
    toggleScreenShare(true, { resolution: { ...prefs.screenResolution, frameRate: prefs.screenFrameRate } });
};

const joinCall = async () => {
    if (!props.thread?.id) return;

    isConnecting.value = true;
    try {
        fetchPermissions(spaceId.value);

        const res = await sfetch('/api/livekit/token', {
            method: 'POST',
            body: JSON.stringify({ threadId: props.thread.id }),
        });

        if (res.ok) {
            const data = await res.json();
            await connectToRoom(data.url, data.token, props.thread.id, String(route.params.spaceId), data.e2eeKey);
        } else {
            toast.show("Impossible de se connecter au salon", "error");
        }
    } catch (e) {
        toast.show("Erreur de connexion", "error");
    } finally {
        isConnecting.value = false;
    }
};

onMounted(() => {
    if (route.query.autojoin === '1' && !isConnected.value) {
        joinCall();
        const nextQuery = { ...route.query };
        delete nextQuery.autojoin;
        router.replace({ query: nextQuery });
    }
});

</script>
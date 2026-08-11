<template>
    <div class="h-screen w-screen bg-black text-white flex flex-col overflow-hidden relative">
        
        <!-- Header -->
        <header class="h-16 border-b border-white/10 flex items-center justify-between px-6 z-10 bg-black/50 backdrop-blur-md">
            <div class="flex items-center gap-4">
                <div>
                    <h1 class="font-semibold text-lg tracking-wide">Appel Vocal Privé</h1>
                </div>
            </div>
            
            <div class="flex items-center gap-4">
                <button v-if="isConnected" @click="leaveRoomLocal" class="danger">
                    Quitter
                </button>
            </div>
        </header>

        <!-- Main Content -->
        <main class="flex-1 relative flex items-center justify-center p-4">
            <div v-if="isLoading" class="flex flex-col items-center justify-center text-white/50">
                <i class="bi bi-arrow-repeat animate-spin text-3xl mb-4"></i>
                <p>Connexion au salon vocal en cours...</p>
            </div>

            <div v-else-if="error" class="flex flex-col items-center justify-center text-red-400 max-w-md text-center">
                <i class="bi bi-exclamation-circle text-4xl mb-4"></i>
                <p class="mb-4">{{ error }}</p>
                <button @click="retry" class="px-6 py-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors">
                    Réessayer
                </button>
            </div>

            <div v-else-if="isConnected" class="w-full h-full flex flex-col">
                <!-- Participants Grid -->
                <div class="flex-1 grid gap-4 p-4 place-items-center"
                     :style="gridStyle">
                    
                    <div v-for="p in allParticipants" :key="p.identity" 
                         class="bg-white/5 rounded-2xl flex flex-col items-center justify-center relative w-full h-full min-h-[150px] border-2 transition-colors duration-300"
                         :class="p.isSpeaking ? 'border-green-500 shadow-[0_0_15px_rgba(34,197,94,0.3)]' : 'border-transparent'">
                         
                        <!-- Vidéos (Caméra / Écran) -->
                        <div v-if="p.isCameraEnabled || p.isScreenShareEnabled" class="w-full h-full flex flex-col bg-black rounded-2xl overflow-hidden relative">
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
                                :class="p.isScreenShareEnabled ? 'absolute bottom-2 right-2 w-24 aspect-video rounded-xl border border-white/20 shadow-2xl z-20' : 'w-full h-full flex-1'"
                            />
                            
                            <div class="absolute bottom-2 left-2 flex items-center gap-1.5 bg-black/60 backdrop-blur-md px-2 py-1 rounded-lg border border-white/10 max-w-[90%]">
                                <i v-if="p.isScreenShareEnabled" class="bi bi-display text-blue-400 text-xs"></i>
                                <span class="font-medium text-xs truncate max-w-[80%]">{{ getParticipantMeta(p).name }}</span>
                                <i v-if="!p.isMicrophoneEnabled" class="bi bi-mic-mute-fill text-red-500 text-xs"></i>
                            </div>
                        </div>

                        <!-- Avatar (Audio only) -->
                        <div v-else class="flex flex-col items-center justify-center w-full h-full">
                            <div class="relative">
                                <img :src="getParticipantMeta(p).avatarUrl" 
                                     class="w-20 h-20 rounded-full object-cover mb-4 border-2" 
                                     :class="p.isSpeaking ? 'border-green-500' : 'border-transparent'" />
                                <div v-if="!p.isMicrophoneEnabled" 
                                     class="absolute -bottom-2 -right-2 bg-red-500 rounded-full w-8 h-8 flex items-center justify-center">
                                    <i class="bi bi-mic-mute-fill text-xs"></i>
                                </div>
                            </div>
                            
                            <span class="font-medium truncate max-w-[80%]">{{ getParticipantMeta(p).name }}</span>
                        </div>
                    </div>

                </div>

                <!-- Controls -->
                <div class="h-20 flex items-center justify-center gap-4 pb-6">
                    <button @click="toggleMicrophone(!isMicEnabled)" 
                            class="w-12 h-12 rounded-full flex items-center justify-center transition-colors"
                            :class="isMicEnabled ? 'bg-white/20 hover:bg-white/30 text-white' : 'bg-red-500/80 hover:bg-red-500 text-white'">
                        <i class="bi text-xl" :class="isMicEnabled ? 'bi-mic-fill' : 'bi-mic-mute-fill'"></i>
                    </button>
                    
                    <button @click="toggleCamera(!isCameraEnabled)" 
                            class="w-12 h-12 rounded-full flex items-center justify-center transition-colors"
                            :class="isCameraEnabled ? 'bg-white/20 hover:bg-white/30 text-white' : 'bg-red-500/80 hover:bg-red-500 text-white'">
                        <i class="bi text-xl" :class="isCameraEnabled ? 'bi-camera-video-fill' : 'bi-camera-video-off-fill'"></i>
                    </button>
                    
                    <button @click="toggleScreenShare(!isScreenShareEnabled)" 
                            class="w-12 h-12 rounded-full flex items-center justify-center transition-colors"
                            :class="isScreenShareEnabled ? 'bg-blue-500 hover:bg-blue-600 text-white' : 'bg-white/20 hover:bg-white/30 text-white'">
                        <i class="bi bi-display text-xl"></i>
                    </button>
                    
                    <button @click="toggleDeafen(!isDeafened)"
                            class="w-12 h-12 rounded-full flex items-center justify-center transition-colors"
                            :class="!isDeafened ? 'bg-white/20 hover:bg-white/30 text-white' : 'bg-red-500/80 hover:bg-red-500 text-white'">
                        <i class="bi text-xl" :class="!isDeafened ? 'bi-volume-up-fill' : 'bi-volume-mute-fill'"></i>
                    </button>
                    
                    <button @click="leaveRoomLocal"
                            class="w-16 h-12 rounded-full flex items-center justify-center bg-red-500 hover:bg-red-600 transition-colors ml-4">
                        <i class="bi bi-telephone-x-fill text-xl"></i>
                    </button>
                </div>
            </div>
            
            <div v-else class="flex flex-col items-center justify-center">
                <i class="bi bi-door-closed text-4xl mb-4 text-white/50"></i>
                <p class="text-white/50">Vous avez quitté le salon.</p>
                <button @click="initCall" class="mt-6 px-6 py-2 bg-blue-500 hover:bg-blue-600 rounded-full transition-colors font-medium">
                    Rejoindre à nouveau
                </button>
            </div>
        </main>
        
    </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { useRoute } from 'vue-router';
import sfetch from '@/assets/utils/sfetch';
import useLiveKit from '@/composables/useLiveKit';
import { keycloak } from '@/assets/keycloak';
import VideoTrack from '@/views/OrgSpace/components/common/VideoTrack.vue';
import { Track } from 'livekit-client';

const route = useRoute();
const code = route.params.code as string;

const { 
    connectToRoom, 
    leaveRoom, 
    isConnected, 
    allParticipants, 
    isMicEnabled, 
    isDeafened,
    isCameraEnabled,
    isScreenShareEnabled,
    toggleMicrophone, 
    toggleDeafen,
    toggleCamera,
    toggleScreenShare
} = useLiveKit();

const isLoading = ref(true);
const error = ref('');
const org = ref<any>(null);
const threadId = ref('');

const gridStyle = computed(() => {
    const count = allParticipants.value.length;
    if (count === 0) return {};
    if (count === 1) return { gridTemplateColumns: '1fr' };
    if (count <= 4) return { gridTemplateColumns: 'repeat(2, 1fr)' };
    if (count <= 9) return { gridTemplateColumns: 'repeat(3, 1fr)' };
    return { gridTemplateColumns: 'repeat(4, 1fr)' };
});

const getParticipantMeta = (p: any) => {
    let meta = { name: '', avatarUrl: '' };
    try {
        if (p.metadata) {
            meta = JSON.parse(p.metadata);
        }
    } catch(e) {}
    
    const finalName = meta.name || p.name || p.identity;
    return {
        name: finalName,
        avatarUrl: meta.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(finalName)}&background=random`
    };
};

const leaveRoomLocal = async () => {
    await leaveRoom(threadId.value, 'home');
};

const initCall = async () => {
    isLoading.value = true;
    error.value = '';

    try {
        // Fetch invite info first to show UI
        const infoRes = await sfetch(`/api/threads/invites/${code}`);
        if (!infoRes.ok) {
            const data = await infoRes.json();
            throw new Error(data.error || 'Invitation invalide ou expirée');
        }
        
        const info = await infoRes.json();
        org.value = info.organization;

        // Check auth
        if (!keycloak.authenticated) {
            keycloak.login({ redirectUri: window.location.href });
            return;
        }

        // Fetch LiveKit Token
        const joinRes = await sfetch(`/api/threads/invites/${code}/join`, {
            method: 'POST'
        });

        if (!joinRes.ok) {
            const data = await joinRes.json();
            throw new Error(data.error || 'Impossible de rejoindre le salon');
        }

        const data = await joinRes.json();
        threadId.value = data.threadId;

        // Ensure variables are in place for E2EE key derivation
        import.meta.env.VITE_LIVEKIT_URL = data.url;
        
        // Minor hack for E2EE: useLiveKit expects `openedOrg.value.id` to derive the key.
        // We temporarily inject it in the global state if needed, but it's cleaner to pass it.
        // Since we cannot easily modify useLiveKit without breaking OrgLayout, let's mock it.
        const { openedOrg } = await import('@/assets/var');
        if (!openedOrg.value) {
            openedOrg.value = { id: data.orgId } as any;
        }

        await connectToRoom(data.url, data.token, data.threadId, 'home');

    } catch (err: any) {
        error.value = err.message;
    } finally {
        isLoading.value = false;
    }
};

const retry = () => {
    initCall();
};

onMounted(() => {
    initCall();
});

onUnmounted(() => {
    if (isConnected.value) {
        leaveRoomLocal();
    }
});
</script>

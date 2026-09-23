<template>
    <Teleport to="body">

        <!-- Fullscreen Call Mode -->
        <Transition name="fade">
            <div
                v-if="isCalling && !isMinimized"
                class="fixed inset-0 z-[1000] bg-(--black)/95 flex items-center justify-center p-4"
                @click.self="isMinimized = true"
            >
                    <div
                        class="
                            relative w-full max-w-6xl aspect-video
                            bg-(--bg2) rounded-3xl overflow-hidden
                            shadow-2xl border border-(--text)/10
                        "
                    >
                        <!-- Header with controls -->
                        <div class="absolute top-4 left-4 right-4 z-20 flex items-center justify-between">
                            <!-- Security Status : bouton discret icône seule — au clic,
                                 explique le fonctionnement du chiffrement plutôt que
                                 d'afficher un gros libellé en permanence (même traitement
                                 que le bouclier des sessions éphémères, PrivateMeetView.vue). -->
                            <button
                                v-if="securityStatus"
                                @click="openSecurityInfo"
                                class="flex items-center justify-center w-9 h-9 rounded-full backdrop-blur-md border transition-colors"
                                :class="[
                                    !securityStatus.encrypted
                                        ? 'bg-yellow-500/20 border-yellow-500/30 text-yellow-400'
                                        : isCurrentPeerVerified
                                            ? 'bg-green-500/20 border-green-500/30 text-green-400 hover:bg-green-500/30'
                                            : 'bg-blue-500/20 border-blue-500/30 text-blue-300 hover:bg-blue-500/30'
                                ]"
                                title="Sécurité de l'appel"
                            >
                                <i
                                    class="bi text-sm"
                                    :class="!securityStatus.encrypted
                                        ? 'bi-shield-exclamation'
                                        : isCurrentPeerVerified ? 'bi-shield-check-fill' : 'bi-shield-lock'"
                                />
                            </button>

                            <!-- Timer and Minimize Button -->
                            <div class="flex items-center gap-4">
                                <div v-if="callTimer" class="px-3 py-1.5 rounded-full bg-(--black)/50 backdrop-blur-md">
                                    <span class="text-sm font-mono text-(--white)">{{ callTimer }}</span>
                                </div>
                                <button
                                    @click="isMinimized = true"
                                    class="default hover:bg-(--white)/10 rounded-full p-1.5"
                                    title="Minimiser"
                                >
                                    <i class="bi bi-arrows-angle-contract text-xl" />
                                </button>
                            </div>
                        </div>

                        <!-- Video Area -->
                        <div class="w-full h-full relative">

                            <!-- Remote Tile (video if active, avatar + speaking ring otherwise) -->
                            <div class="absolute inset-0 flex items-center justify-center p-6 pt-16">
                                <div class="relative w-full h-full bg-(--black) rounded-2xl overflow-hidden flex items-center justify-center">

                                    <!-- L'élément média reste monté tant qu'un flux distant existe, même
                                         sans vidéo (appel audio seul) : c'est lui qui joue le son, et
                                         registerRemoteMediaElement() (setSinkId) a besoin d'un élément
                                         qui reste présent pendant tout l'appel, pas seulement quand la
                                         caméra est active. -->
                                    <video
                                        v-if="currentRemoteStream"
                                        :ref="setRemoteVideoRef"
                                        :srcObject="currentRemoteStream"
                                        autoplay
                                        :muted="isDeafened"
                                        class="w-full h-full object-cover"
                                        :class="{ 'opacity-0 absolute': !hasRemoteVideo }"
                                    />

                                    <div v-if="!hasRemoteVideo" class="flex flex-col items-center gap-4">
                                        <img
                                            :src="currentPeerAvatar"
                                            class="w-32 h-32 rounded-full border-4 transition-all duration-300"
                                            :class="isRemoteSpeaking ? 'border-(--primary) scale-110 shadow-[0_0_30px_rgba(var(--primary-rgb),0.5)]' : 'border-transparent'"
                                        />
                                        <p v-if="remoteStreams.size === 0" class="text-lg font-medium text-(--white)/60 animate-pulse">
                                            Appel en cours...
                                        </p>
                                        <div v-if="securityStatus?.encrypted" class="flex items-center gap-2 text-green-400/60 text-sm">
                                            <i class="bi bi-lock-fill" />
                                            <span>Appel sécurisé</span>
                                        </div>
                                    </div>

                                    <div
                                        v-if="currentPeerName"
                                        class="
                                            absolute bottom-4 left-4
                                            flex items-center gap-2
                                            bg-black/60 backdrop-blur-md
                                            px-4 py-2 rounded-xl border
                                            border-white/10 shadow-lg
                                        "
                                    >
                                        <span class="text-sm font-bold text-white">{{ currentPeerName }}</span>
                                    </div>

                                </div>
                            </div>

                            <!-- Local Video Preview (PiP) -->
                            <div
                                class="
                                    absolute bottom-6 right-6 w-48 aspect-video
                                    overflow-hidden border-2 border-(--text)/20
                                    shadow-xl bg-(--bg2) rounded-xl
                                "
                            >
                                <video
                                    v-if="localStream && (isCamOn || isScreenSharing)"
                                    :srcObject="localStream"
                                    autoplay
                                    muted
                                    class="w-full h-full object-cover mirror"
                                />
                                <div v-else class="w-full h-full flex items-center justify-center">
                                    <img
                                        :src="myAvatar"
                                        class="w-16 h-16 rounded-full border-2 transition-all duration-300"
                                        :class="isSpeaking ? 'border-(--primary) scale-105 shadow-[0_0_15px_rgba(var(--primary-rgb),0.5)]' : 'border-transparent'"
                                    />
                                </div>
                                <div v-if="!isMicOn" class="absolute bottom-1.5 left-1.5 bg-black/60 backdrop-blur-md rounded-md w-6 h-6 flex items-center justify-center">
                                    <i class="bi bi-mic-mute-fill text-red-500 text-xs" />
                                </div>
                            </div>

                        </div>

                        <!-- Call Controls -->
                        <div
                            class="
                                absolute left-1/2 -translate-x-1/2 bottom-6
                                flex items-center justify-center
                            "
                        >
                            <CallControls
                                :isMicOn="isMicOn"
                                :isCamOn="isCamOn"
                                :isScreenSharing="isScreenSharing"
                                :isDeafened="isDeafened"
                                :showInvite="false"
                                :switchDevice="switchDevice"
                                :applyVideoQuality="applyVideoQuality"
                                @toggleMic="toggleMic"
                                @toggleCam="onToggleCam"
                                @toggleScreenShare="onToggleScreenShare"
                                @toggleDeafen="toggleDeafen"
                                @endCall="handleEndCall"
                            />
                        </div>

                    </div>
                </div>
        </Transition>

        <!-- SAS / Fingerprint Verification Panel -->
        <Transition name="fade">
            <div
                v-if="showVerifyPanel"
                class="fixed inset-0 z-[1100] bg-(--black)/70 flex items-center justify-center p-4"
                @click.self="showVerifyPanel = false"
            >
                <div class="w-full max-w-sm bg-(--bg2) rounded-2xl p-6 shadow-2xl border border-(--text)/10">

                    <div class="flex items-center gap-3 text-blue-400 mb-3">
                        <i class="bi bi-shield-lock text-2xl" />
                        <h3 class="text-lg font-bold text-(--text)">Vérifier l'appel</h3>
                    </div>

                    <p class="text-sm text-(--text2) mb-4 leading-relaxed">
                        Lisez ce code à voix haute à votre interlocuteur, et demandez-lui de lire le sien.
                        S'ils correspondent, l'appel n'est pas intercepté.
                    </p>

                    <div class="mb-4 px-4 py-3 rounded-xl bg-(--bg)/60 border border-(--text)/10 text-center">
                        <span class="text-xl font-mono tracking-[0.2em] text-(--text)">{{ localFingerprint }}</span>
                    </div>

                    <!-- Vérifié via RTCPeerConnection.getStats() sur la paire ICE
                         réellement retenue, pas juste déduit de la config. -->
                    <div v-if="connectionType" class="flex items-center gap-2 mb-4 text-xs" :class="connectionType === 'relay' ? 'text-yellow-400' : 'text-green-400'">
                        <i class="bi" :class="connectionType === 'relay' ? 'bi-exclamation-triangle-fill' : 'bi-check-circle-fill'" />
                        <span>
                            {{ connectionType === 'direct'
                                ? 'Connexion directe entre vos deux appareils (pas de serveur intermédiaire pour le média).'
                                : connectionType === 'relay'
                                    ? 'Connexion relayée (TURN) — nécessaire à cause de votre réseau, le média transite par un relais mais reste chiffré de bout en bout.'
                                    : 'Type de connexion inconnu.' }}
                        </span>
                    </div>

                    <label class="text-xs text-(--text2) mb-2 block">Code lu par votre interlocuteur :</label>
                    <input
                        v-model="fingerprintInput"
                        type="text"
                        maxlength="16"
                        placeholder="Ex: 1A2B3C4D5E6F7890"
                        class="w-full bg-black/20 border rounded-lg px-4 py-2 text-sm text-(--text) outline-none transition-all mb-2 font-mono uppercase"
                        :class="verifyError ? 'border-red-500/60' : 'border-(--text)/10 focus:border-(--primary)/50'"
                        @keydown.enter="confirmFingerprint"
                    />
                    <p v-if="verifyError" class="text-xs text-red-400 mb-4">
                        Ce code ne correspond pas — l'appel pourrait être intercepté. Ne confirmez que si les deux codes sont réellement identiques.
                    </p>
                    <p v-else class="text-xs text-transparent mb-4 select-none">.</p>

                    <div class="flex justify-end gap-3">
                        <button @click="showVerifyPanel = false" class="default">Plus tard</button>
                        <button @click="confirmFingerprint" :disabled="!fingerprintInput.trim()" class="primary" :class="{ 'opacity-40 cursor-not-allowed': !fingerprintInput.trim() }">
                            Confirmer
                        </button>
                    </div>

                </div>
            </div>
        </Transition>

        <!-- Popup d'explication du chiffrement, ouverte par le bouclier discret
             (fullscreen et minimisé) — contenu éducatif, pas d'action requise,
             sauf le renvoi vers la vérification SAS quand elle est pertinente. -->
        <Popup :isOpen="showSecurityInfo" @close="showSecurityInfo = false">
            <template #title>Sécurité de l'appel</template>

            <div class="space-y-5 text-sm text-(--text2) leading-relaxed">

                <div class="flex items-start gap-3">
                    <i class="bi bi-router-fill text-lg text-(--primary) mt-0.5 shrink-0" />
                    <div>
                        <p class="text-(--text) font-semibold mb-1">Connexion directe (peer-to-peer)</p>
                        <p>
                            Le son et la vidéo ne transitent jamais par les serveurs de Synco.
                            Une fois l'appel établi, votre appareil communique directement avec
                            celui de votre correspondant.
                        </p>
                        <p class="mt-2 flex items-center gap-1.5 text-xs font-medium" :class="connectionType === 'relay' ? 'text-yellow-500' : connectionType === 'direct' ? 'text-green-500' : 'text-(--text2)'">
                            <i class="bi" :class="connectionType === 'relay' ? 'bi-exclamation-triangle-fill' : connectionType === 'direct' ? 'bi-check-circle-fill' : 'bi-hourglass-split'" />
                            {{ connectionType === 'relay'
                                ? 'Connexion actuelle : relayée (réseau restrictif) — le média reste chiffré de bout en bout malgré tout'
                                : connectionType === 'direct'
                                    ? 'Connexion actuelle : directe'
                                    : 'Connexion en cours de vérification…' }}
                        </p>
                    </div>
                </div>

                <div class="flex items-start gap-3">
                    <i class="bi bi-key-fill text-lg text-(--primary) mt-0.5 shrink-0" />
                    <div>
                        <p class="text-(--text) font-semibold mb-1">Chiffrement de bout en bout</p>
                        <p>
                            WebRTC chiffre déjà nativement tout le média (DTLS-SRTP, automatique
                            et obligatoire). Synco ajoute une seconde couche : à l'établissement
                            de l'appel, vos deux appareils négocient une clé de session unique
                            (ECDH) que seul votre correspondant peut calculer — même le serveur
                            de signalisation qui vous met en relation ne peut pas la connaître.
                        </p>
                    </div>
                </div>

                <div class="flex items-start gap-3 pt-3 border-t border-(--border-color)">
                    <i class="bi" :class="isCurrentPeerVerified ? 'bi-shield-check-fill text-lg text-green-500 mt-0.5 shrink-0' : 'bi-patch-question-fill text-lg text-(--primary) mt-0.5 shrink-0'" />
                    <div class="flex-1">
                        <p class="text-(--text) font-semibold mb-1">Vérification anti-interception</p>
                        <p v-if="!securityStatus?.encrypted">
                            L'échange de clé est en cours d'établissement — la vérification sera
                            disponible une fois l'appel chiffré.
                        </p>
                        <template v-else-if="isCurrentPeerVerified">
                            <p class="text-green-500 font-medium flex items-center gap-1.5">
                                <i class="bi bi-check-circle-fill" />
                                Code vérifié pour cet appel
                            </p>
                        </template>
                        <template v-else>
                            <p class="mb-3">
                                Un serveur de signalisation compromis pourrait en théorie
                                s'interposer sur l'échange de clé initial. Lire à voix haute un
                                court code à votre correspondant (et comparer le sien) confirme
                                qu'aucun tiers ne s'est glissé entre vous deux.
                            </p>
                            <button @click="startVerificationFromInfo" class="primary !text-xs !py-1.5">
                                <i class="bi bi-shield-lock" />
                                Vérifier le code de sécurité
                            </button>
                        </template>
                    </div>
                </div>

            </div>

        </Popup>

        <!-- Minimized Floating Window (16:9) - Only one instance per call -->
        <Transition name="slide-fade">
            <DraggableWindow
                v-if="isCalling && isMinimized"
                :initialX="windowX"
                :initialY="windowY"
                :active="true"
                width="320px"
                height="180px"
                class="z-[1001]"
                :key="remoteStreams.size > 0 ? `call-${Array.from(remoteStreams.keys())[0]}` : 'call-waiting'"
            >
                <template #header>
                    <div
                        class="
                            relative w-full h-full bg-(--bg2) rounded-2xl
                            overflow-hidden shadow-2xl border border-(--text)/10
                            group
                        "
                    >
                        <!-- Header with close/minimize and timer -->
                        <div class="absolute top-2 left-2 right-2 z-10 flex items-center justify-between">
                            <button
                                @click="handleEndCall"
                                class="rounded-full bg-red-500/80 hover:bg-red-500 p-1.5 text-white transition-colors"
                                title="Raccrocher"
                            >
                                <i class="bi bi-telephone-x-fill text-sm" />
                            </button>

                            <div v-if="callTimer" class="px-2 py-1 rounded bg-(--black)/40">
                                <span class="text-xs font-mono text-(--white)">{{ callTimer }}</span>
                            </div>

                            <button
                                @click="isMinimized = false"
                                class="rounded-full bg-(--primary)/80 hover:bg-(--primary) p-1.5 text-white transition-colors"
                                title="Plein écran"
                            >
                                <i class="bi bi-arrows-angle-expand text-sm" />
                            </button>
                        </div>

                        <!-- Video Content -->
                        <div class="w-full h-full relative pt-8">

                            <!-- Élément média toujours monté tant qu'un flux existe (même sans
                                 vidéo, cf. plein écran ci-dessus) : c'est lui qui joue le son. -->
                            <video
                                v-if="currentRemoteStream"
                                :ref="setRemoteVideoRef"
                                :srcObject="currentRemoteStream"
                                autoplay
                                :muted="isDeafened"
                                class="w-full h-full object-cover"
                                :class="{ 'opacity-0 absolute': !hasRemoteVideo }"
                            />

                            <div v-if="hasRemoteVideo" class="absolute bottom-1 left-1 bg-(--black)/70 px-1.5 py-0.5 rounded text-[10px]">
                                <span class="text-(--white) font-medium truncate max-w-[120px] block">{{ currentPeerName }}</span>
                            </div>

                            <div v-if="!hasRemoteVideo" class="w-full h-full flex items-center justify-center">
                                <img
                                    :src="currentPeerAvatar"
                                    class="w-14 h-14 rounded-full border-2 transition-all duration-300"
                                    :class="isRemoteSpeaking ? 'border-(--primary) shadow-[0_0_15px_rgba(var(--primary-rgb),0.5)]' : 'border-transparent'"
                                />
                            </div>

                            <!-- Local Video Preview (small) -->
                            <div
                                v-if="localStream && (isCamOn || isScreenSharing)"
                                class="
                                    absolute bottom-2 right-2 w-20 aspect-video
                                    overflow-hidden border border-(--white)/20
                                    shadow-lg bg-(--black) rounded-lg
                                "
                            >
                                <video
                                    :srcObject="localStream"
                                    autoplay
                                    muted
                                    class="w-full h-full object-cover mirror"
                                />
                            </div>

                            <!-- Security Badge (minimized) — icône seule, même popup d'info -->
                            <button
                                v-if="securityStatus?.encrypted"
                                @click="openSecurityInfo"
                                class="absolute bottom-2 left-2 w-5 h-5 rounded-full flex items-center justify-center"
                                :class="isCurrentPeerVerified ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-300'"
                                title="Sécurité de l'appel"
                            >
                                <i class="bi text-[10px]" :class="isCurrentPeerVerified ? 'bi-shield-check-fill' : 'bi-shield-lock'" />
                            </button>

                        </div>

                        <!-- Hover Controls (minimized) -->
                        <div
                            class="
                                absolute left-1/2 -translate-x-1/2 -bottom-10
                                flex items-center bg-(--black)/60 border-(--white)/10
                                backdrop-blur-xl rounded-full border-t p-1.5
                                opacity-0 group-hover:opacity-100 group-hover:-bottom-2
                                transition-all duration-200
                            "
                        >
                            <button
                                @click="toggleMic"
                                :class="!isMicOn ? 'bg-red-500/50 text-red-200' : ''"
                                class="rounded-full bg-(--white)/10 hover:bg-(--white)/20 text-(--white) transition-all w-9 h-9 text-lg mx-1"
                            >
                                <i class="bi" :class="isMicOn ? 'bi-mic-fill' : 'bi-mic-mute-fill'" />
                            </button>

                            <button
                                @click="onToggleCam"
                                :class="!isCamOn ? 'bg-(--white)/5 text-(--white)/50' : ''"
                                class="rounded-full bg-(--white)/10 hover:bg-(--white)/20 text-(--white) transition-all w-9 h-9 text-lg mx-1"
                            >
                                <i class="bi" :class="isCamOn ? 'bi-camera-video-fill' : 'bi-camera-video-off-fill'" />
                            </button>
                        </div>

                    </div>
                </template>
            </DraggableWindow>
        </Transition>

    </Teleport>
</template>

<script setup lang="ts">

import useSecurePeer from '@/composables/useSecurePeer';
import { computed, onUnmounted, ref, watch, type ComponentPublicInstance } from 'vue';
import DraggableWindow from '../common/DraggableWindow.vue';
import CallControls from './CallControls.vue';
import Popup from '@/components/Popup.vue';
import { openedOrg, user } from '@/assets/var';
import { getVoicePrefs, resolveCameraCaptureOptions } from '@/assets/utils/voicePrefs';

const isMinimized = ref<boolean>(false);
const windowX = ref<number>(window.innerWidth - 350);
const windowY = ref<number>(window.innerHeight - 220);

const {
    isCalling,
    remoteStreams,
    remoteSpeaking,
    remoteHasVideo,
    activeCalls,
    localStream,
    isMicOn,
    isCamOn,
    isScreenSharing,
    isDeafened,
    isSpeaking,
    endCall,
    toggleMic,
    toggleCam,
    toggleScreenShare,
    toggleDeafen,
    switchDevice,
    applyVideoQuality,
    registerRemoteMediaElement,
    getCallSecurityStatus,
    verifySecurityFingerprint,
    getConnectionType
} = useSecurePeer();

// Le peer courant : d'abord celui dont on a déjà un flux (appel connecté),
// sinon le peer qu'on est en train d'appeler/de rejoindre — activeCalls a
// déjà une entrée dès startCall(), avant toute réponse, donc ça couvre aussi
// l'état "ça sonne" sans avoir besoin d'un état dédié.
const currentPeerId = computed<string | null>(() => {
    if (remoteStreams.value.size > 0) return (remoteStreams.value.keys().next().value as string) ?? null;
    if (activeCalls.value.size > 0) return (activeCalls.value.keys().next().value as string) ?? null;
    return null;
});

const currentRemoteStream = computed<MediaStream | null>(() =>
    currentPeerId.value ? remoteStreams.value.get(currentPeerId.value) ?? null : null
);

// La caméra et le partage d'écran se remplacent l'un l'autre sur la même
// track vidéo (cf. useSecurePeer.ts toggleCam/toggleScreenShare) : un seul
// flux vidéo possible à la fois, pas besoin de distinguer les deux ici.
//
// Dérivé de remoteHasVideo (booléen primitif tenu à jour par
// useSecurePeer.ts), PAS de currentRemoteStream.getVideoTracks() : sur une
// renégociation, currentRemoteStream reste le MÊME objet MediaStream par
// référence (juste muté en place), donc un computed dérivé de son contenu ne
// se propage jamais correctement — cf. le commentaire détaillé sur
// remoteHasVideo dans useSecurePeer.ts.
const hasRemoteVideo = computed<boolean>(() =>
    currentPeerId.value !== null && !!remoteHasVideo.value.get(currentPeerId.value)
);

const isRemoteSpeaking = computed<boolean>(() =>
    currentPeerId.value !== null && !!remoteSpeaking.value.get(currentPeerId.value)
);

const getParticipantName = (peerId: string | null): string => {
    if (!peerId || !openedOrg.value?.members) return '';
    const member = openedOrg.value.members.find(m => m.user?.id === peerId);
    return member?.user?.name || '';
};

const getParticipantAvatar = (peerId: string | null): string => {
    if (!peerId) return '';
    const member = openedOrg.value?.members?.find(m => m.user?.id === peerId);
    return member?.user?.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(member?.user?.name || '')}&background=128a60&color=fff`;
};

const currentPeerName = computed(() => getParticipantName(currentPeerId.value));
const currentPeerAvatar = computed(() => getParticipantAvatar(currentPeerId.value));
const myAvatar = computed(() => user.value?.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.value?.name || '')}&background=128a60&color=fff`);

// Applique le device/résolution/framerate choisis dans les réglages à
// l'activation, comme onToggleCam/onToggleScreenShare dans VoiceThreadView.vue.
const onToggleCam = () => {
    if (isCamOn.value) { toggleCam(); return; }
    const prefs = getVoicePrefs();
    const { resolution, frameRate } = resolveCameraCaptureOptions(prefs);
    toggleCam({ deviceId: prefs.camDeviceId, resolution, frameRate });
};

const onToggleScreenShare = () => {
    if (isScreenSharing.value) { toggleScreenShare(); return; }
    const prefs = getVoicePrefs();
    toggleScreenShare({ resolution: { ...prefs.screenResolution, frameRate: prefs.screenFrameRate } });
};

// L'élément <video> réellement monté doit être enregistré pour que
// switchDevice('audiooutput', ...) puisse lui appliquer setSinkId — un seul
// interlocuteur à la fois en appel privé, donc pas besoin du Map de setters
// mémoïsés par identity utilisé dans VoiceThreadView.vue (N participants).
const setRemoteVideoRef = (el: Element | ComponentPublicInstance | null) => {
    const peerId = currentPeerId.value;
    if (!peerId) return;
    registerRemoteMediaElement(peerId, (el as HTMLMediaElement) || null);
};

// SAS verification: two peers only share the exact same fingerprint if
// their ECDH key exchange wasn't intercepted (cf. useSecurePeer.ts
// generateFingerprint). Tracked per-peerId, in-memory only, and reset on
// call end — verifying today says nothing about tomorrow's call.
const verifiedPeers = ref<Set<string>>(new Set());
const showVerifyPanel = ref<boolean>(false);
const fingerprintInput = ref<string>('');
const verifyError = ref<boolean>(false);

const isCurrentPeerVerified = computed<boolean>(() =>
    currentPeerId.value !== null && verifiedPeers.value.has(currentPeerId.value)
);

const localFingerprint = computed<string>(() => {
    if (!currentPeerId.value) return '';
    return getCallSecurityStatus(currentPeerId.value).fingerprint;
});

// 'direct' | 'relay' | 'unknown' | null (pas encore chargé) — vérifié depuis
// les stats WebRTC réelles (cf. useSecurePeer.ts getConnectionType), pas
// supposé depuis la config statique.
const connectionType = ref<'direct' | 'relay' | 'unknown' | null>(null);

const openVerifyPanel = () => {
    fingerprintInput.value = '';
    verifyError.value = false;
    connectionType.value = null;
    showVerifyPanel.value = true;
    if (currentPeerId.value) {
        getConnectionType(currentPeerId.value).then(type => { connectionType.value = type; });
    }
};

// Popup d'explication ouverte au clic sur le bouclier — remplace l'ancien
// gros libellé texte ("Chiffrement..."/"Appel sécurisé") en permanence
// affiché, même traitement que le bouclier des sessions éphémères
// (PrivateMeetView.vue).
const showSecurityInfo = ref<boolean>(false);

const openSecurityInfo = () => {
    showSecurityInfo.value = true;
    connectionType.value = null;
    if (currentPeerId.value) {
        getConnectionType(currentPeerId.value).then(type => { connectionType.value = type; });
    }
};

// Depuis la popup d'info : bascule directement vers la vérification SAS
// sans avoir à rouvrir un second bouclier.
const startVerificationFromInfo = () => {
    showSecurityInfo.value = false;
    openVerifyPanel();
};

const confirmFingerprint = () => {
    if (!currentPeerId.value) return;
    const ok = verifySecurityFingerprint(currentPeerId.value, fingerprintInput.value.trim());
    if (ok) {
        verifiedPeers.value = new Set(verifiedPeers.value).add(currentPeerId.value);
        showVerifyPanel.value = false;
    } else {
        verifyError.value = true;
    }
};

// Call timer
const callStartTime = ref<number | null>(null);
const callTimer = ref<string>('');
// startTimer() est appelé depuis des watchers, pas depuis le corps synchrone
// de setup() — onUnmounted() n'y a plus d'instance active à laquelle
// s'attacher (Vue le signale par un warning et n'enregistre rien), donc
// l'intervalle n'était jamais nettoyé. Suivi dans une ref et nettoyé par
// stopTimer(), lui-même appelé depuis le SEUL onUnmounted du composant
// (enregistré une fois, en synchrone, plus bas).
const timerIntervalId = ref<ReturnType<typeof setInterval> | null>(null);

// Compute security status for display
const securityStatus = computed(() => {
    return currentPeerId.value ? getCallSecurityStatus(currentPeerId.value) : null;
});

// Start call timer when call begins
const startTimer = () => {
    if (callStartTime.value) return;
    callStartTime.value = Date.now();
    updateTimer();
    timerIntervalId.value = setInterval(updateTimer, 1000);
};

const stopTimer = () => {
    callStartTime.value = null;
    callTimer.value = '';
    if (timerIntervalId.value) {
        clearInterval(timerIntervalId.value);
        timerIntervalId.value = null;
    }
};

const updateTimer = () => {
    if (!callStartTime.value) {
        callTimer.value = '';
        return;
    }

    const seconds = Math.floor((Date.now() - callStartTime.value) / 1000);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    callTimer.value = [
        hours.toString().padStart(2, '0'),
        minutes.toString().padStart(2, '0'),
        secs.toString().padStart(2, '0')
    ].join(':');
};

const handleEndCall = () => {
    endCall();
    stopTimer();
    isMinimized.value = false;
    verifiedPeers.value = new Set();
    showVerifyPanel.value = false;
    showSecurityInfo.value = false;
};

// Watch for call state changes to manage timer
watch(() => isCalling.value, (newVal) => {
    if (newVal && remoteStreams.value.size > 0) {
        startTimer();
    } else {
        stopTimer();
    }
}, { immediate: true });

// Also watch remote streams
watch(() => remoteStreams.value.size, (newSize) => {
    if (newSize > 0 && isCalling.value) {
        startTimer();
    }
});

// Cleanup on unmount
onUnmounted(() => {
    stopTimer();
    endCall();
});

</script>

<style scoped>

.mirror {
    transform: scaleX(-1);
}

.fade-enter-active,
.fade-leave-active {
    transition: opacity 0.3s ease, transform 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
    opacity: 0;
    transform: scale(0.95);
}

.slide-fade-enter-active {
    transition: all 0.3s ease-out;
}

.slide-fade-leave-active {
    transition: all 0.2s cubic-bezier(1.0, 0.5, 0.8, 1.0);
}

.slide-fade-enter-from,
.slide-fade-leave-to {
    transform: translateX(20px);
    opacity: 0;
}

</style>

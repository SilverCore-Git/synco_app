<template>

    <!-- Ancre invisible : DropDown a besoin d'un élément #trigger monté pour se positionner,
         mais l'ouverture réelle se fait par contextmenu sur la tuile elle-même (cf. VoiceThreadView),
         via la méthode `open()` exposée ci-dessous. display:none la sort entièrement du flux
         (grid/flex) pour ne pas perturber la mise en page des tuiles. -->
    <div class="hidden">
    <DropDown ref="dropdownRef" align="mouse">

        <template #trigger>
            <span />
        </template>

        <template #content>

            <div class="px-2 py-1.5 text-xs font-semibold text-(--text2) truncate">
                {{ displayName }}
            </div>

            <div v-if="!isSelf" class="px-3 py-2 dropdown-item-annimate" @click.stop>
                <div class="flex items-center justify-between mb-1.5">
                    <span class="text-xs text-(--text2)">Volume</span>
                    <span class="text-xs text-(--text) font-mono">{{ volume }}%</span>
                </div>
                <input
                    type="range"
                    min="0"
                    max="200"
                    step="5"
                    :value="volume"
                    @input="onVolumeInput"
                    class="w-full accent-(--primary)"
                />
            </div>

            <button
                v-if="canMute && !isSelf"
                @click="onToggleMute"
                class="dropdown-item-style dropdown-item-annimate"
            >
                <i class="bi mr-2" :class="participant.isMicrophoneEnabled ? 'bi-mic-mute' : 'bi-mic'" />
                {{ participant.isMicrophoneEnabled ? 'Couper le micro' : 'Réactiver le micro' }}
            </button>

            <button
                v-if="canDisconnect && !isSelf"
                @click="showConfirm = true"
                class="text-red-500! hover:bg-red-500! hover:text-(--white)! dropdown-item-style dropdown-item-annimate"
            >
                <i class="bi bi-telephone-x mr-2" />
                Expulser du salon
            </button>

        </template>

    </DropDown>
    </div>

    <ConfirmDelete
        :show="showConfirm"
        :itemName="displayName"
        itemType="ce participant"
        title="Expulser ce participant ?"
        buttonText="Expulser"
        :loading="disconnecting"
        @confirm="onDisconnect"
        @cancel="showConfirm = false"
    />

</template>

<script setup lang="ts">

import { computed, ref } from 'vue';
import DropDown from '@/components/DropDown.vue';
import ConfirmDelete from '@/components/common/ConfirmDelete.vue';
import useLiveKit from '@/composables/useLiveKit';
import { useToast } from '@/composables/useToast';

const props = defineProps<{
    participant: any;
    threadId: string;
    isSelf: boolean;
    canMute: boolean;
    canDisconnect: boolean;
    getName: (p: any) => string;
}>();

const { participantVolumes, setParticipantVolume, muteParticipant, disconnectParticipant } = useLiveKit();
const toast = useToast();

const dropdownRef = ref<any>(null);
const showConfirm = ref(false);
const disconnecting = ref(false);

/** Ouvre le menu — appelé depuis le gestionnaire @contextmenu de la tuile parente. */
const open = (e: MouseEvent) => dropdownRef.value?.toggleDropdown(e);
defineExpose({ open });

const displayName = computed(() => props.getName(props.participant) || 'Anonyme');
const volume = computed(() => participantVolumes.get(props.participant.identity) ?? 100);

const onVolumeInput = (e: Event) => {
    const pct = Number((e.target as HTMLInputElement).value);
    setParticipantVolume(props.participant.identity, pct);
};

const onToggleMute = async () => {
    try {
        const res = await muteParticipant(props.threadId, props.participant.identity, !!props.participant.isMicrophoneEnabled);
        if (!res.ok) throw new Error();
    } catch {
        toast.show("Impossible de modifier le micro de ce participant", "error");
    }
};

const onDisconnect = async () => {
    disconnecting.value = true;
    try {
        const res = await disconnectParticipant(props.threadId, props.participant.identity);
        if (!res.ok) throw new Error();
    } catch {
        toast.show("Impossible d'expulser ce participant", "error");
    } finally {
        disconnecting.value = false;
        showConfirm.value = false;
    }
};

</script>

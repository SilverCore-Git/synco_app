<template>

    <div class="flex flex-col w-full">

        <DropDown align="right" click="right" class="w-full">
            <template #trigger>
                <button
                    @click="handleAction"
                    class="
                        w-full flex items-center justify-start 
                        text-left gap-2 px-2 py-1.5 rounded-lg
                        transition-all duration-200 group cursor-pointer
                        hover:bg-(--primary)/5 active:scale-95
                        hover:text-(--text) 
                    "
                    :class="[
                        isActiveInRoom
                            ? 'border-l-3 border-(--primary) bg-(--primary)/10 text-(--text)' 
                            : 'text-(--text2)',
                    ]"
                >

                    <div class="flex items-center justify-center w-5 h-5">
                        <i
                            v-if="isAnyoneSpeaking"
                            class="bi bi-soundwave text-lg text-(--primary) animate-pulse"
                        />
                        <i
                            v-else
                            class="bi bi-volume-up-fill text-lg group-hover:opacity-100"
                            :class="isActiveInRoom ? 'opacity-100' : 'opacity-40'"
                        />
                    </div>

                    <span class="text-sm font-medium truncate lowercase tracking-wide">
                        {{ thread.name }}
                    </span>

                    <div
                        v-if="currentParticipants.length > 0"
                        class="text-[10px] bg-black/20 px-1.5 py-0.5 rounded-full opacity-60"
                    >
                        {{ currentParticipants.length }}
                    </div>

                    <i
                        @click.stop="voiceInviteModalRef?.openModal()"
                        class="bi bi-person-plus-fill opacity-0 group-hover:opacity-100 transition-opacity hover:text-(--primary) text-sm ml-auto"
                        title="Inviter un membre"
                    />

                </button>
            </template>
            <template #content>
                <button @click="showEditThread = !showEditThread" class="dropdown-item-annimate dropdown-item-style">
                    <i class="bi bi-pencil-fill mr-2" />
                    Modifier
                </button>
                <button @click="voiceInviteModalRef?.openModal()" class="dropdown-item-annimate dropdown-item-style">
                    <i class="bi bi-person-plus-fill mr-2"></i> Inviter un membre
                </button>
                <button @click="openInviteModal" class="dropdown-item-annimate dropdown-item-style">
                    <i class="bi bi-link-45deg mr-2"></i> Gérer les liens d'invitation
                </button>
                <button v-if="can('FOLDER_DELETE', route.params.spaceId as string, thread.id)" @click="showConfirmDelete = !showConfirmDelete" class="dropdown-item-annimate dropdown-item-style text-red-400! hover:bg-red-500/10!">
                    <i class="bi bi-trash-fill mr-2" /> Supprimer
                </button>
            </template>
        </DropDown>

        <UpdateThread 
            :is-open="showEditThread"
            :thread="thread"
            @close="showEditThread = false"
        />

        <InviteLinkModal ref="inviteModalRef" :thread="thread" />
        <VoiceInviteModal ref="voiceInviteModalRef" :thread="thread" />
        
        <ConfirmDelete
            :show="showConfirmDelete"
            item-type="salon"
            :item-name="thread.name"
            @cancel="showConfirmDelete = false"
            @confirm="deleteThread"
        />

        <div 
            v-if="currentParticipants.length > 0"
            class="flex flex-col gap-1 ml-7 mt-1 mb-2"
        >

            <div 
                v-for="p in currentParticipants" 
                :key="p.identity"
                class="flex items-center gap-2 py-1 px-1 rounded transition-colors"
                :class="p.isSpeaking ? 'text-(--primary)' : 'text-(--text)'"
            >

                <div class="relative">
                    <img 
                        :src="getMeta(p).avatarUrl || `https://ui-avatars.com/api/?name=${getMeta(p).name}`" 
                        class="w-5 h-5 rounded-full object-cover transition-transform"
                        :class="p.isSpeaking ? 'scale-110 ring-2 ring-(--primary)' : ''"
                    />
                </div>
                
                <span class="text-xs truncate font-medium">
                    {{ getMeta(p).name || 'Anonyme' }}
                </span>

                <i v-if="!p.isMicrophoneEnabled" class="bi bi-mic-mute-fill text-[10px] ml-auto opacity-40" />

            </div>

        </div>

    </div>

</template>

<script lang="ts" setup>

import { computed, onMounted, onUnmounted, ref } from 'vue';
import type { Thread } from '@/types/types';
import useLiveKit from '@/composables/useLiveKit';
import sfetch from '@/assets/utils/sfetch';
import { useRoute, useRouter } from 'vue-router';
import useWSocket, { waitForSocketConnection } from '@/composables/useWSocket';
import { openedOrg } from '@/assets/var';
import DropDown from '@/components/DropDown.vue';
import UpdateThread from '../popup/UpdateThread.vue';
import InviteLinkModal from '../popup/InviteLinkModal.vue';
import VoiceInviteModal from '../popup/VoiceInviteModal.vue';
import ConfirmDelete from '@/components/common/ConfirmDelete.vue';
import { usePermissions } from '@/composables/usePermissions';

const props = defineProps<{
  thread: Thread;
  active?: boolean;
}>();

const route = useRoute();
const router = useRouter();
const inviteModalRef = ref<any>(null);
const voiceInviteModalRef = ref<any>(null);
const showConfirmDelete = ref<boolean>(false);
const showEditThread = ref<boolean>(false);

const orgId = computed(() => openedOrg.value?.id);
const { can } = usePermissions(orgId);

const { room, isConnected, connectToRoom, allParticipants, getWSData } = useLiveKit();

const socketParticipants = ref<any[]>([]);


const currentParticipants = computed(() => {
    if (isActiveInRoom.value) return allParticipants.value;
    return socketParticipants.value;
});

const isActiveInRoom = computed(() => {
    return isConnected.value && room.value?.name === props.thread.id;
});

const openInviteModal = () => {
    if (inviteModalRef.value) {
        inviteModalRef.value.openModal();
    }
};

const deleteThread = async () => {
    const socket = await useWSocket();
    const connected = await waitForSocketConnection(socket, 15000);
    if (!connected) {
        console.error('[VoiceThreadBtn] Socket not connected, cannot delete thread');
        return;
    }
    socket.value?.emit('thread:delete', ({ orgId: openedOrg.value?.id, threadId: props.thread.id }));
    showConfirmDelete.value = false;
};

const isAnyoneSpeaking = computed(() => {
    return currentParticipants.value.some(p => p.isSpeaking);
});


const getMeta = (p: any): any => {
    if (!openedOrg.value?.members) return {};
    const member = openedOrg.value.members.find(m => String(m.user?.id) === String(p.identity));
    return member?.user || {};
};

const handleAction = async () => {

    if (isActiveInRoom.value) 
    {
        const name = (route.name == 'OrgHome' || route.name == 'OrgThreadHome') 
                 ? 'OrgThreadHome' : 'SpaceThreadView';
        router.push({ name, params: { ...route.params, threadId: props.thread.id }, query: { ...route.query,  type: 'vocal', showView: '1' } })
    } 
    else 
    {

        const res = await sfetch('/api/livekit/token', {
            method: 'POST',
            body: JSON.stringify({ threadId: props.thread.id }),
        });

        if (res.ok)
        {
            const data = await res.json();
            await connectToRoom(data.url, data.token, props.thread.id, String(route.params.spaceId), data.e2eeKey);
        }

    }

};

let mountedSocket: Awaited<ReturnType<typeof useWSocket>>['value'] = null;

const onVocUpdate = ({ participants, threadId }: { participants: any[]; threadId: string }) => {
    if (threadId === props.thread.id)
    {
        socketParticipants.value = participants;
    }
};

const onVocGetUpdate = ({ threadId }: { threadId: string }) => {
    if (threadId === props.thread.id && isActiveInRoom.value && room.value)
    {
        mountedSocket?.emit('voc:update', {
            participants: getWSData(room.value),
            threadId: props.thread.id,
            orgId: route.params.orgId,
            spaceId: route.params.spaceId
        });
    }
};

onMounted(async () => {

    const socketRef = await useWSocket();
    const socket = socketRef.value;
    if (!socket) return;
    mountedSocket = socket;

    // Chaque VoiceThreadBtn (un par salon vocal affiché) s'abonne à ces deux
    // events sur le socket partagé de l'app : off('voc:update') sans handler
    // précis retire TOUS les listeners de l'event, y compris ceux des autres
    // salons — d'où la référence explicite pour ne désabonner que la sienne.
    socket.on('voc:update', onVocUpdate);
    socket.on('voc:get-update', onVocGetUpdate);

    if (!isActiveInRoom.value)
    {


        socket.emit('voc:get-update', {
            threadId: props.thread.id,
            orgId: route.params.orgId,
            spaceId: route.params.spaceId
        });

    }

});

onUnmounted(async () => {
    const socket = (await useWSocket()).value;
    if (socket)
    {
        socket.off('voc:update', onVocUpdate);
        socket.off('voc:get-update', onVocGetUpdate);
    }
});

</script>
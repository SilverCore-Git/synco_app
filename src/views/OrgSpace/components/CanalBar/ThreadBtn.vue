<template>

    <DropDown align="right" click="right" class="w-full">

        <template #trigger>

            <button
                @click="emit('click')"
                class="
                    w-full flex items-center justify-start 
                    text-left gap-2 px-2 py-1.5 rounded-lg
                    transition-all duration-200 group cursor-pointer
                    hover:bg-(--primary)/5 active:scale-95
                    hover:text-(--text) 
                "
                :class="[
                    active
                        ? 'border-l-3 border-(--primary) bg-(--primary)/10 text-(--text)' 
                        : 'text-(--text2)',
                    hasUnread
                        ? 'bg-(--primary)/2' 
                        : ''
                ]"
            >

                <div class="flex items-center justify-center w-5 h-5">
                    <i 
                        class="bi bi-hash text-xl group-hover:opacity-100"
                        :class="active ? 'opacity-100' : 'opacity-40'"
                    />
                </div>

                <span class="text-sm font-medium truncate lowercase tracking-wide">
                    {{ thread.name }}
                </span>

                <div 
                    v-if="hasUnread" 
                    class="
                        ml-auto w-2 h-2 mr-1.5 bg-(--primary)
                        animate-pulse rounded-full 
                        shadow-[0_0_8px_var(--primary)]
                    "
                />

            </button>

        </template>

        <template #content>

            <button v-if="devMode" @click="copyThreadId" class="dropdown-item-annimate dropdown-item-style text-(--primary)! hover:bg-(--primary)/10!">
                <i class="bi bi-hash mr-2" />
                Copier l'ID
            </button>

            <button @click="showEditThread = !showEditThread" class="dropdown-item-annimate dropdown-item-style">
                <i class="bi bi-pencil-fill mr-2" />
                Modifier
            </button>

            <button v-if="can('FOLDER_DELETE')" @click="showConfirmDelete = !showConfirmDelete" class="dropdown-item-annimate dropdown-item-style text-red-400! hover:bg-red-500/10!">
                <i class="bi bi-trash-fill mr-2" />
                Supprimer
            </button>

        </template>

    </DropDown>


    <UpdateThread 
        :is-open="showEditThread"
        :thread="thread"
        @close="showEditThread = false"
    />

    <ConfirmDelete
        :show="showConfirmDelete"
        item-type="salon"
        :item-name="thread.name"
        @cancel="showConfirmDelete = false"
        @confirm="deleteThread"
    />

</template>

<script lang="ts" setup>

import DropDown from '@/components/DropDown.vue';
import type { Thread } from '@/types/types';
import UpdateThread from '../popup/UpdateThread.vue';
import { ref } from 'vue';
import ConfirmDelete from '@/components/common/ConfirmDelete.vue';
import useWSocket, { waitForSocketConnection } from '@/composables/useWSocket';
import { openedOrg } from '@/assets/var';
import useSettingsItem from '@/composables/useSettingsItem';
import { useToast } from '@/composables/useToast';
import { usePermissions } from '@/composables/usePermissions';
import { computed } from 'vue';
const props = defineProps<{
  thread: Thread;
  active?: boolean;
  hasUnread?: boolean;
}>();

// Ignore attributes passed by Draggable (class, data-draggable)
defineOptions({
  inheritAttrs: false
});

const emit = defineEmits(['click']);

const showEditThread = ref<boolean>(false);
const showConfirmDelete = ref<boolean>(false);
const toast = useToast();
const orgId = computed(() => openedOrg.value?.id);
const { can } = usePermissions(orgId);
const { Item: devMode } = useSettingsItem('devMode', false);

const copyThreadId = () => {
    navigator.clipboard.writeText(props.thread.id);
    toast.show('ID du salon copié', 'success');
};

const deleteThread = async () => {
    const socket = await useWSocket();
    const connected = await waitForSocketConnection(socket, 15000);
    if (!connected) {
        toast.show('Connexion au serveur perdue, réessayez.', 'error');
        return;
    }
    socket.value?.emit('thread:delete', ({ orgId: openedOrg.value?.id, threadId: props.thread.id }));
    showConfirmDelete.value = false;
}

</script>
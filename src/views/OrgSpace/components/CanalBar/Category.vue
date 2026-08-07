<template>

    <div class="w-full ">

        <button 
            @click="toggleOpen"
            class="
                w-full flex items-center justify-between
                cursor-pointer group
                text-(--text2) hover:text-(--text) 
                transition-colors duration-200
            "
        >

            <div class="category-drag-handle flex items-center gap-1 w-full cursor-grab active:cursor-grabbing">

                <i 
                    class="bi bi-chevron-right inline-block text-[10px] transition-transform duration-200"
                    :class="isOpen ? 'rotate-90' : 'rotate-0'"
                />

                <span class="ml-1.5 text-[11px] font-bold uppercase tracking-wider truncate flex-1 text-left">
                    {{ category.name }}
                </span>

            </div>

            <div @click.stop>
                <CreateNewThread 
                    :categoryId="category.id"
                    :index="threads.length + 1"
                    key="'createNewSpace-' + category.id"
                >
                    <i
                        class="
                            bi bi-plus-lg ml-auto text-sm
                            hover:text-(--primary) transition-colors
                        "
                    />
                </CreateNewThread>
            </div>

        </button>

        <div 
            v-show="isOpen" 
            class="pt-1 w-full"
        >

            <draggable
                v-model="localThreads" 
                item-key="id"
                group="threads"
                @change="onChange"
                ghost-class="opacity-50"
                drag-class="cursor-grabbing"
                class="space-y-0.5 min-h-[10px]"
            >

                <template #item="{ element: thread }">

                    <div class="cursor-grab active:cursor-grabbing w-full">
                        <ThreadBtn 
                            v-if="thread.type === 'text'"
                            :thread="thread"
                            :active="route.params.threadId == thread.id"
                            :hasUnread="getUnreadCountByThreadId(thread.id).value > 0 || thread.hasUnread"
                            :key="'thread-text-' + thread.id"
                            @click="navigateToThread(thread.id)"
                        />

                        <VoiceThreadBtn 
                            v-else-if="thread.type === 'vocal'"
                            :thread="thread"
                            :active="route.params.threadId == thread.id"
                            :key="'thread-vocal-' + thread.id"
                        />
                    </div>

                </template>

            </draggable>

        </div>
        
    </div>

</template>

<script lang="ts" setup>

import { ref, watch } from 'vue';
import draggable from 'vuedraggable';
import type { Category, Thread } from '@/types/types';
import ThreadBtn from './ThreadBtn.vue';
import { useRoute, useRouter } from 'vue-router';
import CreateNewThread from '../popup/CreateNewThread.vue';
import useWSocket from '@/composables/useWSocket';
import VoiceThreadBtn from './VoiceThreadBtn.vue';
import { useNotification } from '@/composables/useNotification';

const props = defineProps<{
    category: Category;
    threads: Thread[];
}>();

const route = useRoute();
const router = useRouter();
const { getUnreadCountByThreadId } = useNotification();

const isOpen = ref<boolean>(true);


const toggleOpen = () => {
    isOpen.value = !isOpen.value;
};

const localThreads = ref<Thread[]>([...props.threads].sort((a, b) => a.index - b.index));

watch(() => props.threads, (newVal) => {
    localThreads.value = [...newVal].sort((a, b) => a.index - b.index);
}, { deep: true });


const onChange = async () => {

    const socket = await useWSocket();

    socket.value?.emit('update-category', ({
        orgId: route.params.orgId,
        spaceId: route.params.spaceId,
        category: {
            ...props.category,
            threads: localThreads.value.map((thread, index) => ({
                ...thread,
                categoryId: props.category.id,
                index
            }))
        }
    }))

};


const navigateToThread = (threadId: string) => {
    const name = (route.name == 'OrgHome' || route.name == 'OrgThreadHome') 
                 ? 'OrgThreadHome' : 'SpaceThreadView';
    router.push({ name, params: { ...route.params, threadId }, query: { ...route.query, type: 'text', showView: '1' } });
};

</script>

<style scoped>
.v-show-aria-expanded {
  transition: all 0.3s ease-out;
}
</style>
<template>

    <div class="w-full">

        <button 
            @click="toggleOpen"
            class="
                w-full flex items-center justify-between
                cursor-pointer group
                text-(--text)/40 hover:text-(--text)/80 
                transition-colors duration-200
            "
        >

            <div>

                <i 
                    class="bi bi-chevron-right inline-block text-[10px] transition-transform duration-200"
                    :class="isOpen ? 'rotate-90' : 'rotate-0'"
                />

                <span class="ml-2 text-[11px] font-bold uppercase tracking-wider truncate">
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
            class="pt-1"
        >

            <draggable
                v-model="localThreads" 
                item-key="id"
                @end="handleDragEnd"
                ghost-class="opacity-50"
                drag-class="cursor-grabbing"
                class="space-y-0.5"
            >

                <template #item="{ element: thread }">

                    <ThreadBtn 
                        :thread="thread"
                        :active="route.params.threadId == thread.id"
                        class="cursor-grab active:cursor-grabbing"
                        @click="navigateToThread(thread.id)"
                    />

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

const props = defineProps<{
    category: Category;
    threads: Thread[];
}>();


const route = useRoute();
const router = useRouter();

const isOpen = ref<boolean>(true);


const toggleOpen = () => {
    isOpen.value = !isOpen.value;
};

const localThreads = ref<Thread[]>([...props.threads].sort((a, b) => a.index - b.index));

watch(() => props.threads, (newVal) => {
    localThreads.value = [...newVal].sort((a, b) => a.index - b.index);
}, { deep: true });


const handleDragEnd = async () => {

    const socket = await useWSocket();

    socket.value?.emit('update-category', ({
        orgId: route.params.orgId,
        spaceId: route.params.spaceId,
        category: {
            ...props.category,
            threads: localThreads.value.map((thread, index) => ({
                ...thread,
                index
            }))
        }
    }))

};


const navigateToThread = (threadId: string) => {
    const name = (route.name == 'OrgHome' || route.name == 'OrgThreadHome') 
                 ? 'OrgThreadHome' : 'SpaceThreadView';
    router.push({ name, params: { ...route.params, threadId } });
};

</script>

<style scoped>
.v-show-aria-expanded {
  transition: all 0.3s ease-out;
}
</style>
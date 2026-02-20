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
            class="space-y-0.5 pt-1 transition-all"
        >

            <ThreadBtn 
                v-for="thread in threads"
                :key="thread.id"
                :thread="thread"
                :active="
                    route.params.threadId == thread.id
                "
                @click="
                    router.push({
                        name: 
                            route.name == 'OrgHome' || route.name == 'OrgThreadHome'
                                ? 'OrgThreadHome'
                                : 'SpaceThreadView',
                        params: {
                            orgId: route.params.orgId,
                            spaceId: route.params.spaceId,
                            threadId: thread.id
                        }
                    })
                "
            />

        </div>
        
    </div>

</template>

<script lang="ts" setup>

import { ref } from 'vue';
import type { Category, Thread } from '@/types/types';
import ThreadBtn from './ThreadBtn.vue';
import { useRoute, useRouter } from 'vue-router';
import CreateNewThread from '../common/CreateNewThread.vue';

defineProps<{
    category: Category;
    threads: Thread[];
}>();

const route = useRoute();
const router = useRouter();
const isOpen = ref<boolean>(true);

const toggleOpen = () => {
    isOpen.value = !isOpen.value;
};


</script>

<style scoped>
.v-show-aria-expanded {
  transition: all 0.3s ease-out;
}
</style>
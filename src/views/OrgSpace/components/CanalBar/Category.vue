<template>

    <div class="w-full">

        <button 
            @click="isOpen = !isOpen"
            class="
                w-full flex items-center 
                cursor-pointer group
                text-(--text)/40 hover:text-(--text)/80 
                transition-colors duration-200
            "
        >

            <i 
                class="bi bi-chevron-right text-[10px] transition-transform duration-200"
                :class="{ 'rotate-90': isOpen }"
            />

            <span class="ml-2 text-[11px] font-bold uppercase tracking-wider truncate">
                {{ category.name }}
            </span>

            <i 
                class="
                    bi bi-plus-lg ml-auto text-sm
                    hover:text-(--primary) transition-colors
                "
            />

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
import type { Category } from '@/types/workSpace';
import ThreadBtn from './ThreadBtn.vue';
import { useRoute, useRouter } from 'vue-router';
import type { Thread } from '../../../../types/workSpace';

defineProps<{
    category: Category;
    threads: Thread[];
}>();

const route = useRoute();
const router = useRouter();
const isOpen = ref<boolean>(true);

</script>

<style scoped>
.v-show-aria-expanded {
  transition: all 0.3s ease-out;
}
</style>
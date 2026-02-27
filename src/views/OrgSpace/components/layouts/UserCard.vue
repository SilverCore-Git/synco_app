<script setup lang="ts">

import getColorByStatus from '@/assets/utils/getColorByStatus';
import type { User } from '@/types/types';
import { onMounted, ref } from 'vue';
import UserDropDown from '../dropdown/UserDropDown.vue';
import { openedOrg } from '@/assets/var';
import { useUser } from '@clerk/vue';

const user = ref<User | undefined>(undefined);
const { user: ClerkUser } = useUser();


onMounted(async () => {
    // user.value = await sfetch('/api/users/me').then(res => res.json());
    user.value = openedOrg.value?.members?.find(member => member.user?.clerkId == ClerkUser.value?.id)?.user;

})

</script>

<template>

    <div
        class="
            absolute bottom-0 left-0 
            w-77 h-14 bg-(--bg2) 
            border-t border-(--primary)/5 
            p-1 flex items-center
        "
    >

        <UserDropDown :user="user" class="w-full">

            <template #trigger>

                <div
                    class="
                        flex items-center 
                        w-full gap-2 p-2
                        rounded-lg hover:bg-(--primary)/5 
                        transition-colors group
                    "
                >

                    <div class="relative flex items-center justify-center">
                                
                        <img 
                            :src="user?.avatarUrl"
                            :alt="user?.name"
                            class="w-8 h-8 rounded-full"
                        />
                        <div 
                            v-if="user && user.data.status"
                            class="
                                absolute -bottom-0.5 -right-0.5 
                                w-3 h-3 border-2 border-(--bg) 
                                rounded-full z-10
                            " 
                            :class="getColorByStatus(user.data.status)"
                        />
                    </div>

        

                    <div class="flex flex-col min-w-0 flex-1 leading-tight select-none">
                        <span class="text-sm font-bold text-(--text) truncate">
                            {{ user?.name || 'Chargement...' }}
                        </span>
                        <span class="text-[10px] text-(--text)/40 truncate font-medium uppercase tracking-wider">
                            {{ user?.data.username }}
                        </span>
                    </div>

                    <div class="flex items-center">
                        <button @click.stop="" title="Couper le micro" class="p-1.5 rounded-md hover:bg-(--primary)/10 active:scale-90 text-(--text)/40 hover:text-(--text) transition-all">
                            <i class="bi bi-mic-fill text-sm" />
                        </button>
                        <button @click.stop="" title="Couper le son" class="p-1.5 rounded-md hover:bg-(--primary)/10 active:scale-90 text-(--text)/40 hover:text-(--text) transition-all">
                            <i class="bi bi-headphones text-sm" />
                        </button>
                        <button @click.stop="" title="Paramètres" class="p-1.5 rounded-md hover:bg-(--primary)/10 active:scale-90 text-(--text)/40 hover:text-(--text) transition-all group/settings">
                            <i class="bi bi-gear-fill text-sm group-hover/settings:rotate-45 transition-transform duration-300" />
                        </button>
                    </div>

                </div>

            </template>

        </UserDropDown>

    </div>

</template>

<style scoped>

:deep(.cl-userButtonTrigger) {
    @apply focus:shadow-none focus:outline-none outline-none ring-0;
}

:deep(.cl-avatarBox) {
    width: 32px;
    height: 32px;
    border-radius: 8px;
}

</style>
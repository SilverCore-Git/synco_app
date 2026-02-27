<template>

    <div
        class="
            h-full min-w-60 bg-(--bg2) border-l border-white/5
            flex flex-col overflow-hidden
        "
    >

        <div class="px-4 min-h-14 flex justify-start items-center border-b border-white/5">
            <h3 class="text-xs font-semibold text-(--text)/50 uppercase tracking-wider">
                Membres ({{ openedOrg?.members?.length || 0 }})
            </h3>
        </div>

        <div class="flex-1 overflow-y-auto p-2 space-y-1 ">
            
            <router-link
                v-for="member in sortedMembers"
                :key="member.id"
                :to="{ name: 'OrgThreadChat', params: { userId: member.id } }"
                class="
                    flex items-center gap-3 px-3 py-2 rounded-lg
                    hover:bg-white/3 transition-colors
                    group
                "
                active-class="bg-white/[0.05]"
            >

                <div class="relative">
                    <img 
                        :src="member.user?.avatarUrl" 
                        :alt="member.user?.name"
                        class="w-8 h-8 rounded-full"
                    />
                    <span 
                        class="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-(--bg2)"
                        :class="getColorByStatus(member.user?.data.status)"
                    />
                </div>

                <div class="flex flex-col">
                    <span class="text-sm font-medium text-(--text) truncate">
                        {{ member.user?.name }}
                    </span>
                    <span class="text-xs text-(--text)/40">
                        {{ getTextByStatus(member.user?.data.status) }}
                    </span>
                </div>

            </router-link>

        </div>

    </div>

</template>

<script lang="ts" setup>

import { computed } from 'vue';
import { openedOrg } from '@/assets/var';
import type { OrgMember } from '@/types/types';
import getColorByStatus from '@/assets/utils/getColorByStatus';
import getTextByStatus from '@/assets/utils/getTextByStatus';

const sortedMembers = computed(() => {

    if (!openedOrg.value?.members) return [];
    
    return [...openedOrg.value.members].sort((a: OrgMember, b: OrgMember) => {

        if (a.user?.data.status === 'online' && b.user?.data.status !== 'online') return -1;
        if (a.user?.data.status !== 'online' && b.user?.data.status === 'online') return 1;
        
        return a.user!.name!.localeCompare(b.user!.name!);

    });
});

</script>
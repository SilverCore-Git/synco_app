<template>

    <div
        class="
            h-full w-full border-l border-white/5
            flex flex-col overflow-hidden  bg-(--bg3)
        "
    >

        <div class="px-4 min-h-14 flex justify-start items-center border-b border-white/5 bg-(--bg2)">
            <h3 class="text-xs font-semibold text-(--text)/50 uppercase tracking-wider">
                Membres ({{ openedOrg?.members?.length || 0 }})
            </h3>
        </div>

        <div v-if="openedOrg?.members" class="flex-1 overflow-y-auto p-2 space-y-1 ">

            <p v-if="members.filter(member => member.user?.data.status !== 'offline').length > 0" class=" py-1 text-xs text-(--text)/60">
                En ligne — {{ members.filter(member => member.user?.data.status !== 'offline').length }}
            </p>
            
            <router-link
                v-for="member in members.filter(member => member.user?.data.status !== 'offline')"
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
                        :src="member.user?.avatarUrl || `https://ui-avatars.com/api/?name=${member.user?.name}&background=16ac77&color=fff`" 
                        :alt="member.user?.name"
                        class="w-8 h-8 rounded-full"
                        @error="(e: any) => e.target.src = `https://ui-avatars.com/api/?name=${member.user?.name}&background=16ac77&color=fff`"
                    />
                    <span 
                        class="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-(--bg2)"
                        :class="getColorByStatus(member.user?.data.status)"
                    />
                </div>

                <div class="flex flex-col">
                    <span class="text-sm font-medium text-(--text) truncate">
                        {{ member.user?.name }}
                    </span>
                    <span class="text-xs text-(--text)/40">
                        {{ member.role }}
                    </span>
                </div>

            </router-link>

            <p v-if="members.filter(member => member.user?.data.status === 'offline').length > 0" class=" py-1 text-xs text-(--text)/60">
                Hors ligne — {{ members.filter(member => member.user?.data.status === 'offline').length }}
            </p>

            <router-link
                v-for="member in members.filter(member => member.user?.data.status === 'offline')"
                :key="member.id"
                :to="{ name: 'OrgThreadChat', params: { userId: member.id } }"
                class="
                    flex items-center gap-3 px-3 py-2 rounded-lg
                    hover:bg-white/3 transition-colors 
                    group opacity-50 
                "
                active-class="bg-white/[0.05]"
            >

                <div class="relative">
                    <img 
                        :src="member.user?.avatarUrl || 'https://cdn.silvercore.fr/static/files/silverteams/avatar/default.png'" 
                        :alt="member.user?.name"
                        class="w-8 h-8 rounded-full"
                    />
                    <span 
                        class="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-(--bg2)"
                        :class="getColorByStatus(member.user?.data.status)"
                    />
                </div>

                <div class="flex flex-col">
                    <span class="text-sm font-medium text-(--text) truncate">
                        {{ member.user?.name }}
                    </span>
                    <span class="text-xs text-(--text)/40">
                        {{ member.role }}
                    </span>
                </div>

            </router-link>

        </div>

        <!-- Loader -->
        <div v-else class="flex-1 overflow-y-auto p-2 space-y-1 ">

            <div class=" rounded-lg bg-(--white)/15 h-4 w-20 animate-pulse" />
            
            <div
                v-for="i in 3"
                :key="i"
                class="
                    flex items-center gap-3 px-3 py-2 rounded-lg
                    hover:bg-white/3 transition-colors 
                    group opacity-50 
                "
            >

                <div class="relative">
                    <div class=" rounded-full bg-(--white)/12 h-9 w-9 animate-pulse" />
                </div>

                <div class="flex flex-col gap-1">
                    <div class=" rounded-lg bg-(--white)/12 h-4 w-24 animate-pulse" />
                    <div class=" rounded-lg bg-(--white)/12 h-3 w-22 animate-pulse" />
                </div>

            </div>

            <div class=" rounded-lg bg-(--white)/15 h-4 w-20 animate-pulse" />

            <div
                v-for="i in 5"
                :key="i"
                class="
                    flex items-center gap-3 px-3 py-2 rounded-lg
                    hover:bg-white/3 transition-colors 
                    group opacity-50 
                "
            >

                <div class="relative">
                    <div class=" rounded-full bg-(--white)/12 h-9 w-9 animate-pulse" />
                </div>

                <div class="flex flex-col gap-1">
                    <div class=" rounded-lg bg-(--white)/12 h-4 w-24 animate-pulse" />
                    <div class=" rounded-lg bg-(--white)/12 h-3 w-22 animate-pulse" />
                </div>

            </div>

        </div>

    </div>

</template>

<script lang="ts" setup>

import { computed } from 'vue';
import { openedOrg } from '@/assets/var';
import getColorByStatus from '@/assets/utils/getColorByStatus';

const members = computed(() => {

    if (!openedOrg.value?.members) return [];
    return openedOrg.value.members;

});

</script>
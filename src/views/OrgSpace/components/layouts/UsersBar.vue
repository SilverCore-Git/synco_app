<template>

    <div
        class="
            h-full w-full border-l border-(--border-color)
            flex flex-col overflow-hidden  bg-(--bg3)
        "
        :class="isDesktopApp() ? 'border-t' : ''"
    >

        <div class="px-4 min-h-14 flex justify-between items-center border-b border-(--border-color) bg-(--bg2)">

            <h3 class="text-xs font-semibold text-(--text2) uppercase tracking-wider">
                Membres ({{ members?.length || 0 }})
            </h3>

            <button 
                v-if="isLittleScreen"
                @click="showUsersBar = !showUsersBar"
                class="hover:text-(--text) transition-colors"
                :class="showUsersBar ? 'text-(--text)' : ''"
            >
                <i class="bi bi-people-fill" />
            </button>

        </div>

        <div v-if="openedOrg?.members" class="flex-1 overflow-y-auto p-2 space-y-1 ">

            <p v-if="members.filter(member => member.user?.data.status !== 'offline').length > 0" class=" py-1 text-xs text-(--text2)">
                En ligne — {{ members.filter(member => member.user?.data.status !== 'offline').length }}
            </p>
            
            <button
                v-for="member in members.filter(member => member.user?.data.status !== 'offline')"
                :key="member.id"
                @click="openProfile(member.user!, $event)"
                class="
                    w-full flex items-center gap-3 px-3 py-2 rounded-lg
                    hover:bg-white/3 transition-colors
                    group text-left
                "
            >

                <div class="relative">
                    <img 
                        :src="member.user?.avatarUrl || `https://ui-avatars.com/api/?name=${member.user?.name}&background=128a60&color=fff`" 
                        :alt="member.user?.name"
                        class="w-8 h-8 rounded-full"
                        @error="(e: any) => e.target.src = `https://ui-avatars.com/api/?name=${member.user?.name}&background=128a60&color=fff`"
                    />
                    <span 
                        class="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-(--bg2)"
                        :class="getColorByStatus(member.user!.data.status)"
                    />
                </div>

                <div class="flex flex-col flex-1 min-w-0">
                    <span class="text-sm font-medium text-(--text) truncate">
                        {{ member.user?.name }}
                    </span>
                    <span class="text-xs text-(--text2)">
                        {{ member.role }}
                    </span>
                </div>

                <button
                    v-if="member.user?.id !== keycloak.subject"
                    @click.prevent="startCall(member.user!)"
                    class="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-(--primary)/10 text-(--text2) hover:text-(--primary) transition-all"
                    title="Appel vocal"
                >
                    <i class="bi bi-telephone-fill text-sm" />
                </button>

            </button>

            <p v-if="members.filter(member => member.user?.data.status === 'offline').length > 0" class=" py-1 text-xs text-(--text2)">
                Hors ligne — {{ members.filter(member => member.user?.data.status === 'offline').length }}
            </p>

            <button
                v-for="member in members.filter(member => member.user?.data.status === 'offline')"
                :key="member.id"
                @click="openProfile(member.user!, $event)"
                class="
                    w-full flex items-center gap-3 px-3 py-2 rounded-lg
                    hover:bg-white/3 transition-colors 
                    group opacity-50 text-left
                "
            >

                <div class="relative">
                    <img 
                        :src="member.user?.avatarUrl || `https://ui-avatars.com/api/?name=${member.user?.name}&background=128a60&color=fff`" 
                        :alt="member.user?.name"
                        class="w-8 h-8 rounded-full"
                        @error="(e: any) => e.target.src = `https://ui-avatars.com/api/?name=${member.user?.name}&background=128a60&color=fff`"
                    />
                    <span 
                        class="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-(--bg2)"
                        :class="getColorByStatus(member.user!.data.status)"
                    />
                </div>

                <div class="flex flex-col flex-1 min-w-0">
                    <span class="text-sm font-medium text-(--text) truncate">
                        {{ member.user?.name }}
                    </span>
                    <span class="text-xs text-(--text2)">
                        {{ member.role }}
                    </span>
                </div>

            </button>

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
import isDesktopApp from '@/assets/isDesktopApp';
import { useRoute } from 'vue-router';
import useSecurePeer from '@/composables/useSecurePeer';
import { keycloak } from '@/assets/keycloak';
import { openProfile } from '@/composables/useProfile';
import { useUsersBar } from '@/composables/useUsersBar';

const route = useRoute();
const { showUsersBar } = useUsersBar();
const { startCall } = useSecurePeer();

defineProps<{
    isLittleScreen: boolean;
}>();

const members = computed(() => {

    if (!openedOrg.value?.members) return [];

    if (route.params.spaceId) {
        const spaceMemberIds = openedOrg.value.spaces?.find(s => s.id === route.params.spaceId)?.membersId || [];
        return openedOrg.value.members.filter(m => spaceMemberIds.includes(m.userId));
    }

    return openedOrg.value.members;

});

</script>
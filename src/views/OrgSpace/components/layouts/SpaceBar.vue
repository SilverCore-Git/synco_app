<script setup lang="ts">

import type { Org } from '@/types/org';
import SpaceBarBTN from '../common/SpaceBarBTN.vue';
import { useRoute, useRouter } from 'vue-router';

const router = useRouter();
const route = useRoute();

defineProps<{
    organization: Org;
}>();

const createNewSpace = () => {
    alert('créer un nouvel espace')
}

</script>

<template>

    <nav
        class="
            h-full min-w-17 bg-(--bg2) border-r border-(--primary)/5
            flex justify-start items-center flex-col pt-2.5
        "
    >

        <ul class="flex justify-start items-center flex-col gap-2 h-full w-full">

            <SpaceBarBTN
                :icon="organization.logo"
                :label="organization.name"
                @click="router.push('/org')"
            />

            <hr class=" w-8 h-0.5 bg-(--text)/50 border-none rounded-full my-2" />

            <SpaceBarBTN
                icon="bi-house"
                label="Général"
                iconFillOnActive
                :active="route.name === 'OrgHome'"
                @click="router.push(`/org/${organization.id}/home`)"
            />

            <SpaceBarBTN
                icon="bi-chat-dots"
                label="Messages privées"
                iconFillOnActive
                :active="route.name === 'OrgChat'"
                @click="router.push(`/org/${organization.id}/chat`)"
            />

            <SpaceBarBTN
                icon="bi-calendar2-date"
                label="Calendrier"
                iconFillOnActive
                :active="route.name === 'OrgCalendar'"
                @click="router.push(`/org/${organization.id}/calendar`)"
            />

            <hr class=" w-8 h-0.5 bg-(--text)/50 border-none rounded-full my-2" />

            <SpaceBarBTN
                icon="bi-people"
                label="Espace1"
                iconFillOnActive
                :active="route.name === 'SpaceView' && route.path.includes('espace1')"
                @click="router.push(`/org/${organization.id}/space/spce-espace1`)"
            />

            <SpaceBarBTN
                icon="bi-person-workspace"
                label="Espace2"
                :active="route.name === 'SpaceView' && route.path.includes('espace2')"
                @click="router.push(`/org/${organization.id}/space/spce-espace2`)"
            />

            <SpaceBarBTN
                icon="bi-plus"
                label="Créer un nouvel espace"
                @click="createNewSpace"
            />

        </ul>

    </nav>

</template>
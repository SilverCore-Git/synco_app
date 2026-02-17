<script setup lang="ts">

import type { Org } from '@/types/org';
import SpaceBarBTN from '../common/SpaceBarBTN.vue';

defineProps<{
    organization: Org;
}>();

</script>

<template>

    <nav
        class="
            h-full w-22 bg-(--bg2) border-r border-(--primary)/5
            flex justify-start items-center flex-col pt-2.5
        "
    >

        <ul class="flex justify-start items-center flex-col gap-2 h-full w-full">

            <SpaceBarBTN
                :icon="organization.logo"
                :label="organization.name"
                @click="console.log('click')"
            />

            <hr class=" w-8 h-0.5 bg-(--text)/50 border-none rounded-full my-2" />

            <SpaceBarBTN
                icon="bi-house"
                label="Général"
                iconFillOnActive
                @click="console.log('click')"
            />

            <SpaceBarBTN
                icon="bi-chat-dots"
                label="Messages privées"
                iconFillOnActive
                @click="console.log('click')"
            />

            <SpaceBarBTN
                icon="bi-calendar2-date"
                label="Calendrier"
                iconFillOnActive
                @click="console.log('click')"
            />

            <hr class=" w-8 h-0.5 bg-(--text)/50 border-none rounded-full my-2" />

            <SpaceBarBTN
                icon="bi-people"
                label="Espace1"
                iconFillOnActive
                @click="console.log('click')"
            />

            <SpaceBarBTN
                icon="bi-person-workspace"
                label="Espace2"
                iconFillOnActive
                @click="console.log('click')"
            />

            <SpaceBarBTN
                icon="bi-plus"
                label="Créer un nouvel espace"
                @click="console.log('click')"
            />

        </ul>

    </nav>

</template>
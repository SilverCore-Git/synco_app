<script setup lang="ts">

import type { Org } from '@/types/org';
import SpaceBarBTN from '../common/SpaceBarBTN.vue';
import { useRoute, useRouter } from 'vue-router';
import { computed } from 'vue';
import type { WorkSpace } from '@/types/workSpace';
import { workSpaces } from '@/organizations';

const router = useRouter();
const route = useRoute();

const props = defineProps<{
    organization: Org;
}>();

const spaces = computed(() => workSpaces.filter((space: WorkSpace) => space.org_id == props.organization.id));

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
                icon="bi-arrow-bar-left"
                label="Revenir aux organisation"
                redhover
                @click="router.push('/')"
            />

            <hr class=" w-8 h-0.5 bg-(--text)/50 border-none rounded-full my-2" />

            <SpaceBarBTN
                icon="bi-house"
                label="Général"
                iconFillOnActive
                :active="route.name === 'OrgHome' || route.name === 'OrgThreadHome'"
                @click="router.push(`/${organization.id}/home`)"
            />

            <SpaceBarBTN
                icon="bi-chat-dots"
                label="Messages privées"
                iconFillOnActive
                :active="route.name === 'OrgChat'"
                @click="router.push(`/${organization.id}/chat`)"
            />
            
            <hr class=" w-8 h-0.5 bg-(--text)/50 border-none rounded-full my-2" />

            <SpaceBarBTN
                v-for="space in spaces"
                :key="'space-' + space.id + '-btn'"
                :icon="space.logo"
                :label="space.name"
                :active="
                    (
                        route.name === 'SpaceView' 
                        || route.name === 'SpaceThreadView'
                    )
                    && route.path.includes(space.id)
                "
                @click="router.push(`/${organization.id}/${space.id}`)"
            />

            <SpaceBarBTN
                icon="bi-plus"
                label="Créer un nouvel espace"
                @click="createNewSpace"
            />

        </ul>

    </nav>

</template>
<script setup lang="ts">

import SpaceBarBTN from '../common/SpaceBarBTN.vue';
import { useRoute, useRouter } from 'vue-router';
import CreateNewSpace from '../popup/CreateNewSpace.vue';
import { openedOrg } from '@/assets/var';
import { computed } from 'vue';
import { useUser } from '@clerk/vue';

const router = useRouter();
const route = useRoute();
const { user: ClerkUser } = useUser();

const canSettings = computed(() => {

    const user = openedOrg.value?.members?.find(user => user.user?.clerkId == ClerkUser.value?.id);

    return (
        user?.userId === openedOrg.value?.ownerId
        || user?.role === 'ADMIN'
        || user?.role === 'OWNER'
    )

})

</script>

<template>

    <nav
        v-if="openedOrg"
        class="
            h-full min-w-17 bg-(--bg2) border-r border-white/5
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

            <SpaceBarBTN
                v-if="canSettings"
                icon="bi-gear"
                label="Paramètres"
                :active="route.name?.toString().startsWith('OrgSettings')"
                iconFillOnActive
                @click="router.push(`/${openedOrg.id}/settings`)"
            />

            <hr class=" w-8 h-0.5 bg-(--text)/50 border-none rounded-full my-2" />

            <SpaceBarBTN
                icon="bi-house"
                label="Général"
                iconFillOnActive
                :active="route.name === 'OrgHome' || route.name === 'OrgThreadHome'"
                @click="router.push(`/${openedOrg.id}/home`)"
            />

            <SpaceBarBTN
                icon="bi-chat-dots"
                label="Messages privées"
                iconFillOnActive
                :active="route.name === 'OrgChat' || route.name === 'OrgThreadChat'"
                @click="router.push(`/${openedOrg.id}/chat`)"
            />
            
            <hr class=" w-8 h-0.5 bg-(--text)/50 border-none rounded-full my-2" />

            <SpaceBarBTN
                v-for="space in openedOrg?.spaces"
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
                @click="router.push(`/${openedOrg.id}/${space.id}`)"
            />

            <CreateNewSpace>
                <SpaceBarBTN
                    icon="bi-plus"
                    label="Créer un nouvel espace"
                />
            </CreateNewSpace>

        </ul>

    </nav>

</template>
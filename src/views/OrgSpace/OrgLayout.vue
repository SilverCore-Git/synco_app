<script setup lang="ts">

import { onBeforeUnmount, onMounted } from 'vue';
import ThreadsBar from './components/layouts/ThreadsBar.vue';
import SpaceBar from './components/layouts/spaceBar.vue';
import UserCard from './components/layouts/UserCard.vue';
import UsersBar from './components/layouts/UsersBar.vue';
import { openedOrg, organizations } from '@/assets/var';
import Loader from '@/components/LogoLoader.vue';
import sfetch from '@/assets/utils/sfetch';
import useWSocket from '@/composables/useWSocket';
import { useUser } from '@clerk/vue';

const props = defineProps<{
    orgId: string;
}>();

const { user } = useUser();

const initSocketListener = async () => {

    const socket = await useWSocket();

    socket.value?.emit('join-org', { orgId: props.orgId });


    const me = openedOrg.value?.members?.find(member => member.user?.clerkId == user.value?.id);
    if (me && me.user) me.user.data.status = 'online';
    

    socket.value?.on('user-status-changed', ({ status, userId }: { status: string, userId: string }) => {
        const member = openedOrg.value?.members?.find(m => m.userId === userId);            
        if (member?.user?.data) member.user.data.status = status;
    });

    socket.value?.on('org-data-updated', ({ orgId, data }: { orgId: string, data: { logo: string, name: string } }) => {

        if (orgId !== props.orgId) return;

        if (!openedOrg.value) return;
        openedOrg.value.logo = data.logo;
        openedOrg.value.name = data.name;

        const curentOrg = organizations.value.find(org => org.id === openedOrg.value?.id);

        if (curentOrg)
        {
            curentOrg.logo = data.logo;
            curentOrg.name = data.name;
        }

    });

}

onMounted(async () => {
   openedOrg.value = await sfetch(`/api/orgs/${props.orgId}`).then(res => res.json()); 
   await initSocketListener();
});

onBeforeUnmount(async () => {
    const socket = await useWSocket();
    socket.value?.off('user-status-changed');
    socket.value?.disconnect();
    socket.value = null;
})

</script>

<template>

    <div
        v-if="openedOrg !== null"
        class="
            h-full w-full 
            flex flex-row 
            relative
        "
    >

        <SpaceBar />
        <ThreadsBar class="h-full" />

        <div class="h-full w-full ">
            <RouterView />
        </div>

        <UsersBar />

        <UserCard />

    </div>

    <div v-else>
        <Loader />
    </div>

</template>
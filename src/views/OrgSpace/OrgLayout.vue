<script setup lang="ts">

import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import ThreadsBar from './components/layouts/ThreadsBar.vue';
import SpaceBar from './components/layouts/SpaceBar.vue';
import UserCard from './components/layouts/UserCard.vue';
import UsersBar from './components/layouts/UsersBar.vue';
import { openedOrg, organizations } from '@/assets/var';
import sfetch from '@/assets/utils/sfetch';
import useWSocket from '@/composables/useWSocket';
import { useUser } from '@clerk/vue';
import usePeer from '@/composables/usePeer';
import type { Category, Message } from '@/types/types';
import { useRoute } from 'vue-router';
import Notifications from '@/components/overlay/Notifications.vue';
import { Starport } from 'vue-starport';
import OrgBtn from '../OrgsSelection/components/OrgBtn.vue';
import { showUsersBar } from '@/assets/settings';


const props = defineProps<{
    orgId: string;
}>();


const { user } = useUser();
const { initPeer } = usePeer();
const route = useRoute();

const loading = ref<boolean>(true);
const orgOnOpen = computed(() => {
    return organizations.value.find(org => org.id === route.params.orgId);
});

const initSocketListener = async () => {

    const socket = await useWSocket();

    socket.value?.emit('join-org', { orgId: props.orgId });
    
    const space = openedOrg.value?.spaces;
    if (space)
    {

        space.forEach(async space => {
            socket.value?.emit('join-space', { orgId: props.orgId, spaceId: space.id });
        })
    
    } 


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

    socket.value?.on('category-updated', ({ orgId, spaceId, category }: { orgId: string, spaceId: string, category: Category }) => {
        
        if (orgId !== props.orgId) return;

        const space = openedOrg.value?.spaces?.find(s => s.id === spaceId);
        if (!space) return;

        const targetCategory = space.categories.find(cat => cat.id === category.id);

        if (targetCategory) 
        {
            
            Object.assign(targetCategory, category);
            
            if (category.threads) 
            {

                category.threads.forEach(updatedThread => {

                    const tIndex = space.threads.findIndex(t => t.id === updatedThread.id);
                    if (tIndex !== -1) 
                    {
                        space.threads[tIndex] = updatedThread;
                    }

                });

            }
        }

    });

    socket.value?.on('notif:new-message', ({ message, spaceId }: { message: Message, spaceId: string }) => {
        
        if (route.params.threadId == message.threadId) return;

        const space = openedOrg.value?.spaces?.find(s => s.id === spaceId);
        if (!space) return;

        const thread = space.threads.find(t => t.id === message.threadId);
        if (!thread) return;

        thread.hasUnread = true;

    });

}

onMounted(async () => {
   openedOrg.value = await sfetch(`/api/orgs/${props.orgId}`).then(res => res.json()); 
   await initSocketListener();
   initPeer();

   setTimeout(() => {
    loading.value = false;
   }, 500);

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
            v-if="!loading"
            class="
                h-full w-full 
                flex flex-row 
                relative bg-(--bg3)
            "
        >

            <SpaceBar />
            <ThreadsBar class="h-full w-60 max-w-60 min-w-60" />

            <div class="bg-(--bg3) h-full w-full min-w-80">
                <RouterView />
            </div>

            <Transition name="slide-in-right">
                <UsersBar v-if="showUsersBar" class="w-60 max-w-60 min-w-60" />
            </Transition>

            <UserCard />

        </div>

        <Transition name="fade">

            <div v-if="loading && orgOnOpen" class="w-full h-full z-100">
                
                <div class="h-full w-full flex items-center justify-center">
                        
                    <Starport :port="`org-${orgOnOpen?.id}`">
                        <OrgBtn :org="orgOnOpen" :loader="true" />
                    </Starport>

                </div>

            </div>

        </Transition>

        <Notifications />

</template>
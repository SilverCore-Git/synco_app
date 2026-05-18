<script setup lang="ts">

import { computed, onBeforeUnmount, onMounted } from 'vue';
import ThreadsBar from './components/layouts/ThreadsBar.vue';
import SpaceBar from './components/layouts/SpaceBar.vue';
import UserCard from './components/layouts/UserCard.vue';
import UsersBar from './components/layouts/UsersBar.vue';
import { openedOrg, organizations, user } from '@/assets/var';
import sfetch from '@/assets/utils/sfetch';
import useWSocket from '@/composables/useWSocket';
import usePeer from '@/composables/usePeer';
import type { Category, Message, OrgMember } from '@/types/types';
import { useRoute } from 'vue-router';
import useSettingsItem from '@/composables/useSettingsItem';
import keycloak from '@/assets/keycloak';
import useNotifications from '@/composables/useNotifications';
import { isMeeting } from '@/composables/usePrivatMeet';
import CallOverlay from '@/components/peer/CallOverlay.vue';
import isDesktopApp from '@/assets/isDesktopApp';
import { useToast } from '@/composables/useToast';


const props = defineProps<{
    orgId: string;
}>();


const { Item: showUsersBar } = useSettingsItem('showUsersBar', true);
const { initPeer } = usePeer();
const { notify } = useNotifications();
const route = useRoute();
const toast = useToast();

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


    const me = openedOrg.value?.members?.find(member => member.user?.id == keycloak.userInfo?.sub);
    if (me && me.user && me.user.data) me.user.data.status = 'online';
    

    socket.value?.on('member:new', ({ member }: { member: OrgMember }) => {
        openedOrg.value?.members?.push(member);
    });

    socket.value?.on('member:kicked', ({ memberId }: { memberId: string }) => {

        const me = openedOrg.value?.members?.find(member => member.user?.id == keycloak.userInfo?.sub);

        if (me?.id == memberId)
        {
            openedOrg.value = null;
            toast.show('Vous avez été éxpulsé de cet organisation.', 'info');
            setTimeout(() => {
                window.location.href = '/';
            }, 2000);
            
        }
        else
        {
            const index = openedOrg.value!.members!.findIndex(m => m.id === memberId);
            if (index !== -1) {
                openedOrg.value!.members!.splice(index, 1);
            }
        }


    });

    socket.value?.on('user-status-changed', ({ status, userId }: { status: string, userId: string }) => {
        const member = openedOrg.value?.members?.find(m => m.userId === userId);            
        if (member && member.user && member.user.data) member.user.data.status = status;
    });

    socket.value?.on('space:updated', async ({ orgId, spaceId, data }: { orgId: string, spaceId: string, data: { logo: string, name: string, members: string[] } }) => {
        
        if (orgId !== props.orgId) return;

        const space = openedOrg.value?.spaces?.find(s => s.id === spaceId);
        if (!space) return;

        space.logo = data.logo;
        space.name = data.name;
        space.membersId = data.members;

        if (data.members.includes(keycloak.userInfo?.sub || '')) 
        {
            
            socket.value?.emit('join-space', { orgId: props.orgId, spaceId });
            
            const space = await sfetch(`/api/spaces/${spaceId}`).then(res => res.json());
            const index = openedOrg.value?.spaces?.findIndex(s => s.id === spaceId);
            if (index !== undefined && index !== -1 && openedOrg.value?.spaces) openedOrg.value.spaces[index] = space;

        } 
        else
        {
            socket.value?.emit('leave-space', { orgId: props.orgId, spaceId });
            openedOrg.value?.spaces?.splice(openedOrg.value.spaces.findIndex(s => s.id === spaceId), 1);
        }

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

    socket.value?.on('privateMeet:incomingCall', async ({ callerId }: { callerId: string }) => {
        const orgMember = openedOrg.value?.members?.find(m => m.userId === callerId);
        if (!isMeeting.value) notify('notif:privateMeet', orgMember, -1);
    });


    socket.value?.on('thread:updated', ({ orgId, threadId, name }: { orgId: string, threadId: string, name: string }) => {
        
        if (orgId !== props.orgId) return;

        const org = openedOrg.value;
        if (!org) return;

        org.spaces?.forEach(space => {
            const t = space.threads?.find(t => t.id === threadId);
            if (t) t.name = name;
        });

        if (org.home) {
            const t = org.home.threads?.find(t => t.id === threadId);
            if (t) t.name = name;
        }

    });

    socket.value?.on('thread:deleted', ({ orgId, threadId }: { orgId: string, threadId: string }) => {
        
        if (orgId !== props.orgId) return;

        const org = openedOrg.value;
        if (!org) return;

        org.spaces?.forEach(space => {
            if (space.threads) 
            {
                const index = space.threads.findIndex(t => t.id === threadId);
                if (index !== -1) {
                    space.threads.splice(index, 1);
                }
            }
        });

        if (org.home?.threads) 
        {
            const index = org.home.threads.findIndex(t => t.id === threadId);
            if (index !== -1) {
                org.home.threads.splice(index, 1);
            }
        }
        
    });

}

onMounted(async () => {
   openedOrg.value = await sfetch(`/api/orgs/${props.orgId}`).then(res => res.json()); 
   await Promise.all([
        initSocketListener(),
        initPeer()
   ])
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
            class="
                h-full w-full flex flex-row 
                relative bg-(--bg)
            "
            :style="{ viewTransitionName: `openOrg-${orgOnOpen?.id}` }"
        >

            <SpaceBar class="h-full" />
            <ThreadsBar class="h-full w-60 max-w-60 min-w-60 " :class="isDesktopApp() ? 'rounded-tl-2xl' : ''" />

            <div 
                class="relative flex-1 h-full min-w-0 overflow-hidden bg-(--bg3)"
                :class="isDesktopApp() ? 'border-t border-white/10' : ''"
            >
                <RouterView />
            </div>

            <Transition name="slide-in-right">
                <UsersBar 
                    v-if="showUsersBar" 
                    class="w-60 max-w-60 min-w-60" 
                />
            </Transition>

            <UserCard />

        </div>

        <CallOverlay />

</template>
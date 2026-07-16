<script setup lang="ts">

import { computed, onBeforeUnmount, onMounted } from 'vue';
import ThreadsBar from './components/layouts/ThreadsBar.vue';
import SpaceBar from './components/layouts/SpaceBar.vue';
import UserCard from './components/layouts/UserCard.vue';
import UsersBar from './components/layouts/UsersBar.vue';
import { isLittleScreen, openedOrg, organizations, user } from '@/assets/var';
import sfetch from '@/assets/utils/sfetch';
import useWSocket from '@/composables/useWSocket';
import useSecurePeer from '@/composables/useSecurePeer';
import type { Category, DMMessage, Message, OrgMember } from '@/types/types';
import { useRoute } from 'vue-router';
import useSettingsItem from '@/composables/useSettingsItem';
import keycloak from '@/assets/keycloak';
import useNotifications from '@/composables/useNotifications';
import { isMeeting } from '@/composables/usePrivatMeet';

import isDesktopApp from '@/assets/isDesktopApp';
import { useToast } from '@/composables/useToast';
import { decryptFromPeer, privateKey } from '@/assets/utils/crypto';
import { SearchSyncService } from '@/services/SearchSyncService';


const props = defineProps<{
    orgId: string;
}>();


const { Item: showUsersBar } = useSettingsItem('showUsersBar', true);
const { initPeer } = useSecurePeer();
const { notify } = useNotifications();
const route = useRoute();
const toast = useToast();

const mediaQuery = window.matchMedia('(max-width: 1024px)');
const showRouterView = computed(() => route.query.showView !== '0');

const orgOnOpen = computed(() => {
    return organizations.value.find(org => org.id === route.params.orgId);
});

import { watch, toRaw } from 'vue';

watch(() => route.params.spaceId, async (newSpaceId, oldSpaceId) => {
    if (newSpaceId && newSpaceId !== oldSpaceId && privateKey.value) {
        const spaceId = newSpaceId as string;
        // Build the entire workspace search index in the background using E2EE keys
        await SearchSyncService.restoreWorkspaceIndexes(spaceId, toRaw(privateKey.value));
    }
}, { immediate: true });

watch(() => [openedOrg.value, route.params.spaceId], ([newOrg, spaceIdParam]) => {
    if (newOrg && spaceIdParam) {
        const spaceId = spaceIdParam as string;
        // Add thread names to the search index for exact BM25 matching (fast, no vector generation needed)
        import('@/services/LocalSearchVectorDB').then(({ localSearchDB }) => {
            const currentSpace = newOrg.spaces?.find(s => s.id === spaceId);
            if (currentSpace && currentSpace.threads) {
                const dummyVector = Array(384).fill(0);
                for (const thread of currentSpace.threads) {
                    localSearchDB.insertDocument({
                        id: thread.id,
                        workspaceId: spaceId,
                        type: 'THREAD',
                        textContent: thread.name,
                        vector: dummyVector
                    });
                }

                // Also fetch and index all files in this workspace for instant name search
                import('@/assets/utils/sfetch').then(({ default: sfetch }) => {
                    sfetch(`/api/spaces/${spaceId}/files`).then(res => res.json()).then(data => {
                        if (data && data.files) {
                            for (const file of data.files) {
                                localSearchDB.insertDocument({
                                    id: file.id,
                                    workspaceId: spaceId,
                                    type: 'FILE',
                                    textContent: file.originalName,
                                    vector: dummyVector,
                                    metadata: { folderId: file.folderId || 'root', fileUrl: file.url }
                                });
                            }
                        }
                    }).catch(err => console.error("Failed to fetch space files for indexing:", err));
                });
            }
        });
    }
}, { immediate: true });

const initSocketListener = async () => {

    const socket = await useWSocket();

    socket.value?.emit('join-org', { orgId: props.orgId });
    
    const space = openedOrg.value?.spaces;
    if (space)
    {
        space.forEach(space => {
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

                    import('@/services/LocalSearchVectorDB').then(({ localSearchDB }) => {
                        localSearchDB.insertDocument({
                            id: updatedThread.id,
                            workspaceId: spaceId,
                            type: 'THREAD',
                            textContent: updatedThread.name,
                            vector: Array(384).fill(0)
                        });
                    });

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

    socket.value?.on('notif:dm:new-message', async (newMessage: DMMessage) => {

        const isMeTheSender = newMessage.senderId === user.value?.id;
        const conversationPeerId = isMeTheSender ? newMessage.recipientId : newMessage.senderId;

        const isCurrentConversation = (route.name === 'OrgThreadChat' || route.name === 'OrgThreadChatPrivateMeet') && route.params.userId === conversationPeerId;

        if (isCurrentConversation) {
            return;
        }

        try {

            const msg: DMMessage = { ...newMessage };

            const keyToUse = isMeTheSender 
                ? msg.selfEncryptedAesKey 
                : msg.encryptedAesKey;


            if (msg.isE2EE && (!keyToUse || !privateKey.value)) 
            {
                msg.content = "🔒 Impossible de déchiffrer : Clé manquante.";
                notify('notif:dmmsg', msg);
                return;
            }

            if (msg.isE2EE) {
                msg.content = await decryptFromPeer(msg.content, keyToUse!, msg.nonce, privateKey.value!);
            }

            notify('notif:dmmsg', msg);

        } catch (cryptoErr) {
            console.error("[E2EE DM Notif] Échec du déchiffrement de la notification :", cryptoErr);
            const fallbackMsg = { ...newMessage, content: "🔒 Nouveau message (Déchiffrement impossible)" };
            notify('notif:dmmsg', fallbackMsg);
        }
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

function handleTabletChange(e: any) 
{
    if (e.matches) 
    {
        showUsersBar.value = false;
        isLittleScreen.value = true;
    } 
    else 
    {
        showUsersBar.value = true;
        isLittleScreen.value = false;
    }
}

onMounted(async () => {

    openedOrg.value = await sfetch(`/api/orgs/${props.orgId}`).then(res => res.json()); 
    await Promise.all([
            initSocketListener(),
            initPeer()
    ])

    handleTabletChange(mediaQuery);
    mediaQuery.addEventListener('change', handleTabletChange);
    isLittleScreen.value = mediaQuery.matches;

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
            <ThreadsBar 
                v-if="route.name !== 'TasksGlobal'"
                class="h-full " 
                :class="[
                    isDesktopApp() ? 'rounded-tl-2xl' : '',
                    isLittleScreen ? 'w-full' : 'w-60 max-w-60 min-w-60'
                ]" 
            />

            <Transition name="slide-in-right">
                <div 
                    v-show="showRouterView"
                    class=" overflow-hidden bg-(--bg3)"
                    :class="[
                        isDesktopApp() ? 'border-t border-white/10' : '',
                        isLittleScreen ? 'fixed top-0 right-0 h-full w-full z-50 bg-(--bg) shadow-lg' : 'relative flex-1 h-full min-w-0'
                    ]"
                >
                    <RouterView />
                </div>
            </Transition>

            <Transition name="slide-in-right-20">
                <UsersBar 
                    v-if="showUsersBar" 
                    :isLittleScreen="isLittleScreen"
                    class="w-60 max-w-60 min-w-60" 
                    :class="isLittleScreen ? 'fixed top-0 right-0 h-full z-50 bg-(--bg) shadow-lg' : 'relative'"
                />
            </Transition>

            <UserCard :isLittleScreen="isLittleScreen" />

        </div>

</template>
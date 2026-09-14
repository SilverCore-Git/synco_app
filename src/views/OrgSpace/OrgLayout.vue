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
import { useUsersBar } from '@/composables/useUsersBar';
import { keycloak } from '@/assets/keycloak';
import useNotifications from '@/composables/useNotifications';
import { useNotification } from '@/composables/useNotification';
import { isMeeting } from '@/composables/usePrivatMeet';

import isDesktopApp from '@/assets/isDesktopApp';
import { useToast } from '@/composables/useToast';
import { decryptFromPeer, privateKey, decryptThreadKeyWithRsa, encryptThreadKeyForMember } from '@/assets/utils/crypto';
import { SearchSyncService } from '@/services/SearchSyncService';
import { usePermissions } from '@/composables/usePermissions';


const props = defineProps<{
    orgId: string;
}>();


const { showUsersBar, setUsersBarHiddenByRoute } = useUsersBar();
const { initPeer } = useSecurePeer();
const { notify } = useNotifications();
const { init: initNotifications } = useNotification();
const route = useRoute();
const toast = useToast();
const { fetchPermissions } = usePermissions(computed(() => props.orgId));

const mediaQuery = window.matchMedia('(max-width: 1024px)');
const showRouterView = computed(() => !isLittleScreen.value || route.query.showView !== '0');

const orgOnOpen = computed(() => {
    return organizations.value.find(org => org.id === route.params.orgId);
});

import { watch, toRaw } from 'vue';

// Dans Tâches/Fichiers, la barre des membres se masque par défaut, sans
// toucher à la préférence enregistrée : on la restaure dès qu'on revient
// sur un salon ou toute autre page (ex: ThreadLayout, OrgAI, Settings).
const USERSBAR_AUTOHIDE_ROUTES = new Set(['TasksSpace', 'TasksGlobal', 'SpaceFiles', 'AgendaGlobal']);

watch(() => route.name, (name) => {
    setUsersBarHiddenByRoute(USERSBAR_AUTOHIDE_ROUTES.has(name as string));
}, { immediate: true });

watch(() => route.params.spaceId, async (newSpaceId, oldSpaceId) => {
    if (newSpaceId && newSpaceId !== oldSpaceId && privateKey.value) {
        const spaceId = newSpaceId as string;
        // Build the entire workspace search index in the background using E2EE keys
        await SearchSyncService.restoreWorkspaceIndexes(spaceId, toRaw(privateKey.value));
    }
}, { immediate: true });

let lastIndexedSpaceId = '';

watch(() => [openedOrg.value, route.params.spaceId] as const, ([newOrg, spaceIdParam]) => {
    if (newOrg && spaceIdParam) {
        const spaceId = spaceIdParam as string;
        if (lastIndexedSpaceId === spaceId) return;
        lastIndexedSpaceId = spaceId;
        
        // Add thread names to the search index for exact BM25 matching (fast, no vector generation needed)
        import('@/services/LocalSearchVectorDB').then(({ localSearchDB }) => {
            const currentSpace = newOrg.spaces?.find((s: any) => s.id === spaceId);
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

                import('@/assets/utils/sfetch').then(({ default: sfetch }) => {
                    // Fetch files
                    sfetch(`/api/spaces/${spaceId}/files`).then(res => res.json()).then(data => {
                        if (data && data.files) {
                            
                            const getFileKeywords = (filename: string) => {
                                const ext = filename.split('.').pop()?.toLowerCase();
                                const keywords: Record<string, string> = {
                                    // Images
                                    'png': 'image photo',
                                    'jpg': 'image photo',
                                    'jpeg': 'image photo',
                                    'gif': 'image animée',
                                    'svg': 'image vecteur',
                                    'webp': 'image photo',
                                    'heic': 'image photo',
                                    // Documents
                                    'pdf': 'pdf document texte',
                                    'doc': 'word document texte',
                                    'docx': 'word document texte',
                                    'txt': 'texte document',
                                    'md': 'texte markdown',
                                    'rtf': 'texte document',
                                    // Tableurs
                                    'xls': 'excel tableur tableau',
                                    'xlsx': 'excel tableur tableau',
                                    'csv': 'excel tableur donnees',
                                    // Presentations
                                    'ppt': 'powerpoint presentation diaporama',
                                    'pptx': 'powerpoint presentation diaporama',
                                    // Vidéos
                                    'mp4': 'video vidéo film',
                                    'mov': 'video vidéo film',
                                    'avi': 'video vidéo film',
                                    'mkv': 'video vidéo film',
                                    'webm': 'video vidéo film',
                                    // Audios
                                    'mp3': 'audio son musique',
                                    'wav': 'audio son musique',
                                    'ogg': 'audio son musique',
                                    'm4a': 'audio son musique',
                                    // Archives
                                    'zip': 'archive compressé zip',
                                    'rar': 'archive compressé rar',
                                    '7z': 'archive compressé',
                                    'tar': 'archive compressé',
                                    'gz': 'archive compressé',
                                    // Code
                                    'js': 'code script javascript',
                                    'ts': 'code script typescript',
                                    'html': 'code web',
                                    'css': 'code style',
                                    'json': 'code donnees json',
                                    'py': 'code script python'
                                };
                                return ext && keywords[ext] ? ` (${keywords[ext]} ${ext})` : ` (${ext})`;
                            };

                            for (const file of data.files) {
                                localSearchDB.insertDocument({
                                    id: file.id,
                                    workspaceId: spaceId,
                                    type: 'FILE',
                                    textContent: file.originalName + getFileKeywords(file.originalName),
                                    vector: dummyVector,
                                    metadata: { 
                                        folderId: file.folderId || 'root', 
                                        fileUrl: file.url,
                                        originalName: file.originalName
                                    }
                                });
                            }
                        }
                    }).catch(err => console.error("Failed to fetch space files for indexing:", err));

                    // Fetch tasks
                    sfetch(`/api/tasks/${newOrg.id}/spaces/${spaceId}/lists`).then(res => res.json()).then(data => {
                        if (data) {
                            const allTasks = [];
                            if (data.lists) {
                                data.lists.forEach((list: any) => {
                                    if (list.tasks) allTasks.push(...list.tasks);
                                });
                            }
                            if (data.unlistedTasks) {
                                allTasks.push(...data.unlistedTasks);
                            }
                            for (const task of allTasks) {
                                localSearchDB.insertDocument({
                                    id: task.id,
                                    workspaceId: spaceId,
                                    type: 'TODO',
                                    textContent: task.title + (task.description ? ' ' + task.description : ''),
                                    vector: dummyVector,
                                    metadata: { 
                                        listId: task.todoListId,
                                        status: task.status,
                                        dueDate: task.dueDate,
                                        assignees: task.assignees,
                                        subtasks: task.subtasks,
                                        parentTask: task.parentTask
                                    }
                                });
                            }
                        }
                    }).catch(err => console.error("Failed to fetch space tasks for indexing:", err));
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

    // Removed forced 'online' status update. The backend now restores the user's lastStatus upon connection.

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

    socket.value?.on('user-data-updated', ({ userId, data }: { userId: string, data: any }) => {
        const member = openedOrg.value?.members?.find(m => m.userId === userId);            
        if (member && member.user) {
            if (data.name !== undefined) member.user.name = data.name;
            if (data.avatarUrl !== undefined) member.user.avatarUrl = data.avatarUrl;
            if (data.job !== undefined) member.user.job = data.job;
            if (data.description !== undefined) member.user.description = data.description;
        }
        
        if (user.value && user.value.id === userId) {
            if (data.name !== undefined) user.value.name = data.name;
            if (data.avatarUrl !== undefined) user.value.avatarUrl = data.avatarUrl;
            if (data.job !== undefined) user.value.job = data.job;
            if (data.description !== undefined) user.value.description = data.description;
        }
    });

    socket.value?.on('key-requested', async ({ threadId, requesterId, publicKey }: { threadId: string, requesterId: string, publicKey: string }) => {
        if (!privateKey.value || !publicKey) return;

        // Delay to avoid all users spamming the server at the exact same millisecond
        setTimeout(() => {
            socket.value?.emit("get-thread-access", { threadId }, async (res: any) => {
                if (res.encryptedKey && !res.needsReadd) {
                    try {
                        const rawKey = await decryptThreadKeyWithRsa(res.encryptedKey, privateKey.value!);
                        const newEncryptedKey = await encryptThreadKeyForMember(rawKey, publicKey);
                        
                        socket.value?.emit("distribute-thread-keys", {
                            threadId,
                            targetUserId: requesterId,
                            encryptedKey: newEncryptedKey
                        });
                    } catch (e) {
                        console.error("[E2EE] Failed to distribute key:", e);
                    }
                }
            });
        }, Math.random() * 2000);
    });

    socket.value?.on('todo-added', ({ task }: { task: any }) => {
        toast.show(`Nouvelle tâche : ${task.title}`, 'info');
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

        let targetCategory;
        let threadsArray;

        if (spaceId) {
            const space = openedOrg.value?.spaces?.find(s => s.id === spaceId);
            if (!space) return;
            targetCategory = space.categories.find(cat => cat.id === category.id);
            threadsArray = space.threads;
        } else {
            const home = openedOrg.value?.home;
            if (!home) return;
            targetCategory = home.categories.find(cat => cat.id === category.id);
            threadsArray = home.threads;
        }

        if (targetCategory) 
        {
            
            Object.assign(targetCategory, category);
            
            if (category.threads) 
            {
                category.threads.forEach(updatedThread => {

                    const tIndex = threadsArray.findIndex((t: any) => t.id === updatedThread.id);
                    if (tIndex !== -1) 
                    {
                        threadsArray[tIndex] = updatedThread;
                    }

                    if (spaceId) {
                        import('@/services/LocalSearchVectorDB').then(({ localSearchDB }) => {
                            localSearchDB.insertDocument({
                                id: updatedThread.id,
                                workspaceId: spaceId,
                                type: 'THREAD',
                                textContent: updatedThread.name,
                                vector: Array(384).fill(0)
                            });
                        });
                    }

                });
            }
        }

    });

    socket.value?.on('categories-updated', ({ orgId, spaceId, categories }: { orgId: string, spaceId: string, categories: Category[] }) => {
        if (orgId !== props.orgId) return;

        let categoriesArray;

        if (spaceId) {
            const space = openedOrg.value?.spaces?.find(s => s.id === spaceId);
            if (!space) return;
            categoriesArray = space.categories;
        } else {
            const home = openedOrg.value?.home;
            if (!home) return;
            categoriesArray = home.categories;
        }

        if (categoriesArray && Array.isArray(categoriesArray)) {
            categories.forEach(updatedCategory => {
                const cIndex = categoriesArray!.findIndex(c => c.id === updatedCategory.id);
                if (cIndex !== -1) {
                    const catToUpdate = categoriesArray![cIndex];
                    if (catToUpdate) catToUpdate.index = updatedCategory.index;
                }
            });
            categoriesArray.sort((a, b) => a.index - b.index);
        }
    });

    socket.value?.on('notif:new-message', ({ message, spaceId }: { message: Message, spaceId: string | null }) => {
        
        if (route.params.threadId == message.threadId) return;

        let thread;
        if (spaceId) {
            const space = openedOrg.value?.spaces?.find(s => s.id === spaceId);
            if (space) thread = space.threads?.find(t => t.id === message.threadId);
        } else {
            thread = openedOrg.value?.home?.threads?.find(t => t.id === message.threadId);
        }

        if (thread) {
            thread.hasUnread = true;
        }

    });

    socket.value?.on('notif:dm:new-message', async (newMessage: DMMessage) => {

        const isMeTheSender = newMessage.senderId === user.value?.id;
        const conversationPeerId = isMeTheSender ? newMessage.recipientId : newMessage.senderId;

        const peerMemberId = openedOrg.value?.members?.find(m => m.user?.id === conversationPeerId)?.id;
        const isCurrentConversation = (route.name === 'OrgThreadChat' || route.name === 'OrgThreadChatPrivateMeet') && route.params.userId === peerMemberId;

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
    socket.value?.on('thread:created', ({ orgId, thread }: { orgId: string, thread: any }) => {
        
        if (orgId !== props.orgId) return;

        const org = openedOrg.value;
        if (!org) return;

        // If thread has workspaceId, add it to the corresponding workspace
        if (thread.workspaceId) {
            const space = org.spaces?.find(s => s.id === thread.workspaceId);
            if (space) {
                if (!space.threads) space.threads = [];
                // Check if it already exists
                if (!space.threads.find(t => t.id === thread.id)) {
                    space.threads.push(thread);
                }
            }
        } 
        // Otherwise, it belongs to the organization home
        else if (org.home) {
            if (!org.home.threads) org.home.threads = [];
            // Check if it already exists
            if (!org.home.threads.find(t => t.id === thread.id)) {
                org.home.threads.push(thread);
            }
        }

    });



    socket.value?.on('thread:updated', ({ orgId, thread }: { orgId: string, thread: any }) => {
        
        if (orgId !== props.orgId) return;

        const org = openedOrg.value;
        if (!org) return;

        org.spaces?.forEach(space => {
            const t = space.threads?.find(t => t.id === thread.id);
            if (t) Object.assign(t, thread);
        });

        if (org.home) {
            const t = org.home.threads?.find(t => t.id === thread.id);
            if (t) Object.assign(t, thread);
        }

    });

    socket.value?.on('thread:deleted', ({ orgId, threadId }: { orgId: string, threadId: string }) => {
        
        if (orgId !== props.orgId) return;

        const org = openedOrg.value;
        if (!org) return;

        org.spaces?.forEach(space => {
            if (space.threads) 
            {
                space.threads = space.threads.filter(t => t.id !== threadId);
            }
        });

        if (org.home?.threads) 
        {
            org.home.threads = org.home.threads.filter(t => t.id !== threadId);
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

    if (!openedOrg.value || openedOrg.value.id !== props.orgId) {
        const res = await sfetch(`/api/orgs/${props.orgId}`);
        if (!res.ok) {
            window.location.href = '/';
            return;
        }
        openedOrg.value = await res.json(); 
    }
    await Promise.all([
            fetchPermissions(),
            initSocketListener(),
            initPeer(),
            initNotifications()
    ])

    handleTabletChange(mediaQuery);
    mediaQuery.addEventListener('change', handleTabletChange);
    isLittleScreen.value = mediaQuery.matches;

});

onBeforeUnmount(async () => {
    // The socket is an app-wide singleton (see useWSocket.ts) shared with
    // other features (DMs, notifications, calls) — it must stay connected
    // across ordinary in-app navigation. Only the listeners registered by
    // this component in initSocketListener() are torn down here; the
    // connection itself is only ever closed on logout or app close.
    const socket = await useWSocket();
    [
        'member:new',
        'member:kicked',
        'user-status-changed',
        'user-data-updated',
        'key-requested',
        'todo-added',
        'space:updated',
        'org-data-updated',
        'category-updated',
        'categories-updated',
        'notif:new-message',
        'notif:dm:new-message',
        'privateMeet:incomingCall',
        'thread:created',
        'thread:updated',
        'thread:deleted',
    ].forEach(event => socket.value?.off(event));
})

</script>

<template>

        <div
            class="
                h-full w-full flex flex-row 
                relative bg-(--bg) overflow-hidden
            "
            :style="{ viewTransitionName: `openOrg-${orgOnOpen?.id}` }"
        >

            <SpaceBar class="h-full" />
            <ThreadsBar
                v-if="route.name !== 'TasksGlobal' && route.name !== 'AgendaGlobal' && route.name !== 'OrgHome'"
                class="h-full " 
                :class="[
                    isDesktopApp() ? 'rounded-tl-2xl' : '',
                    isLittleScreen ? 'flex-1 min-w-0' : 'w-60 max-w-60 min-w-60'
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

            <Transition name="fade">
                <div 
                    v-if="showUsersBar && isLittleScreen" 
                    @click="showUsersBar = false"
                    class="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm"
                ></div>
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
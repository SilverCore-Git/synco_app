<template>

    <div class="fixed top-4 right-4 z-1000 flex flex-col gap-2 w-80 pointer-events-none">

        <TransitionGroup name="list">

            <div 
                v-for="notif in sortedNotifications" 
                :key="notif.type + '-' + notif.id"
                class="
                    pointer-events-auto flex items-start 
                    gap-3 p-4 rounded-xl border shadow-lg w-full
                    backdrop-blur-md transition-all duration-300
                "
                :class="getStyles(notif.type, notif.toastType)"
            >

                <div class="flex items-center gap-3 w-full">

                    <template v-if="notif.type == 'toast'">

                        <i :class="['bi text-lg', getIcon(notif.toastType!)]" />
                        
                        <span class="text-sm font-medium flex-1">{{ notif.message }}</span>

                    </template>

                    <template v-else-if="notif.type == 'notif:msg'">

                        <RouterLink
                            :to="`/${openedOrg?.id}/${getSpaceIdByThreadId(notif.msg!.threadId)}/${notif.msg?.threadId}?type=text&select=${notif.msg?.id}`"
                            class="flex items-center gap-3"
                        >
                            
                            <div class="relative shrink-0">
                                <img 
                                    :src="(notif.msg as any)?.sender?.avatarUrl  || ''"
                                    class="w-11 h-11 rounded-full object-cover border border-(--white)/5"
                                />
                            </div>

                            <div class="flex-1 overflow-hidden" v-if="notif.msg">
                                <h4 class="text-(--text) text-sm font-bold truncate flex items-center gap-1">
                                    {{ (notif.msg as any)?.sender?.name }}
                                    <span v-if="(notif.msg as any).webhookId" class="bg-(--primary)/20 text-(--primary) text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wider font-bold">APP</span>
                                </h4>
                                <p class="text-(--text) text-sm line-clamp-2 leading-snug">
                                    <span v-if="(notif.msg as any).embeds?.length > 0" class="font-semibold text-(--primary) block truncate">
                                        {{ (notif.msg as any).embeds[0].title }}
                                    </span>
                                    <span v-else>{{ notif.msg.content }}</span>
                                </p>
                            </div>

                        </RouterLink>

                    </template>

                    <template v-else-if="notif.type == 'notif:dmmsg'">

                        <RouterLink
                            :to="`/${openedOrg?.id}/chat/${notif.dmmsg?.senderId}`"
                            class="flex items-center gap-3"
                        >
                            
                            <div class="relative shrink-0">
                                <img 
                                    :src="notif.dmmsg?.sender?.avatarUrl  || `https://ui-avatars.com/api/?name=${notif.dmmsg?.sender?.name}&background=128a60&color=fff`"
                                    class="w-11 h-11 rounded-full object-cover border border-(--white)/5"
                                />
                            </div>

                            <div class="flex-1 overflow-hidden" v-if="notif.dmmsg">
                                <h4 class="text-(--text) text-sm font-bold truncate">
                                    {{ notif.dmmsg?.sender?.name }}
                                </h4>
                                <p class="text-(--text) text-sm line-clamp-2 leading-snug">
                                    {{ notif.dmmsg?.content }}
                                </p>
                            </div>

                        </RouterLink>

                    </template>

                    <template v-else-if="notif.type == 'notif:call'">

                        <div class="flex flex-col w-full">

                            <div class="flex items-center gap-3">

                                <div class="relative">
                                    <img 
                                        :src="notif.call?.user?.avatarUrl || ''"
                                        class="w-11 h-11 rounded-full object-cover border border-(--white)/5"
                                    />
                                </div>

                                <div class="flex-1 overflow-hidden">
                                    <p class="text-xs font-bold text-primary uppercase tracking-wider mb-1">Appel entrant</p>
                                    <h4 class=" font-semibold truncate">{{ notif.call?.user?.name || 'Utilisateur inconnu' }}</h4>
                                </div>

                            </div>

                            <div class="flex gap-3 mt-5 w-full">

                                <button 
                                    @click="rejectCall()"
                                    class="danger w-full gap-3"
                                >
                                    <i class="bi bi-x-lg" />
                                    Refuser
                                </button>
                                
                                <button 
                                    @click="router.push({ name: 'OrgThreadChat', params: { userId: notif.call?.id } }), acceptCall()"
                                    class="primary w-full gap-3"
                                >
                                    <i class="bi bi-telephone-fill animate-bounce" />
                                    Répondre
                                </button>

                            </div>

                        </div>

                    </template>

                    <template v-else-if="notif.type == 'notif:privateMeet'">

                        <div class="flex flex-col w-full">

                            <div class="flex items-center gap-3">

                                <div class="relative">
                                    <img 
                                        :src="notif.privateMeet?.user?.avatarUrl || ''"
                                        class="w-11 h-11 rounded-full object-cover border border-(--white)/5"
                                    />
                                </div>

                                <div class="flex-1 overflow-hidden">
                                    <p class="text-xs font-bold text-primary uppercase tracking-wider mb-1">Discussion privée</p>
                                    <h4 class=" font-semibold truncate">{{ notif.privateMeet?.user?.name || 'Utilisateur inconnu' }}</h4>
                                </div>

                            </div>

                            <div class="flex gap-3 mt-5 w-full">

                                <button 
                                    @click="remove(notif.id)"
                                    class="danger w-full gap-3"
                                >
                                    <i class="bi bi-x-lg" />
                                    Refuser
                                </button>
                                
                                <button 
                                    @click="router.push({ name: 'OrgThreadChatPrivateMeet', params: { userId: notif.privateMeet?.id } });"
                                    class="primary w-full gap-3"
                                >
                                    <i class="bi bi-telephone-fill animate-bounce" />
                                    Répondre
                                </button>

                            </div>

                        </div>

                    </template>

                </div>

                <button 
                    @click="remove(notif.id)" 
                    class="opacity-40 hover:opacity-100 transition-opacity absolute top-4 right-4"
                    :class="notif.type == 'notif:call' ? 'absolute top-4 right-4' : ''"
                >
                    <i class="bi bi-x-lg text-xs" />
                </button>
                
            </div>

        </TransitionGroup>

    </div>

</template>

<script setup lang="ts">

import getSpaceIdByThreadId from '@/assets/utils/getSpaceWithThreadId';
import { openedOrg } from '@/assets/var';
import useNotifications, { type NotificationType } from '@/composables/useNotifications';
import useSecurePeer from '@/composables/useSecurePeer';
import { computed, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { SoundService } from '@/services/SoundService';


const { notifications, initListener, remove } = useNotifications();
const router = useRouter();
const { acceptCall, rejectCall } = useSecurePeer();


const sortedNotifications = computed(() => {
    
    return notifications.value
    .sort((a, b) => {

        const dateA = new Date(a.createdAt);
        const dateB = new Date(b.createdAt);
        return dateB.getTime() - dateA.getTime();

    });

});

const getIcon = (type: string) => {
    switch (type) {
        case 'success': return 'bi-check-circle-fill text-green-400';
        case 'error': return 'bi-exclamation-octagon-fill text-red-400';
        case 'warning': return 'bi-exclamation-triangle-fill text-yellow-400';
        default: return 'bi-info-circle-fill text-blue-400';
    }
};

const getStyles = (type: NotificationType, toastType?: string) => {

    switch (type) 
    {

        case 'toast': switch (toastType) 
        {
            case 'success': return 'bg-green-500/10 border-green-500/20 text-green-200';
            case 'error': return 'bg-red-500/10 border-red-500/20 text-red-200';
            case 'warning': return 'bg-yellow-500/10 border-yellow-500/20 text-yellow-200';
            default: return 'bg-blue-500/10 border-blue-500/20 text-blue-200';
        };

        case 'notif:msg': return 'bg-(--bg2)/80 border border-white/10 rounded-2xl shadow-2xl p-4 backdrop-blur-xl cursor-pointer hover:border-primary/30 transition-colors';
        case 'notif:dmmsg': return 'bg-(--bg2)/80 border border-white/10 rounded-2xl shadow-2xl p-4 backdrop-blur-xl cursor-pointer hover:border-primary/30 transition-colors';
        case 'notif:call': return 'bg-(--bg2)/80 border border-white/10 rounded-2xl shadow-2xl p-4 backdrop-blur-xl cursor-pointer hover:border-primary/30 transition-colors';
        case 'notif:privateMeet': return 'bg-(--bg2)/80 border border-white/10 rounded-2xl shadow-2xl p-4 backdrop-blur-xl cursor-pointer hover:border-primary/30 transition-colors';

    }

};


const playNotificationSound = () => {
    SoundService.play('notification');
};

watch(() => notifications.value.length, (newLength, oldLength) => {
    if (newLength > oldLength) {
        const latestNotif = notifications.value[notifications.value.length - 1];
        if (latestNotif && latestNotif.type !== 'toast') {
            playNotificationSound();
        }
    }
});

onMounted(async () => {
    await initListener();
})

</script>
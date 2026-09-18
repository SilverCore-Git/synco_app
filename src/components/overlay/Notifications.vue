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
                            :to="`/${(notif.msg as any)?.orgId || openedOrg?.id}/${(notif.msg as any)?.spaceId || getSpaceIdByThreadId(notif.msg!.threadId)}/${notif.msg?.threadId}?type=text&select=${notif.msg?.id}`"
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
                                    {{ $p((notif.msg as any)?.sender?.name) }}
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
                                    :src="notif.dmmsg?.sender?.avatarUrl  || `https://ui-avatars.com/api/?name=${$p(notif.dmmsg?.sender?.name)}&background=128a60&color=fff`"
                                    class="w-11 h-11 rounded-full object-cover border border-(--white)/5"
                                />
                            </div>

                            <div class="flex-1 overflow-hidden" v-if="notif.dmmsg">
                                <h4 class="text-(--text) text-sm font-bold truncate">
                                    {{ $p(notif.dmmsg?.sender?.name) }}
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
                                    <h4 class=" font-semibold truncate">{{ $p(notif.call?.user?.name) || 'Utilisateur inconnu' }}</h4>
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
                                    <h4 class=" font-semibold truncate">{{ $p(notif.privateMeet?.user?.name) || 'Utilisateur inconnu' }}</h4>
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
import useNotifications, { type Notification, type NotificationType } from '@/composables/useNotifications';
import useSecurePeer from '@/composables/useSecurePeer';
import { computed, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { SoundService } from '@/services/SoundService';
import { isTauriPlatform } from '@/assets/keycloak';
import useSettingsItem from '@/composables/useSettingsItem';
import {
    isPermissionGranted as isNativeNotifPermissionGranted,
    requestPermission as requestNativeNotifPermission,
    sendNotification as sendNativeNotification
} from '@tauri-apps/plugin-notification';
import { getCurrentWindow } from '@tauri-apps/api/window';


const { notifications, initListener, remove } = useNotifications();
const router = useRouter();
const { acceptCall, rejectCall } = useSecurePeer();
const { Item: privacyMode } = useSettingsItem('privacyMode', false);


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

const formatName = (name?: string | null): string => {
    if (!name) return 'Quelqu\'un';
    return privacyMode.value ? name.charAt(0).toUpperCase() : name;
};

let nativeNotificationsGranted = false;

const ensureNativeNotificationPermission = async (): Promise<void> => {
    if (!isTauriPlatform()) return;
    try {
        nativeNotificationsGranted = await isNativeNotifPermissionGranted();
        if (!nativeNotificationsGranted) {
            const permission = await requestNativeNotifPermission();
            nativeNotificationsGranted = permission === 'granted';
        }
    } catch (e) {
        console.error('[Notifications] Failed to request native notification permission', e);
    }
};

// Regroupe les notifications natives par conversation/appelant : posté avec le
// même `id`, le plugin remplace le toast existant au lieu d'en empiler un nouveau.
// 32 bits signés, comme attendu par le plugin.
const hashToInt32 = (str: string): number => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = (hash * 31 + str.charCodeAt(i)) | 0;
    }
    return hash;
};

interface NativeNotifContext {
    key: string;
    title: string;
    singleBody: string;
    pluralBody: (count: number) => string;
}

const pendingNativeNotifCounts = new Map<number, number>();
const pendingNativeNotifTimers = new Map<number, ReturnType<typeof setTimeout>>();
// Laisse le temps à une rafale de messages rapprochés de s'accumuler avant
// d'afficher/mettre à jour le toast, au lieu d'en poster un par message.
const NATIVE_NOTIF_DEBOUNCE_MS = 1200;

// Mis à jour par onFocusChanged plutôt qu'interrogé à la volée : évite une
// requête isFocused() ponctuelle qui peut renvoyer un état obsolète au
// moment précis où un message arrive.
let isWindowFocused = true;

const getNativeNotificationContext = (notif: Notification): NativeNotifContext | null => {
    switch (notif.type) {
        case 'notif:msg': {
            const msg = notif.msg as any;
            const name = formatName(msg?.sender?.name);
            const body = msg?.embeds?.length > 0 ? msg.embeds[0].title : msg?.content;
            return {
                key: `msg:${msg?.threadId}`,
                title: name,
                singleBody: body || 'Nouveau message',
                pluralBody: (count) => `${count} nouveaux messages`
            };
        }
        case 'notif:dmmsg': {
            const name = formatName(notif.dmmsg?.sender?.name);
            return {
                key: `dm:${notif.dmmsg?.senderId}`,
                title: name,
                singleBody: notif.dmmsg?.content || 'Nouveau message',
                pluralBody: (count) => `${count} nouveaux messages`
            };
        }
        case 'notif:call': {
            const name = formatName(notif.call?.user?.name);
            return {
                key: `call:${notif.call?.id}`,
                title: 'Appel entrant',
                singleBody: name,
                pluralBody: (count) => `${count} appels de ${name}`
            };
        }
        case 'notif:privateMeet': {
            const name = formatName(notif.privateMeet?.user?.name);
            return {
                key: `privateMeet:${notif.privateMeet?.id}`,
                title: 'Discussion privée',
                singleBody: name,
                pluralBody: (count) => `${count} demandes de ${name}`
            };
        }
        default:
            return null;
    }
};

const showNativeNotification = (notif: Notification) => {
    if (!isTauriPlatform() || !nativeNotificationsGranted) return;

    // L'utilisateur est déjà dans l'app : le popup in-app + le son suffisent.
    if (isWindowFocused) return;

    const ctx = getNativeNotificationContext(notif);
    if (!ctx) return;

    const id = hashToInt32(ctx.key);
    const count = (pendingNativeNotifCounts.get(id) || 0) + 1;
    pendingNativeNotifCounts.set(id, count);

    // Une rafale de messages ne doit produire qu'une notification (mise à
    // jour), pas une par message : on repousse l'envoi tant que d'autres
    // messages du même contexte continuent d'arriver.
    const existingTimer = pendingNativeNotifTimers.get(id);
    if (existingTimer) clearTimeout(existingTimer);

    pendingNativeNotifTimers.set(id, setTimeout(() => {
        pendingNativeNotifTimers.delete(id);
        const finalCount = pendingNativeNotifCounts.get(id) || count;
        try {
            sendNativeNotification({
                id,
                title: ctx.title,
                body: finalCount > 1 ? ctx.pluralBody(finalCount) : ctx.singleBody
            });
        } catch (e) {
            console.error('[Notifications] Failed to show native notification', e);
        }
    }, NATIVE_NOTIF_DEBOUNCE_MS));
};

watch(() => notifications.value.length, (newLength, oldLength) => {
    if (newLength > oldLength) {
        const latestNotif = notifications.value[notifications.value.length - 1];
        if (latestNotif && latestNotif.type !== 'toast') {
            playNotificationSound();
            showNativeNotification(latestNotif);
        }
    }
});

onMounted(async () => {
    await ensureNativeNotificationPermission();

    if (isTauriPlatform()) {
        try {
            const appWindow = getCurrentWindow();
            isWindowFocused = await appWindow.isFocused();

            await appWindow.onFocusChanged(({ payload: focused }: { payload: boolean }) => {
                isWindowFocused = focused;

                if (focused) {
                    // Une fois l'app reprise en main, on repart de zéro pour le regroupement.
                    pendingNativeNotifCounts.clear();
                    pendingNativeNotifTimers.forEach(t => clearTimeout(t));
                    pendingNativeNotifTimers.clear();
                }
            });
        } catch (e) {
            console.error('[Notifications] Failed to listen for window focus changes', e);
        }
    }

    await initListener();
})

</script>
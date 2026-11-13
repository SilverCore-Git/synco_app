<template>
    <section class="dash-card">
        <header class="dash-card-header">
            <div class="flex items-center gap-2">
                <i class="bi bi-chat-square-text text-(--text)"></i>
                <h3 class="font-semibold text-(--text)">À vous de répondre</h3>
                <span v-if="totalUnread > 0" class="dash-badge">{{ totalUnread }}</span>
            </div>
            <button
                v-if="totalUnread > 0"
                @click="markAllRead"
                class="text-xs text-(--text2) hover:text-(--text)"
                title="Tout marquer comme lu"
            >
                <i class="bi bi-check2-all"></i> Tout lu
            </button>
        </header>

        <div v-if="!loading && allItems.length > 0" class="dash-tabs" role="group" aria-label="Filtrer">
            <button
                v-for="tab in visibleTabs"
                :key="tab.id"
                :aria-pressed="filter === tab.id"
                @click="filter = tab.id"
            >
                {{ tab.label }} <span class="tabular-nums">{{ tab.count }}</span>
            </button>
        </div>

        <div v-if="loading" class="dash-card-body space-y-2 animate-pulse">
            <div v-for="i in 3" :key="i" class="h-12 bg-(--text)/5 rounded-xl"></div>
        </div>

        <div v-else-if="allItems.length === 0" class="dash-card-empty animate-app-reveal">
            <i class="bi bi-check2-circle text-2xl text-(--text2)"></i>
            <p class="font-semibold text-(--text)">Vous êtes à jour</p>
            <p>Aucun message, mention ou appel manqué en attente.</p>
        </div>

        <ul v-else class="dash-card-body space-y-1 animate-app-reveal">
            <li v-for="item in items" :key="item.key">
                <button class="dash-row" @click="openItem(item)">
                    <div class="relative shrink-0">
                        <img
                            :src="item.avatar || defaultAvatar(item.title)"
                            class="w-9 h-9 rounded-full object-cover"
                            alt=""
                        />
                        <span v-if="item.kind === 'missedCall'" class="dash-row-badge bg-red-500">
                            <i class="bi bi-telephone-x-fill" />
                        </span>
                        <span v-else-if="item.kind === 'missedMeet'" class="dash-row-badge bg-red-500">
                            <i class="bi bi-shield-x" />
                        </span>
                        <span v-else-if="item.kind === 'thread'" class="dash-row-badge bg-sky-600">
                            <i class="bi bi-hash" />
                        </span>
                        <span v-else-if="item.kind === 'workspaceAdded'" class="dash-row-badge bg-(--primary)">
                            <i class="bi bi-plus-lg" />
                        </span>
                        <span v-else-if="item.kind === 'calendarAccess'" class="dash-row-badge bg-(--primary)">
                            <i class="bi bi-calendar2-week" />
                        </span>
                        <span v-else-if="item.kind === 'event'" class="dash-row-badge bg-(--primary)">
                            <i class="bi bi-calendar2-check" />
                        </span>
                    </div>
                    <div class="flex-1 min-w-0 text-left">
                        <p class="text-sm font-semibold text-(--text) truncate">{{ item.title }}</p>
                        <p class="text-xs text-(--text2) truncate">{{ item.subtitle }}</p>
                    </div>
                    <div class="flex flex-col items-end gap-1 shrink-0">
                        <span class="text-[11px] text-(--text2)">{{ formatRelativeTime(item.latestAt) }}</span>
                        <span v-if="item.count > 1" class="dash-badge-sm tabular-nums">{{ item.count }}</span>
                    </div>
                </button>
            </li>
            <li v-if="hiddenCount > 0" class="px-3 py-1.5 text-xs text-(--text2)">
                et {{ hiddenCount }} autre{{ hiddenCount > 1 ? 's' : '' }}
            </li>
        </ul>
    </section>
</template>

<script lang="ts" setup>
import { defaultAvatar } from '@/assets/utils/defaultAvatar';
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { openedOrg } from '@/assets/var';
import { useNotification } from '@/composables/useNotification';
import { formatRelativeTime } from '@/assets/utils/relativeTime';
import type { NotificationType } from '@/types/types';

const router = useRouter();
const { notifications, init, markAsRead, markDMAsRead, markThreadAsRead } = useNotification();
const loading = ref(true);

onMounted(async () => {
    await init();
    loading.value = false;
});

interface DashItem {
    key: string;
    kind: 'dm' | 'thread' | 'missedCall' | 'missedMeet' | 'workspaceAdded' | 'calendarAccess' | 'event';
    title: string;
    subtitle: string;
    avatar?: string | null;
    count: number;
    latestAt: string;
    dmUserId?: string;
    threadId?: string;
    spaceId?: string | null;
    // Pour missedCall/missedMeet/workspaceAdded : route déjà résolue côté
    // serveur (createAndSendNotification, cf. call.ts/privateMeet.ts/
    // spaces.ts) — contrairement aux DM/threads, pas besoin de la
    // reconstruire ici à partir d'un id.
    route?: string;
    notifId: string;
}

const orgMemberIds = computed(() => new Set((openedOrg.value?.members || []).map(m => m.userId)));

const unreadDMs = computed<DashItem[]>(() => {
    const groups = new Map<string, DashItem>();

    for (const n of notifications.value) {
        if (n.isRead || n.type !== 'MESSAGE' || !n.data?.dmUserId) continue;
        const dmUserId = n.data.dmUserId as string;
        if (!orgMemberIds.value.has(dmUserId)) continue; // hors de cette organisation

        const existing = groups.get(dmUserId);
        if (!existing) {
            const member = openedOrg.value?.members?.find(m => m.userId === dmUserId);
            groups.set(dmUserId, {
                key: `dm-${dmUserId}`,
                kind: 'dm',
                title: n.metadata?.senderName || member?.user?.name || 'Message privé',
                subtitle: n.title === 'Nouveau message privé' ? 'Message privé' : n.title,
                avatar: n.metadata?.senderAvatar || member?.user?.avatarUrl || null,
                count: 1,
                latestAt: n.createdAt,
                dmUserId,
                notifId: n.id
            });
        } else {
            existing.count++;
            if (new Date(n.createdAt) > new Date(existing.latestAt)) existing.latestAt = n.createdAt;
        }
    }

    return [...groups.values()];
});

const unreadThreads = computed<DashItem[]>(() => {
    const groups = new Map<string, DashItem>();
    const orgId = openedOrg.value?.id;

    for (const n of notifications.value) {
        if (n.isRead || n.type !== 'MESSAGE' || !n.data?.threadId) continue;
        if (n.data?.orgId && n.data.orgId !== orgId) continue;

        const threadId = n.data.threadId as string;
        const existing = groups.get(threadId);
        if (!existing) {
            groups.set(threadId, {
                key: `thread-${threadId}`,
                kind: 'thread',
                title: n.metadata?.spaceName || n.title.replace(/^Nouveau message dans /, ''),
                subtitle: n.metadata?.senderName ? `${n.metadata.senderName} a écrit` : 'Nouveau message',
                avatar: n.metadata?.senderAvatar || null,
                count: 1,
                latestAt: n.createdAt,
                threadId,
                spaceId: n.data?.spaceId || null,
                notifId: n.id
            });
        } else {
            existing.count++;
            if (new Date(n.createdAt) > new Date(existing.latestAt)) existing.latestAt = n.createdAt;
        }
    }

    return [...groups.values()];
});

// Appels manqués, sessions éphémères manquées, ajouts à un workspace, accès
// agenda — pas groupées comme les DM/threads (ce sont des événements
// ponctuels, pas des conversations qui s'accumulent), une ligne par
// notification.
const OTHER_TYPES: NotificationType[] = [
    'MISSED_CALL', 'MISSED_MEET', 'WORKSPACE_ADDED',
    'CALENDAR_ACCESS_REQUEST', 'CALENDAR_ACCESS_INVITE',
    'CALENDAR_ACCESS_GRANTED', 'CALENDAR_ACCESS_DECLINED', 'CALENDAR_ACCESS_REVOKED',
    'EVENT_INVITE', 'EVENT_RSVP', 'EVENT_REMINDER'
];

const CALENDAR_ACCESS_TYPES: NotificationType[] = [
    'CALENDAR_ACCESS_REQUEST', 'CALENDAR_ACCESS_INVITE',
    'CALENDAR_ACCESS_GRANTED', 'CALENDAR_ACCESS_DECLINED', 'CALENDAR_ACCESS_REVOKED'
];

const EVENT_TYPES: NotificationType[] = ['EVENT_INVITE', 'EVENT_RSVP', 'EVENT_REMINDER'];

function kindForOtherType(type: NotificationType): DashItem['kind'] {
    if (type === 'MISSED_CALL') return 'missedCall';
    if (type === 'MISSED_MEET') return 'missedMeet';
    if (CALENDAR_ACCESS_TYPES.includes(type)) return 'calendarAccess';
    if (EVENT_TYPES.includes(type)) return 'event';
    return 'workspaceAdded';
}

const otherNotifs = computed<DashItem[]>(() => {
    const orgId = openedOrg.value?.id;

    return notifications.value
        .filter(n => !n.isRead && OTHER_TYPES.includes(n.type) && (!n.data?.orgId || n.data.orgId === orgId))
        .map((n): DashItem => ({
            key: `notif-${n.id}`,
            kind: kindForOtherType(n.type),
            title: n.metadata?.senderName || 'Quelqu\'un',
            subtitle: n.body,
            avatar: n.metadata?.senderAvatar || null,
            count: 1,
            latestAt: n.createdAt,
            route: n.data?.route as string | undefined,
            notifId: n.id
        }));
});

const allItems = computed(() =>
    [...unreadDMs.value, ...unreadThreads.value, ...otherNotifs.value]
        .sort((a, b) => new Date(b.latestAt).getTime() - new Date(a.latestAt).getTime())
);

// Filtres de la carte : on ne montre que les catégories qui ont quelque chose.
type FilterId = 'all' | 'dm' | 'thread' | 'call' | 'other';
const filter = ref<FilterId>('all');

function filterOf(kind: DashItem['kind']): Exclude<FilterId, 'all'> {
    if (kind === 'dm') return 'dm';
    if (kind === 'thread') return 'thread';
    if (kind === 'missedCall' || kind === 'missedMeet') return 'call';
    return 'other';
}

const visibleTabs = computed(() => {
    const count = (id: FilterId) => id === 'all' ? allItems.value.length : allItems.value.filter(i => filterOf(i.kind) === id).length;
    const tabs: { id: FilterId; label: string; count: number }[] = [
        { id: 'all', label: 'Tout', count: count('all') },
        { id: 'dm', label: 'Messages', count: count('dm') },
        { id: 'thread', label: 'Salons', count: count('thread') },
        { id: 'call', label: 'Appels', count: count('call') },
        { id: 'other', label: 'Invitations', count: count('other') }
    ];
    return tabs.filter(t => t.id === 'all' || t.count > 0);
});

// Un filtre vidé (tout lu) retombe sur « Tout ».
watch(visibleTabs, tabs => {
    if (!tabs.some(t => t.id === filter.value)) filter.value = 'all';
});

const MAX_ROWS = 8;
const filteredItems = computed(() =>
    filter.value === 'all' ? allItems.value : allItems.value.filter(i => filterOf(i.kind) === filter.value)
);
const items = computed(() => filteredItems.value.slice(0, MAX_ROWS));
const hiddenCount = computed(() => Math.max(0, filteredItems.value.length - MAX_ROWS));

const totalUnread = computed(() => allItems.value.length);

// Uniquement ce que la carte affiche (org ouverte) — pas markAllAsRead(),
// qui viderait aussi les notifications des autres organisations. DM/threads
// via les variantes « by-dm/by-thread » : le serveur recalcule depuis la BDD,
// y compris les notifications absentes du cache local.
async function markAllRead() {
    await Promise.all([
        ...unreadDMs.value.map(i => markDMAsRead(i.dmUserId!)),
        ...unreadThreads.value.map(i => markThreadAsRead(i.threadId!)),
        ...otherNotifs.value.map(i => markAsRead(i.notifId))
    ]);
}

defineExpose({ markAllRead, totalUnread });

function openItem(item: DashItem) {
    const orgId = openedOrg.value?.id;

    // missedCall / missedMeet / workspaceAdded : événements ponctuels sans
    // route reconstructible localement — pas de vue dédiée à "rouvrir" une
    // fois lus (contrairement à un DM/thread, toujours là), donc marqués lus
    // au clic plutôt que de rester affichés indéfiniment. Fait avant le
    // early-return sur orgId ci-dessous : sans ça, un clic pendant que
    // l'organisation finit encore de charger ne faisait tout simplement
    // rien — pas d'erreur visible, mais la notification restait non lue.
    if (item.kind === 'missedCall' || item.kind === 'missedMeet' || item.kind === 'workspaceAdded' || item.kind === 'calendarAccess' || item.kind === 'event') {
        markAsRead(item.notifId);
        if (item.route) router.push(item.route);
        return;
    }

    if (!orgId) return;

    if (item.kind === 'dm' && item.dmUserId) {
        router.push({ name: 'OrgThreadChat', params: { orgId, userId: item.dmUserId } });
        return;
    }
    if (item.kind === 'thread' && item.threadId) {
        router.push(`/${orgId}/${item.spaceId || 'home'}/${item.threadId}`);
        return;
    }
}
</script>

<style scoped>
.dash-card {
    display: flex;
    flex-direction: column;
    border: 1px solid var(--border-color);
    border-radius: 1rem;
    background: var(--bg2);
    overflow: hidden;
    min-height: 0;
}

.dash-card-header {
    min-height: 3rem;
    padding: 0 1rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid var(--border-color);
}

.dash-card-body {
    flex: 1;
    min-height: 0;
    padding: 0.5rem;
    overflow-y: auto;
}

.dash-card-empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 2rem 1rem;
    color: var(--text2);
    font-size: 0.8rem;
}

.dash-row {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 0.65rem;
    padding: 0.5rem 0.6rem;
    border-radius: 0.75rem;
    text-align: left;
    transition: background-color 0.15s;
}
.dash-row:hover {
    background: var(--bg);
}

.dash-tabs {
    display: flex;
    gap: 0.25rem;
    padding: 0.5rem 0.5rem 0;
    overflow-x: auto;
    scrollbar-width: none;
}
.dash-tabs button {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    height: 1.85rem;
    padding: 0 0.65rem;
    border-radius: 0.6rem;
    font-size: 0.8rem;
    color: var(--text2);
    transition: background-color 0.15s, color 0.15s;
}
.dash-tabs button span { font-size: 0.7rem; opacity: 0.8; }
.dash-tabs button:hover { color: var(--text); }
.dash-tabs button[aria-pressed="true"] {
    background: rgba(var(--primary-rgb), 0.12);
    color: var(--primary);
    font-weight: 600;
}

.dash-row-badge {
    position: absolute;
    bottom: -2px;
    right: -2px;
    width: 1rem;
    height: 1rem;
    border-radius: 999px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.5rem;
    color: white;
    border: 2px solid var(--bg2);
}

.dash-badge {
    font-size: 0.7rem;
    font-weight: 700;
    color: white;
    background: var(--primary);
    border-radius: 999px;
    padding: 0.05rem 0.5rem;
}

.dash-badge-sm {
    font-size: 0.65rem;
    font-weight: 700;
    color: white;
    background: #ef4444;
    border-radius: 999px;
    min-width: 1.1rem;
    text-align: center;
    padding: 0 0.3rem;
}
</style>

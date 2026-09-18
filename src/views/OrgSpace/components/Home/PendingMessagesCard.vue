<template>
    <section class="dash-card">
        <header class="dash-card-header">
            <div class="flex items-center gap-2">
                <i class="bi bi-chat-dots text-(--text)"></i>
                <h3 class="font-semibold text-(--text)">Messages</h3>
                <span v-if="totalUnread > 0" class="dash-badge">{{ totalUnread }}</span>
            </div>
        </header>

        <div v-if="loading" class="dash-card-body space-y-2 animate-pulse">
            <div v-for="i in 3" :key="i" class="h-12 bg-white/5 rounded-xl"></div>
        </div>

        <div v-else-if="items.length === 0" class="dash-card-empty">
            <i class="bi bi-check2-circle text-2xl text-(--text2)"></i>
            <p>Aucun message en attente</p>
        </div>

        <ul v-else class="dash-card-body space-y-1">
            <li v-for="item in items" :key="item.key">
                <button class="dash-row" @click="openItem(item)">
                    <img
                        :src="item.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(item.title)}&background=128a60&color=fff`"
                        class="w-9 h-9 rounded-full shrink-0"
                        alt=""
                    />
                    <div class="flex-1 min-w-0 text-left">
                        <p class="text-sm font-medium text-(--text) truncate">{{ item.title }}</p>
                        <p class="text-xs text-(--text2) truncate">{{ item.subtitle }}</p>
                    </div>
                    <div class="flex flex-col items-end gap-1 shrink-0">
                        <span class="text-[11px] text-(--text2)">{{ formatRelativeTime(item.latestAt) }}</span>
                        <span v-if="item.count > 1" class="dash-badge-sm">{{ item.count }}</span>
                    </div>
                </button>
            </li>
        </ul>
    </section>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { openedOrg } from '@/assets/var';
import { useNotification } from '@/composables/useNotification';
import { formatRelativeTime } from '@/assets/utils/relativeTime';

const router = useRouter();
const { notifications, init } = useNotification();
const loading = ref(true);

onMounted(async () => {
    await init();
    loading.value = false;
});

interface DashItem {
    key: string;
    kind: 'dm' | 'thread';
    title: string;
    subtitle: string;
    avatar?: string | null;
    count: number;
    latestAt: string;
    dmUserId?: string;
    threadId?: string;
    spaceId?: string | null;
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
                dmUserId
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
                spaceId: n.data?.spaceId || null
            });
        } else {
            existing.count++;
            if (new Date(n.createdAt) > new Date(existing.latestAt)) existing.latestAt = n.createdAt;
        }
    }

    return [...groups.values()];
});

const items = computed(() =>
    [...unreadDMs.value, ...unreadThreads.value]
        .sort((a, b) => new Date(b.latestAt).getTime() - new Date(a.latestAt).getTime())
        .slice(0, 8)
);

const totalUnread = computed(() => unreadDMs.value.length + unreadThreads.value.length);

function openItem(item: DashItem) {
    const orgId = openedOrg.value?.id;
    if (!orgId) return;

    if (item.kind === 'dm' && item.dmUserId) {
        router.push({ name: 'OrgThreadChat', params: { orgId, userId: item.dmUserId } });
    } else if (item.kind === 'thread' && item.threadId) {
        router.push(`/${orgId}/${item.spaceId || 'home'}/${item.threadId}`);
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
    background: rgba(255, 255, 255, 0.04);
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

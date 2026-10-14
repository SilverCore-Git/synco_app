<template>

    <!-- Panel SAV équipe : visuel volontairement distinct d'AdminPanel.vue
         (propre entête, pas d'onglets admin). -->

    <div class="h-full flex flex-col overflow-hidden bg-(--bg2) text-(--text)">

        <nav class="shrink-0 bg-(--bg)/80 backdrop-blur-xl border-b border-(--text)/5 px-6 py-4">
            <div class="max-w-6xl mx-auto">
                <div class="flex items-center gap-4 mb-4">
                    <router-link to="/" class="p-2 hover:bg-(--text)/5 rounded-xl transition-colors">
                        <i class="bi bi-arrow-left text-xl" />
                    </router-link>
                    <h1 class="text-xl font-black uppercase tracking-wider flex items-center gap-2">
                        <i class="bi bi-headset text-(--primary)" /> Panel SAV
                    </h1>
                </div>

                <div class="flex flex-wrap items-center gap-2">

                    <!-- Mes tickets / Non assignés / Tous : trois choix fixes, des
                         onglets suffisent (pas besoin d'une liste déroulante). -->
                    <div class="flex items-center gap-1 bg-(--bg2) rounded-lg p-1">
                        <button
                            v-for="opt in assigneeTabs"
                            :key="opt.value"
                            class="px-3 py-1.5 rounded-md text-xs font-bold transition-colors"
                            :class="assigneeFilter === opt.value ? 'bg-(--primary) text-white' : 'text-(--text2) hover:text-(--text)'"
                            @click="assigneeFilter = opt.value"
                        >
                            {{ opt.label }}
                        </button>
                    </div>

                    <div class="w-40">
                        <SupportSearchSelect v-model="statusFilter" :options="statusOptions" none-label="Tous les statuts" placeholder="Tous les statuts" />
                    </div>
                    <div class="w-40">
                        <SupportSearchSelect v-model="priorityFilter" :options="priorityOptions" none-label="Toutes urgences" placeholder="Toutes urgences" />
                    </div>
                    <div class="w-48">
                        <SupportSearchSelect v-model="tagFilter" :options="tagOptions" none-label="Tous les tags" placeholder="Tous les tags" search-placeholder="Rechercher un tag..." />
                    </div>

                </div>
            </div>
        </nav>

        <main class="flex-1 min-h-0 overflow-y-auto">
            <div class="max-w-6xl mx-auto p-6 flex flex-col gap-3">

                <p v-if="error" class="text-sm text-red-500">{{ error }}</p>
                <p v-else-if="!loading && sorted.length === 0" class="text-center text-(--text2) py-16">Aucun ticket ne correspond à ces filtres.</p>

                <router-link
                    v-for="t in sorted"
                    :key="t.id"
                    :to="`/support-panel/${t.id}`"
                    class="flex items-center gap-4 bg-(--bg) border border-(--border-color) rounded-xl p-4 hover:border-(--primary)/40 transition-colors"
                >
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2 mb-1 flex-wrap">
                            <span class="text-xs font-mono text-(--text2)">#{{ t.number }}</span>
                            <span class="font-bold truncate">{{ titles[t.id] ?? '...' }}</span>
                            <span v-for="tag in t.tags" :key="tag.id" class="px-1.5 py-0.5 rounded text-[10px] font-bold" :style="{ background: tag.color + '22', color: tag.color }">
                                {{ tag.name }}
                            </span>
                        </div>
                        <div class="flex items-center gap-2 text-xs text-(--text2) flex-wrap">
                            <span class="px-2 py-0.5 rounded-full border text-[10px] font-bold" :class="STATUS_COLORS[t.status]">{{ statusLabel(t.status) }}</span>
                            <span class="px-2 py-0.5 rounded-full border text-[10px] font-bold" :class="t.priority ? PRIORITY_COLORS[t.priority] : 'text-(--text2) bg-(--text)/5 border-(--border-color)'">{{ priorityLabel(t.priority) }}</span>
                            <span>{{ t.creator.name }}</span>
                            <span v-if="t.organization">· {{ t.organization.name }}</span>
                            <span>· {{ formatRelative(t.lastMessageAt) }}</span>
                        </div>
                    </div>

                    <div v-if="t.assignee" class="flex items-center gap-2 shrink-0" :title="t.assignee.name">
                        <img :src="t.assignee.avatarUrl || defaultAvatar(t.assignee.name)" class="w-7 h-7 rounded-full object-cover" />
                    </div>
                    <span v-else class="text-[10px] font-bold text-amber-500 shrink-0">Non assigné</span>

                    <div
                        v-if="getUnreadCountBySupportTicketId(t.id, 'staff').value > 0"
                        class="w-2 h-2 bg-red-500 animate-pulse rounded-full shadow-[0_0_8px_var(--glow-danger-strong)] shrink-0"
                    />

                    <i class="bi bi-chevron-right text-(--text2) shrink-0" />
                </router-link>

                <div v-if="loading" class="flex justify-center py-6"><SpinLoader /></div>
                <button v-else-if="hasMore" class="default mx-auto mt-2" @click="loadMore">Charger plus</button>

            </div>
        </main>

    </div>

</template>

<script lang="ts" setup>

import { computed, onMounted, ref } from 'vue';
import { defaultAvatar } from '@/assets/utils/defaultAvatar';
import { useStaffSupportTickets } from '@/composables/useSupportTicketEvents';
import { useNotification } from '@/composables/useNotification';
import { supportApi } from '@/services/support/api';
import type { SupportTag, SupportTicketPriority, SupportTicketStatus } from '@/types/support';
import SpinLoader from '@/components/SpinLoader.vue';
import SupportSearchSelect from '@/components/support/SupportSearchSelect.vue';
import { STATUS_COLORS, PRIORITY_COLORS, STATUS_OPTIONS, PRIORITY_OPTIONS, statusLabel, priorityLabel } from './supportLabels';

const assigneeTabs: { value: 'me' | 'none' | ''; label: string }[] = [
    { value: 'me', label: 'Mes tickets' },
    { value: 'none', label: 'Non assignés' },
    { value: '', label: 'Tous' },
];
const assigneeFilter = ref<'me' | 'none' | ''>('me');
const statusFilter = ref<SupportTicketStatus | null>(null);
const priorityFilter = ref<SupportTicketPriority | null>(null);
const tagFilter = ref<string | null>(null);

const statusOptions = STATUS_OPTIONS;
const priorityOptions = PRIORITY_OPTIONS;
const tags = ref<SupportTag[]>([]);
const tagOptions = computed(() => tags.value.map(t => ({ id: t.id, label: t.name, color: t.color })));

const filters = computed(() => ({
    ...(assigneeFilter.value ? { assignee: assigneeFilter.value } : {}),
    ...(statusFilter.value ? { status: statusFilter.value as SupportTicketStatus } : {}),
    ...(priorityFilter.value ? { priority: priorityFilter.value as SupportTicketPriority } : {}),
    ...(tagFilter.value ? { tag: tagFilter.value } : {}),
}));

const { tickets, titles, loading, hasMore, error, loadMore } = useStaffSupportTickets(filters);
const { getUnreadCountBySupportTicketId } = useNotification();

const PRIORITY_ORDER: Record<string, number> = { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 };
const sorted = computed(() => [...tickets.value].sort((a, b) => {
    const pa = a.priority ? PRIORITY_ORDER[a.priority]! : 4;
    const pb = b.priority ? PRIORITY_ORDER[b.priority]! : 4;
    if (pa !== pb) return pa - pb;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
}));

const formatRelative = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const mn = Math.floor(diff / 60000);
    if (mn < 1) return "à l'instant";
    if (mn < 60) return `${mn} min`;
    const h = Math.floor(mn / 60);
    if (h < 24) return `${h} h`;
    const d = Math.floor(h / 24);
    if (d < 30) return `${d} j`;
    return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
};

onMounted(async () => {
    try { tags.value = await supportApi.listTags(); } catch (e) { console.warn('[Support] Tags indisponibles :', (e as Error).message); }
});

</script>

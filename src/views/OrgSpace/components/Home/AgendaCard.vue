<template>
    <section class="dash-card">
        <header class="dash-card-header">
            <div class="flex items-center gap-2">
                <i class="bi bi-calendar3 text-(--text)"></i>
                <h3 class="font-semibold text-(--text)">Agenda</h3>
            </div>
            <RouterLink :to="`/${orgId}/agenda`" class="text-xs text-(--text2) hover:text-(--text)">
                Voir tout <i class="bi bi-arrow-right"></i>
            </RouterLink>
        </header>

        <div v-if="loading" class="dash-card-body space-y-2 animate-pulse">
            <div v-for="i in 3" :key="i" class="h-12 bg-white/5 rounded-xl"></div>
        </div>

        <div v-else-if="items.length === 0" class="dash-card-empty animate-app-reveal">
            <i class="bi bi-calendar2-check text-2xl text-(--text2)"></i>
            <p>Aucun évènement à venir</p>
        </div>

        <ul v-else class="dash-card-body space-y-1 animate-app-reveal">
            <li v-for="occ in items" :key="occ.occurrenceKey">
                <RouterLink :to="`/${orgId}/agenda`" class="dash-row">
                    <span class="dash-dot" :style="{ background: occ.color || 'var(--primary)' }"></span>
                    <div class="flex-1 min-w-0 text-left">
                        <p class="text-sm font-medium text-(--text) truncate">{{ occ.title }}</p>
                        <p class="text-xs text-(--text2) truncate">{{ formatDayLabel(occ.startAt) }}</p>
                    </div>
                    <span class="text-[11px] text-(--text2) shrink-0">{{ occ.allDay ? 'Journée' : formatTime(occ.startAt) }}</span>
                </RouterLink>
            </li>
        </ul>
    </section>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref } from 'vue';
import { openedOrg } from '@/assets/var';
import { useAgenda } from '@/composables/useAgenda';

const orgId = computed(() => openedOrg.value?.id);
const { occurrences, fetchRange } = useAgenda();
const loading = ref(true);

onMounted(async () => {
    if (!orgId.value) return;
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setDate(to.getDate() + 14);

    await fetchRange(orgId.value, from.toISOString(), to.toISOString());
    loading.value = false;
});

const items = computed(() =>
    [...occurrences.value]
        .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
        .slice(0, 6)
);

function formatTime(iso: string): string {
    return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function formatDayLabel(iso: string): string {
    const date = new Date(iso);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(date);
    target.setHours(0, 0, 0, 0);
    const diffDays = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Aujourd'hui";
    if (diffDays === 1) return 'Demain';
    return date.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
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

.dash-dot {
    width: 0.55rem;
    height: 0.55rem;
    border-radius: 999px;
    flex-shrink: 0;
}
</style>

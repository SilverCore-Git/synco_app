<template>
    <section class="dash-card">
        <header class="dash-card-header">
            <div class="flex items-center gap-2">
                <i class="bi bi-grid text-(--text)"></i>
                <h3 class="font-semibold text-(--text)">Espaces actifs</h3>
            </div>
            <span class="text-xs text-(--text2) tabular-nums">{{ spaceCount }} espace{{ spaceCount > 1 ? 's' : '' }}</span>
        </header>

        <div v-if="spaceCount === 0" class="dash-card-empty">
            <i class="bi bi-grid text-2xl text-(--text2)"></i>
            <p>Vous n'êtes membre d'aucun espace pour l'instant.</p>
        </div>

        <ul v-else class="dash-card-body space-y-1">
            <li v-for="s in rows" :key="s.space.id">
                <RouterLink :to="`/${orgId}/${s.space.id}?showView=0`" class="space-row">
                    <span class="space-logo" :class="{ 'in-voice': s.liveNames }">
                        <img v-if="s.space.logo && s.space.logo.includes('data:')" :src="s.space.logo" alt="" class="w-full h-full object-cover" />
                        <i v-else-if="s.space.logo" class="bi text-lg" :class="s.space.logo"></i>
                        <span v-else class="font-bold">{{ s.space.name.charAt(0).toUpperCase() }}</span>
                    </span>
                    <span class="flex-1 min-w-0">
                        <span class="block text-sm font-semibold text-(--text) truncate">{{ s.space.name }}</span>
                        <span class="flex items-center gap-1.5 text-xs text-(--text2) truncate">
                            <template v-if="s.liveNames">
                                <span class="live-dot" aria-hidden="true"></span>
                                <span class="truncate">Vocal en cours · {{ s.liveNames }}</span>
                            </template>
                            <template v-else-if="s.unread > 0">
                                {{ s.unread }} notification{{ s.unread > 1 ? 's' : '' }} non lue{{ s.unread > 1 ? 's' : '' }}
                            </template>
                            <template v-else>Rien de nouveau</template>
                        </span>
                    </span>
                    <span v-if="s.unread > 0" class="dash-badge tabular-nums">{{ s.unread }}</span>
                </RouterLink>
            </li>
            <li v-if="hiddenCount > 0" class="px-3 py-1.5 text-xs text-(--text2)">
                et {{ hiddenCount }} autre{{ hiddenCount > 1 ? 's' : '' }} espace{{ hiddenCount > 1 ? 's' : '' }} sans activité
            </li>
        </ul>
    </section>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { openedOrg } from '@/assets/var';
import { useNotification } from '@/composables/useNotification';
import { useVoicePresence } from '@/composables/useVoicePresence';
import type { WorkSpace } from '@/types/types';

const orgId = computed(() => openedOrg.value?.id);
const { notifications } = useNotification();
const { voiceByThread } = useVoicePresence();

function firstName(userId: string): string {
    const name = openedOrg.value?.members?.find(m => String(m.userId) === String(userId))?.user?.name;
    return name?.split(' ')[0] || 'Anonyme';
}

function liveNamesOf(space: WorkSpace): string {
    const ids = (space.threads || [])
        .filter(t => t.type === 'vocal')
        .flatMap(t => voiceByThread.value.get(t.id) || [])
        .map(p => p.identity);
    if (ids.length === 0) return '';
    const names = ids.map(firstName);
    return names.length > 3 ? `${names.slice(0, 3).join(', ')} +${names.length - 3}` : names.join(', ');
}

const spaceCount = computed(() => openedOrg.value?.spaces?.length || 0);

// Ordre : vocal en cours, puis le plus de non-lus, puis l'ordre de la barre
// d'espaces. Cinq lignes au plus : l'accueil montre où ça bouge, pas la liste
// complète (elle est dans la barre d'espaces).
const MAX_ROWS = 5;

const allRows = computed(() =>
    (openedOrg.value?.spaces || [])
        .map((space, index) => ({
            space,
            index,
            liveNames: liveNamesOf(space),
            unread: notifications.value.filter(n => !n.isRead && n.data?.spaceId === space.id).length
        }))
        .sort((a, b) =>
            (a.liveNames ? 0 : 1) - (b.liveNames ? 0 : 1)
            || b.unread - a.unread
            || a.index - b.index
        )
);

const rows = computed(() => allRows.value.slice(0, MAX_ROWS));
const hiddenCount = computed(() => Math.max(0, allRows.value.length - MAX_ROWS));
</script>

<style scoped>
.dash-card {
    display: flex;
    flex-direction: column;
    border: 1px solid var(--border-color);
    border-radius: 1rem;
    background: var(--bg2);
    overflow: hidden;
    min-width: 0;
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
    padding: 0.5rem;
}

.dash-card-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    padding: 2rem 1rem;
    color: var(--text2);
    font-size: 0.8rem;
    text-align: center;
}

.space-row {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    padding: 0.45rem 0.5rem;
    border-radius: 0.75rem;
    transition: background-color 0.15s;
}
.space-row:hover { background: var(--bg); }
.space-row:hover .space-logo { border-color: rgba(var(--primary-rgb), 0.5); }

/* Même tuile que SpaceBarBTN, en plus petit : bordure verte quand un vocal est actif. */
.space-logo {
    width: 2.25rem;
    height: 2.25rem;
    flex-shrink: 0;
    display: grid;
    place-items: center;
    overflow: hidden;
    border-radius: 0.65rem;
    border: 1px solid var(--border-color);
    background: var(--bg);
    color: var(--text);
    transition: border-color 0.2s;
}
.space-logo.in-voice {
    border: 2px solid #22c55e;
    box-shadow: 0 0 8px 1px rgba(34, 197, 94, 0.45);
}

.dash-badge {
    font-size: 0.7rem;
    font-weight: 700;
    color: white;
    background: var(--primary);
    border-radius: 999px;
    padding: 0.05rem 0.5rem;
}

.live-dot {
    width: 0.4rem;
    height: 0.4rem;
    flex-shrink: 0;
    border-radius: 999px;
    background: #22c55e;
}
</style>

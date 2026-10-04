<template>
    <section class="dash-card">
        <header class="dash-card-header">
            <div class="flex items-center gap-2">
                <i class="bi bi-calendar3 text-(--text)"></i>
                <h3 class="font-semibold text-(--text)">Agenda</h3>
            </div>
            <RouterLink :to="agendaLink" class="text-xs text-(--text2) hover:text-(--text)">
                Voir tout <i class="bi bi-arrow-right"></i>
            </RouterLink>
        </header>

        <div ref="scrollEl" class="dash-card-body">
            <div v-if="loading" class="space-y-2 pt-2 animate-pulse">
                <div v-for="i in 4" :key="i" class="h-12 bg-(--text)/5 rounded-xl"></div>
            </div>

            <template v-else>
                <div v-for="day in days" :key="day.key" class="pb-3 animate-app-reveal">
                    <AgendaDayDivider :date="day.date" :count="day.occurrences.length" />
                    <ul class="space-y-1.5">
                        <li v-for="occ in day.occurrences" :key="`${occ.eventId}|${occ.occurrenceKey}`">
                            <AgendaEventItem :occurrence="occ" :to="agendaLink" :now="now" />
                        </li>
                    </ul>
                </div>

                <div v-if="isEmpty && !loadingMore" class="dash-card-empty">
                    <i class="bi bi-calendar2-check text-2xl text-(--text2)"></i>
                    <p v-if="reachedEnd">Aucun évènement à venir</p>
                    <p v-else>Rien de prévu d'ici le {{ horizonLabel }}</p>
                </div>
            </template>

            <!-- Sentinelle de défilement infini : son entrée dans le viewport de
                 la carte déclenche le chargement de la fenêtre de jours suivante. -->
            <div ref="sentinelEl" class="feed-foot">
                <div v-if="loadingMore" class="flex items-center gap-2 text-xs text-(--text2)">
                    <span class="w-3.5 h-3.5 border-2 border-(--primary)/30 border-t-(--primary) rounded-full animate-spin"></span>
                    Chargement des jours suivants…
                </div>

                <button
                    v-else-if="error"
                    type="button"
                    @click="runFill()"
                    class="text-xs font-semibold text-(--text2) hover:text-(--text) flex items-center gap-1.5"
                >
                    <i class="bi bi-arrow-clockwise"></i> {{ error }} Réessayer
                </button>

                <span v-else-if="reachedEnd && !isEmpty" class="text-[11px] text-(--text2)">
                    Plus rien de prévu d'ici le {{ horizonLabel }}
                </span>

                <button
                    v-else-if="!reachedEnd && !loading"
                    type="button"
                    @click="runFill()"
                    class="text-xs font-semibold text-(--text2) hover:text-(--text) flex items-center gap-1.5"
                >
                    <i class="bi bi-chevron-down"></i> Charger les jours suivants
                </button>
            </div>
        </div>
    </section>
</template>

<script lang="ts" setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { openedOrg } from '@/assets/var';
import { useUpcomingAgenda } from '@/composables/useUpcomingAgenda';
import AgendaDayDivider from './AgendaDayDivider.vue';
import AgendaEventItem from './AgendaEventItem.vue';

const orgId = computed(() => openedOrg.value?.id);
const agendaLink = computed(() => `/${orgId.value}/agenda`);

const { days, loading, loadingMore, reachedEnd, error, isEmpty, loadedUntil, start, loadMore } = useUpcomingAgenda();

const scrollEl = ref<HTMLElement | null>(null);
const sentinelEl = ref<HTMLElement | null>(null);
let observer: IntersectionObserver | null = null;

// Marge de déclenchement : on charge la suite un peu avant que la sentinelle
// n'atteigne réellement le bas, pour que le défilement ne bute jamais sur du vide.
const PREFETCH_MARGIN_PX = 160;

// Nombre de fenêtres enchaînées par passe. Une période creuse (aucun évènement
// sur 30 jours) ne remplit pas la carte et ne produit donc aucun scroll qui
// relancerait l'observer : on enchaîne quelques fenêtres, puis on s'arrête sur
// un bouton explicite plutôt que de dérouler l'année entière en requêtes.
const MAX_WINDOWS_PER_PASS = 3;

let filling = false;

function sentinelIsNear(): boolean {
    const root = scrollEl.value;
    const sentinel = sentinelEl.value;
    if (!root || !sentinel) return false;
    return sentinel.getBoundingClientRect().top <= root.getBoundingClientRect().bottom + PREFETCH_MARGIN_PX;
}

async function runFill(): Promise<void> {
    if (filling) return;
    filling = true;
    try {
        for (let i = 0; i < MAX_WINDOWS_PER_PASS; i++) {
            if (reachedEnd.value) break;
            if (i > 0 && !sentinelIsNear()) break;
            const loaded = await loadMore();
            if (!loaded) break;
            await nextTick();
        }
    } finally {
        filling = false;
    }
}

const horizonLabel = computed(() =>
    loadedUntil.value.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
);

// Horloge partagée par toutes les lignes (badge « en cours », estompage des
// évènements passés) — une minute suffit, et un seul timer pour la carte.
const now = ref(Date.now());
const clock = window.setInterval(() => { now.value = Date.now(); }, 60_000);

onMounted(() => {
    observer = new IntersectionObserver(
        entries => {
            if (entries.some(entry => entry.isIntersecting)) runFill();
        },
        { root: scrollEl.value, rootMargin: `0px 0px ${PREFETCH_MARGIN_PX}px 0px` }
    );
    if (sentinelEl.value) observer.observe(sentinelEl.value);
});

onBeforeUnmount(() => {
    observer?.disconnect();
    window.clearInterval(clock);
});

watch(orgId, async id => {
    if (!id) return;
    await start(id);
    // L'observer ne se redéclenche pas tout seul après ce premier chargement
    // (la sentinelle n'a pas bougé) : on complète à la main tant qu'elle reste
    // visible, sinon une première fenêtre vide laisserait la carte vide.
    await nextTick();
    if (sentinelIsNear()) await runFill();
}, { immediate: true });
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

/* Pas de padding haut : les séparateurs de jour sont collants (position:
   sticky, top: 0) et un padding laisserait défiler les évènements dans
   l'espace au-dessus d'eux. */
.dash-card-body {
    flex: 1;
    min-height: 0;
    padding: 0 0.6rem 0.5rem;
    overflow-y: auto;
}

.dash-card-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 2.5rem 1rem 1rem;
    color: var(--text2);
    font-size: 0.8rem;
}

.feed-foot {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 2.25rem;
    padding: 0.25rem 0 0.5rem;
    text-align: center;
}
</style>

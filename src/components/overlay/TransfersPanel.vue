<template>

    <!-- Envois et téléchargements en cours (cf. services/transfers). Placé par
         la colonne bas-droite d'App.vue (z-1500 : au-dessus des DropDown,
         sous les Popup), sous les tâches ouvertes du TaskPanelDock, avec les
         mêmes surfaces (br-bar réduit, br-card déplié) et la même largeur. -->
    <Transition name="transfers" mode="out-in">

        <!-- Réduit : une barre comme une tâche réduite, avec la progression globale en fond. -->
        <div v-if="items.length > 0 && collapsed" key="bar" class="br-bar relative overflow-hidden shrink-0 w-(--br-width) max-w-[calc(100vw-2rem)]">
            <div
                v-if="activeCount > 0"
                class="absolute inset-y-0 left-0 bg-(--primary)/10 transition-all duration-300 pointer-events-none"
                :style="{ width: `${overallPercent}%` }"
            />
            <button
                type="button"
                class="relative flex-1 min-w-0 h-full flex items-center gap-2 pl-3 text-left"
                :title="`Déplier : ${headline}`"
                @click="collapsed = false"
            >
                <i :class="['bi shrink-0', headIcon]" />
                <span class="flex-1 min-w-0 truncate text-sm font-semibold text-(--text)">{{ headline }}</span>
                <span v-if="activeCount > 0" class="text-[11px] whitespace-nowrap text-(--text2)">{{ Math.round(overallPercent) }} %</span>
            </button>
            <button v-if="activeCount === 0" type="button" class="br-btn relative mr-1" title="Fermer" aria-label="Fermer" @click="clearFinished">
                <i class="bi bi-x-lg" />
            </button>
            <span v-else class="w-1" />
        </div>

        <!-- Déplié : une carte comme un panneau du dock. -->
        <section
            v-else-if="items.length > 0"
            key="card"
            class="br-card shrink-0 w-(--br-width) max-w-[calc(100vw-2rem)] flex flex-col"
            aria-label="Transferts"
        >
            <header class="flex items-center gap-1.5 pl-4 pr-2 py-2 border-b border-(--border-color) shrink-0">
                <i :class="['bi shrink-0', headIcon]" />
                <div class="flex-1 min-w-0">
                    <p class="text-xs font-semibold text-(--text) truncate">{{ headline }}</p>
                    <p v-if="activeCount > 0" class="text-[11px] text-(--text2) truncate">
                        {{ Math.round(overallPercent) }} %<template v-if="overallSpeed > 0"> · {{ formatBytes(overallSpeed) }}/s</template>
                    </p>
                </div>
                <button type="button" class="br-btn" title="Réduire" aria-label="Réduire" @click="collapsed = true">
                    <i class="bi bi-dash-lg" />
                </button>
                <button v-if="activeCount === 0" type="button" class="br-btn" title="Fermer" aria-label="Fermer" @click="clearFinished">
                    <i class="bi bi-x-lg" />
                </button>
            </header>

            <div v-if="activeCount > 0" class="h-0.5 bg-(--text)/10">
                <div class="h-full bg-(--primary) transition-all duration-300" :style="{ width: `${overallPercent}%` }" />
            </div>

            <ul class="max-h-72 overflow-y-auto divide-y divide-(--border-color)">
                <li v-for="t in items" :key="t.id" class="px-4 py-2.5 flex items-center gap-3">

                    <i :class="['bi shrink-0', iconFor(t)]" />

                    <div class="flex-1 min-w-0">
                        <p class="text-sm font-semibold text-(--text) truncate" :title="t.name">{{ t.name }}</p>

                        <p class="text-[11px] truncate" :class="t.status === 'error' ? 'text-red-400' : 'text-(--text2)'">
                            {{ statusLine(t) }}
                        </p>

                        <div v-if="t.status === 'running' || t.status === 'queued'" class="mt-1.5 h-1 bg-(--text)/10 rounded-full overflow-hidden">
                            <div class="h-full bg-(--primary) transition-all duration-300" :style="{ width: `${percentOf(t)}%` }" />
                        </div>
                    </div>

                    <button
                        v-if="isActive(t)"
                        type="button"
                        class="br-btn hover:!text-red-400 hover:!bg-red-500/10"
                        title="Annuler"
                        @click="cancelTransfer(t.id)"
                    >
                        <i class="bi bi-x-lg" />
                    </button>
                    <button
                        v-else
                        type="button"
                        class="br-btn"
                        title="Masquer"
                        @click="dismissTransfer(t.id)"
                    >
                        <i class="bi bi-x-lg" />
                    </button>

                </li>
            </ul>
        </section>
    </Transition>

</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { transfers, cancelTransfer, dismissTransfer, type Transfer } from '@/services/transfers/transferManager';

const collapsed = ref(false);

const items = computed(() => transfers as readonly Transfer[]);

const isActive = (t: Transfer) => t.status === 'queued' || t.status === 'running' || t.status === 'finalizing';

const active = computed(() => items.value.filter(isActive));
const activeCount = computed(() => active.value.length);

const overallPercent = computed(() => {
    const total = active.value.reduce((sum, t) => sum + t.size, 0);
    const loaded = active.value.reduce((sum, t) => sum + Math.min(t.loaded, t.size), 0);
    return total > 0 ? (loaded / total) * 100 : 0;
});

const overallSpeed = computed(() => active.value.reduce((sum, t) => sum + (t.status === 'running' ? t.bytesPerSecond : 0), 0));

const headline = computed(() => {
    if (activeCount.value === 0) {
        const errors = items.value.filter(t => t.status === 'error').length;
        return errors > 0 ? `${errors} transfert${errors > 1 ? 's' : ''} en échec` : 'Transferts terminés';
    }
    const uploads = active.value.filter(t => t.kind === 'upload').length;
    const downloads = activeCount.value - uploads;
    const parts: string[] = [];
    if (uploads) parts.push(`${uploads} envoi${uploads > 1 ? 's' : ''}`);
    if (downloads) parts.push(`${downloads} téléchargement${downloads > 1 ? 's' : ''}`);
    return `${parts.join(' et ')} en cours`;
});

const percentOf = (t: Transfer) => (t.size > 0 ? Math.min(100, (t.loaded / t.size) * 100) : 0);

const iconFor = (t: Transfer) => {
    if (t.status === 'done') return 'bi-check-circle-fill text-green-400';
    if (t.status === 'error') return 'bi-exclamation-circle-fill text-red-400';
    if (t.status === 'cancelled') return 'bi-slash-circle text-(--text2)';
    return t.kind === 'upload' ? 'bi-arrow-up-circle text-(--primary)' : 'bi-arrow-down-circle text-(--primary)';
};

const headIcon = computed(() => {
    if (activeCount.value > 0) return 'bi-arrow-down-up text-(--primary)';
    return items.value.some(t => t.status === 'error') ? 'bi-exclamation-circle-fill text-red-400' : 'bi-check2-circle text-green-400';
});

/** Tout est fini : on retire les transferts terminés de la liste (la barre disparaît). */
const clearFinished = () => items.value.filter(t => !isActive(t)).forEach(t => dismissTransfer(t.id));

const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${Math.round(bytes)} o`;
    const units = ['Ko', 'Mo', 'Go', 'To'];
    let value = bytes / 1024;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit++;
    }
    return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
};

const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${Math.max(1, Math.round(seconds))} s`;
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes} min`;
    return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
};

const statusLine = (t: Transfer) => {
    switch (t.status) {
        case 'queued': return 'En attente…';
        case 'finalizing': return t.kind === 'upload' ? 'Finalisation…' : 'Enregistrement…';
        case 'done': return t.kind === 'upload' ? 'Envoyé' : 'Téléchargé';
        case 'cancelled': return 'Annulé';
        case 'error': return t.error || 'Échec du transfert';
        case 'running': {
            let line = `${formatBytes(Math.min(t.loaded, t.size))} / ${formatBytes(t.size)}`;
            if (t.bytesPerSecond > 0) {
                line += ` · ${formatBytes(t.bytesPerSecond)}/s`;
                const remaining = (t.size - t.loaded) / t.bytesPerSecond;
                if (remaining > 1) line += ` · ${formatDuration(remaining)}`;
            }
            return line;
        }
    }
};
</script>

<style scoped>
.transfers-enter-active,
.transfers-leave-active {
    transition: opacity 0.2s ease, transform 0.2s ease;
}
.transfers-enter-from,
.transfers-leave-to {
    opacity: 0;
    transform: translateY(8px);
}
</style>

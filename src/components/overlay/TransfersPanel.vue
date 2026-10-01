<template>

    <!-- Envois et téléchargements en cours (cf. services/transfers). Au-dessus
         des DropDown (z-1000) mais sous les modales Popup (z-2000), pour ne
         jamais masquer leurs boutons. -->
    <Transition name="transfers">
        <div
            v-if="items.length > 0"
            class="
                fixed bottom-4 right-4 z-[1500] w-80 max-w-[calc(100vw-2rem)]
                bg-(--bg) border border-(--text)/10 rounded-xl shadow-2xl
                overflow-hidden flex flex-col
            "
        >

            <button
                class="flex items-center gap-3 px-4 py-3 w-full text-left hover:bg-(--text)/5 transition-colors"
                @click="collapsed = !collapsed"
            >
                <i :class="['bi text-(--primary)', activeCount > 0 ? 'bi-arrow-down-up' : 'bi-check2-circle']" />
                <div class="flex-1 min-w-0">
                    <p class="text-sm font-semibold text-(--text) truncate">{{ headline }}</p>
                    <p v-if="activeCount > 0" class="text-xs text-(--text2) truncate">
                        {{ Math.round(overallPercent) }} %<template v-if="overallSpeed > 0"> · {{ formatBytes(overallSpeed) }}/s</template>
                    </p>
                </div>
                <i :class="['bi text-(--text2)', collapsed ? 'bi-chevron-up' : 'bi-chevron-down']" />
            </button>

            <div v-if="activeCount > 0" class="h-0.5 bg-(--text)/10">
                <div class="h-full bg-(--primary) transition-all duration-300" :style="{ width: `${overallPercent}%` }" />
            </div>

            <ul v-if="!collapsed" class="max-h-72 overflow-y-auto divide-y divide-(--text)/5">
                <li v-for="t in items" :key="t.id" class="px-4 py-2.5 flex items-center gap-3">

                    <i :class="['bi shrink-0', iconFor(t)]" />

                    <div class="flex-1 min-w-0">
                        <p class="text-sm text-(--text) truncate" :title="t.name">{{ t.name }}</p>

                        <p class="text-xs truncate" :class="t.status === 'error' ? 'text-red-400' : 'text-(--text2)'">
                            {{ statusLine(t) }}
                        </p>

                        <div v-if="t.status === 'running' || t.status === 'queued'" class="mt-1.5 h-1 bg-(--text)/10 rounded-full overflow-hidden">
                            <div class="h-full bg-(--primary) transition-all duration-300" :style="{ width: `${percentOf(t)}%` }" />
                        </div>
                    </div>

                    <button
                        v-if="isActive(t)"
                        class="w-7 h-7 shrink-0 rounded-lg flex items-center justify-center text-(--text2) hover:text-red-400 hover:bg-red-500/10 transition-colors"
                        title="Annuler"
                        @click="cancelTransfer(t.id)"
                    >
                        <i class="bi bi-x-lg text-xs" />
                    </button>
                    <button
                        v-else-if="t.status === 'error'"
                        class="w-7 h-7 shrink-0 rounded-lg flex items-center justify-center text-(--text2) hover:text-(--text) hover:bg-(--text)/5 transition-colors"
                        title="Masquer"
                        @click="dismissTransfer(t.id)"
                    >
                        <i class="bi bi-x-lg text-xs" />
                    </button>

                </li>
            </ul>

        </div>
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

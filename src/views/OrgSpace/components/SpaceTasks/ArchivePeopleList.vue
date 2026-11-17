<template>
    <div class="flex flex-col gap-1 min-h-0">
        <!-- Recherche dès qu'il y a de quoi chercher : l'écran doit tenir à 100 membres. -->
        <div v-if="people.length > 6" class="relative mb-1.5 shrink-0">
            <i class="bi bi-search absolute left-3 top-1/2 -translate-y-1/2 text-(--text2) text-xs"></i>
            <input
                v-model="search"
                @click.stop
                type="text"
                placeholder="Rechercher une personne…"
                aria-label="Rechercher une personne"
                class="w-full bg-(--text)/[0.03] border border-(--text)/10 rounded-lg pl-8 pr-3 py-1.5 text-xs text-(--text) placeholder:text-(--text2) focus:outline-none focus:border-(--primary)/50"
            />
        </div>

        <button
            type="button"
            @click="emit('update:modelValue', null)"
            class="person-row rv-row"
            style="--i: 0"
            :class="modelValue === null ? 'is-active' : ''"
            :aria-pressed="modelValue === null"
        >
            <span class="w-8 h-8 rounded-full bg-(--text)/5 flex items-center justify-center shrink-0">
                <i class="bi bi-people-fill text-(--text2)"></i>
            </span>
            <span class="flex-1 min-w-0 text-left">
                <span class="block text-sm font-bold truncate">Tout le monde</span>
                <span class="block text-[11px] text-(--text2) truncate">{{ people.length }} {{ people.length > 1 ? 'personnes' : 'personne' }}</span>
            </span>
            <span class="text-xs font-bold tabular-nums text-(--text2)">{{ totalCount }}</span>
        </button>

        <div class="flex flex-col gap-1 overflow-y-auto min-h-0 -mr-1 pr-1">
            <button
                v-for="(row, idx) in filteredPeople" :key="row.person.id"
                type="button"
                @click="emit('update:modelValue', row.person.id)"
                class="person-row rv-row"
                :style="{ '--i': Math.min(idx + 1, 10) }"
                :class="[modelValue === row.person.id ? 'is-active' : '', row.count === 0 ? 'opacity-50' : '']"
                :aria-pressed="modelValue === row.person.id"
            >
                <PersonAvatar :person="row.person" size="w-8 h-8" />
                <span class="flex-1 min-w-0 text-left">
                    <span class="block text-sm font-bold truncate">{{ row.person.isNone ? 'Sans assigné' : $p(row.person.name) }}</span>
                    <span class="block text-[11px] text-(--text2) truncate">
                        <template v-if="row.person.isMe">Vous · </template>{{ archivedAgoLabel(row.lastArchivedAt, 'Dernière archive') }}
                    </span>
                </span>
                <span class="text-xs font-bold tabular-nums" :class="row.count ? 'text-(--text)' : 'text-(--text2)'">{{ row.count }}</span>
            </button>

            <p v-if="filteredPeople.length === 0" class="text-xs text-center text-(--text2) py-4">
                Personne ne s'appelle ainsi.
            </p>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { archivedAgoLabel } from '@/assets/utils/taskArchive';
import PersonAvatar from './ArchivePersonAvatar.vue';
import type { ArchivePerson } from './archivePeople';

export interface ArchivePersonRow {
    person: ArchivePerson;
    /** Tâches de cette personne qui passent la recherche et les tags. */
    count: number;
    lastArchivedAt: Date | null;
}

const props = defineProps<{
    people: ArchivePersonRow[];
    modelValue: string | null;
    totalCount: number;
}>();

const emit = defineEmits<{ 'update:modelValue': [string | null] }>();

const search = ref('');
const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const filteredPeople = computed(() => {
    const q = normalize(search.value.trim());
    if (!q) return props.people;
    return props.people.filter(r => normalize(r.person.isNone ? 'sans assigne' : r.person.name).includes(q));
});
</script>

<style scoped>
.person-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    width: 100%;
    padding: 0.4rem 0.6rem;
    border-radius: 0.75rem;
    color: var(--text);
    transition: background-color 150ms, color 150ms;
}
.person-row:hover {
    background: color-mix(in srgb, var(--text) 5%, transparent);
}
.person-row:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 1px;
}
.person-row.is-active {
    background: color-mix(in srgb, var(--primary) 15%, transparent);
    color: var(--primary);
}
.person-row.is-active .text-\(--text\) {
    color: var(--primary);
}
</style>

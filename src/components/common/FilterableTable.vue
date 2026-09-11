<template>

    <div class="flex flex-col gap-4 w-full">

        <!-- Barre d'outils : recherche + filtres -->
        <div class="flex flex-wrap items-center gap-3">

            <div class="relative flex-1 min-w-[200px]">
                <i class="bi bi-search absolute left-3 top-1/2 -translate-y-1/2 text-(--text2) text-sm pointer-events-none" />
                <input
                    v-model="search"
                    type="text"
                    :placeholder="searchPlaceholder || 'Rechercher...'"
                    class="w-full bg-(--white)/5 border border-(--white)/10 rounded-xl pl-9 pr-4 py-2 text-sm text-(--text) placeholder-(--text2) focus:outline-none focus:border-(--primary)/40 transition-all"
                />
            </div>

            <select
                v-for="filter in filters"
                :key="filter.key"
                v-model="activeFilters[filter.key]"
                class="bg-(--white)/5 border border-(--white)/10 rounded-xl px-3 py-2 text-xs text-(--text) focus:outline-none focus:border-(--primary)/40 transition-all"
            >
                <option value="">{{ filter.label }} (tous)</option>
                <option v-for="opt in filter.options" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
            </select>

            <button
                v-if="hasActiveFilters"
                @click="clearFilters"
                type="button"
                class="text-xs text-(--text2) hover:text-(--text) transition-colors px-2 py-1.5 flex items-center gap-1 shrink-0"
            >
                <i class="bi bi-x-circle" /> Réinitialiser
            </button>

        </div>

        <!-- Table -->
        <div class="overflow-x-auto rounded-2xl border border-(--white)/10 bg-(--white)/5">
            <table class="w-full text-sm min-w-max">
                <thead>
                    <tr class="text-left text-(--text2) text-xs uppercase tracking-wider border-b border-(--white)/10">
                        <th
                            v-for="col in columns"
                            :key="col.key"
                            @click="col.sortable && toggleSort(col.key)"
                            class="px-4 py-3 font-bold whitespace-nowrap"
                            :class="col.sortable ? 'cursor-pointer select-none hover:text-(--text)' : ''"
                        >
                            <span class="inline-flex items-center gap-1.5">
                                {{ col.label }}
                                <i v-if="col.sortable" class="bi text-[10px]" :class="sortIcon(col.key)" />
                            </span>
                        </th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-if="sortedItems.length === 0">
                        <td :colspan="columns.length" class="px-4 py-10 text-center text-(--text2)">
                            <slot name="empty">Aucun résultat</slot>
                        </td>
                    </tr>
                    <tr
                        v-for="item in sortedItems"
                        :key="getRowKey(item)"
                        class="border-t border-(--white)/5 hover:bg-(--white)/8 transition-all"
                    >
                        <td v-for="col in columns" :key="col.key" class="px-4 py-3 text-(--text) align-middle">
                            <slot :name="`cell-${col.key}`" :item="item" :value="getValue(item, col)">
                                {{ getValue(item, col) }}
                            </slot>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>

    </div>

</template>

<script setup lang="ts" generic="T extends Record<string, any>">

import { ref, computed } from 'vue';

export interface FilterableTableColumn<T> {
    key: string;
    label: string;
    sortable?: boolean;
    // Accesseur pour la valeur brute (par défaut : item[col.key])
    accessor?: (item: T) => any;
    // Comparateur custom pour le tri (par défaut : comparaison naturelle)
    sortFn?: (a: T, b: T) => number;
}

export interface FilterableTableFilter<T> {
    key: string;
    label: string;
    options: { value: string; label: string }[];
    matchFn: (item: T, value: string) => boolean;
}

const props = defineProps<{
    items: T[];
    columns: FilterableTableColumn<T>[];
    filters?: FilterableTableFilter<T>[];
    // Prédicat de recherche custom (sinon : recherche substring sur les colonnes texte)
    searchFn?: (item: T, query: string) => boolean;
    searchPlaceholder?: string;
    itemKey?: (item: T) => string | number;
}>();

const search = ref<string>('');
const sortKey = ref<string | null>(null);
const sortDir = ref<'asc' | 'desc'>('asc');
const activeFilters = ref<Record<string, string>>({});

const hasActiveFilters = computed(() =>
    search.value.length > 0 || Object.values(activeFilters.value).some(v => !!v)
);

function clearFilters() {
    search.value = '';
    activeFilters.value = {};
}

function getValue(item: T, col: FilterableTableColumn<T>) {
    return col.accessor ? col.accessor(item) : (item as any)[col.key];
}

function getRowKey(item: T): string | number {
    if (props.itemKey) return props.itemKey(item);
    return (item as any).id ?? JSON.stringify(item);
}

function toggleSort(key: string) {
    if (sortKey.value === key) {
        sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc';
    } else {
        sortKey.value = key;
        sortDir.value = 'asc';
    }
}

function sortIcon(key: string) {
    if (sortKey.value !== key) return 'bi-arrow-down-up opacity-30';
    return sortDir.value === 'asc' ? 'bi-arrow-up' : 'bi-arrow-down';
}

const filteredItems = computed(() => {
    let result = props.items;

    if (search.value.trim()) {
        const q = search.value.trim().toLowerCase();
        result = result.filter(item => {
            if (props.searchFn) return props.searchFn(item, q);
            return props.columns.some(col => {
                const v = getValue(item, col);
                return typeof v === 'string' && v.toLowerCase().includes(q);
            });
        });
    }

    for (const filter of props.filters || []) {
        const value = activeFilters.value[filter.key];
        if (value) {
            result = result.filter(item => filter.matchFn(item, value));
        }
    }

    return result;
});

const sortedItems = computed(() => {
    if (!sortKey.value) return filteredItems.value;
    const col = props.columns.find(c => c.key === sortKey.value);
    if (!col) return filteredItems.value;

    const arr = [...filteredItems.value];
    arr.sort((a, b) => {
        let cmp: number;
        if (col.sortFn) {
            cmp = col.sortFn(a, b);
        } else {
            const av = getValue(a, col);
            const bv = getValue(b, col);
            if (av == null && bv == null) cmp = 0;
            else if (av == null) cmp = -1;
            else if (bv == null) cmp = 1;
            else if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv;
            else cmp = String(av).localeCompare(String(bv));
        }
        return sortDir.value === 'asc' ? cmp : -cmp;
    });
    return arr;
});

defineExpose({ filteredItems, sortedItems, clearFilters });

</script>

<style scoped></style>

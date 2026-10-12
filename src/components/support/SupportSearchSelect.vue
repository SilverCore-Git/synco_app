<template>

    <!-- Liste déroulante avec recherche, générique : tout endroit du SAV qui
         choisit une personne/un tag/une organisation/un filtre parmi une
         liste qui peut grandir (contrainte produit Synco : jamais une
         rangée de boutons, cf. project_synco_scale_ux). -->

    <DropDown ref="dropdownRef" align="left" content-iner-t-w="w-72 max-h-80 overflow-hidden flex flex-col p-0!">

        <template #trigger>
            <button
                type="button"
                class="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-(--border-color) bg-(--bg) text-sm text-left hover:border-(--primary)/40 transition-colors"
            >
                <span class="truncate flex items-center gap-2" :class="selected ? 'text-(--text)' : 'text-(--text2)'">
                    <span v-if="selected?.color" class="w-2.5 h-2.5 rounded-full shrink-0" :style="{ background: selected.color }" />
                    {{ selected?.label ?? placeholder }}
                </span>
                <i class="bi bi-chevron-down text-(--text2) text-xs shrink-0" />
            </button>
        </template>

        <template #content>
            <div class="flex flex-col max-h-80" @click.stop>

                <div class="p-2 border-b border-(--border-color) shrink-0">
                    <div class="relative">
                        <i class="bi bi-search absolute left-3 top-1/2 -translate-y-1/2 text-(--text2) text-xs" />
                        <input
                            v-model="search"
                            type="text"
                            :placeholder="searchPlaceholder"
                            class="w-full bg-(--bg2) border border-(--border-color) rounded-lg pl-8 pr-3 py-1.5 text-xs text-(--text) outline-none focus:border-(--primary)/50"
                            @keydown.enter="handleEnter"
                        />
                    </div>
                </div>

                <div class="flex-1 overflow-y-auto p-1">

                    <button
                        v-if="noneLabel"
                        type="button"
                        class="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-left hover:bg-(--primary)/10 transition-colors"
                        :class="modelValue == null ? 'text-(--primary) font-bold' : 'text-(--text)'"
                        @click="select(null)"
                    >
                        <i class="bi bi-slash-circle text-xs" /> {{ noneLabel }}
                    </button>

                    <button
                        v-for="opt in filtered"
                        :key="opt.id"
                        type="button"
                        class="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-left hover:bg-(--primary)/10 transition-colors"
                        :class="modelValue === opt.id ? 'text-(--primary) font-bold' : 'text-(--text)'"
                        @click="select(opt.id)"
                    >
                        <span v-if="opt.color" class="w-2.5 h-2.5 rounded-full shrink-0" :style="{ background: opt.color }" />
                        <img v-else-if="opt.avatarUrl !== undefined" :src="opt.avatarUrl || defaultAvatar(opt.label)" class="w-5 h-5 rounded-full object-cover shrink-0" />
                        <span class="truncate">{{ opt.label }}</span>
                        <span v-if="opt.sublabel" class="text-(--text2) text-xs truncate ml-auto">{{ opt.sublabel }}</span>
                    </button>

                    <p v-if="filtered.length === 0 && !noneLabel" class="text-center text-xs text-(--text2) py-4">
                        Aucun résultat.
                    </p>

                    <button
                        v-if="creatable && search.trim() && !exactMatch"
                        type="button"
                        class="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-left text-(--primary) hover:bg-(--primary)/10 transition-colors border-t border-(--border-color) mt-1"
                        @click="handleCreate"
                    >
                        <i class="bi bi-plus-circle" /> Créer « {{ search.trim() }} »
                    </button>

                </div>

            </div>
        </template>

    </DropDown>

</template>

<script lang="ts" setup generic="T extends string = string">

import { computed, ref, watch } from 'vue';
import DropDown from '@/components/DropDown.vue';
import { defaultAvatar } from '@/assets/utils/defaultAvatar';

export interface SupportSelectOption<T extends string = string> {
    id: T;
    label: string;
    sublabel?: string;
    color?: string;
    /** Présent (même vide) : affiche un avatar plutôt qu'un point de couleur. */
    avatarUrl?: string | null;
}

// Générique (T) : la plupart des appelants choisissent dans une énumération
// typée (statut, urgence…) plutôt qu'une simple chaîne — sans ça, chaque
// v-model vers un ref<SupportTicketPriority | null> par exemple aurait
// nécessité un cast manuel à chaque site d'appel.
const props = defineProps<{
    modelValue: T | null;
    options: SupportSelectOption<T>[];
    placeholder?: string;
    searchPlaceholder?: string;
    /** Option « Aucune » en tête de liste (valeur null). */
    noneLabel?: string;
    /** Propose de créer l'entrée tapée si elle ne correspond à aucune option (ex. tags). */
    creatable?: boolean;
}>();

const emit = defineEmits<{
    (e: 'update:modelValue', value: T | null): void;
    (e: 'create', label: string): void;
}>();

const dropdownRef = ref<InstanceType<typeof DropDown> | null>(null);
const search = ref('');

const selected = computed(() => props.options.find(o => o.id === props.modelValue) ?? null);

const filtered = computed(() => {
    const q = search.value.trim().toLowerCase();
    if (!q) return props.options;
    return props.options.filter(o => o.label.toLowerCase().includes(q) || o.sublabel?.toLowerCase().includes(q));
});

const exactMatch = computed(() => props.options.some(o => o.label.toLowerCase() === search.value.trim().toLowerCase()));

const select = (id: T | null) => {
    emit('update:modelValue', id);
    search.value = '';
    dropdownRef.value?.closeDropdown();
};

const handleCreate = () => {
    emit('create', search.value.trim());
    search.value = '';
    dropdownRef.value?.closeDropdown();
};

const handleEnter = () => {
    if (filtered.value.length === 1) select(filtered.value[0]!.id);
    else if (props.creatable && search.value.trim() && !exactMatch.value) handleCreate();
};

// Recherche propre à chaque ouverture.
watch(() => dropdownRef.value, () => {});

</script>

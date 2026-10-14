<template>
    <div class="flex flex-col gap-1.5 w-full shrink-0">
    <div class="relative group w-full">
        <i class="bi bi-search absolute left-3.5 top-1/2 -translate-y-1/2 text-(--text2) group-focus-within:text-(--primary) transition-all duration-300" />
        <input
            v-model="query"
            type="text"
            :placeholder="useRegex ? 'Rechercher avec une expression régulière…' : 'Rechercher une tâche…'"
            class="w-full bg-(--text)/[0.03] border rounded-xl py-2.5 pl-11 pr-24 text-sm text-(--text) placeholder:text-(--text2) focus:outline-none focus:ring-4 transition-all duration-300"
            :class="invalid ? 'border-red-500/60 focus:border-red-500/60 focus:ring-red-500/10' : 'border-(--text)/10 focus:border-(--primary)/60 focus:ring-(--primary)/10'"
        >
        <div class="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            <button
                v-if="query"
                type="button"
                @click="query = ''"
                class="w-7 h-7 flex items-center justify-center text-(--text2) hover:text-red-400 active:scale-90 transition-all"
                title="Effacer la recherche"
            >
                <i class="bi bi-x-circle-fill" />
            </button>
            <button
                type="button"
                @click="useRegex = !useRegex"
                class="h-7 px-2 rounded-lg font-mono text-xs font-bold transition-colors"
                :class="useRegex ? 'bg-(--primary)/15 text-(--primary)' : 'text-(--text2) hover:bg-(--text)/10'"
                :title="useRegex ? 'Expression régulière activée' : 'Activer la recherche par expression régulière'"
            >
                .*
            </button>
        </div>
    </div>
    <p v-if="invalid" class="text-[11px] text-red-400">Expression régulière invalide — aucun filtre de recherche appliqué.</p>
    </div>
</template>

<script setup lang="ts">
defineProps<{ invalid: boolean }>();
const query = defineModel<string>('query', { required: true });
const useRegex = defineModel<boolean>('regex', { required: true });
</script>

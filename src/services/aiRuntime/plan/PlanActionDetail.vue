<template>
    <aside class="flex flex-col gap-3 text-sm text-(--text) min-w-0" aria-label="Détail de l'action">
        <h3 class="text-base font-bold leading-snug break-words">{{ action.label }}</h3>
        <p v-if="summary" class="break-words min-w-0 rounded-lg bg-(--text)/5 px-3 py-2">{{ summary }}</p>
        <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
            <template v-for="l in lines" :key="l.field">
                <dt class="text-(--text2)">{{ l.label }}</dt>
                <dd class="break-words min-w-0" :class="l.unknown ? 'text-amber-500' : ''">{{ l.text }}</dd>
            </template>
            <dt class="text-(--text2)">Fait par</dt>
            <dd>{{ action.executor === 'device' ? 'Votre appareil, avec votre clé' : 'Synco AI, sur le runtime' }}</dd>
        </dl>
        <p v-if="needs.length"><strong>Dépend de :</strong> {{ needs.join(', ') }}</p>
        <p v-if="neededBy.length"><strong>Nécessaire à :</strong> {{ neededBy.join(', ') }}</p>
        <p v-if="stateText" class="rounded-lg bg-(--text)/5 px-3 py-2">{{ stateText }}</p>
        <p class="text-xs text-(--text2)">Les noms des espaces et des personnes sont lus dans l'annuaire de votre appareil, pas dans le texte de Synco AI.</p>
        <button
            v-if="canToggle"
            type="button"
            class="self-start mt-1 rounded-lg bg-(--text)/6 hover:bg-(--text)/10 px-3 py-2 font-medium"
            @click="emit('toggle', action.n)"
        >
            <i class="bi" :class="checked ? 'bi-x-lg' : 'bi-check-lg'" /> {{ checked ? 'Décocher cette action' : 'Cocher cette action' }}
        </button>
    </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { argLines, type NameResolver } from './planLabels';
import { summarizeTool } from '@/components/ai/summaries/summaryRegistry';
import { summaryModules } from '@/components/ai/summaries/summaryModules';
import type { PlanActionModel, PlanModel } from './planModel';
import { abandonText, STATE_TEXT, type ActionProgress } from './planProgress';

const props = defineProps<{ model: PlanModel; action: PlanActionModel; resolver: NameResolver; checked: boolean; canToggle: boolean; progress?: ActionProgress }>();
const emit = defineEmits<{ (e: 'toggle', n: number): void }>();

const lines = computed(() => argLines(props.action.args, props.resolver, props.action.argsRefs));
// Résumé du domaine (URL complète, nom du membre, niveau…), comme sur les cartes de confirmation (L15b).
const summary = computed(() => props.action.tool
    ? summarizeTool(props.action.tool, props.action.args, { userName: id => props.resolver.resolve('user', id) }, summaryModules)
    : '');
const name = (n: number) => `« ${props.model.actions[n - 1]?.label ?? n} »`;
const needs = computed(() => props.action.after.map(name));
const neededBy = computed(() => (props.model.dependents[props.action.n - 1] ?? []).map(name));
const stateText = computed(() => {
    const p = props.progress;
    if (!p || p.state === 'pending') return '';
    return p.state === 'failed' || p.state === 'skipped' ? `${STATE_TEXT[p.state]} : ${abandonText(p.code) || 'l’agent en sera informé.'}` : STATE_TEXT[p.state];
});
</script>

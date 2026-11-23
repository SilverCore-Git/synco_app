<template>
    <div class="rounded-2xl border border-(--text)/10 bg-(--bg2) p-4 text-(--text) max-w-xl">
        <div class="flex items-start gap-3">
            <div class="h-10 w-10 shrink-0 rounded-xl bg-(--primary)/15 text-(--primary) flex items-center justify-center text-lg"><i class="bi bi-diagram-3" /></div>
            <div class="min-w-0 flex-1">
                <h3 class="font-bold leading-snug">Synco AI vous propose {{ model.actions.length }} action{{ model.actions.length > 1 ? 's' : '' }}</h3>
                <p class="text-xs text-(--text2)">{{ steps }} · {{ expiry }}</p>
            </div>
        </div>

        <div class="mt-3 flex flex-wrap gap-1.5">
            <span v-for="c in chips" :key="c" class="rounded-full bg-(--text)/7 px-2.5 py-0.5 text-xs">{{ c }}</span>
            <span v-if="sensitiveCount" class="rounded-full bg-amber-500/15 text-amber-600 px-2.5 py-0.5 text-xs font-medium"><i class="bi bi-exclamation-triangle-fill" /> {{ sensitiveCount }} à vérifier</span>
        </div>
        <p class="mt-2 text-xs text-(--text2)"><i class="bi bi-laptop" /> {{ device }} sur votre appareil · <i class="bi bi-robot" /> {{ agent }} par Synco AI</p>

        <div v-if="invalid" class="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-500" role="alert">Plan illisible, refusé sans rien faire.</div>
        <div v-else-if="expired" class="mt-3 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-600"><i class="bi bi-hourglass-split" /> Plan expiré.</div>

        <template v-else-if="inline">
            <ul class="mt-3 flex flex-col gap-1">
                <li v-for="a in model.actions" :key="a.n">
                    <label class="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-(--text)/5 cursor-pointer">
                        <input type="checkbox" class="h-4 w-4 accent-(--primary)" :checked="sel.checked.has(a.n)" :disabled="offline" @change="toggle(a.n)" />
                        <span class="min-w-0 flex-1 text-sm break-words" :class="dropped(a.n) ? 'line-through opacity-60' : ''">{{ a.label }}</span>
                        <span class="text-[11px] text-(--text2) shrink-0">{{ a.executor === 'device' ? 'Votre appareil' : 'Synco AI' }}</span>
                    </label>
                    <p v-if="result.ignoredBecause.has(a.n)" class="pl-9 text-xs text-amber-600">Ignorée : « {{ label(result.ignoredBecause.get(a.n)!) }} » est décochée</p>
                </li>
            </ul>
            <div class="mt-3 flex flex-wrap items-center gap-2">
                <button type="button" class="text-xs text-(--text2) underline mr-auto" @click="emit('review')">Voir le graphe</button>
                <span v-if="offline" class="text-xs text-(--text2)">Reconnectez-vous pour décider</span>
                <button type="button" class="rounded-lg bg-red-500/10 text-red-500 px-3 py-1.5 text-sm font-semibold disabled:opacity-50" :disabled="offline" @click="emit('reject')">Refuser</button>
                <button type="button" class="rounded-lg bg-(--primary) text-white px-3 py-1.5 text-sm font-semibold disabled:opacity-40" :disabled="offline || !result.canAccept" @click="accept">
                    Accepter {{ result.accepted.length }} action{{ result.accepted.length > 1 ? 's' : '' }}
                </button>
            </div>
        </template>

        <button v-else type="button" class="mt-3 w-full rounded-lg bg-(--primary) text-white px-3 py-2 text-sm font-semibold" @click="emit('review')">
            <i class="bi bi-diagram-3" /> Examiner et valider
        </button>
    </div>
</template>

<script setup lang="ts">
import { computed, toRef, watch } from 'vue';
import { isSmallPlan, type PlanModel } from './planModel';
import { kindChip } from './planLabels';
import { usePlanSelection } from './usePlanSelection';

const props = defineProps<{ model: PlanModel; offline?: boolean; expired?: boolean; invalid?: boolean }>();
const emit = defineEmits<{ (e: 'accept', accepted: number[]): void; (e: 'reject' | 'review'): void }>();

const { sel, result, toggle, reset } = usePlanSelection(toRef(props, 'model'));
// Le plan affiché peut changer entre deux rendus : la sélection repart de zéro et PC76 est réévalué.
watch(() => props.model, reset);

/** PC76 : validation sur place seulement pour 5 actions au plus, aucune sensible. */
const inline = computed(() => isSmallPlan(props.model));
const dropped = (n: number) => !sel.value.checked.has(n) || result.value.ignoredBecause.has(n);
const label = (n: number) => props.model.actions[n - 1]?.label ?? String(n);
/** Revalide la règle au moment de décider : un plan devenu grand ou sensible ne part jamais d'ici. */
const accept = () => { if (isSmallPlan(props.model) && result.value.canAccept) emit('accept', result.value.accepted); else emit('review'); };

const steps = computed(() => `${props.model.maxLevel} étape${props.model.maxLevel > 1 ? 's' : ''}`);
const expiry = computed(() => (props.model.expiresAt ? `${props.expired ? 'expiré' : 'expire'} le ${new Date(props.model.expiresAt).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''));
const sensitiveCount = computed(() => props.model.actions.filter(a => a.sensitive).length);
const device = computed(() => props.model.actions.filter(a => a.executor === 'device').length);
const agent = computed(() => props.model.actions.length - device.value);
const chips = computed(() => {
    const counts = new Map<string, { kind: string; tool?: string; n: number }>();
    for (const a of props.model.actions) {
        const k = `${a.kind}:${a.tool ?? ''}`;
        const c = counts.get(k) ?? { kind: a.kind, tool: a.tool, n: 0 };
        c.n++;
        counts.set(k, c);
    }
    return [...counts.values()].map(c => kindChip(c.kind, c.tool, c.n));
});
</script>

<template>
    <div class="relative" :style="{ width: layout.width + 'px', height: layout.height + 'px' }">
        <svg class="absolute inset-0 pointer-events-none" :width="layout.width" :height="layout.height" aria-hidden="true">
            <path v-for="l in links" :key="`${l.from}-${l.to}`" :d="l.d" fill="none" stroke="currentColor" stroke-width="1.5" class="text-(--text)/20" />
        </svg>
        <template v-for="b in layout.bands" :key="b.id">
            <div
                class="absolute rounded-2xl"
                :class="b.kind === 'sensitive' ? 'bg-amber-500/10 border border-amber-500/40' : 'bg-(--text)/4'"
                :style="{ left: b.x + 'px', top: b.y + 'px', width: b.w + 'px', height: b.h + 'px' }"
            >
                <button
                    type="button"
                    class="flex items-center gap-2 px-3.5 h-[34px] text-sm font-bold text-(--text) max-w-full"
                    :class="b.kind === 'sensitive' ? 'text-amber-600 cursor-default' : ''"
                    :aria-expanded="!b.collapsed"
                    @click="b.kind !== 'sensitive' && emit('toggleBand', b.id)"
                >
                    <i class="bi" :class="b.kind === 'sensitive' ? 'bi-exclamation-triangle-fill' : b.collapsed ? 'bi-chevron-right' : 'bi-chevron-down'" />
                    <span class="truncate">{{ b.label }}</span>
                    <span class="font-normal text-(--text2) shrink-0">· {{ b.members.length }} action{{ b.members.length > 1 ? 's' : '' }}</span>
                </button>
                <p v-if="b.collapsed" class="px-3.5 text-xs text-(--text2)">{{ bandSummary(b.members) }}</p>
            </div>
        </template>
        <div v-for="n in nodeList" :key="n.n" class="absolute" :style="{ left: n.x + 'px', top: n.y + 'px', width: n.w + 'px', height: n.h + 'px' }">
            <PlanActionCard
                :model="model"
                :action="model.actions[n.n - 1]!"
                :mode="mode"
                :checked="checked.has(n.n)"
                :interactive="interactive"
                :ignored-because="causeLabel(n.n)"
                :state="progress?.get(n.n)?.state"
                :selected="selected === n.n"
                @toggle="emit('toggle', $event)"
                @select="emit('select', $event)"
            />
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import PlanActionCard from './PlanActionCard.vue';
import { countChecked, graphLinks, layoutGraph, type PlanModel } from './planModel';
import type { ActionProgress } from './planProgress';

const props = defineProps<{
    model: PlanModel;
    mode: 'select' | 'follow';
    checked: ReadonlySet<number>;
    ignored: ReadonlyMap<number, number>;
    progress?: ReadonlyMap<number, ActionProgress>;
    selected: number | null;
    interactive: boolean;
    expanded: ReadonlySet<string>;
}>();
const emit = defineEmits<{ (e: 'toggle' | 'select', n: number): void; (e: 'toggleBand', id: string): void }>();

const layout = computed(() => layoutGraph(props.model, props.expanded));
const nodeList = computed(() => [...layout.value.nodes.values()]);
const links = computed(() => graphLinks(props.model, layout.value));
const causeLabel = (n: number): string | undefined => {
    const c = props.ignored.get(n);
    return c === undefined ? undefined : `« ${props.model.actions[c - 1]?.label ?? c} » est décochée`;
};
const bandSummary = (members: number[]): string => {
    if (!props.progress) {
        const n = countChecked(members, props.checked, props.ignored);
        return `${members.length} actions, ${n} action${n > 1 ? 's' : ''} cochée${n > 1 ? 's' : ''}. Déroulez pour les voir.`;
    }
    const c = { done: 0, failed: 0, executing: 0 };
    for (const n of members) { const s = props.progress.get(n)?.state; if (s === 'done') c.done++; else if (s === 'failed') c.failed++; else if (s === 'executing') c.executing++; }
    return `${c.done} faite(s) · ${c.executing} en cours · ${c.failed} échec(s)`;
};
</script>

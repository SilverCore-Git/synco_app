<template>
    <div class="flex flex-col gap-4">
        <section v-for="lvl in levels" :key="lvl.level">
            <h3 class="text-sm font-bold text-(--text) mb-2">{{ levelTitle(lvl.level) }}</h3>
            <ul class="flex flex-col gap-2">
                <li v-for="a in lvl.actions" :key="a.n">
                    <button
                        type="button"
                        class="w-full text-left flex items-center gap-3 rounded-xl border bg-(--bg) px-3 py-3 min-h-12"
                        :class="a.sensitive ? 'border-amber-500/50 bg-amber-500/5' : 'border-(--text)/10'"
                        @click="emit('select', a.n)"
                    >
                        <input
                            v-if="mode === 'select'"
                            type="checkbox"
                            class="h-5 w-5 shrink-0 accent-(--primary)"
                            :checked="checked.has(a.n)"
                            :disabled="!interactive"
                            :aria-label="`Inclure : ${a.label}`"
                            @click.stop
                            @change="emit('toggle', a.n)"
                        />
                        <i v-else class="bi shrink-0" :class="stateIcon(a.n)" />
                        <span class="min-w-0 flex-1">
                            <span class="block text-sm font-semibold text-(--text) break-words" :class="dropped(a.n) ? 'line-through opacity-60' : ''">{{ a.label }}</span>
                            <span class="block text-xs text-(--text2) truncate">{{ a.sensitive ? 'À vérifier · ' : '' }}{{ a.executor === 'device' ? 'Votre appareil' : 'Synco AI' }}{{ ignored.has(a.n) ? ' · ignorée' : '' }}</span>
                        </span>
                        <i class="bi bi-chevron-right text-(--text2)" />
                    </button>
                </li>
            </ul>
        </section>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { levelTitle, type PlanModel } from './planModel';
import type { ActionProgress } from './planProgress';

const props = defineProps<{
    model: PlanModel;
    mode: 'select' | 'follow';
    checked: ReadonlySet<number>;
    ignored: ReadonlyMap<number, number>;
    progress?: ReadonlyMap<number, ActionProgress>;
    interactive: boolean;
}>();
const emit = defineEmits<{ (e: 'toggle' | 'select', n: number): void }>();

const levels = computed(() => {
    const out: { level: number; actions: PlanModel['actions'] }[] = [];
    for (let l = 1; l <= props.model.maxLevel; l++) out.push({ level: l, actions: props.model.actions.filter(a => a.level === l) });
    return out.filter(l => l.actions.length > 0);
});
const dropped = (n: number) => (props.mode === 'select' ? !props.checked.has(n) || props.ignored.has(n) : ['removed', 'skipped'].includes(props.progress?.get(n)?.state ?? ''));
const stateIcon = (n: number): string => {
    switch (props.progress?.get(n)?.state) {
        case 'executing': return 'bi-arrow-repeat animate-spin text-(--primary)';
        case 'done': return 'bi-check-circle-fill text-emerald-500';
        case 'failed': return 'bi-x-circle-fill text-red-500';
        case 'skipped': case 'removed': return 'bi-slash-circle text-(--text2)';
        default: return 'bi-circle text-(--text2)';
    }
};
</script>

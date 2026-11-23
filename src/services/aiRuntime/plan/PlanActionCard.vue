<template>
    <div
        class="h-full flex flex-col rounded-xl border bg-(--bg) px-3 py-2.5 cursor-pointer transition-colors min-w-0"
        :class="[
            selected ? 'border-(--primary) ring-2 ring-(--primary)/30' : action.sensitive ? 'border-amber-500/50 bg-amber-500/5' : 'border-(--text)/10 hover:border-(--text)/25',
            dim ? 'opacity-55' : '',
        ]"
        role="button"
        tabindex="0"
        :aria-pressed="selected"
        @click="emit('select', action.n)"
        @keydown.enter.prevent="emit('select', action.n)"
        @keydown.space.prevent="emit('select', action.n)"
    >
        <div class="flex items-start gap-2 min-w-0">
            <input
                v-if="mode === 'select'"
                type="checkbox"
                class="mt-0.5 h-4 w-4 shrink-0 accent-(--primary)"
                :checked="checked"
                :disabled="!interactive"
                :aria-label="`Inclure : ${action.label}`"
                @click.stop
                @change="emit('toggle', action.n)"
            />
            <span v-else class="mt-0.5 w-4 shrink-0 flex justify-center" :title="STATE_TEXT[state]">
                <i v-if="state === 'executing'" class="bi bi-arrow-repeat animate-spin text-(--primary)" />
                <i v-else-if="state === 'done'" class="bi bi-check-circle-fill text-emerald-500" />
                <i v-else-if="state === 'failed'" class="bi bi-x-circle-fill text-red-500" />
                <i v-else-if="state === 'unknown_outcome'" class="bi bi-question-circle-fill text-amber-500" />
                <i v-else-if="state === 'skipped' || state === 'removed'" class="bi bi-slash-circle text-(--text2)" />
                <i v-else class="bi bi-circle text-(--text2)" />
            </span>
            <i class="bi shrink-0 mt-0.5" :class="[KIND_ICON[action.kind] ?? 'bi-question-circle', action.sensitive ? 'text-amber-500' : 'text-(--primary)']" />
            <span class="text-sm font-semibold leading-snug text-(--text) break-words min-w-0" :class="struck ? 'line-through' : ''">{{ action.label }}</span>
        </div>
        <div v-if="action.place" class="mt-1 pl-6 text-xs truncate" :class="action.place.unknown ? 'text-amber-500' : 'text-(--text2)'">{{ action.place.text }}</div>
        <div class="mt-auto pt-1.5 pl-6 flex items-center justify-between gap-2 text-[11px] text-(--text2) min-w-0">
            <span class="shrink-0"><i class="bi" :class="action.executor === 'device' ? 'bi-laptop' : 'bi-robot'" /> {{ action.executor === 'device' ? 'Votre appareil' : 'Synco AI' }}</span>
            <span class="truncate" :title="note">{{ note }}</span>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { KIND_ICON } from './planLabels';
import { dependsText, type PlanActionModel, type PlanModel } from './planModel';
import { STATE_TEXT, type ViewState } from './planProgress';

const props = defineProps<{
    model: PlanModel;
    action: PlanActionModel;
    mode: 'select' | 'follow';
    checked?: boolean;
    interactive?: boolean;
    /** Libellé de l'action dont le retrait écarte celle-ci (cascade). */
    ignoredBecause?: string;
    state?: ViewState;
    selected?: boolean;
}>();
const emit = defineEmits<{ (e: 'toggle' | 'select', n: number): void }>();

const state = computed<ViewState>(() => props.state ?? 'pending');
const struck = computed(() => (props.mode === 'select' ? !props.checked || !!props.ignoredBecause : state.value === 'removed' || state.value === 'skipped'));
const dim = computed(() => struck.value);
const note = computed(() => {
    if (props.mode === 'select') {
        if (props.ignoredBecause) return `Ignorée : ${props.ignoredBecause}`;
        if (props.action.sensitive && !props.checked) return 'Non cochée';
        return dependsText(props.model, props.action);
    }
    return state.value === 'pending' ? dependsText(props.model, props.action) : STATE_TEXT[state.value];
});
</script>

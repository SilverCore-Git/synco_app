<template>
    <div ref="root" class="relative inline-block">
        <button type="button" class="picker-trigger" :disabled="disabled" @click="toggle">
            <i class="bi bi-plus-lg"></i> {{ label }}
        </button>

        <Transition name="fade">
            <div v-if="open" class="picker-panel" role="dialog" aria-label="Ajouter une personne">
                <div class="flex items-center gap-2 sm:hidden px-3 pt-3">
                    <button type="button" class="p-2 -ml-2 text-(--text2)" aria-label="Fermer" @click="open = false"><i class="bi bi-arrow-left text-lg"></i></button>
                    <span class="font-bold text-sm">Ajouter une personne</span>
                </div>
                <div class="p-3">
                    <div class="relative">
                        <i class="bi bi-search absolute left-3 top-1/2 -translate-y-1/2 text-(--text2) text-sm"></i>
                        <input ref="input" v-model="query" type="text" class="picker-input" placeholder="Rechercher un nom ou un e-mail" autocomplete="off"
                            @keydown.down.prevent="move(1)" @keydown.up.prevent="move(-1)" @keydown.enter.prevent="pickActive" @keydown.esc.stop="open = false" />
                    </div>
                </div>
                <ul class="px-2 pb-1 max-sm:flex-1 max-sm:overflow-y-auto" role="listbox">
                    <li v-for="(p, i) in results.people" :key="p.userId" role="option" :aria-selected="i === active">
                        <button type="button" class="picker-row" :class="i === active ? 'picker-row-active' : ''" @mouseenter="active = i" @click="pick(p.userId)">
                            <img :src="p.avatar" alt="" class="w-7 h-7 rounded-full object-cover shrink-0" />
                            <span class="flex-1 min-w-0 truncate text-left font-medium">{{ p.name }}</span>
                            <span class="text-xs text-(--text2) truncate max-w-32">{{ p.role }}</span>
                        </button>
                    </li>
                    <li v-if="!results.people.length" class="px-3 py-4 text-sm text-(--text2)">Personne ne correspond.</li>
                </ul>
                <p class="px-4 py-3 text-xs text-(--text2)">
                    {{ results.total }} résultat{{ results.total > 1 ? 's' : '' }} sur {{ total }} membres · tapez pour affiner
                </p>
            </div>
        </Transition>
    </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { orgMemberCount, searchPeople } from './policyMembers';

const props = defineProps<{ exclude: ReadonlySet<string>; disabled?: boolean; label?: string }>();
const emit = defineEmits<{ pick: [userId: string] }>();

const label = computed(() => props.label ?? 'Ajouter une personne');
const open = ref(false);
const query = ref('');
const active = ref(0);
const root = ref<HTMLElement | null>(null);
const input = ref<HTMLInputElement | null>(null);

const results = computed(() => searchPeople(query.value, props.exclude));
const total = computed(() => orgMemberCount());
watch(query, () => { active.value = 0; });

const toggle = async () => {
    open.value = !open.value;
    if (open.value) {
        query.value = '';
        active.value = 0;
        await nextTick();
        input.value?.focus();
    }
};
const move = (d: number) => {
    const n = results.value.people.length;
    if (n) active.value = (active.value + d + n) % n;
};
const pick = (userId: string) => {
    emit('pick', userId);
    open.value = false;
};
const pickActive = () => {
    const p = results.value.people[active.value];
    if (p) pick(p.userId);
};

const onDown = (e: MouseEvent) => {
    if (open.value && root.value && !root.value.contains(e.target as Node)) open.value = false;
};
onMounted(() => document.addEventListener('mousedown', onDown));
onBeforeUnmount(() => document.removeEventListener('mousedown', onDown));
</script>

<style scoped>
.picker-trigger {
    display: inline-flex; align-items: center; gap: 0.5rem;
    padding: 0.4rem 0.9rem; border-radius: 999px; font-size: 0.8rem; font-weight: 600;
    color: var(--primary); border: 1px solid color-mix(in srgb, var(--primary) 45%, transparent);
    background: transparent; transition: background 0.15s;
}
.picker-trigger:hover:not(:disabled) { background: color-mix(in srgb, var(--primary) 8%, transparent); }
.picker-trigger:disabled { opacity: 0.5; cursor: not-allowed; }
.picker-panel {
    position: absolute; z-index: 40; top: calc(100% + 0.5rem); left: 0; width: 24rem; max-width: 90vw;
    background: var(--bg); border: 1px solid var(--border-color); border-radius: 1rem;
    box-shadow: 0 18px 40px -12px rgb(0 0 0 / 0.35);
}
@media (max-width: 639px) {
    .picker-panel { position: fixed; inset: 0; width: auto; max-width: none; border-radius: 0; display: flex; flex-direction: column; z-index: 3000; }
}
.picker-input {
    width: 100%; padding: 0.55rem 0.75rem 0.55rem 2.2rem; border-radius: 0.75rem; font-size: 0.875rem;
    background: var(--bg2); border: 1px solid var(--border-color); color: var(--text); outline: none;
}
.picker-input:focus { border-color: var(--primary); }
.picker-row {
    display: flex; align-items: center; gap: 0.7rem; width: 100%; padding: 0.5rem 0.6rem;
    border-radius: 0.7rem; font-size: 0.875rem; color: var(--text);
}
.picker-row-active { background: color-mix(in srgb, var(--primary) 12%, transparent); color: var(--primary); }
</style>

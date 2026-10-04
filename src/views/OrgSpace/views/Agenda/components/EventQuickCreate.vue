<template>
    <Teleport to="body">
        <div v-if="visible" class="quick-create-catcher" @mousedown.self="emit('close')">
            <div class="quick-create-card" :style="cardStyle" @mousedown.stop>
                <div class="quick-create-header">
                    <span class="quick-create-date">{{ rangeLabel }}</span>
                    <button class="quick-create-close" @click="emit('close')"><i class="bi bi-x-lg"></i></button>
                </div>

                <input
                    ref="titleInput"
                    v-model="title"
                    type="text"
                    class="quick-create-title"
                    placeholder="Ajouter un titre"
                    @keydown.enter.prevent="save"
                    @keydown.esc="emit('close')"
                />

                <label class="quick-create-allday">
                    <input type="checkbox" v-model="allDay" class="w-3.5 h-3.5 accent-(--primary)" />
                    <span>Journée entière</span>
                </label>

                <div class="quick-create-footer">
                    <button type="button" class="quick-create-more" @click="emit('more-options', currentRange)">
                        Plus d'options
                    </button>
                    <button type="button" class="quick-create-save" :disabled="saving" @click="save">
                        <span v-if="saving" class="w-3.5 h-3.5 border-2 border-(--text)/40 border-t-white rounded-full animate-spin"></span>
                        <template v-else>Enregistrer</template>
                    </button>
                </div>
            </div>
        </div>
    </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useAgenda } from '@/composables/useAgenda';

interface Range {
    start: Date;
    end: Date;
    allDay?: boolean;
}

const props = defineProps<{
    visible: boolean;
    orgId: string;
    range: Range | null;
    anchor: { x: number; y: number } | null;
}>();

const emit = defineEmits<{
    close: [];
    created: [];
    'more-options': [range: Range];
}>();

const { createEvent } = useAgenda();

const title = ref('');
const allDay = ref(false);
const saving = ref(false);
const titleInput = ref<HTMLInputElement | null>(null);

watch(() => props.visible, async (v) => {
    if (!v) return;
    title.value = '';
    allDay.value = !!props.range?.allDay;
    saving.value = false;
    await nextTick();
    titleInput.value?.focus();
});

const currentRange = computed<Range>(() => ({
    start: props.range?.start || new Date(),
    end: props.range?.end || new Date(Date.now() + 30 * 60000),
    allDay: allDay.value
}));

const rangeLabel = computed(() => {
    if (!props.range) return '';
    const { start, end } = props.range;
    const sameDay = start.toDateString() === end.toDateString();
    const dayFmt = (d: Date) => d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
    const timeFmt = (d: Date) => d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

    if (allDay.value) {
        return sameDay ? dayFmt(start) : `${dayFmt(start)} → ${dayFmt(end)}`;
    }
    if (sameDay) return `${dayFmt(start)} · ${timeFmt(start)} – ${timeFmt(end)}`;
    return `${dayFmt(start)} ${timeFmt(start)} → ${dayFmt(end)} ${timeFmt(end)}`;
});

const cardStyle = computed(() => {
    const CARD_WIDTH = 300;
    const CARD_HEIGHT = 190;
    const margin = 12;
    let x = props.anchor?.x ?? window.innerWidth / 2 - CARD_WIDTH / 2;
    let y = props.anchor?.y ?? window.innerHeight / 2 - CARD_HEIGHT / 2;

    x = Math.min(Math.max(margin, x), window.innerWidth - CARD_WIDTH - margin);
    y = Math.min(Math.max(margin, y), window.innerHeight - CARD_HEIGHT - margin);

    return { left: `${x}px`, top: `${y}px` };
});

async function save() {
    if (saving.value) return;
    saving.value = true;
    try {
        const r = currentRange.value;
        const created = await createEvent(props.orgId, {
            title: title.value.trim() || 'Nouvel événement',
            startAt: r.start.toISOString(),
            endAt: r.end.toISOString(),
            allDay: r.allDay
        });
        if (created) emit('created');
    } finally {
        saving.value = false;
    }
}
</script>

<style scoped>
.quick-create-catcher {
    position: fixed;
    inset: 0;
    z-index: 1900;
}

.quick-create-card {
    position: fixed;
    width: 300px;
    background: var(--bg);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 1rem;
    box-shadow: 0 20px 45px rgba(0, 0, 0, 0.35);
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    animation: quick-create-pop 0.12s ease-out;
}

@keyframes quick-create-pop {
    from { opacity: 0; transform: scale(0.96); }
    to { opacity: 1; transform: scale(1); }
}

.quick-create-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
}

.quick-create-date {
    font-size: 11px;
    font-weight: 700;
    color: var(--text2);
    text-transform: capitalize;
}

.quick-create-close {
    color: var(--text2);
    padding: 2px;
}

.quick-create-close:hover {
    color: var(--text);
}

.quick-create-title {
    width: 100%;
    background: transparent;
    border: none;
    border-bottom: 1.5px solid var(--border-color);
    padding: 4px 2px 8px;
    font-size: 15px;
    font-weight: 700;
    color: var(--text);
}

.quick-create-title:focus {
    outline: none;
    border-bottom-color: var(--primary);
}

.quick-create-allday {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--text2);
    cursor: pointer;
    width: fit-content;
}

.quick-create-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 4px;
}

.quick-create-more {
    font-size: 11px;
    font-weight: 700;
    color: var(--text2);
}

.quick-create-more:hover {
    color: var(--primary);
}

.quick-create-save {
    background: var(--primary);
    color: white;
    font-size: 12px;
    font-weight: 700;
    padding: 6px 14px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    gap: 6px;
}

.quick-create-save:hover {
    filter: brightness(1.08);
}

.quick-create-save:disabled {
    opacity: 0.7;
}
</style>

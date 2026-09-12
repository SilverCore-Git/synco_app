<template>
    <Popup :is-open="show" @close="emit('close')">
        <template #title>
            <div class="flex items-center gap-2">
                <i class="bi bi-calendar-event text-(--primary)"></i>
                <span>{{ mode === 'create' ? 'Nouvel événement' : "Modifier l'événement" }}</span>
            </div>
        </template>

        <div v-if="loadingDetails" class="flex items-center justify-center py-16 w-full sm:w-[560px]">
            <div class="w-8 h-8 border-4 border-(--primary)/30 border-t-(--primary) rounded-full animate-spin"></div>
        </div>

        <form v-else @submit.prevent="handleSave()" class="space-y-5 w-full max-w-full sm:w-[560px]">

            <!-- RSVP -->
            <div v-if="showRsvp" class="flex items-center justify-between gap-3 bg-(--bg2)/50 border border-(--border-color) rounded-xl px-4 py-3">
                <span class="text-xs font-bold text-(--text2) uppercase tracking-wider">Votre réponse</span>
                <div class="flex gap-2">
                    <button type="button" @click="setRsvp('ACCEPTED')" class="rsvp-btn" :class="{ 'rsvp-active-accepted': myAttendee?.status === 'ACCEPTED' }">
                        <i class="bi bi-check-lg"></i> Accepter
                    </button>
                    <button type="button" @click="setRsvp('TENTATIVE')" class="rsvp-btn" :class="{ 'rsvp-active-tentative': myAttendee?.status === 'TENTATIVE' }">
                        <i class="bi bi-question-lg"></i> Peut-être
                    </button>
                    <button type="button" @click="setRsvp('DECLINED')" class="rsvp-btn" :class="{ 'rsvp-active-declined': myAttendee?.status === 'DECLINED' }">
                        <i class="bi bi-x-lg"></i> Décliner
                    </button>
                </div>
            </div>

            <div class="flex flex-col gap-2">
                <label class="text-xs font-bold text-(--text2) uppercase tracking-wider">Titre</label>
                <input
                    v-model="title"
                    type="text"
                    placeholder="Ex: Réunion d'équipe"
                    class="field-input"
                    required
                />
            </div>

            <div class="flex flex-col gap-2">
                <label class="text-xs font-bold text-(--text2) uppercase tracking-wider">Description (optionnel)</label>
                <textarea v-model="description" rows="2" placeholder="Détails de l'événement..." class="field-input resize-none"></textarea>
            </div>

            <div class="flex flex-col gap-2">
                <label class="text-xs font-bold text-(--text2) uppercase tracking-wider">Lieu (optionnel)</label>
                <input v-model="location" type="text" placeholder="Ex: Salle B / Visio" class="field-input" />
            </div>

            <label class="flex items-center gap-3 cursor-pointer w-fit">
                <input type="checkbox" v-model="allDay" class="w-4 h-4 accent-(--primary)" />
                <span class="text-sm font-medium text-(--text)">Journée entière</span>
            </label>

            <div class="grid grid-cols-2 gap-4">
                <div class="flex flex-col gap-2">
                    <label class="text-xs font-bold text-(--text2) uppercase tracking-wider">Début</label>
                    <div class="flex gap-2">
                        <input v-model="startDate" type="date" class="field-input" required />
                        <input v-if="!allDay" v-model="startTime" type="time" class="field-input w-28" />
                    </div>
                </div>
                <div class="flex flex-col gap-2">
                    <label class="text-xs font-bold text-(--text2) uppercase tracking-wider">Fin</label>
                    <div class="flex gap-2">
                        <input v-model="endDate" type="date" class="field-input" />
                        <input v-if="!allDay" v-model="endTime" type="time" class="field-input w-28" />
                    </div>
                </div>
            </div>

            <!-- Récurrence -->
            <div class="flex flex-col gap-3 border-t border-(--border-color) pt-4">
                <label class="text-xs font-bold text-(--text2) uppercase tracking-wider">Récurrence</label>
                <select v-model="freq" class="field-input" :disabled="mode === 'edit' && scopeLocked">
                    <option value="NONE">Ne se répète pas</option>
                    <option value="DAILY">Quotidien</option>
                    <option value="WEEKLY">Hebdomadaire</option>
                    <option value="MONTHLY">Mensuel</option>
                    <option value="YEARLY">Annuel</option>
                </select>

                <template v-if="freq !== 'NONE'">
                    <div class="flex items-center gap-2 text-sm text-(--text)">
                        <span>Tous les</span>
                        <input v-model.number="interval" type="number" min="1" class="field-input w-20" />
                        <span>{{ freqUnitLabel }}</span>
                    </div>

                    <div class="flex flex-col gap-2">
                        <span class="text-xs font-bold text-(--text2) uppercase tracking-wider">Fin de la récurrence</span>
                        <div class="flex flex-wrap items-center gap-3">
                            <label class="flex items-center gap-2 cursor-pointer">
                                <input type="radio" value="NEVER" v-model="endType" class="accent-(--primary)" />
                                <span class="text-sm text-(--text)">Jamais</span>
                            </label>
                            <label class="flex items-center gap-2 cursor-pointer">
                                <input type="radio" value="ON_DATE" v-model="endType" class="accent-(--primary)" />
                                <span class="text-sm text-(--text)">Le</span>
                                <input v-model="untilDate" type="date" class="field-input" :disabled="endType !== 'ON_DATE'" />
                            </label>
                            <label class="flex items-center gap-2 cursor-pointer">
                                <input type="radio" value="AFTER_COUNT" v-model="endType" class="accent-(--primary)" />
                                <span class="text-sm text-(--text)">Après</span>
                                <input v-model.number="count" type="number" min="1" class="field-input w-16" :disabled="endType !== 'AFTER_COUNT'" />
                                <span class="text-sm text-(--text)">occurrences</span>
                            </label>
                        </div>
                    </div>
                </template>
            </div>

            <!-- Invités -->
            <div class="flex flex-col gap-2 border-t border-(--border-color) pt-4">
                <label class="text-xs font-bold text-(--text2) uppercase tracking-wider">Invités</label>
                <div class="relative">
                    <i class="bi bi-search absolute left-3 top-1/2 -translate-y-1/2 text-(--text2) text-sm"></i>
                    <input v-model="attendeeSearch" placeholder="Rechercher une personne..." class="field-input pl-9" />
                </div>
                <div class="bg-(--bg2)/30 border border-white/10 rounded-xl p-3 max-h-36 overflow-y-auto space-y-2">
                    <label v-for="member in filteredAttendeeMembers" :key="member.userId" class="flex items-center gap-3 cursor-pointer group">
                        <input type="checkbox" :value="member.userId" v-model="attendeeIds" class="w-4 h-4 rounded accent-(--primary)" />
                        <img v-if="member.user?.avatarUrl" :src="member.user.avatarUrl" class="w-6 h-6 rounded-full object-cover">
                        <div v-else class="w-6 h-6 rounded-full bg-(--primary)/20 text-(--primary) flex items-center justify-center text-[10px] font-bold">
                            {{ ($p(member.user?.name) || member.userId).substring(0, 2).toUpperCase() }}
                        </div>
                        <span class="text-sm font-medium text-(--text) group-hover:text-white transition-colors">
                            {{ $p(member.user?.name) || member.userId }}
                        </span>
                    </label>
                    <div v-if="filteredAttendeeMembers.length === 0" class="text-xs text-center text-(--text2) py-2">Aucun résultat</div>
                </div>
            </div>

            <!-- Rappels -->
            <div class="flex flex-col gap-2 border-t border-(--border-color) pt-4">
                <label class="text-xs font-bold text-(--text2) uppercase tracking-wider">Mes rappels</label>
                <div class="flex flex-wrap gap-2" v-if="currentReminders.length > 0">
                    <span v-for="r in currentReminders" :key="r.id" class="reminder-chip">
                        {{ formatMinutes(r.minutesBefore) }}
                        <button type="button" @click="removeReminderItem(r)"><i class="bi bi-x-lg"></i></button>
                    </span>
                </div>
                <div class="flex gap-2">
                    <select v-model="newReminderPreset" class="field-input">
                        <option :value="10">10 minutes avant</option>
                        <option :value="30">30 minutes avant</option>
                        <option :value="60">1 heure avant</option>
                        <option :value="1440">1 jour avant</option>
                        <option value="custom">Personnalisé...</option>
                    </select>
                    <input v-if="newReminderPreset === 'custom'" v-model.number="customReminderMinutes" type="number" min="1" placeholder="Minutes" class="field-input w-28" />
                    <button type="button" @click="addReminderItem" class="default !text-xs shrink-0">
                        <i class="bi bi-plus-lg"></i> Ajouter
                    </button>
                </div>
            </div>
        </form>

        <template #footer>
            <div class="flex flex-col sm:flex-row gap-3 w-full sm:justify-between">
                <div class="flex gap-2">
                    <template v-if="mode === 'edit'">
                        <button v-if="isRecurringSeries" type="button" @click="askCancelOccurrence" class="danger !text-xs" :disabled="saving">
                            Annuler cette occurrence
                        </button>
                        <button v-if="isRecurringSeries" type="button" @click="askDeleteSeries" class="danger !text-xs" :disabled="saving">
                            Supprimer toute la série
                        </button>
                        <button v-else type="button" @click="askDeleteSingle" class="danger !text-xs" :disabled="saving">
                            Supprimer
                        </button>
                    </template>
                </div>

                <div class="flex gap-2 justify-end">
                    <button type="button" @click="emit('close')" class="default" :disabled="saving">Annuler</button>

                    <template v-if="mode === 'edit' && isRecurringSeries">
                        <button
                            type="button"
                            @click="handleSave('occurrence')"
                            class="primary"
                            :class="[saving ? 'loader' : '', !title.trim() ? 'opacity-50 pointer-events-none' : '']"
                            :disabled="saving || !title.trim()"
                        >
                            Modifier cette occurrence
                        </button>
                        <button
                            type="button"
                            @click="handleSave('series')"
                            class="primary"
                            :class="[saving ? 'loader' : '', !title.trim() ? 'opacity-50 pointer-events-none' : '']"
                            :disabled="saving || !title.trim()"
                        >
                            Modifier toute la série
                        </button>
                    </template>
                    <button
                        v-else
                        type="button"
                        @click="handleSave('series')"
                        class="primary"
                        :class="[saving ? 'loader' : '', !title.trim() ? 'opacity-50 pointer-events-none' : '']"
                        :disabled="saving || !title.trim()"
                    >
                        {{ mode === 'create' ? 'Créer' : 'Enregistrer' }}
                    </button>
                </div>
            </div>
        </template>
    </Popup>

    <ConfirmDelete
        :show="showDeleteConfirm"
        :item-type="deleteItemType"
        :item-name="title || occurrence?.title || ''"
        :extra-warning="deleteExtraWarning"
        :loading="deleting"
        @cancel="showDeleteConfirm = false"
        @confirm="confirmDelete"
    />
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import Popup from '@/components/Popup.vue';
import ConfirmDelete from '@/components/common/ConfirmDelete.vue';
import { openedOrg, user } from '@/assets/var';
import { useAgenda } from '@/composables/useAgenda';
import type { OrgMember } from '@/types/types';
import type {
    OccurrenceInstance,
    RecurrenceFreq,
    RsvpStatus,
    CreateEventDTO,
    UpdateEventDTO,
    EventReminder
} from '@/types/agenda';

const props = defineProps<{
    show: boolean;
    orgId: string;
    occurrence?: OccurrenceInstance | null;
    initialDate?: Date | null;
}>();

const emit = defineEmits<{
    close: [];
    saved: [];
    deleted: [];
}>();

const {
    currentEvent,
    getEvent,
    createEvent,
    updateEvent,
    deleteEvent,
    updateOccurrence,
    cancelOccurrence,
    addAttendees,
    removeAttendee,
    respondToInvite,
    addReminder,
    removeReminder
} = useAgenda();

const mode = computed<'create' | 'edit'>(() => (props.occurrence ? 'edit' : 'create'));
const isRecurringSeries = computed(() => !!props.occurrence?.isRecurring);
const scopeLocked = false; // réservé pour une future édition ciblée de la règle de récurrence uniquement en mode série

const loadingDetails = ref(false);
const saving = ref(false);

// ── Champs du formulaire ───────────────────────────────────────────
const title = ref('');
const description = ref('');
const location = ref('');
const allDay = ref(false);
const startDate = ref('');
const startTime = ref('');
const endDate = ref('');
const endTime = ref('');

type FreqOption = 'NONE' | RecurrenceFreq;
const freq = ref<FreqOption>('NONE');
const interval = ref(1);
type EndType = 'NEVER' | 'ON_DATE' | 'AFTER_COUNT';
const endType = ref<EndType>('NEVER');
const untilDate = ref('');
const count = ref(5);

const freqUnitLabel = computed(() => {
    switch (freq.value) {
        case 'DAILY': return 'jour(s)';
        case 'WEEKLY': return 'semaine(s)';
        case 'MONTHLY': return 'mois';
        case 'YEARLY': return 'an(s)';
        default: return '';
    }
});

// ── Invités ─────────────────────────────────────────────────────────
const attendeeIds = ref<string[]>([]);
const initialAttendeeIds = ref<string[]>([]);
const attendeeSearch = ref('');

const availableAttendeeMembers = computed<OrgMember[]>(() => {
    const members = openedOrg.value?.members || [];
    return members.filter(m => m.userId !== user.value?.id);
});

const filteredAttendeeMembers = computed<OrgMember[]>(() => {
    if (!attendeeSearch.value.trim()) return availableAttendeeMembers.value;
    const s = attendeeSearch.value.toLowerCase();
    return availableAttendeeMembers.value.filter(m => (m.user?.name || m.userId).toLowerCase().includes(s));
});

// ── Rappels ─────────────────────────────────────────────────────────
const pendingReminderMinutes = ref<number[]>([]);
const newReminderPreset = ref<number | 'custom'>(10);
const customReminderMinutes = ref(30);

interface DisplayReminder {
    id: string;
    minutesBefore: number;
}

const currentReminders = computed<DisplayReminder[]>(() => {
    if (mode.value === 'edit') {
        return (currentEvent.value?.reminders || []).map((r: EventReminder) => ({ id: r.id, minutesBefore: r.minutesBefore }));
    }
    return pendingReminderMinutes.value.map((m, i) => ({ id: `pending-${i}`, minutesBefore: m }));
});

function formatMinutes(m: number): string {
    if (m % 1440 === 0) return `${m / 1440} jour(s) avant`;
    if (m % 60 === 0) return `${m / 60} heure(s) avant`;
    return `${m} min avant`;
}

async function addReminderItem() {
    const minutes = newReminderPreset.value === 'custom' ? customReminderMinutes.value : newReminderPreset.value;
    if (!minutes || minutes <= 0) return;

    if (mode.value === 'edit' && props.occurrence) {
        await addReminder(props.orgId, props.occurrence.eventId, minutes);
    } else {
        pendingReminderMinutes.value.push(minutes);
    }
}

async function removeReminderItem(r: DisplayReminder) {
    if (mode.value === 'edit' && props.occurrence) {
        await removeReminder(props.orgId, props.occurrence.eventId, r.id);
    } else {
        const idx = pendingReminderMinutes.value.indexOf(r.minutesBefore);
        if (idx !== -1) pendingReminderMinutes.value.splice(idx, 1);
    }
}

// ── RSVP ─────────────────────────────────────────────────────────────
const myAttendee = computed(() => currentEvent.value?.attendees.find(a => a.userId === user.value?.id));
const isCreator = computed(() => currentEvent.value?.creatorId === user.value?.id);
const showRsvp = computed(() => mode.value === 'edit' && !!myAttendee.value && !isCreator.value);

async function setRsvp(status: RsvpStatus) {
    if (!props.occurrence) return;
    await respondToInvite(props.orgId, props.occurrence.eventId, status);
    await getEvent(props.orgId, props.occurrence.eventId);
}

// ── Chargement / réinitialisation du formulaire ──────────────────────
function pad(n: number): string {
    return String(n).padStart(2, '0');
}

function splitISO(iso: string): { date: string; time: string } {
    const d = new Date(iso);
    return {
        date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
        time: `${pad(d.getHours())}:${pad(d.getMinutes())}`
    };
}

function resetForm() {
    title.value = '';
    description.value = '';
    location.value = '';
    allDay.value = false;
    startDate.value = '';
    startTime.value = '';
    endDate.value = '';
    endTime.value = '';
    freq.value = 'NONE';
    interval.value = 1;
    endType.value = 'NEVER';
    untilDate.value = '';
    count.value = 5;
    attendeeIds.value = [];
    initialAttendeeIds.value = [];
    attendeeSearch.value = '';
    pendingReminderMinutes.value = [];
    newReminderPreset.value = 10;
    customReminderMinutes.value = 30;
}

function prefillFromInitialDate(date: Date) {
    const d = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    startDate.value = d;
    endDate.value = d;
    startTime.value = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
    const end = new Date(date.getTime() + 60 * 60000);
    endTime.value = `${pad(end.getHours())}:${pad(end.getMinutes())}`;
}

function prefillFromOccurrence() {
    const occ = props.occurrence;
    if (!occ) return;

    title.value = occ.title;
    description.value = occ.description || '';
    location.value = occ.location || '';
    allDay.value = occ.allDay;

    const s = splitISO(occ.startAt);
    const e = splitISO(occ.endAt);
    startDate.value = s.date;
    startTime.value = s.time;
    endDate.value = e.date;
    endTime.value = e.time;

    const ev = currentEvent.value;
    const rule = ev?.recurrenceRule;
    if (rule) {
        freq.value = rule.freq;
        interval.value = rule.interval;
        if (rule.until) {
            endType.value = 'ON_DATE';
            untilDate.value = splitISO(rule.until).date;
        } else if (rule.count) {
            endType.value = 'AFTER_COUNT';
            count.value = rule.count;
        } else {
            endType.value = 'NEVER';
        }
    } else {
        freq.value = 'NONE';
    }

    const ids = (ev?.attendees || []).map(a => a.userId);
    attendeeIds.value = [...ids];
    initialAttendeeIds.value = [...ids];
}

watch(() => props.show, async (isShown) => {
    if (!isShown) return;

    resetForm();
    currentEvent.value = null;

    if (props.occurrence) {
        loadingDetails.value = true;
        try {
            await getEvent(props.orgId, props.occurrence.eventId);
            prefillFromOccurrence();
        } finally {
            loadingDetails.value = false;
        }
    } else if (props.initialDate) {
        prefillFromInitialDate(props.initialDate);
    }
}, { immediate: true });

// ── Construction des payloads ────────────────────────────────────────
function toISO(dateStr: string, timeStr: string): string {
    return new Date(`${dateStr}T${timeStr || '00:00'}:00`).toISOString();
}

function computeStartAt(): string {
    return allDay.value ? toISO(startDate.value, '00:00') : toISO(startDate.value, startTime.value || '09:00');
}

function computeEndAt(): string {
    const d = endDate.value || startDate.value;
    return allDay.value ? toISO(d, '23:59') : toISO(d, endTime.value || '10:00');
}

function buildRecurrenceRule() {
    if (freq.value === 'NONE') return null;
    const rule: { freq: RecurrenceFreq; interval: number; until?: string; count?: number } = {
        freq: freq.value,
        interval: Math.max(1, interval.value || 1)
    };
    if (endType.value === 'ON_DATE' && untilDate.value) {
        rule.until = toISO(untilDate.value, '23:59');
    } else if (endType.value === 'AFTER_COUNT') {
        rule.count = Math.max(1, count.value || 1);
    }
    return rule;
}

// ── Sauvegarde ────────────────────────────────────────────────────────
async function handleSave(scope: 'occurrence' | 'series' = 'series') {
    if (!title.value.trim() || !startDate.value) return;

    saving.value = true;
    try {
        const dto: CreateEventDTO = {
            title: title.value.trim(),
            description: description.value.trim() || null,
            location: location.value.trim() || null,
            startAt: computeStartAt(),
            endAt: computeEndAt(),
            allDay: allDay.value
        };

        if (mode.value === 'create') {
            dto.recurrenceRule = buildRecurrenceRule();
            dto.attendeeIds = attendeeIds.value;

            const created = await createEvent(props.orgId, dto);
            if (created) {
                for (const minutes of pendingReminderMinutes.value) {
                    await addReminder(props.orgId, created.id, minutes);
                }
                emit('saved');
                emit('close');
            }
        } else if (props.occurrence) {
            const eventId = props.occurrence.eventId;

            if (scope === 'occurrence') {
                await updateOccurrence(props.orgId, eventId, props.occurrence.startAt, dto);
            } else {
                const seriesDto: UpdateEventDTO = { ...dto };
                if (isRecurringSeries.value) {
                    seriesDto.recurrenceRule = buildRecurrenceRule();
                }
                await updateEvent(props.orgId, eventId, seriesDto);

                const initialSet = new Set(initialAttendeeIds.value);
                const currentSet = new Set(attendeeIds.value);
                const toAdd = attendeeIds.value.filter(id => !initialSet.has(id));
                const toRemove = initialAttendeeIds.value.filter(id => !currentSet.has(id));

                if (toAdd.length) await addAttendees(props.orgId, eventId, toAdd);
                for (const id of toRemove) await removeAttendee(props.orgId, eventId, id);
            }

            emit('saved');
            emit('close');
        }
    } finally {
        saving.value = false;
    }
}

// ── Suppression / annulation ──────────────────────────────────────────
type DeleteMode = 'occurrence' | 'series' | 'single';
const deleteMode = ref<DeleteMode>('single');
const showDeleteConfirm = ref(false);
const deleting = ref(false);

const deleteItemType = computed(() => {
    if (deleteMode.value === 'occurrence') return 'cette occurrence';
    if (deleteMode.value === 'series') return 'toute la série';
    return "l'événement";
});

const deleteExtraWarning = computed(() => {
    return deleteMode.value === 'series'
        ? 'Toutes les occurrences et réponses des participants seront perdues.'
        : undefined;
});

function askCancelOccurrence() {
    deleteMode.value = 'occurrence';
    showDeleteConfirm.value = true;
}

function askDeleteSeries() {
    deleteMode.value = 'series';
    showDeleteConfirm.value = true;
}

function askDeleteSingle() {
    deleteMode.value = 'single';
    showDeleteConfirm.value = true;
}

async function confirmDelete() {
    if (!props.occurrence) return;

    deleting.value = true;
    try {
        if (deleteMode.value === 'occurrence') {
            await cancelOccurrence(props.orgId, props.occurrence.eventId, props.occurrence.startAt);
        } else {
            await deleteEvent(props.orgId, props.occurrence.eventId);
        }
        showDeleteConfirm.value = false;
        emit('deleted');
        emit('close');
    } finally {
        deleting.value = false;
    }
}
</script>

<style scoped>
.field-input {
    width: 100%;
    background: color-mix(in srgb, var(--bg2) 30%, transparent);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 0.75rem;
    padding: 0.65rem 1rem;
    color: var(--text);
    font-size: 0.875rem;
    transition: border-color 0.15s ease;
}

.field-input:focus {
    outline: none;
    border-color: color-mix(in srgb, var(--primary) 50%, transparent);
}

.reminder-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    font-weight: 600;
    padding: 4px 8px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--primary) 14%, transparent);
    color: var(--text);
}

.reminder-chip button {
    color: var(--text2);
    display: flex;
    align-items: center;
}

.reminder-chip button:hover {
    color: var(--text);
}

.rsvp-btn {
    font-size: 11px;
    font-weight: 700;
    padding: 6px 10px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.05);
    color: var(--text2);
    display: flex;
    align-items: center;
    gap: 4px;
    transition: all 0.15s ease;
}

.rsvp-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    color: var(--text);
}

.rsvp-active-accepted {
    background: color-mix(in srgb, #22c55e 20%, transparent);
    color: #22c55e;
}

.rsvp-active-tentative {
    background: color-mix(in srgb, #f59e0b 20%, transparent);
    color: #f59e0b;
}

.rsvp-active-declined {
    background: color-mix(in srgb, #ef4444 20%, transparent);
    color: #ef4444;
}
</style>

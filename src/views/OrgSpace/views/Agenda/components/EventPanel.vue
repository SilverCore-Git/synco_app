<template>
    <Teleport to="body">
        <Transition name="panel-fade">
            <div v-if="show" class="event-panel-catcher"></div>
        </Transition>
        <Transition name="panel-slide">
            <aside v-if="show" class="event-panel">
                <div class="event-panel-header">
                    <div class="flex items-center gap-2 text-(--text2) text-xs font-bold uppercase tracking-wider">
                        <i class="bi bi-calendar-event"></i>
                        <span>{{ mode === 'create' ? 'Nouvel événement' : "Modifier l'événement" }}</span>
                    </div>
                    <button class="event-panel-close" @click="emit('close')"><i class="bi bi-x-lg"></i></button>
                </div>

                <div v-if="loadingDetails" class="flex-1 flex items-center justify-center">
                    <div class="w-8 h-8 border-4 border-(--primary)/30 border-t-(--primary) rounded-full animate-spin"></div>
                </div>

                <form v-else @submit.prevent="handleSave()" class="event-panel-body">

                    <!-- RSVP -->
                    <div v-if="showRsvp" class="rsvp-row">
                        <span class="text-[11px] font-bold text-(--text2) uppercase tracking-wider">Votre réponse</span>
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

                    <!-- Titre + couleur -->
                    <div class="flex items-center gap-2">
                        <input
                            v-model="title"
                            type="text"
                            placeholder="Ajouter un titre"
                            class="title-input flex-1"
                            required
                        />
                        <div class="color-swatch-trigger" @click="colorPickerOpen = !colorPickerOpen">
                            <span class="color-dot" :style="{ background: color || 'var(--primary)' }"></span>
                        </div>
                    </div>

                    <div v-if="colorPickerOpen" class="color-swatch-panel">
                        <button
                            v-for="c in colorPresets"
                            :key="c"
                            type="button"
                            class="color-swatch"
                            :class="{ 'is-active': color === c }"
                            :style="{ background: c }"
                            @click="color = c; colorPickerOpen = false"
                        ></button>
                        <button
                            type="button"
                            class="color-swatch color-swatch-none"
                            :class="{ 'is-active': !color }"
                            @click="color = null; colorPickerOpen = false"
                        >
                            <i class="bi bi-slash-lg"></i>
                        </button>
                    </div>

                    <!-- Horaire -->
                    <div class="icon-row">
                        <i class="bi bi-clock icon-row-icon"></i>
                        <div class="flex-1 flex flex-col gap-2">
                            <label class="flex items-center gap-2 cursor-pointer w-fit mb-1">
                                <input type="checkbox" v-model="allDay" class="w-3.5 h-3.5 accent-(--primary)" />
                                <span class="text-xs font-medium text-(--text2)">Journée entière</span>
                            </label>
                            <div class="flex items-center gap-2 flex-wrap">
                                <input v-model="startDate" type="date" class="field-input-sm" required />
                                <input v-if="!allDay" v-model="startTime" type="time" class="field-input-sm w-24" />
                                <span class="text-(--text2) text-xs">→</span>
                                <input v-model="endDate" type="date" class="field-input-sm" />
                                <input v-if="!allDay" v-model="endTime" type="time" class="field-input-sm w-24" />
                            </div>
                        </div>
                    </div>

                    <!-- Lieu -->
                    <div class="icon-row">
                        <i class="bi bi-geo-alt icon-row-icon"></i>
                        <input v-model="location" type="text" placeholder="Ajouter un lieu" class="field-input-flat" />
                    </div>

                    <!-- Description -->
                    <div class="icon-row">
                        <i class="bi bi-text-left icon-row-icon"></i>
                        <textarea v-model="description" rows="2" placeholder="Ajouter une description" class="field-input-flat resize-none"></textarea>
                    </div>

                    <!-- Récurrence -->
                    <div class="icon-row">
                        <i class="bi bi-arrow-repeat icon-row-icon"></i>
                        <div class="flex-1">
                            <button type="button" class="disclosure-summary" @click="recurrenceOpen = !recurrenceOpen">
                                <span>{{ recurrenceSummary }}</span>
                                <i class="bi" :class="recurrenceOpen ? 'bi-chevron-up' : 'bi-chevron-down'"></i>
                            </button>

                            <div v-if="recurrenceOpen" class="disclosure-panel">
                                <select v-model="freq" class="field-input-sm w-full">
                                    <option value="NONE">Ne se répète pas</option>
                                    <option value="DAILY">Quotidien</option>
                                    <option value="WEEKLY">Hebdomadaire</option>
                                    <option value="MONTHLY">Mensuel</option>
                                    <option value="YEARLY">Annuel</option>
                                </select>

                                <template v-if="freq !== 'NONE'">
                                    <div class="flex items-center gap-2 text-xs text-(--text)">
                                        <span>Tous les</span>
                                        <input v-model.number="interval" type="number" min="1" class="field-input-sm w-16" />
                                        <span>{{ freqUnitLabel }}</span>
                                    </div>

                                    <div class="flex flex-col gap-2">
                                        <span class="text-[10px] font-bold text-(--text2) uppercase tracking-wider">Fin</span>
                                        <label class="flex items-center gap-2 cursor-pointer text-xs">
                                            <input type="radio" value="NEVER" v-model="endType" class="accent-(--primary)" />
                                            Jamais
                                        </label>
                                        <label class="flex items-center gap-2 cursor-pointer text-xs">
                                            <input type="radio" value="ON_DATE" v-model="endType" class="accent-(--primary)" />
                                            Le <input v-model="untilDate" type="date" class="field-input-sm" :disabled="endType !== 'ON_DATE'" />
                                        </label>
                                        <label class="flex items-center gap-2 cursor-pointer text-xs">
                                            <input type="radio" value="AFTER_COUNT" v-model="endType" class="accent-(--primary)" />
                                            Après <input v-model.number="count" type="number" min="1" class="field-input-sm w-14" :disabled="endType !== 'AFTER_COUNT'" /> occurrences
                                        </label>
                                    </div>
                                </template>
                            </div>
                        </div>
                    </div>

                    <!-- Invités -->
                    <div class="icon-row">
                        <i class="bi bi-people icon-row-icon"></i>
                        <div class="flex-1">
                            <button type="button" class="disclosure-summary" @click="attendeesOpen = !attendeesOpen">
                                <span>{{ attendeesSummary }}</span>
                                <i class="bi" :class="attendeesOpen ? 'bi-chevron-up' : 'bi-chevron-down'"></i>
                            </button>

                            <div v-if="attendeesOpen" class="disclosure-panel">
                                <div class="relative">
                                    <i class="bi bi-search absolute left-3 top-1/2 -translate-y-1/2 text-(--text2) text-xs"></i>
                                    <input v-model="attendeeSearch" placeholder="Rechercher une personne..." class="field-input-sm pl-8 w-full" />
                                </div>
                                <div class="attendee-list">
                                    <label v-for="member in filteredAttendeeMembers" :key="member.userId" class="flex items-center gap-3 cursor-pointer group">
                                        <input type="checkbox" :value="member.userId" v-model="attendeeIds" class="w-3.5 h-3.5 rounded accent-(--primary)" />
                                        <img v-if="member.user?.avatarUrl" :src="member.user.avatarUrl" class="w-6 h-6 rounded-full object-cover">
                                        <div v-else class="w-6 h-6 rounded-full bg-(--primary)/20 text-(--primary) flex items-center justify-center text-[10px] font-bold">
                                            {{ ($p(member.user?.name) || member.userId).substring(0, 2).toUpperCase() }}
                                        </div>
                                        <span class="text-xs font-medium text-(--text) group-hover:text-white transition-colors">
                                            {{ $p(member.user?.name) || member.userId }}
                                        </span>
                                    </label>
                                    <div v-if="filteredAttendeeMembers.length === 0" class="text-[11px] text-center text-(--text2) py-2">Aucun résultat</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Rappels -->
                    <div class="icon-row">
                        <i class="bi bi-bell icon-row-icon"></i>
                        <div class="flex-1">
                            <button type="button" class="disclosure-summary" @click="remindersOpen = !remindersOpen">
                                <span>{{ remindersSummary }}</span>
                                <i class="bi" :class="remindersOpen ? 'bi-chevron-up' : 'bi-chevron-down'"></i>
                            </button>

                            <div v-if="remindersOpen" class="disclosure-panel">
                                <div class="flex flex-wrap gap-2" v-if="currentReminders.length > 0">
                                    <span v-for="r in currentReminders" :key="r.id" class="reminder-chip">
                                        {{ formatMinutes(r.minutesBefore) }}
                                        <button type="button" @click="removeReminderItem(r)"><i class="bi bi-x-lg"></i></button>
                                    </span>
                                </div>
                                <div class="flex gap-2">
                                    <select v-model="newReminderPreset" class="field-input-sm flex-1">
                                        <option :value="10">10 minutes avant</option>
                                        <option :value="30">30 minutes avant</option>
                                        <option :value="60">1 heure avant</option>
                                        <option :value="1440">1 jour avant</option>
                                        <option value="custom">Personnalisé...</option>
                                    </select>
                                    <input v-if="newReminderPreset === 'custom'" v-model.number="customReminderMinutes" type="number" min="1" placeholder="Min" class="field-input-sm w-16" />
                                    <button type="button" @click="addReminderItem" class="default !text-[11px] !px-2 !py-1 shrink-0">
                                        <i class="bi bi-plus-lg"></i>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </form>

                <div v-if="!loadingDetails" class="event-panel-footer">
                    <div class="flex gap-2">
                        <template v-if="mode === 'edit'">
                            <button v-if="isRecurringSeries" type="button" @click="askCancelOccurrence" class="danger !text-xs" :disabled="saving">
                                Annuler l'occurrence
                            </button>
                            <button v-if="isRecurringSeries" type="button" @click="askDeleteSeries" class="danger !text-xs" :disabled="saving">
                                Supprimer la série
                            </button>
                            <button v-else type="button" @click="askDeleteSingle" class="danger !text-xs" :disabled="saving">
                                Supprimer
                            </button>
                        </template>
                    </div>

                    <div class="flex gap-2 justify-end flex-wrap">
                        <button type="button" @click="emit('close')" class="default !text-xs" :disabled="saving">Annuler</button>

                        <template v-if="mode === 'edit' && isRecurringSeries">
                            <button
                                type="button"
                                @click="handleSave('occurrence')"
                                class="primary !text-xs"
                                :class="[saving ? 'loader' : '', !title.trim() ? 'opacity-50 pointer-events-none' : '']"
                                :disabled="saving || !title.trim()"
                            >
                                Cette occurrence
                            </button>
                            <button
                                type="button"
                                @click="handleSave('series')"
                                class="primary !text-xs"
                                :class="[saving ? 'loader' : '', !title.trim() ? 'opacity-50 pointer-events-none' : '']"
                                :disabled="saving || !title.trim()"
                            >
                                Toute la série
                            </button>
                        </template>
                        <button
                            v-else
                            type="button"
                            @click="handleSave('series')"
                            class="primary !text-xs"
                            :class="[saving ? 'loader' : '', !title.trim() ? 'opacity-50 pointer-events-none' : '']"
                            :disabled="saving || !title.trim()"
                        >
                            {{ mode === 'create' ? 'Créer' : 'Enregistrer' }}
                        </button>
                    </div>
                </div>
            </aside>
        </Transition>
    </Teleport>

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
import ConfirmDelete from '@/components/common/ConfirmDelete.vue';
import { openedOrg, user } from '@/assets/var';
import useSettingsItem from '@/composables/useSettingsItem';
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

interface InitialRange {
    start: Date;
    end: Date;
    allDay?: boolean;
}

const props = defineProps<{
    show: boolean;
    orgId: string;
    occurrence?: OccurrenceInstance | null;
    initialRange?: InitialRange | null;
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

const loadingDetails = ref(false);
const saving = ref(false);

// ── Sections repliables (réduit la charge visuelle par défaut) ────────
const recurrenceOpen = ref(false);
const attendeesOpen = ref(false);
const remindersOpen = ref(false);

// ── Champs du formulaire ───────────────────────────────────────────
const title = ref('');
const description = ref('');
const location = ref('');
const allDay = ref(false);
const color = ref<string | null>(null);
const colorPickerOpen = ref(false);
const colorPresets = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4', '#8b5cf6', '#64748b'];
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

const recurrenceSummary = computed(() => {
    if (freq.value === 'NONE') return 'Ne se répète pas';
    const base = freqUnitLabel.value.replace('(s)', '');
    switch (freq.value) {
        case 'DAILY': return interval.value > 1 ? `Tous les ${interval.value} jours` : 'Tous les jours';
        case 'WEEKLY': return interval.value > 1 ? `Toutes les ${interval.value} semaines` : 'Toutes les semaines';
        case 'MONTHLY': return interval.value > 1 ? `Tous les ${interval.value} mois` : 'Tous les mois';
        case 'YEARLY': return interval.value > 1 ? `Tous les ${interval.value} ans` : 'Tous les ans';
        default: return base;
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

const { Item: privacyMode } = useSettingsItem('privacyMode', false);
function p(name: any): string {
    if (!name || typeof name !== 'string') return name;
    return privacyMode.value ? name.charAt(0).toUpperCase() : name;
}

const attendeesSummary = computed(() => {
    const n = attendeeIds.value.length;
    if (n === 0) return 'Aucun invité';
    if (n === 1) {
        const m = availableAttendeeMembers.value.find(m => m.userId === attendeeIds.value[0]);
        return m ? (p(m.user?.name) || m.userId) : '1 invité';
    }
    return `${n} invités`;
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

const remindersSummary = computed(() => {
    const n = currentReminders.value.length;
    return n === 0 ? 'Aucun rappel' : `${n} rappel${n > 1 ? 's' : ''}`;
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
    color.value = null;
    colorPickerOpen.value = false;
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
    recurrenceOpen.value = false;
    attendeesOpen.value = false;
    remindersOpen.value = false;
}

function prefillFromInitialRange(range: InitialRange) {
    const s = `${range.start.getFullYear()}-${pad(range.start.getMonth() + 1)}-${pad(range.start.getDate())}`;
    const e = `${range.end.getFullYear()}-${pad(range.end.getMonth() + 1)}-${pad(range.end.getDate())}`;
    startDate.value = s;
    endDate.value = e;
    allDay.value = !!range.allDay;
    startTime.value = `${pad(range.start.getHours())}:${pad(range.start.getMinutes())}`;
    endTime.value = `${pad(range.end.getHours())}:${pad(range.end.getMinutes())}`;
}

function prefillFromOccurrence() {
    const occ = props.occurrence;
    if (!occ) return;

    title.value = occ.title;
    description.value = occ.description || '';
    location.value = occ.location || '';
    allDay.value = occ.allDay;
    color.value = occ.color;

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
        recurrenceOpen.value = true;
    } else {
        freq.value = 'NONE';
    }

    const ids = (ev?.attendees || []).map(a => a.userId);
    attendeeIds.value = [...ids];
    initialAttendeeIds.value = [...ids];
    if (ids.length > 0) attendeesOpen.value = true;
    if ((ev?.reminders || []).length > 0) remindersOpen.value = true;
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
    } else if (props.initialRange) {
        prefillFromInitialRange(props.initialRange);
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
            allDay: allDay.value,
            color: color.value
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
.event-panel-catcher {
    position: fixed;
    inset: 0;
    z-index: 1800;
    background: transparent;
}

.event-panel {
    position: fixed;
    top: 0;
    right: 0;
    height: 100%;
    width: 420px;
    max-width: 100vw;
    background: var(--bg);
    border-left: 1px solid var(--border-color);
    box-shadow: -12px 0 40px rgba(0, 0, 0, 0.25);
    z-index: 1900;
    display: flex;
    flex-direction: column;
}

.panel-slide-enter-active,
.panel-slide-leave-active {
    transition: transform 0.22s cubic-bezier(0.22, 1, 0.36, 1);
}
.panel-slide-enter-from,
.panel-slide-leave-to {
    transform: translateX(100%);
}

.panel-fade-enter-active,
.panel-fade-leave-active {
    transition: opacity 0.2s ease;
}
.panel-fade-enter-from,
.panel-fade-leave-to {
    opacity: 0;
}

.event-panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 18px;
    border-bottom: 1px solid var(--border-color);
    flex-shrink: 0;
}

.event-panel-close {
    color: var(--text2);
    padding: 4px;
}
.event-panel-close:hover {
    color: var(--text);
}

.event-panel-body {
    flex: 1;
    overflow-y: auto;
    padding: 18px;
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.event-panel-footer {
    flex-shrink: 0;
    padding: 14px 18px;
    border-top: 1px solid var(--border-color);
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.title-input {
    width: 100%;
    background: transparent;
    border: none;
    border-bottom: 1.5px solid var(--border-color);
    padding: 4px 2px 10px;
    font-size: 18px;
    font-weight: 800;
    color: var(--text);
}
.title-input:focus {
    outline: none;
    border-bottom-color: var(--primary);
}

.color-swatch-trigger {
    flex-shrink: 0;
    padding: 6px;
    border-radius: 8px;
    cursor: pointer;
}
.color-swatch-trigger:hover {
    background: rgba(255, 255, 255, 0.06);
}

.color-dot {
    display: block;
    width: 14px;
    height: 14px;
    border-radius: 999px;
}

.color-swatch-panel {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding: 4px 0 2px;
}

.color-swatch {
    width: 22px;
    height: 22px;
    border-radius: 999px;
    border: 2px solid transparent;
    transition: transform 0.1s ease;
}
.color-swatch:hover {
    transform: scale(1.12);
}
.color-swatch.is-active {
    border-color: var(--text);
}

.color-swatch-none {
    background: transparent;
    border: 1.5px dashed var(--text2);
    color: var(--text2);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
}

.icon-row {
    display: flex;
    align-items: flex-start;
    gap: 14px;
}

.icon-row-icon {
    color: var(--text2);
    font-size: 15px;
    margin-top: 6px;
    width: 16px;
    flex-shrink: 0;
    text-align: center;
}

.field-input-sm {
    background: color-mix(in srgb, var(--bg2) 30%, transparent);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 0.5rem;
    padding: 0.4rem 0.6rem;
    color: var(--text);
    font-size: 0.75rem;
}
.field-input-sm:focus {
    outline: none;
    border-color: color-mix(in srgb, var(--primary) 50%, transparent);
}

.field-input-flat {
    flex: 1;
    background: transparent;
    border: none;
    border-bottom: 1px solid transparent;
    padding: 6px 0;
    color: var(--text);
    font-size: 0.8rem;
}
.field-input-flat::placeholder {
    color: var(--text2);
}
.field-input-flat:focus {
    outline: none;
    border-bottom-color: var(--primary);
}

.disclosure-summary {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 0;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text);
    text-align: left;
}
.disclosure-summary i {
    color: var(--text2);
    font-size: 11px;
}
.disclosure-summary:hover {
    color: var(--primary);
}

.disclosure-panel {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 10px 0 4px;
}

.attendee-list {
    background: color-mix(in srgb, var(--bg2) 30%, transparent);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 0.75rem;
    padding: 10px;
    max-height: 150px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.reminder-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 10px;
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

.rsvp-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    background: color-mix(in srgb, var(--bg2) 50%, transparent);
    border: 1px solid var(--border-color);
    border-radius: 0.75rem;
    padding: 10px 12px;
    flex-wrap: wrap;
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

<template>
    <div class="flex flex-col min-h-0" :class="variant === 'panel' ? 'flex-1' : ''">
        <div v-if="state.loading && !state.details" class="flex-1 flex items-center justify-center py-16">
            <div class="w-7 h-7 border-4 border-(--primary)/30 border-t-(--primary) rounded-full animate-spin"></div>
        </div>

        <div
            v-else
            class="flex flex-col gap-5"
            :class="variant === 'panel' ? 'flex-1 min-h-0 overflow-y-auto px-4 pt-3 pb-4 custom-scrollbar' : ''"
        >
            <div class="flex items-center gap-2.5">
                <span class="w-3 h-3 rounded-full shrink-0" :style="{ background: f.color || 'var(--primary)' }"></span>
                <input
                    ref="titleInputEl"
                    v-model="f.title"
                    type="text"
                    placeholder="Ajouter un titre"
                    class="flex-1 min-w-0 bg-transparent text-lg font-bold text-(--text) placeholder:text-(--text2) placeholder:font-semibold rounded-lg px-1.5 -mx-1.5 py-0.5 focus:outline-none focus:bg-(--surface-sunken)"
                    @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
                />
            </div>

            <!-- Réponse à l'invitation : même contrôle que le statut d'une tâche -->
            <div v-if="showRsvp" class="flex flex-col gap-1.5">
                <div class="grid grid-cols-3 gap-1 p-1 rounded-xl bg-(--surface-sunken)" role="group" aria-label="Votre réponse">
                    <button
                        v-for="r in RSVPS"
                        :key="r.id"
                        type="button"
                        class="h-8 rounded-lg flex items-center justify-center gap-1.5 text-xs font-bold transition-all active:scale-95"
                        :class="myAttendee?.status === r.id ? r.activeClass : 'text-(--text2) hover:text-(--text)'"
                        :aria-pressed="myAttendee?.status === r.id"
                        @click="respondToEvent(state, r.id)"
                    >
                        <i :class="r.icon"></i> {{ r.label }}
                    </button>
                </div>
                <p class="text-xs text-(--text2) px-1">Invitation de {{ $p(creatorName) || 'un collègue' }}</p>
            </div>

            <p v-if="delegateName" class="flex items-center gap-2 text-xs text-(--text2) px-1 -mt-2">
                <i class="bi bi-person-check"></i> Ajouté par {{ delegateName === 'vous' ? 'vous' : $p(delegateName) }}
            </p>

            <!-- Propriétés : chaque ligne s'ouvre en place -->
            <div class="flex flex-col">
                <button type="button" class="prop-row" :class="{ 'is-active': activeSection === 'when' }" @click="toggleSection('when')">
                    <span class="prop-k"><i class="bi bi-clock"></i> Quand</span>
                    <span class="prop-v"><span class="truncate first-letter:uppercase">{{ whenLabel }}</span></span>
                </button>
                <div v-if="activeSection === 'when'" class="prop-editor flex flex-col gap-2.5">
                    <label class="flex items-center gap-2 cursor-pointer w-fit">
                        <input v-model="f.allDay" type="checkbox" class="w-3.5 h-3.5 accent-(--primary)" />
                        <span class="text-xs font-medium text-(--text)">Journée entière</span>
                    </label>
                    <div class="grid grid-cols-[2.5rem_1fr_auto] items-center gap-2">
                        <span class="text-xs text-(--text2)">Début</span>
                        <input v-model="f.startDate" type="date" class="ev-input" @change="keepEndAfterStart" />
                        <input v-if="!f.allDay" v-model="f.startTime" type="time" class="ev-input w-24" @change="keepEndAfterStart" />
                        <span v-else></span>
                        <span class="text-xs text-(--text2)">Fin</span>
                        <input v-model="f.endDate" type="date" class="ev-input" :min="f.startDate" />
                        <input v-if="!f.allDay" v-model="f.endTime" type="time" class="ev-input w-24" />
                        <span v-else></span>
                    </div>
                </div>

                <button type="button" class="prop-row" :class="{ 'is-active': activeSection === 'repeat' }" @click="toggleSection('repeat')">
                    <span class="prop-k"><i class="bi bi-arrow-repeat"></i> Répétition</span>
                    <span class="prop-v" :class="f.freq === 'NONE' ? 'text-(--text2)!' : ''">{{ recurrenceSummary }}</span>
                </button>
                <div v-if="activeSection === 'repeat'" class="prop-editor flex flex-col gap-3">
                    <div class="grid grid-cols-5 gap-1 p-1 rounded-xl bg-(--surface-sunken)">
                        <button
                            v-for="o in FREQS"
                            :key="o.id"
                            type="button"
                            class="h-7 rounded-lg text-[11px] font-bold transition-colors"
                            :class="f.freq === o.id ? 'bg-(--bg) text-(--text) shadow-sm' : 'text-(--text2) hover:text-(--text)'"
                            @click="f.freq = o.id"
                        >{{ o.label }}</button>
                    </div>
                    <template v-if="f.freq !== 'NONE'">
                        <div class="flex items-center gap-2 text-xs text-(--text)">
                            <span>Tous les</span>
                            <input v-model.number="f.interval" type="number" min="1" class="ev-input w-16" />
                            <span>{{ freqUnitLabel }}</span>
                        </div>
                        <div class="flex flex-col gap-1.5 text-xs text-(--text)">
                            <span class="text-[11px] font-bold text-(--text2)">Fin de la répétition</span>
                            <label class="flex items-center gap-2 cursor-pointer h-8">
                                <input v-model="f.endType" type="radio" value="NEVER" class="accent-(--primary)" /> Jamais
                            </label>
                            <label class="flex items-center gap-2 cursor-pointer h-8">
                                <input v-model="f.endType" type="radio" value="ON_DATE" class="accent-(--primary)" /> Le
                                <input v-model="f.untilDate" type="date" class="ev-input" :disabled="f.endType !== 'ON_DATE'" />
                            </label>
                            <label class="flex items-center gap-2 cursor-pointer h-8">
                                <input v-model="f.endType" type="radio" value="AFTER_COUNT" class="accent-(--primary)" /> Après
                                <input v-model.number="f.count" type="number" min="1" class="ev-input w-16" :disabled="f.endType !== 'AFTER_COUNT'" /> fois
                            </label>
                        </div>
                    </template>
                </div>

                <!-- Lieu : se tape directement dans la ligne -->
                <label class="prop-row cursor-text">
                    <span class="prop-k"><i class="bi bi-geo-alt"></i> Lieu</span>
                    <input
                        v-model="f.location"
                        type="text"
                        placeholder="Ajouter un lieu"
                        class="prop-v w-full bg-transparent placeholder:text-(--text2) focus:outline-none"
                        @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
                    />
                </label>

                <button type="button" class="prop-row" :class="{ 'is-active': activeSection === 'attendees' }" @click="toggleSection('attendees')">
                    <span class="prop-k"><i class="bi bi-people"></i> Invités</span>
                    <span class="prop-v">
                        <span v-if="!selectedMembers.length" class="text-(--text2)">Personne</span>
                        <template v-else>
                            <span class="flex items-center -space-x-1.5">
                                <template v-for="m in selectedMembers.slice(0, 4)" :key="m.userId">
                                    <img v-if="m.user?.avatarUrl" :src="m.user.avatarUrl" :title="$p(m.user?.name)" class="w-5 h-5 rounded-full object-cover border border-(--bg)">
                                    <span v-else :title="$p(m.user?.name)" class="w-5 h-5 rounded-full bg-(--primary)/20 text-(--primary) flex items-center justify-center text-[8px] font-black border border-(--bg)">
                                        {{ ($p(m.user?.name) || m.userId).substring(0, 2).toUpperCase() }}
                                    </span>
                                </template>
                            </span>
                            <span class="truncate">{{ attendeesLabel }}</span>
                        </template>
                    </span>
                </button>
                <div v-if="activeSection === 'attendees'" class="prop-editor">
                    <div class="relative mb-2">
                        <i class="bi bi-search absolute left-3 top-1/2 -translate-y-1/2 text-(--text2) text-sm"></i>
                        <input
                            v-model="attendeeSearch"
                            placeholder="Rechercher une personne..."
                            class="w-full bg-(--surface-sunken) border border-(--text)/20 rounded-xl pl-9 pr-4 py-2 text-sm text-(--text) placeholder:text-(--text2) focus:outline-none focus:border-(--primary)/50"
                        />
                    </div>
                    <div class="max-h-44 overflow-y-auto space-y-2">
                        <label v-for="member in filteredMembers" :key="member.userId" class="flex items-center gap-3 cursor-pointer group">
                            <input
                                v-model="f.attendeeIds"
                                type="checkbox"
                                :value="member.userId"
                                class="w-4 h-4 rounded bg-(--surface-sunken) border-(--text)/20 text-(--primary) focus:ring-(--primary) focus:ring-offset-0"
                            />
                            <span class="flex items-center gap-2 min-w-0">
                                <img v-if="member.user?.avatarUrl" :src="member.user.avatarUrl" class="w-6 h-6 rounded-full object-cover">
                                <span v-else class="w-6 h-6 rounded-full bg-(--primary)/20 text-(--primary) flex items-center justify-center text-[10px] font-bold shrink-0">
                                    {{ ($p(member.user?.name) || member.userId).substring(0, 2).toUpperCase() }}
                                </span>
                                <span class="text-sm font-medium text-(--text) truncate group-hover:text-(--primary) transition-colors">
                                    {{ $p(member.user?.name) || member.userId }}
                                </span>
                            </span>
                            <span v-if="attendeeStatus(member.userId)" class="ml-auto text-[10px] font-bold whitespace-nowrap" :class="attendeeStatus(member.userId)!.class">
                                {{ attendeeStatus(member.userId)!.label }}
                            </span>
                        </label>
                        <p v-if="filteredMembers.length === 0" class="text-xs text-center text-(--text2) py-2">Aucun résultat</p>
                    </div>
                </div>

                <button type="button" class="prop-row" :class="{ 'is-active': activeSection === 'reminders' }" @click="toggleSection('reminders')">
                    <span class="prop-k"><i class="bi bi-bell"></i> Rappels</span>
                    <span class="prop-v" :class="state.reminders.length ? '' : 'text-(--text2)!'"><span class="truncate">{{ remindersLabel }}</span></span>
                </button>
                <div v-if="activeSection === 'reminders'" class="prop-editor flex flex-col gap-2.5">
                    <div v-if="sortedReminders.length" class="flex flex-wrap gap-1.5">
                        <span v-for="r in sortedReminders" :key="r.id" class="reminder-chip">
                            {{ formatMinutes(r.minutesBefore) }}
                            <button type="button" :aria-label="`Retirer le rappel ${formatMinutes(r.minutesBefore)}`" @click="removeEventReminder(state, r)">
                                <i class="bi bi-x-lg"></i>
                            </button>
                        </span>
                    </div>
                    <div class="flex flex-wrap gap-1.5">
                        <button
                            v-for="m in REMINDER_PRESETS"
                            :key="m"
                            type="button"
                            class="file-action border border-(--border-color)"
                            :disabled="state.reminders.some(r => r.minutesBefore === m)"
                            @click="addEventReminder(state, m)"
                        >
                            <i class="bi bi-plus-lg"></i> {{ formatMinutes(m) }}
                        </button>
                    </div>
                    <div class="flex items-center gap-2 text-xs text-(--text)">
                        <input v-model.number="customReminderMinutes" type="number" min="1" class="ev-input w-20" @keydown.enter.prevent="addCustomReminder" />
                        <span class="text-(--text2)">min avant</span>
                        <button type="button" class="file-action" @click="addCustomReminder"><i class="bi bi-plus-lg"></i> Ajouter</button>
                    </div>
                </div>

                <button type="button" class="prop-row" :class="{ 'is-active': activeSection === 'color' }" @click="toggleSection('color')">
                    <span class="prop-k"><i class="bi bi-palette"></i> Couleur</span>
                    <span class="prop-v">
                        <span class="w-3 h-3 rounded-full shrink-0" :style="{ background: f.color || 'var(--primary)' }"></span>
                        {{ colorLabel }}
                    </span>
                </button>
                <div v-if="activeSection === 'color'" class="prop-editor">
                    <div class="flex flex-wrap gap-2">
                        <button
                            type="button"
                            class="color-swatch"
                            :class="{ 'is-active': !f.color }"
                            style="background: var(--primary)"
                            title="Par défaut"
                            @click="f.color = null"
                        ></button>
                        <button
                            v-for="c in COLORS"
                            :key="c.value"
                            type="button"
                            class="color-swatch"
                            :class="{ 'is-active': f.color === c.value }"
                            :style="{ background: c.value }"
                            :title="c.label"
                            @click="f.color = c.value"
                        ></button>
                    </div>
                </div>

                <!-- Création pour le compte d'un collègue (accès en écriture à son agenda) -->
                <template v-if="!state.eventId && writableSharedCalendars.length">
                    <button type="button" class="prop-row" :class="{ 'is-active': activeSection === 'calendar' }" @click="toggleSection('calendar')">
                        <span class="prop-k"><i class="bi bi-calendar2-week"></i> Agenda</span>
                        <span class="prop-v"><span class="truncate">{{ calendarLabel }}</span></span>
                    </button>
                    <div v-if="activeSection === 'calendar'" class="prop-editor">
                        <div class="flex flex-col gap-1">
                            <button
                                v-for="o in calendarOptions"
                                :key="o.id ?? 'me'"
                                type="button"
                                class="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm text-left transition-colors"
                                :class="o.id === f.targetOwnerId ? 'bg-(--primary)/10 text-(--primary) font-bold' : 'text-(--text) hover:bg-(--text)/5'"
                                @click="f.targetOwnerId = o.id; activeSection = null"
                            >
                                <i class="bi bi-calendar3 w-4 text-center"></i>
                                <span class="truncate flex-1">{{ o.label }}</span>
                                <i v-if="o.id === f.targetOwnerId" class="bi bi-check-lg"></i>
                            </button>
                        </div>
                    </div>
                </template>
            </div>

            <section>
                <h3 class="section-title"><i class="bi bi-text-left"></i> Description</h3>
                <textarea
                    ref="descriptionEl"
                    v-model="f.description"
                    rows="3"
                    placeholder="Ordre du jour, lien de visio, notes…"
                    class="w-full resize-none bg-(--surface-sunken) border border-(--border-color) focus:border-(--primary)/50 rounded-xl px-3 py-2.5 text-sm text-(--text) placeholder:text-(--text2) focus:outline-none"
                    @input="autoGrow"
                ></textarea>
            </section>
        </div>

        <!-- Pied : état de l'enregistrement + actions rares -->
        <footer
            class="relative shrink-0 flex items-center gap-2 text-xs text-(--text2)"
            :class="variant === 'panel' ? 'px-4 py-2.5 border-t border-(--border-color)' : 'pt-5'"
        >
            <span class="flex-1 flex items-center gap-1.5 min-h-8">
                <template v-if="state.saveStatus === 'saving'"><i class="bi bi-arrow-repeat animate-spin"></i> Enregistrement…</template>
                <template v-else-if="state.saveStatus === 'saved'"><i class="bi bi-check-circle-fill text-green-500"></i> Enregistré</template>
                <template v-else-if="!state.eventId">
                    <i class="bi bi-info-circle"></i> {{ f.title.trim() ? 'Enregistrement automatique' : 'Donnez-lui un titre pour l\'enregistrer' }}
                </template>
            </span>
            <button
                v-if="state.eventId"
                ref="menuButtonEl"
                type="button"
                class="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-(--text)/10 hover:text-(--text) transition-colors"
                aria-label="Plus d'actions"
                :aria-expanded="menuOpen"
                @click="menuOpen = !menuOpen"
            >
                <i class="bi bi-three-dots"></i>
            </button>
            <Transition name="task-menu">
                <div
                    v-if="menuOpen"
                    ref="menuEl"
                    class="absolute right-3 bottom-full mb-1 min-w-56 p-1.5 rounded-xl bg-(--bg) border border-(--border-color) shadow-xl flex flex-col gap-0.5 z-10"
                >
                    <button v-if="isRecurringSeries" type="button" class="task-menu-item text-red-500!" @click="askDelete('occurrence')">
                        <i class="bi bi-calendar-x"></i> Annuler cette occurrence
                    </button>
                    <button type="button" class="task-menu-item text-red-500!" @click="askDelete('event')">
                        <i class="bi bi-trash"></i> {{ isRecurringSeries ? 'Supprimer toute la série' : 'Supprimer l\'événement' }}
                    </button>
                </div>
            </Transition>
        </footer>
    </div>

    <ConfirmDelete
        :show="showDeleteConfirm"
        :item-type="deleteMode === 'occurrence' ? 'cette occurrence' : isRecurringSeries ? 'toute la série' : 'l\'événement'"
        :item-name="f.title || 'cet événement'"
        :extra-warning="deleteMode === 'event' && isRecurringSeries ? 'Toutes les occurrences et réponses des participants seront perdues.' : undefined"
        :loading="deleting"
        @cancel="showDeleteConfirm = false"
        @confirm="confirmDelete"
    />
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import ConfirmDelete from '@/components/common/ConfirmDelete.vue';
import type { OrgMember } from '@/types/types';
import type { RsvpStatus } from '@/types/agenda';
import { openedOrg, user } from '@/assets/var';
import useSettingsItem from '@/composables/useSettingsItem';
import { useCalendarAccess } from '@/composables/useCalendarAccess';
import { useEventPanels, type EventFreq, type EventPanelState } from '@/composables/useEventPanels';

const props = withDefaults(defineProps<{
    panelId: string;
    state: EventPanelState;
    variant?: 'panel' | 'popup';
}>(), { variant: 'panel' });

const { saveEvent, addEventReminder, removeEventReminder, respondToEvent, deleteEventFromPanel } = useEventPanels();
const { acceptedSharedCalendars } = useCalendarAccess();

// Le formulaire vit dans le dock (useEventPanels) : réduire le panneau ne perd rien.
const f = props.state.form;

const { Item: privacyMode } = useSettingsItem('privacyMode', false);
const p = (name: unknown): string => {
    if (!name || typeof name !== 'string') return '';
    return privacyMode.value ? name.charAt(0).toUpperCase() : name;
};

// ── Sauvegarde automatique ─────────────────────────────────────────────
// Pas de bouton Enregistrer : chaque modification programme une sauvegarde
// (le premier titre crée l'événement). Réduire ou fermer le panneau envoie
// tout de suite ce qui restait en attente.
let saveTimer: ReturnType<typeof setTimeout> | null = null;

watch(() => props.state.form, () => {
    if (props.state.hydrating || props.state.loading) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
        saveTimer = null;
        saveEvent(props.state);
    }, 600);
}, { deep: true });

onBeforeUnmount(() => {
    if (!saveTimer) return;
    clearTimeout(saveTimer);
    saveTimer = null;
    saveEvent(props.state);
});

const titleInputEl = ref<HTMLInputElement | null>(null);
const descriptionEl = ref<HTMLTextAreaElement | null>(null);

const autoGrow = () => {
    const el = descriptionEl.value;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 320)}px`;
};

onMounted(() => nextTick(() => {
    autoGrow();
    if (!props.state.eventId && !f.title) titleInputEl.value?.focus();
}));
watch(() => props.state.loading, loading => { if (!loading) nextTick(autoGrow); });

// ── Sections ───────────────────────────────────────────────────────────
type Section = 'when' | 'repeat' | 'attendees' | 'reminders' | 'color' | 'calendar';
const activeSection = ref<Section | null>(null);
const toggleSection = (key: Section) => {
    activeSection.value = activeSection.value === key ? null : key;
};

// ── Horaire ────────────────────────────────────────────────────────────
const whenLabel = computed(() => {
    if (!f.startDate) return 'Choisir une date';
    const endDate = f.endDate || f.startDate;
    const day = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
    const sameDay = endDate === f.startDate;
    if (f.allDay) return sameDay ? `${day(f.startDate)} · journée entière` : `${day(f.startDate)} → ${day(endDate)}`;
    return sameDay
        ? `${day(f.startDate)} · ${f.startTime} – ${f.endTime}`
        : `${day(f.startDate)} ${f.startTime} → ${day(endDate)} ${f.endTime}`;
});

// Déplacer le début garde la durée : la fin suit au lieu de passer avant.
const previousStart = ref(`${f.startDate}T${f.startTime || '00:00'}`);
const keepEndAfterStart = () => {
    const before = new Date(previousStart.value);
    const start = new Date(`${f.startDate}T${f.startTime || '00:00'}`);
    const end = new Date(`${f.endDate || f.startDate}T${f.endTime || '00:00'}`);
    previousStart.value = `${f.startDate}T${f.startTime || '00:00'}`;
    if (isNaN(start.getTime()) || isNaN(before.getTime()) || isNaN(end.getTime())) return;
    const shifted = new Date(end.getTime() + (start.getTime() - before.getTime()));
    const pad = (n: number) => String(n).padStart(2, '0');
    f.endDate = `${shifted.getFullYear()}-${pad(shifted.getMonth() + 1)}-${pad(shifted.getDate())}`;
    if (!f.allDay) f.endTime = `${pad(shifted.getHours())}:${pad(shifted.getMinutes())}`;
};
watch(() => props.state.loading, () => { previousStart.value = `${f.startDate}T${f.startTime || '00:00'}`; });

// ── Répétition ─────────────────────────────────────────────────────────
const FREQS: { id: EventFreq; label: string }[] = [
    { id: 'NONE', label: 'Non' },
    { id: 'DAILY', label: 'Jour' },
    { id: 'WEEKLY', label: 'Semaine' },
    { id: 'MONTHLY', label: 'Mois' },
    { id: 'YEARLY', label: 'An' }
];

const freqUnitLabel = computed(() => ({ DAILY: 'jour(s)', WEEKLY: 'semaine(s)', MONTHLY: 'mois', YEARLY: 'an(s)', NONE: '' })[f.freq]);

const recurrenceSummary = computed(() => {
    const n = f.interval > 1 ? f.interval : 0;
    let base: string;
    switch (f.freq) {
        case 'DAILY': base = n ? `Tous les ${n} jours` : 'Tous les jours'; break;
        case 'WEEKLY': base = n ? `Toutes les ${n} semaines` : 'Toutes les semaines'; break;
        case 'MONTHLY': base = n ? `Tous les ${n} mois` : 'Tous les mois'; break;
        case 'YEARLY': base = n ? `Tous les ${n} ans` : 'Tous les ans'; break;
        default: return 'Ne se répète pas';
    }
    if (f.endType === 'ON_DATE' && f.untilDate) {
        return `${base}, jusqu'au ${new Date(`${f.untilDate}T00:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`;
    }
    if (f.endType === 'AFTER_COUNT') return `${base}, ${f.count} fois`;
    return base;
});

const isRecurringSeries = computed(() => !!props.state.occurrence?.isRecurring);

// ── Invités ────────────────────────────────────────────────────────────
const attendeeSearch = ref('');

const availableMembers = computed<OrgMember[]>(() =>
    (openedOrg.value?.members || []).filter(m => m.userId !== user.value?.id)
);

const filteredMembers = computed<OrgMember[]>(() => {
    const s = attendeeSearch.value.trim().toLowerCase();
    if (!s) return availableMembers.value;
    return availableMembers.value.filter(m => (m.user?.name || m.userId).toLowerCase().includes(s));
});

const selectedMembers = computed(() =>
    availableMembers.value.filter(m => f.attendeeIds.includes(m.userId))
);

const attendeesLabel = computed(() => {
    const list = selectedMembers.value;
    if (list.length === 1) return p(list[0]!.user?.name) || '1 invité';
    return `${list.length} invités`;
});

const ATTENDEE_STATUS: Record<RsvpStatus, { label: string; class: string } | null> = {
    ACCEPTED: { label: 'Accepté', class: 'text-green-500' },
    TENTATIVE: { label: 'Peut-être', class: 'text-amber-500' },
    DECLINED: { label: 'Décliné', class: 'text-red-500' },
    PENDING: { label: 'En attente', class: 'text-(--text2)' }
} as Record<RsvpStatus, { label: string; class: string } | null>;

const attendeeStatus = (userId: string) => {
    const a = props.state.details?.attendees.find(a => a.userId === userId);
    return a ? ATTENDEE_STATUS[a.status] ?? null : null;
};

// ── Réponse à l'invitation ─────────────────────────────────────────────
const RSVPS: { id: RsvpStatus; label: string; icon: string; activeClass: string }[] = [
    { id: 'ACCEPTED', label: 'Oui', icon: 'bi bi-check-lg', activeClass: 'bg-green-500 text-white' },
    { id: 'TENTATIVE', label: 'Peut-être', icon: 'bi bi-question-lg', activeClass: 'bg-amber-500 text-white' },
    { id: 'DECLINED', label: 'Non', icon: 'bi bi-x-lg', activeClass: 'bg-red-500 text-white' }
];

const myAttendee = computed(() => props.state.details?.attendees.find(a => a.userId === user.value?.id));
const showRsvp = computed(() => !!myAttendee.value && props.state.details?.creatorId !== user.value?.id);
const creatorName = computed(() => {
    const id = props.state.details?.creatorId;
    return openedOrg.value?.members?.find(m => m.userId === id)?.user?.name || '';
});

const delegateName = computed(() => {
    const id = props.state.details?.createdByDelegateId;
    if (!id) return null;
    if (id === user.value?.id) return 'vous';
    return openedOrg.value?.members?.find(m => m.userId === id)?.user?.name || 'un collègue';
});

// ── Rappels ────────────────────────────────────────────────────────────
const REMINDER_PRESETS = [10, 30, 60, 1440];
const customReminderMinutes = ref(15);

const sortedReminders = computed(() => [...props.state.reminders].sort((a, b) => a.minutesBefore - b.minutesBefore));

function formatMinutes(m: number): string {
    if (m % 1440 === 0) return m === 1440 ? '1 jour avant' : `${m / 1440} jours avant`;
    if (m % 60 === 0) return m === 60 ? '1 heure avant' : `${m / 60} heures avant`;
    return `${m} min avant`;
}

const remindersLabel = computed(() => {
    const list = sortedReminders.value;
    if (!list.length) return 'Aucun rappel';
    if (list.length === 1) return formatMinutes(list[0]!.minutesBefore);
    return `${list.length} rappels`;
});

const addCustomReminder = () => addEventReminder(props.state, customReminderMinutes.value);

// ── Couleur ────────────────────────────────────────────────────────────
// Mêmes teintes que AddExternalCalendarModal.vue.
const COLORS = [
    { value: '#6366f1', label: 'Indigo' },
    { value: '#22c55e', label: 'Vert' },
    { value: '#f59e0b', label: 'Ambre' },
    { value: '#ef4444', label: 'Rouge' },
    { value: '#ec4899', label: 'Rose' },
    { value: '#06b6d4', label: 'Cyan' },
    { value: '#8b5cf6', label: 'Violet' },
    { value: '#64748b', label: 'Ardoise' }
];
const colorLabel = computed(() => COLORS.find(c => c.value === f.color)?.label ?? (f.color ? 'Personnalisée' : 'Par défaut'));

// ── Agenda de création ─────────────────────────────────────────────────
const writableSharedCalendars = computed(() => acceptedSharedCalendars.value.filter(g => g.level === 'WRITE'));
const calendarOptions = computed(() => [
    { id: null as string | null, label: 'Mon agenda' },
    ...writableSharedCalendars.value.map(g => ({ id: g.ownerId as string | null, label: `Agenda de ${p(g.owner.name) || g.owner.pseudo}` }))
]);
const calendarLabel = computed(() => calendarOptions.value.find(o => o.id === f.targetOwnerId)?.label ?? 'Mon agenda');

// ── Menu « … » : supprimer ─────────────────────────────────────────────
const menuOpen = ref(false);
const menuEl = ref<HTMLElement | null>(null);
const menuButtonEl = ref<HTMLElement | null>(null);

const onDocumentPointerDown = (e: PointerEvent) => {
    if (!menuOpen.value) return;
    const target = e.target as Node;
    if (menuEl.value?.contains(target) || menuButtonEl.value?.contains(target)) return;
    menuOpen.value = false;
};
onMounted(() => document.addEventListener('pointerdown', onDocumentPointerDown));
onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocumentPointerDown));

const deleteMode = ref<'occurrence' | 'event'>('event');
const showDeleteConfirm = ref(false);
const deleting = ref(false);

const askDelete = (mode: 'occurrence' | 'event') => {
    menuOpen.value = false;
    deleteMode.value = mode;
    showDeleteConfirm.value = true;
};

const confirmDelete = async () => {
    deleting.value = true;
    try {
        // Une sauvegarde en attente recréerait ce qu'on supprime.
        if (saveTimer) {
            clearTimeout(saveTimer);
            saveTimer = null;
        }
        if (await deleteEventFromPanel(props.panelId, props.state, deleteMode.value)) {
            showDeleteConfirm.value = false;
        }
    } finally {
        deleting.value = false;
    }
};
</script>

<style scoped src="./taskPanel.css"></style>
<style scoped>
.ev-input {
    min-width: 0;
    background: var(--surface-sunken);
    border: 1px solid color-mix(in srgb, var(--text) 20%, transparent);
    border-radius: 0.5rem;
    padding: 0.35rem 0.6rem;
    font-size: 0.8rem;
    color: var(--text);
}
.ev-input:focus {
    outline: none;
    border-color: color-mix(in srgb, var(--primary) 50%, transparent);
}
.ev-input:disabled { opacity: 0.5; }

.reminder-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    height: 1.6rem;
    padding: 0 0.4rem 0 0.65rem;
    border-radius: 999px;
    font-size: 0.72rem;
    font-weight: 600;
    background: color-mix(in srgb, var(--primary) 14%, transparent);
    color: var(--text);
}
.reminder-chip button {
    display: grid;
    place-items: center;
    width: 1.1rem;
    height: 1.1rem;
    border-radius: 999px;
    font-size: 0.55rem;
    color: var(--text2);
}
.reminder-chip button:hover { background: color-mix(in srgb, var(--text) 12%, transparent); color: var(--text); }

.color-swatch {
    width: 1.5rem;
    height: 1.5rem;
    border-radius: 999px;
    border: 2px solid transparent;
    box-shadow: inset 0 0 0 2px var(--bg);
    transition: transform 0.1s ease;
}
.color-swatch:hover { transform: scale(1.12); }
.color-swatch.is-active { border-color: var(--text); }
</style>

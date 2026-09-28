<template>

    <div class="space-y-4">

        <!-- Rythme : une rangée de pastilles, et en dessous uniquement ce que
             ce rythme réclame. Un utilisateur simple ne voit que ça. -->
        <div class="flex flex-wrap gap-2">
            <button
                v-for="option in RHYTHMS"
                :key="option.value"
                @click="setRhythm(option.value)"
                class="px-4 py-2 rounded-lg text-sm font-medium border transition-all"
                :class="model.rhythm === option.value
                    ? 'bg-(--primary) text-white border-(--primary)'
                    : 'bg-(--bg2) text-(--text2) border-(--border-color) hover:text-(--text)'"
            >
                {{ option.label }}
            </button>
        </div>

        <div class="p-4 bg-(--bg2) rounded-xl border border-(--border-color) space-y-4">

            <!-- HORAIRE -->
            <template v-if="model.rhythm === 'HOURLY'">
                <label class="field">
                    <span class="field-label">Intervalle</span>
                    <select v-model.number="model.intervalHours" class="input">
                        <option v-for="h in 12" :key="h" :value="h">
                            {{ h === 1 ? 'Toutes les heures' : `Toutes les ${h} heures` }}
                        </option>
                    </select>
                </label>

                <div class="grid grid-cols-2 gap-3">
                    <label class="field">
                        <span class="field-label">À partir de</span>
                        <input type="time" class="input" :value="toTime(model.activeFromMinute ?? 540)"
                            @input="model.activeFromMinute = fromTime($event)" />
                    </label>
                    <label class="field">
                        <span class="field-label">Jusqu'à</span>
                        <input type="time" class="input" :value="toTime(model.activeUntilMinute ?? 1140)"
                            @input="model.activeUntilMinute = fromTime($event)" />
                    </label>
                </div>
            </template>

            <!-- QUOTIDIEN / HEBDOMADAIRE -->
            <template v-else-if="model.rhythm === 'DAILY' || model.rhythm === 'WEEKLY'">
                <div v-if="model.rhythm === 'WEEKLY'" class="field">
                    <span class="field-label">Jours d'envoi</span>
                    <div class="flex flex-wrap gap-1.5">
                        <button
                            v-for="(day, index) in DAY_LABELS"
                            :key="day"
                            @click="toggleWeekday(index + 1)"
                            class="w-10 h-10 rounded-lg text-sm font-medium border transition-all"
                            :class="model.activeWeekdays.includes(index + 1)
                                ? 'bg-(--primary) text-white border-(--primary)'
                                : 'bg-(--bg) text-(--text2) border-(--border-color) hover:text-(--text)'"
                        >
                            {{ day }}
                        </button>
                    </div>
                </div>

                <label class="field">
                    <span class="field-label">Heure d'envoi</span>
                    <input type="time" class="input" :value="toTime(model.sendTimes[0] ?? 510)"
                        @input="setFirstSendTime($event)" />
                </label>
            </template>

            <!-- MENSUEL -->
            <template v-else>
                <label class="field">
                    <span class="field-label">Jour du mois</span>
                    <select v-model.number="model.dayOfMonth" class="input">
                        <option :value="-1">Le dernier jour du mois</option>
                        <option v-for="d in 28" :key="d" :value="d">
                            {{ d === 1 ? 'Le 1er' : `Le ${d}` }}
                        </option>
                    </select>
                    <!-- 29 à 31 volontairement absents : ces quantièmes n'existent
                         pas tous les mois, et « dernier jour » exprime l'intention
                         sans ambiguïté. -->
                </label>

                <label class="field">
                    <span class="field-label">Heure d'envoi</span>
                    <input type="time" class="input" :value="toTime(model.sendTimes[0] ?? 510)"
                        @input="setFirstSendTime($event)" />
                </label>
            </template>

        </div>

        <!-- Le repli : un utilisateur simple ne l'ouvre jamais, un utilisateur
             exigeant y trouve tout. -->
        <div>
            <button
                @click="showAdvanced = !showAdvanced"
                class="flex items-center gap-2 text-sm text-(--text2) hover:text-(--text) transition-colors"
            >
                <i :class="showAdvanced ? 'bi bi-chevron-down' : 'bi bi-chevron-right'" />
                Affiner
            </button>

            <div v-if="showAdvanced" class="mt-3 p-4 bg-(--bg2) rounded-xl border border-(--border-color) space-y-4">

                <div v-if="model.rhythm === 'DAILY'" class="field">
                    <span class="field-label">Jours actifs</span>
                    <div class="flex flex-wrap gap-1.5">
                        <button
                            v-for="(day, index) in DAY_LABELS"
                            :key="day"
                            @click="toggleWeekday(index + 1)"
                            class="w-10 h-10 rounded-lg text-sm font-medium border transition-all"
                            :class="model.activeWeekdays.length === 0 || model.activeWeekdays.includes(index + 1)
                                ? 'bg-(--primary) text-white border-(--primary)'
                                : 'bg-(--bg) text-(--text2) border-(--border-color) hover:text-(--text)'"
                        >
                            {{ day }}
                        </button>
                    </div>
                    <span class="text-xs text-(--text2)">Aucun jour coché signifie tous les jours.</span>
                </div>

                <div v-if="model.rhythm !== 'HOURLY'" class="field">
                    <span class="field-label">Heures d'envoi supplémentaires</span>
                    <div class="flex flex-wrap items-center gap-2">
                        <span
                            v-for="(minutes, index) in extraSendTimes"
                            :key="`${minutes}-${index}`"
                            class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-(--primary)/10 text-(--primary) text-sm"
                        >
                            {{ formatMinutes(minutes) }}
                            <button @click="removeSendTime(minutes)" class="hover:opacity-70">
                                <i class="bi bi-x-lg text-xs" />
                            </button>
                        </span>
                        <input
                            type="time"
                            class="input w-32"
                            :value="newSendTime"
                            @input="newSendTime = ($event.target as HTMLInputElement).value"
                        />
                        <button
                            @click="addSendTime"
                            :disabled="model.sendTimes.length >= 6"
                            class="px-3 py-1.5 rounded-lg bg-(--text)/5 text-sm text-(--text) hover:bg-(--text)/10 transition-colors disabled:opacity-40"
                        >
                            Ajouter
                        </button>
                    </div>
                </div>

                <label class="field">
                    <span class="field-label">Fuseau horaire</span>
                    <select v-model="model.timezone" class="input">
                        <option v-for="tz in TIMEZONES" :key="tz" :value="tz">{{ tz }}</option>
                    </select>
                </label>

                <div class="grid grid-cols-2 gap-3">
                    <label class="field">
                        <span class="field-label">Commence le</span>
                        <input type="date" class="input" :value="toDate(model.startsAt)"
                            @input="model.startsAt = fromDate($event)" />
                    </label>
                    <label class="field">
                        <span class="field-label">Se termine le</span>
                        <input type="date" class="input" :value="toDate(model.endsAt)"
                            @input="model.endsAt = fromDate($event)" />
                    </label>
                </div>

            </div>
        </div>

        <!-- La phrase qui redit la configuration. C'est l'élément le plus utile
             de l'écran : une grille de cases ne dit pas ce qu'on vient de régler. -->
        <div class="flex items-start gap-2.5 p-3.5 rounded-xl bg-(--primary)/8 border border-(--primary)/20">
            <i class="bi bi-clock-history text-(--primary) mt-0.5 shrink-0" />
            <p class="text-sm text-(--text) leading-relaxed">{{ summary }}</p>
        </div>

    </div>

</template>

<script setup lang="ts">

import { ref, computed } from 'vue';
import { describeScheduleFull, formatMinutes } from '@/assets/utils/describeSchedule';
import type { ActivityReport, ReportRhythm } from '@/types/activityReports';

/** Sous-ensemble planification, modifié en place par l'éditeur parent. */
type ScheduleModel = Pick<
    ActivityReport,
    'rhythm' | 'sendTimes' | 'activeWeekdays' | 'intervalHours'
    | 'activeFromMinute' | 'activeUntilMinute' | 'dayOfMonth' | 'timezone' | 'startsAt' | 'endsAt'
>;

const model = defineModel<ScheduleModel>({ required: true });

const props = defineProps<{ nextRunAt?: string | null }>();

const RHYTHMS: { value: ReportRhythm; label: string }[] = [
    { value: 'HOURLY', label: 'Toutes les heures' },
    { value: 'DAILY', label: 'Chaque jour' },
    { value: 'WEEKLY', label: 'Chaque semaine' },
    { value: 'MONTHLY', label: 'Chaque mois' },
];

const DAY_LABELS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

// Liste courte : les fuseaux réellement utilisés par les équipes, plutôt que
// les ~600 identifiants IANA dans un <select>.
const TIMEZONES = [
    'Europe/Paris', 'Europe/London', 'Europe/Lisbon', 'Europe/Madrid', 'Europe/Berlin',
    'Europe/Brussels', 'Europe/Zurich', 'Europe/Athens', 'Africa/Casablanca', 'Africa/Abidjan',
    'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
    'America/Montreal', 'America/Sao_Paulo', 'Asia/Dubai', 'Asia/Kolkata',
    'Asia/Singapore', 'Asia/Tokyo', 'Australia/Sydney', 'UTC',
];

const showAdvanced = ref<boolean>(false);
const newSendTime = ref<string>('18:00');

const summary = computed(() => describeScheduleFull(model.value, props.nextRunAt));

/** Toutes les heures sauf la première, réglée dans le bloc principal. */
const extraSendTimes = computed(() => [...model.value.sendTimes].sort((a, b) => a - b).slice(1));

const toTime = (minutes: number): string =>
    `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

const fromTime = (event: Event): number => {
    const [h, m] = (event.target as HTMLInputElement).value.split(':').map(Number);
    return (h ?? 0) * 60 + (m ?? 0);
};

const toDate = (iso?: string | null): string => (iso ? new Date(iso).toISOString().slice(0, 10) : '');

const fromDate = (event: Event): string | null => {
    const value = (event.target as HTMLInputElement).value;
    return value ? new Date(`${value}T00:00:00`).toISOString() : null;
};

const setFirstSendTime = (event: Event) => {
    const minutes = fromTime(event);
    const rest = [...model.value.sendTimes].sort((a, b) => a - b).slice(1);
    model.value.sendTimes = [minutes, ...rest];
};

const setRhythm = (rhythm: ReportRhythm) => {
    model.value.rhythm = rhythm;

    // Chaque rythme a des champs obligatoires côté API : on les renseigne au
    // changement plutôt que de laisser l'enregistrement échouer sur un 400.
    if (rhythm === 'HOURLY') {
        model.value.intervalHours ??= 1;
        model.value.activeFromMinute ??= 9 * 60;
        model.value.activeUntilMinute ??= 19 * 60;
    }
    if (rhythm === 'WEEKLY' && model.value.activeWeekdays.length === 0) {
        model.value.activeWeekdays = [1];
    }
    if (rhythm === 'MONTHLY') {
        model.value.dayOfMonth ??= 1;
    }
};

const toggleWeekday = (day: number) => {
    const current = model.value.activeWeekdays;
    model.value.activeWeekdays = current.includes(day)
        ? current.filter(d => d !== day)
        : [...current, day].sort((a, b) => a - b);
};

const addSendTime = () => {
    const [h, m] = newSendTime.value.split(':').map(Number);
    const minutes = (h ?? 0) * 60 + (m ?? 0);
    if (model.value.sendTimes.includes(minutes) || model.value.sendTimes.length >= 6) return;
    model.value.sendTimes = [...model.value.sendTimes, minutes].sort((a, b) => a - b);
};

const removeSendTime = (minutes: number) => {
    if (model.value.sendTimes.length <= 1) return;
    model.value.sendTimes = model.value.sendTimes.filter(t => t !== minutes);
};

</script>

<style scoped>

.field {
    @apply flex flex-col gap-1.5;
}

.field-label {
    @apply text-sm font-medium text-(--text);
}

.input {
    @apply bg-(--bg) border border-(--border-color) rounded-lg px-3 py-2 text-sm text-(--text) outline-none focus:border-(--primary)/50 transition-colors;
}

</style>

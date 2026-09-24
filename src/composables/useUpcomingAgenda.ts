// ============================================
// Flux "agenda à venir" paginé par fenêtres de jours, pour un affichage en
// défilement infini (carte Agenda de l'accueil). Rien à voir avec
// useAgendaFeed.ts, qui gère le lien d'abonnement iCal ("feed") de l'agenda.
//
// State local à chaque appel, contrairement à useAgenda.ts dont l'état est
// partagé au niveau module : la carte accumule ses propres fenêtres et ne doit
// pas écraser (ni se faire écraser par) les occurrences de la vue Agenda.
// ============================================

import { computed, ref } from 'vue';
import sfetch from '@/assets/utils/sfetch';
import { useExternalCalendars } from './useExternalCalendars';
import type { ListOccurrencesResponse, OccurrenceInstance } from '@/types/agenda';

// Taille d'une fenêtre de chargement, en jours. Assez large pour qu'un agenda
// normalement rempli ait de quoi remplir la carte en une requête, assez petite
// pour que le premier affichage ne dépende pas d'un an d'expansion de
// récurrences côté serveur.
const CHUNK_DAYS = 30;

// Au-delà, on arrête : un agenda vide ne doit pas déclencher une requête par
// fenêtre indéfiniment.
const HORIZON_DAYS = 365;

export interface UpcomingAgendaDay {
    key: string; // YYYY-MM-DD local
    date: Date;
    occurrences: OccurrenceInstance[];
}

function startOfDay(date: Date): Date {
    const copy = new Date(date);
    copy.setHours(0, 0, 0, 0);
    return copy;
}

function addDays(date: Date, days: number): Date {
    const copy = new Date(date);
    copy.setDate(copy.getDate() + days);
    return copy;
}

export function dayKeyOf(date: Date): string {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
}

export function useUpcomingAgenda() {
    const { isExternalCalendarVisible } = useExternalCalendars();

    const occurrences = ref<OccurrenceInstance[]>([]);
    const loading = ref(false);      // première fenêtre
    const loadingMore = ref(false);  // fenêtres suivantes
    const reachedEnd = ref(false);
    const error = ref<string | null>(null);

    const feedStart = ref<Date>(startOfDay(new Date()));
    const loadedUntil = ref<Date>(startOfDay(new Date()));

    let orgId: string | null = null;
    // Clé composite : `occurrenceKey` ne vaut que l'ISO du début pour une série
    // récurrente, il n'est donc unique qu'au sein d'un même événement. Sert à
    // dédupliquer un événement renvoyé par deux fenêtres qui se chevauchent
    // (typiquement un événement multi-jours à cheval).
    let seen = new Set<string>();

    const horizonEnd = computed(() => addDays(feedStart.value, HORIZON_DAYS));

    const days = computed<UpcomingAgendaDay[]>(() => {
        const startMs = feedStart.value.getTime();
        const groups = new Map<string, UpcomingAgendaDay>();

        for (const occ of occurrences.value) {
            // Un événement commencé avant le début du flux (multi-jours encore
            // en cours) est rattaché au premier jour affiché : rangé à sa vraie
            // date de début, il tomberait dans le passé et serait invisible
            // alors qu'il concerne toujours aujourd'hui.
            let day = startOfDay(new Date(occ.startAt));
            if (day.getTime() < startMs) day = new Date(feedStart.value);

            const key = dayKeyOf(day);
            const group = groups.get(key);
            if (group) group.occurrences.push(occ);
            else groups.set(key, { key, date: day, occurrences: [occ] });
        }

        const list = [...groups.values()].sort((a, b) => a.date.getTime() - b.date.getTime());
        for (const group of list) {
            group.occurrences.sort((a, b) => {
                if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
                return new Date(a.startAt).getTime() - new Date(b.startAt).getTime();
            });
        }
        return list;
    });

    const isEmpty = computed(() => !loading.value && days.value.length === 0);

    /** Charge la fenêtre suivante. Renvoie false si rien n'a été chargé (fin, échec, ou chargement déjà en cours). */
    async function loadMore(): Promise<boolean> {
        if (!orgId || reachedEnd.value || loading.value || loadingMore.value) return false;

        const from = loadedUntil.value;
        const to = addDays(from, CHUNK_DAYS) > horizonEnd.value ? horizonEnd.value : addDays(from, CHUNK_DAYS);
        if (to.getTime() <= from.getTime()) {
            reachedEnd.value = true;
            return false;
        }

        const isFirstWindow = occurrences.value.length === 0 && from.getTime() === feedStart.value.getTime();
        if (isFirstWindow) loading.value = true;
        else loadingMore.value = true;
        error.value = null;

        try {
            const params = new URLSearchParams({
                from: from.toISOString(),
                // `to` exclusif côté flux (début du jour suivant la fenêtre),
                // l'API attend une borne incluse.
                to: new Date(to.getTime() - 1).toISOString()
            });
            const res = await sfetch(`/api/orgs/${orgId}/agenda/events?${params.toString()}`);
            if (!res.ok) throw new Error('fetch failed');

            const data: ListOccurrencesResponse = await res.json();
            const fresh = data.occurrences.filter(occ => {
                // Même préférence locale de masquage que la vue Agenda
                // (useExternalCalendars) : un calendrier externe masqué ne doit
                // pas ressortir sur l'accueil.
                if (occ.externalConnectionId && orgId && !isExternalCalendarVisible(orgId, occ.externalConnectionId)) return false;
                const key = `${occ.eventId}|${occ.occurrenceKey}`;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });

            if (fresh.length > 0) occurrences.value = [...occurrences.value, ...fresh];
            loadedUntil.value = to;
            if (to.getTime() >= horizonEnd.value.getTime()) reachedEnd.value = true;
            return true;
        } catch {
            // `loadedUntil` n'avance pas : la même fenêtre sera retentée au
            // prochain déclenchement (scroll ou bouton), sans trou dans le flux.
            error.value = "Impossible de charger la suite de l'agenda.";
            return false;
        } finally {
            loading.value = false;
            loadingMore.value = false;
        }
    }

    /** (Ré)initialise le flux sur aujourd'hui et charge la première fenêtre. */
    async function start(targetOrgId: string): Promise<void> {
        orgId = targetOrgId;
        occurrences.value = [];
        seen = new Set();
        feedStart.value = startOfDay(new Date());
        loadedUntil.value = startOfDay(new Date());
        reachedEnd.value = false;
        error.value = null;
        await loadMore();
    }

    return {
        days,
        loading,
        loadingMore,
        reachedEnd,
        error,
        isEmpty,
        feedStart,
        loadedUntil,
        start,
        loadMore
    };
}

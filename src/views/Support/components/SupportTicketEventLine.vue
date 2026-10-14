<template>

    <!-- Événement système d'un ticket (prise en charge, transfert,
         changement de statut/urgence…), affiché au milieu du fil PUBLIC.
         Aucun précédent dans ThreadView (les threads n'ont pas ce genre
         d'événement inline) : style simple, centré, comme demandé. -->

    <div class="flex items-center justify-center my-3 px-4">
        <div class="flex items-center gap-2 text-[11px] text-(--text2) bg-(--text)/5 rounded-full px-3 py-1">
            <i class="bi" :class="icon" />
            <span>{{ label }}</span>
            <span class="opacity-60">· {{ formatTime(event.createdAt) }}</span>
        </div>
    </div>

</template>

<script lang="ts" setup>

import { computed } from 'vue';
import type { SupportTicketEventDTO } from '@/types/support';

const props = defineProps<{ event: SupportTicketEventDTO }>();

const translatePriority = (p: unknown) => ({ LOW: 'basse', NORMAL: 'normale', HIGH: 'haute', URGENT: 'urgente' } as Record<string, string>)[String(p)] ?? String(p ?? '');
const translateStatus = (s: unknown) => ({
    PENDING: 'en attente', IN_PROGRESS: 'en cours', WAITING_CUSTOMER: "en attente du client",
    RESOLVED: 'résolu', CLOSED: 'fermé',
} as Record<string, string>)[String(s)] ?? String(s ?? '');

const actorName = computed(() => props.event.actor?.name ?? 'Quelqu\'un');

const icon = computed(() => ({
    CREATED: 'bi-plus-circle',
    CLAIMED: 'bi-person-check-fill',
    TRANSFERRED: 'bi-arrow-left-right',
    RELEASED: 'bi-person-dash-fill',
    PRIORITY_CHANGED: 'bi-exclamation-triangle',
    STATUS_CHANGED: 'bi-arrow-repeat',
    CLOSED_BY_CLIENT: 'bi-x-circle',
    REOPENED_BY_CLIENT: 'bi-arrow-counterclockwise',
}[props.event.type] ?? 'bi-dot'));

const label = computed(() => {
    const data = props.event.data ?? {};
    switch (props.event.type) {
        case 'CREATED': return 'Ticket créé.';
        case 'CLAIMED': return `${actorName.value} a pris en charge le ticket (urgence ${translatePriority(data.priority)}).`;
        case 'TRANSFERRED': return `${actorName.value} a transféré le ticket.`;
        case 'RELEASED': return `${actorName.value} a libéré le ticket.`;
        case 'PRIORITY_CHANGED': return `${actorName.value} a changé l'urgence${data.to ? ` : ${translatePriority(data.to)}` : ''}.`;
        case 'STATUS_CHANGED': return `Statut changé${data.to ? ` : ${translateStatus(data.to)}` : ''}${!props.event.actor ? ' (réponse du client)' : ''}.`;
        case 'CLOSED_BY_CLIENT': return 'Le client a fermé le ticket.';
        case 'REOPENED_BY_CLIENT': return 'Le client a réouvert le ticket.';
        default: return props.event.type;
    }
});

const formatTime = (iso: string) => new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

</script>

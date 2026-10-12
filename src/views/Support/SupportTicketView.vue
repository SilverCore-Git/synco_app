<template>

    <div class="h-full flex flex-col overflow-hidden bg-(--bg2) text-(--text)">

        <nav class="shrink-0 bg-(--bg)/80 backdrop-blur-xl border-b border-(--text)/5 px-4 sm:px-6 py-3">
            <div class="max-w-3xl mx-auto flex items-center gap-3">
                <router-link to="/support" class="p-2 hover:bg-(--text)/5 rounded-xl transition-colors shrink-0">
                    <i class="bi bi-arrow-left text-xl" />
                </router-link>

                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2">
                        <span v-if="ticket" class="text-xs font-mono text-(--text2)">#{{ ticket.number }}</span>
                        <h1 class="font-bold truncate">{{ title ?? (ticket ? '(sans titre)' : 'Chargement...') }}</h1>
                    </div>
                    <div v-if="ticket" class="flex items-center gap-2 text-xs mt-1 flex-wrap">
                        <span class="px-2 py-0.5 rounded-full border text-[10px] font-bold" :class="STATUS_COLORS[ticket.status]">{{ statusLabel(ticket.status) }}</span>
                        <span v-if="ticket.priority" class="px-2 py-0.5 rounded-full border text-[10px] font-bold" :class="PRIORITY_COLORS[ticket.priority]">{{ priorityLabel(ticket.priority) }}</span>
                        <span v-if="ticket.assignee" class="flex items-center gap-1.5 text-(--text2)">
                            <img :src="ticket.assignee.avatarUrl || defaultAvatar(ticket.assignee.name)" class="w-4 h-4 rounded-full object-cover" />
                            {{ ticket.assignee.name }}
                        </span>
                        <span v-else class="text-(--text2)">Non assigné</span>
                    </div>
                </div>

                <button
                    v-if="ticket && (ticket.status === 'RESOLVED' || ticket.status === 'CLOSED')"
                    class="default text-xs shrink-0"
                    :disabled="actionBusy"
                    @click="reopen"
                >
                    <i class="bi bi-arrow-counterclockwise mr-1" /> Réouvrir
                </button>
                <button
                    v-else-if="ticket"
                    class="danger text-xs shrink-0"
                    :disabled="actionBusy"
                    @click="confirmClose = true"
                >
                    <i class="bi bi-check2-circle mr-1" /> Fermer
                </button>
            </div>
        </nav>

        <p v-if="publicKeyError" class="shrink-0 text-xs text-amber-500 bg-amber-500/10 border-b border-amber-500/20 px-4 py-2">
            <i class="bi bi-exclamation-triangle-fill mr-1" /> {{ publicKeyError.message }}
        </p>

        <ChatTimeline
            v-if="ticket"
            ref="timelineRef"
            :channel="channel"
            :loading="loadingMessages"
            placeholder="Décrivez votre problème..."
        >
            <template #header>
                <div v-if="events.length" class="mb-4">
                    <SupportTicketEventLine v-for="ev in events" :key="ev.id" :event="ev" />
                </div>
            </template>
        </ChatTimeline>

        <div v-else class="flex-1 flex items-center justify-center">
            <SpinLoader v-if="loadingTicket" />
            <p v-else class="text-(--text2)">{{ notFoundMessage }}</p>
        </div>

        <ConfirmDelete
            :show="confirmClose"
            item-name="ce ticket"
            item-type="le ticket"
            title="Fermer ce ticket ?"
            message="Vous pourrez le réouvrir à tout moment si le problème n'est pas résolu."
            button-text="Fermer le ticket"
            :loading="actionBusy"
            @confirm="close"
            @cancel="confirmClose = false"
        />

    </div>

</template>

<script lang="ts" setup>

import { computed, onMounted, onUnmounted, ref, shallowRef } from 'vue';
import { useRoute } from 'vue-router';
import type { Socket } from 'socket.io-client';
import { defaultAvatar } from '@/assets/utils/defaultAvatar';
import { decryptMessages } from '@/assets/utils/decryptMessages';
import { useToast } from '@/composables/useToast';
import useWSocket from '@/composables/useWSocket';
import { useSupportRole } from '@/composables/useSupportRole';
import { useSupportTicketEvents } from '@/composables/useSupportTicketEvents';
import { createSupportMessageChannel } from '@/composables/supportMessageChannel';
import { supportApi } from '@/services/support/api';
import { openSupportTicket } from '@/services/support/tickets';
import { SupportLockedError } from '@/services/support/keys';
import type { SupportTicketDTO, SupportTicketEventDTO } from '@/types/support';
import ChatTimeline from '@/views/OrgSpace/components/common/ChatTimeline.vue';
import ConfirmDelete from '@/components/common/ConfirmDelete.vue';
import SpinLoader from '@/components/SpinLoader.vue';
import SupportTicketEventLine from './components/SupportTicketEventLine.vue';
import { STATUS_COLORS, PRIORITY_COLORS, statusLabel, priorityLabel } from './supportLabels';

const route = useRoute();
const toast = useToast();
const { role } = useSupportRole();

const ticketId = computed(() => route.params.id as string);
const ticket = shallowRef<SupportTicketDTO | null>(null);
const title = ref<string | null>(null);
const publicKey = shallowRef<CryptoKey | null>(null);
const publicKeyError = ref<Error | null>(null);
const events = ref<SupportTicketEventDTO[]>([]);
const loadingTicket = ref(true);
const loadingMessages = ref(true);
const notFoundMessage = ref('Ticket introuvable ou accès refusé.');
const confirmClose = ref(false);
const actionBusy = ref(false);
const timelineRef = ref<InstanceType<typeof ChatTimeline> | null>(null);
const socket = shallowRef<Socket | null>(null);

const channel = createSupportMessageChannel({
    ticketId: () => ticket.value?.id ?? null,
    channel: 'PUBLIC',
    key: publicKey,
    ticket,
    role,
    socket,
});

const loadEvents = async () => {
    try {
        events.value = await supportApi.getTicketEvents(ticketId.value);
    } catch (e) {
        console.warn('[Support] Événements du ticket indisponibles :', (e as Error).message);
    }
};

const load = async () => {
    loadingTicket.value = true;
    loadingMessages.value = true;
    publicKeyError.value = null;
    try {
        const opened = await openSupportTicket(ticketId.value);
        ticket.value = opened.ticket;
        title.value = opened.title;
        publicKey.value = opened.publicKey;
        publicKeyError.value = opened.publicKeyError;
        loadingTicket.value = false;

        await loadEvents();

        if (opened.publicKey) {
            const { messages, hasMore } = await channel.join();
            const decrypted = await decryptMessages(messages, opened.publicKey);
            timelineRef.value?.setMessages(decrypted, hasMore);
        }
    } catch (e) {
        loadingTicket.value = false;
        if (e instanceof SupportLockedError) {
            notFoundMessage.value = e.message;
        } else {
            notFoundMessage.value = 'Ticket introuvable ou accès refusé.';
            console.error('[Support] Ouverture du ticket impossible :', e);
        }
    } finally {
        loadingMessages.value = false;
    }
};

useSupportTicketEvents({
    scope: 'client',
    ticketId,
    onTicketUpdated: (t) => { if (t.id === ticket.value?.id) ticket.value = t; },
    onEvent: (ev) => { if (ev.ticketId === ticket.value?.id) events.value = [...events.value, ev]; },
});

const close = async () => {
    actionBusy.value = true;
    try {
        ticket.value = await supportApi.closeTicket(ticketId.value);
        confirmClose.value = false;
        toast.show('Ticket fermé.', 'success');
    } catch (e) {
        toast.show((e as Error).message || 'Impossible de fermer le ticket.', 'error');
    } finally {
        actionBusy.value = false;
    }
};

const reopen = async () => {
    actionBusy.value = true;
    try {
        ticket.value = await supportApi.reopenTicket(ticketId.value);
        toast.show('Ticket réouvert.', 'success');
    } catch (e) {
        toast.show((e as Error).message || 'Impossible de réouvrir le ticket.', 'error');
    } finally {
        actionBusy.value = false;
    }
};

onMounted(async () => {
    socket.value = (await useWSocket()).value;
    await load();
});

onUnmounted(() => {
    channel.leave();
});

</script>

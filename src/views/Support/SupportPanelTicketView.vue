<template>

    <div class="h-full flex flex-col overflow-hidden bg-(--bg2) text-(--text)">

        <!-- En-tête : urgence, statut, tags, assigné, actions. -->
        <nav class="shrink-0 bg-(--bg)/80 backdrop-blur-xl border-b border-(--text)/5 px-4 sm:px-6 py-3">
            <div class="flex items-center gap-3 flex-wrap">
                <router-link to="/support-panel" class="p-2 hover:bg-(--text)/5 rounded-xl transition-colors shrink-0">
                    <i class="bi bi-arrow-left text-xl" />
                </router-link>

                <div class="min-w-0">
                    <div class="flex items-center gap-2">
                        <span v-if="ticket" class="text-xs font-mono text-(--text2)">#{{ ticket.number }}</span>
                        <h1 class="font-bold truncate max-w-80">{{ title ?? (ticket ? '(sans titre)' : 'Chargement...') }}</h1>
                    </div>
                </div>

                <div v-if="ticket" class="flex items-center gap-2 ml-auto flex-wrap">

                    <div class="w-36">
                        <SupportSearchSelect
                            :model-value="ticket.status"
                            :options="STATUS_OPTIONS"
                            @update:model-value="(s) => s && changeStatus(s)"
                        />
                    </div>

                    <div class="w-36">
                        <SupportSearchSelect
                            :model-value="ticket.priority"
                            :options="PRIORITY_OPTIONS"
                            none-label="Sans urgence"
                            placeholder="Urgence"
                            @update:model-value="(p) => p && changePriority(p)"
                        />
                    </div>

                    <div class="w-48">
                        <SupportSearchSelect
                            :model-value="null"
                            :options="addableTagOptions"
                            placeholder="+ Tag"
                            search-placeholder="Rechercher ou créer un tag..."
                            creatable
                            @update:model-value="(id) => id && addTag(id)"
                            @create="createAndAddTag"
                        />
                    </div>

                    <template v-if="!ticket.assignee">
                        <button class="primary text-xs" :disabled="actionBusy" @click="showClaim = true">
                            <i class="bi bi-person-check mr-1" /> Prendre en charge
                        </button>
                    </template>
                    <template v-else>
                        <div class="w-44">
                            <SupportSearchSelect
                                :model-value="ticket.assignee.id"
                                :options="transferOptions"
                                placeholder="Transférer..."
                                search-placeholder="Rechercher un membre..."
                                @update:model-value="(id) => id && id !== ticket!.assignee!.id && transfer(id)"
                            />
                        </div>
                        <button class="default text-xs" :disabled="actionBusy" @click="release">
                            <i class="bi bi-person-dash mr-1" /> Libérer
                        </button>
                    </template>

                </div>
            </div>

            <div v-if="ticket && ticket.tags.length" class="flex items-center gap-1.5 flex-wrap mt-2">
                <span
                    v-for="tag in ticket.tags"
                    :key="tag.id"
                    class="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold"
                    :style="{ background: tag.color + '22', color: tag.color }"
                >
                    {{ tag.name }}
                    <button @click="removeTag(tag.id)" class="hover:text-red-500">
                        <i class="bi bi-x" />
                    </button>
                </span>
            </div>

            <p v-if="publicKeyError" class="text-xs text-amber-500 mt-2">
                <i class="bi bi-exclamation-triangle-fill mr-1" /> Canal client : {{ publicKeyError.message }}
            </p>
            <p v-if="internalKeyError" class="text-xs text-amber-500 mt-2">
                <i class="bi bi-exclamation-triangle-fill mr-1" /> Canal interne : {{ internalKeyError.message }}
            </p>
        </nav>

        <!-- Mobile : onglets. Bureau : PUBLIC au centre, INTERNAL + fiche à droite. -->
        <div class="sm:hidden shrink-0 flex items-center gap-1 bg-(--bg) border-b border-(--text)/5 p-1.5">
            <button
                v-for="t in (['public','internal'] as const)"
                :key="t"
                class="flex-1 px-3 py-1.5 rounded-md text-xs font-bold transition-colors"
                :class="mobileTab === t ? 'bg-(--primary) text-white' : 'text-(--text2)'"
                @click="mobileTab = t"
            >
                {{ t === 'public' ? 'Client' : 'Interne' }}
            </button>
        </div>

        <main v-if="ticket" class="flex-1 min-h-0 flex overflow-hidden">

            <!-- relative + overflow-hidden : ChatTimeline ancre sa barre de
                 saisie en `absolute inset-x-0` au premier ancêtre positionné
                 (même motif que ThreadLayout.vue). Sans ça, les deux
                 timelines PUBLIC/INTERNAL remontaient jusqu'au même ancêtre
                 positionné de la page, et leurs barres de saisie s'étalaient
                 chacune sur toute cette largeur au lieu de rester dans leur
                 colonne — celle du fil interne recouvrait celle du client. -->
            <div class="relative overflow-hidden flex-1 min-w-0 flex flex-col" :class="{ 'hidden sm:flex': mobileTab !== 'public' }">
                <ChatTimeline :channel="publicChannel" ref="publicTimelineRef" :loading="loadingPublic" placeholder="Répondre au client...">
                    <template #header>
                        <div v-if="events.length" class="mb-4">
                            <SupportTicketEventLine v-for="ev in events" :key="ev.id" :event="ev" />
                        </div>
                    </template>
                </ChatTimeline>
            </div>

            <div class="w-full sm:w-96 shrink-0 border-l border-(--text)/5 flex flex-col overflow-hidden" :class="{ 'hidden sm:flex': mobileTab !== 'internal' }">

                <div class="relative overflow-hidden flex-1 min-h-0 flex flex-col">
                    <ChatTimeline :channel="internalChannel" ref="internalTimelineRef" :loading="loadingInternal" placeholder="Note interne (invisible du client)...">
                        <template #header>
                            <div v-if="internalChannel.pinning?.pinnedId.value" class="mb-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs">
                                <div class="flex items-center gap-2 text-amber-500 font-bold mb-1">
                                    <i class="bi bi-pin-angle-fill" /> Message épinglé
                                </div>
                                <p class="text-(--text) line-clamp-3">{{ pinnedContent ?? '…' }}</p>
                            </div>
                        </template>
                    </ChatTimeline>
                </div>

                <div class="shrink-0 max-h-72 overflow-y-auto p-3 border-t border-(--text)/5">
                    <SupportRequesterCard :ticket-id="ticketId" />
                </div>

            </div>

        </main>

        <div v-else class="flex-1 flex items-center justify-center">
            <SpinLoader v-if="loadingTicket" />
            <p v-else class="text-(--text2)">{{ notFoundMessage }}</p>
        </div>

        <SupportClaimModal
            :is-open="showClaim"
            :busy="actionBusy"
            @close="showClaim = false"
            @confirm="claim"
        />

        <ConfirmDelete
            :show="confirmClose"
            item-name="ce ticket"
            item-type="le ticket"
            title="Fermer ce ticket ?"
            message="Le client sera notifié ; le ticket pourra être réouvert par la suite."
            button-text="Fermer le ticket"
            :loading="actionBusy"
            @confirm="confirmedClose"
            @cancel="confirmClose = false"
        />

    </div>

</template>

<script lang="ts" setup>

import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue';
import { useRoute } from 'vue-router';
import type { Socket } from 'socket.io-client';
import { decryptMessageWithContentKey } from '@/assets/utils/crypto';
import { decryptMessages } from '@/assets/utils/decryptMessages';
import { useToast } from '@/composables/useToast';
import useWSocket from '@/composables/useWSocket';
import { useSupportRole } from '@/composables/useSupportRole';
import { useSupportTicketEvents } from '@/composables/useSupportTicketEvents';
import { useNotification } from '@/composables/useNotification';
import { createSupportMessageChannel } from '@/composables/supportMessageChannel';
import { loadStaffMembers, staffMembers } from '@/services/support/staffMembers';
import { supportApi } from '@/services/support/api';
import { openSupportTicket, claimSupportTicket } from '@/services/support/tickets';
import { SupportLockedError } from '@/services/support/keys';
import { user } from '@/assets/var';
import type { SupportTicketEventDTO, SupportTicketPriority, SupportTicketStaffDTO, SupportTicketStatus } from '@/types/support';
import ChatTimeline from '@/views/OrgSpace/components/common/ChatTimeline.vue';
import ConfirmDelete from '@/components/common/ConfirmDelete.vue';
import SpinLoader from '@/components/SpinLoader.vue';
import SupportSearchSelect from '@/components/support/SupportSearchSelect.vue';
import SupportTicketEventLine from './components/SupportTicketEventLine.vue';
import SupportRequesterCard from './components/SupportRequesterCard.vue';
import SupportClaimModal from './components/SupportClaimModal.vue';
import { STATUS_OPTIONS, PRIORITY_OPTIONS } from './supportLabels';

const route = useRoute();
const toast = useToast();
const { role } = useSupportRole();
const { markSupportTicketAsRead } = useNotification();

const ticketId = computed(() => route.params.id as string);
const ticket = shallowRef<SupportTicketStaffDTO | null>(null);
const title = ref<string | null>(null);
const publicKey = shallowRef<CryptoKey | null>(null);
const internalKey = shallowRef<CryptoKey | null>(null);
const publicKeyError = ref<Error | null>(null);
const internalKeyError = ref<Error | null>(null);
const events = ref<SupportTicketEventDTO[]>([]);
const loadingTicket = ref(true);
const loadingPublic = ref(true);
const loadingInternal = ref(true);
const notFoundMessage = ref('Ticket introuvable ou accès refusé.');
const actionBusy = ref(false);
const showClaim = ref(false);
const confirmClose = ref(false);
const pendingStatus = ref<SupportTicketStatus | null>(null);
const mobileTab = ref<'public' | 'internal'>('public');
const publicTimelineRef = ref<InstanceType<typeof ChatTimeline> | null>(null);
const internalTimelineRef = ref<InstanceType<typeof ChatTimeline> | null>(null);
const socket = shallowRef<Socket | null>(null);

const publicChannel = createSupportMessageChannel({
    ticketId: () => ticket.value?.id ?? null,
    channel: 'PUBLIC',
    key: publicKey,
    ticket,
    role,
    socket,
});
const internalChannel = createSupportMessageChannel({
    ticketId: () => ticket.value?.id ?? null,
    channel: 'INTERNAL',
    key: internalKey,
    ticket,
    role,
    socket,
});
// Le canal n'expose le message épinglé que chiffré (channel.pinning.pinnedMessage) :
// on relit et déchiffre nous-mêmes via GET .../pinned-message à chaque
// changement d'id épinglé (pin/dépin, changement de ticket).
const pinnedContent = ref<string | null>(null);
watch([() => internalChannel.pinning?.pinnedId.value, internalKey], async ([id, key]) => {
    if (!id || !key || !ticket.value) { pinnedContent.value = null; return; }
    try {
        const msg = await supportApi.getPinnedMessage(ticket.value.id);
        pinnedContent.value = msg && msg.id === id ? await decryptMessageWithContentKey(msg.content, msg.iv ?? '', key) : null;
    } catch (e) {
        console.warn('[Support] Message épinglé indisponible :', (e as Error).message);
        pinnedContent.value = null;
    }
});

const transferOptions = computed(() =>
    staffMembers.value.filter(m => m.id !== user.value?.id).map(m => ({ id: m.id, label: m.name, avatarUrl: m.avatarUrl }))
);

const addableTagOptions = computed(() => {
    const held = new Set(ticket.value?.tags.map(t => t.id) ?? []);
    return allTags.value.filter(t => !held.has(t.id)).map(t => ({ id: t.id, label: t.name, color: t.color }));
});
const allTags = ref<{ id: string; name: string; color: string }[]>([]);

const TAG_COLORS = ['#ef4444', '#f59e0b', '#22c55e', '#0ea5e9', '#a855f7', '#ec4899'];

const loadEvents = async () => {
    try { events.value = await supportApi.getTicketEvents(ticketId.value); }
    catch (e) { console.warn('[Support] Événements indisponibles :', (e as Error).message); }
};

const load = async () => {
    loadingTicket.value = true;
    loadingPublic.value = true;
    loadingInternal.value = true;
    publicKeyError.value = null;
    internalKeyError.value = null;
    try {
        const opened = await openSupportTicket(ticketId.value);
        if (!('creator' in opened.ticket)) throw new Error("Accès refusé : ce ticket n'est pas visible par l'équipe.");
        ticket.value = opened.ticket as SupportTicketStaffDTO;
        title.value = opened.title;
        publicKey.value = opened.publicKey;
        internalKey.value = opened.internalKey;
        publicKeyError.value = opened.publicKeyError;
        internalKeyError.value = opened.internalKeyError;
        loadingTicket.value = false;
        void markSupportTicketAsRead(ticketId.value);

        await Promise.all([
            loadEvents(),
            loadStaffMembers().catch(() => {}),
            supportApi.listTags().then(t => { allTags.value = t; }).catch(() => {}),
        ]);

        if (opened.publicKey) {
            const { messages, hasMore } = await publicChannel.join();
            publicTimelineRef.value?.setMessages(await decryptMessages(messages, opened.publicKey), hasMore);
        }
        loadingPublic.value = false;

        if (opened.internalKey) {
            const { messages, hasMore } = await internalChannel.join();
            internalTimelineRef.value?.setMessages(await decryptMessages(messages, opened.internalKey), hasMore);
        }
        loadingInternal.value = false;
    } catch (e) {
        loadingTicket.value = false;
        loadingPublic.value = false;
        loadingInternal.value = false;
        if (e instanceof SupportLockedError) notFoundMessage.value = e.message;
        else { notFoundMessage.value = (e as Error).message || 'Ticket introuvable ou accès refusé.'; console.error('[Support] Ouverture du ticket (équipe) impossible :', e); }
    }
};

useSupportTicketEvents({
    scope: 'staff',
    ticketId,
    onTicketUpdated: (t) => { if (t.id === ticket.value?.id && 'creator' in t) ticket.value = t as SupportTicketStaffDTO; },
    onEvent: (ev) => { if (ev.ticketId === ticket.value?.id) events.value = [...events.value, ev]; },
});

// ── Actions ───────────────────────────────────────────────────────────

const claim = async (priority: SupportTicketPriority) => {
    if (!ticket.value) return;
    actionBusy.value = true;
    try {
        const res = await claimSupportTicket(ticket.value, priority);
        ticket.value = res.ticket;
        if (res.internalKey) {
            internalKey.value = res.internalKey;
            internalKeyError.value = null;
            if (!internalChannel.id.value) return;
            const { messages, hasMore } = await internalChannel.join();
            internalTimelineRef.value?.setMessages(await decryptMessages(messages, res.internalKey), hasMore);
        }
        showClaim.value = false;
        toast.show('Ticket pris en charge.', 'success');
    } catch (e) {
        toast.show((e as Error).message || 'Impossible de prendre en charge ce ticket.', 'error');
    } finally {
        actionBusy.value = false;
    }
};

const transfer = async (toUserId: string) => {
    if (!ticket.value) return;
    actionBusy.value = true;
    try {
        ticket.value = await supportApi.transferTicket(ticket.value.id, toUserId);
        toast.show('Ticket transféré.', 'success');
    } catch (e) {
        toast.show((e as Error).message || 'Transfert impossible.', 'error');
    } finally {
        actionBusy.value = false;
    }
};

const release = async () => {
    if (!ticket.value) return;
    actionBusy.value = true;
    try {
        ticket.value = await supportApi.releaseTicket(ticket.value.id);
        toast.show('Ticket libéré.', 'success');
    } catch (e) {
        toast.show((e as Error).message || 'Impossible de libérer ce ticket.', 'error');
    } finally {
        actionBusy.value = false;
    }
};

const changePriority = async (priority: SupportTicketPriority) => {
    if (!ticket.value) return;
    try {
        ticket.value = await supportApi.patchTicket(ticket.value.id, { priority });
    } catch (e) {
        toast.show((e as Error).message || "Impossible de changer l'urgence.", 'error');
    }
};

const changeStatus = (status: SupportTicketStatus) => {
    if (!ticket.value) return;
    if (status === 'CLOSED') {
        pendingStatus.value = status;
        confirmClose.value = true;
        return;
    }
    void applyStatus(status);
};

const applyStatus = async (status: SupportTicketStatus) => {
    if (!ticket.value) return;
    actionBusy.value = true;
    try {
        ticket.value = await supportApi.patchTicket(ticket.value.id, { status });
    } catch (e) {
        toast.show((e as Error).message || 'Impossible de changer le statut.', 'error');
    } finally {
        actionBusy.value = false;
    }
};

const confirmedClose = async () => {
    if (pendingStatus.value) await applyStatus(pendingStatus.value);
    confirmClose.value = false;
    pendingStatus.value = null;
};

const addTag = async (tagId: string) => {
    if (!ticket.value) return;
    try {
        ticket.value = await supportApi.setTicketTags(ticket.value.id, [...ticket.value.tags.map(t => t.id), tagId]);
    } catch (e) {
        toast.show((e as Error).message || "Impossible d'ajouter ce tag.", 'error');
    }
};

const removeTag = async (tagId: string) => {
    if (!ticket.value) return;
    try {
        ticket.value = await supportApi.setTicketTags(ticket.value.id, ticket.value.tags.filter(t => t.id !== tagId).map(t => t.id));
    } catch (e) {
        toast.show((e as Error).message || 'Impossible de retirer ce tag.', 'error');
    }
};

const createAndAddTag = async (name: string) => {
    if (!ticket.value || !name) return;
    try {
        const color = TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)]!;
        const created = await supportApi.createTag({ name, color });
        allTags.value = [...allTags.value, created];
        await addTag(created.id);
    } catch (e) {
        toast.show((e as Error).message || 'Impossible de créer ce tag.', 'error');
    }
};

onMounted(async () => {
    socket.value = (await useWSocket()).value;
    await load();
});

onUnmounted(() => {
    publicChannel.leave();
    internalChannel.leave();
});

</script>

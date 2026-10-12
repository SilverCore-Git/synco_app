<template>

    <div class="h-full flex flex-col overflow-hidden bg-(--bg2) text-(--text)">

        <nav class="shrink-0 bg-(--bg)/80 backdrop-blur-xl border-b border-(--text)/5 px-6 py-4">
            <div class="max-w-4xl mx-auto flex items-center justify-between gap-4">
                <div class="flex items-center gap-4">
                    <router-link to="/" class="p-2 hover:bg-(--text)/5 rounded-xl transition-colors">
                        <i class="bi bi-arrow-left text-xl" />
                    </router-link>
                    <h1 class="text-xl font-black uppercase tracking-wider">Aide &amp; support</h1>
                </div>
                <button v-if="!showCreate" class="primary flex items-center gap-2" @click="showCreate = true">
                    <i class="bi bi-plus-lg" /> Nouveau ticket
                </button>
            </div>
        </nav>

        <main class="flex-1 min-h-0 overflow-y-auto">
            <div class="max-w-4xl mx-auto p-6 flex flex-col gap-6">

                <Transition name="fade-slide-in-up">
                    <div v-if="showCreate" class="bg-(--bg) border border-(--border-color) rounded-2xl p-6">
                        <h2 class="text-lg font-bold mb-4">Nouveau ticket</h2>
                        <NewSupportTicketForm @created="onCreated" @cancel="showCreate = false" />
                    </div>
                </Transition>

                <div v-if="loading" class="flex justify-center py-10">
                    <SpinLoader />
                </div>

                <template v-else>

                    <p v-if="error" class="text-sm text-red-500">{{ error }}</p>

                    <p v-else-if="tickets.length === 0 && !showCreate" class="text-center text-(--text2) py-16">
                        Vous n'avez aucun ticket. Besoin d'aide ? Créez-en un.
                    </p>

                    <router-link
                        v-for="t in tickets"
                        :key="t.id"
                        :to="`/support/${t.id}`"
                        class="flex items-center gap-4 bg-(--bg) border border-(--border-color) rounded-xl p-4 hover:border-(--primary)/40 transition-colors"
                    >
                        <div class="flex-1 min-w-0">
                            <div class="flex items-center gap-2 mb-1">
                                <span class="text-xs font-mono text-(--text2)">#{{ t.number }}</span>
                                <span class="font-bold truncate">{{ titles[t.id] ?? '...' }}</span>
                            </div>
                            <div class="flex items-center gap-2 text-xs text-(--text2)">
                                <span class="px-2 py-0.5 rounded-full border text-[10px] font-bold" :class="STATUS_COLORS[t.status]">{{ statusLabel(t.status) }}</span>
                                <span v-if="t.priority" class="px-2 py-0.5 rounded-full border text-[10px] font-bold" :class="PRIORITY_COLORS[t.priority]">{{ priorityLabel(t.priority) }}</span>
                                <span v-if="t.organization">· {{ t.organization.name }}</span>
                                <span>· {{ formatRelative(t.lastMessageAt) }}</span>
                            </div>
                        </div>

                        <div v-if="t.assignee" class="flex items-center gap-2 shrink-0" :title="t.assignee.name">
                            <img :src="t.assignee.avatarUrl || defaultAvatar(t.assignee.name)" class="w-7 h-7 rounded-full object-cover" />
                        </div>

                        <i class="bi bi-chevron-right text-(--text2) shrink-0" />
                    </router-link>

                </template>

            </div>
        </main>

    </div>

</template>

<script lang="ts" setup>

import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { defaultAvatar } from '@/assets/utils/defaultAvatar';
import { useClientSupportTickets } from '@/composables/useSupportTicketEvents';
import SpinLoader from '@/components/SpinLoader.vue';
import NewSupportTicketForm from './components/NewSupportTicketForm.vue';
import type { CreateSupportTicketResult } from '@/services/support/tickets';
import { STATUS_COLORS, PRIORITY_COLORS, statusLabel, priorityLabel } from './supportLabels';

const router = useRouter();
const showCreate = ref(false);

const { tickets, titles, loading, error } = useClientSupportTickets();

const onCreated = (result: CreateSupportTicketResult) => {
    showCreate.value = false;
    router.push(`/support/${result.ticket.id}`);
};

const formatRelative = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const mn = Math.floor(diff / 60000);
    if (mn < 1) return "à l'instant";
    if (mn < 60) return `${mn} min`;
    const h = Math.floor(mn / 60);
    if (h < 24) return `${h} h`;
    const d = Math.floor(h / 24);
    if (d < 30) return `${d} j`;
    return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
};

</script>

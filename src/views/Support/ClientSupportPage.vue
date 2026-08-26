<template>
    <div class="flex flex-col h-screen bg-(--bg) text-(--text) w-full overflow-hidden">
        <nav class="sticky top-0 z-50 bg-(--bg)/80 backdrop-blur-xl border-b border-white/5 px-6 py-4 shrink-0">
            <div class="max-w-7xl mx-auto flex items-center justify-between w-full">
                <div class="flex items-center gap-4">
                    <router-link v-if="currentView !== 'list'" to="/support" class="p-2 hover:bg-white/5 rounded-xl transition-colors">
                        <i class="bi bi-arrow-left text-xl"></i>
                    </router-link>
                    <router-link v-else to="/" class="p-2 hover:bg-white/5 rounded-xl transition-colors">
                        <i class="bi bi-arrow-left text-xl"></i>
                    </router-link>
                    <div>
                        <h1 class="text-xl font-black uppercase tracking-wider flex items-center gap-3">
                            {{ currentView === 'list' ? 'Support SAV' : currentView === 'create' ? 'Nouveau Ticket' : 'Discussion Support' }}
                        </h1>
                    </div>
                </div>

                <router-link v-if="currentView === 'list'" to="/support/new" class="primary flex items-center gap-2 text-sm px-4 py-2 rounded-lg font-bold">
                    <i class="bi bi-plus-lg"></i> Nouveau Ticket
                </router-link>
            </div>
        </nav>

        <main class="flex-1 overflow-hidden relative">
            <div v-if="currentView === 'list'" class="h-full overflow-y-auto p-4 md:p-6 custom-scrollbar">
                <div v-if="loading" class="flex justify-center items-center h-40">
                    <i class="bi bi-arrow-repeat animate-spin text-3xl text-(--primary)"></i>
                </div>
                <div v-else-if="tickets.length === 0" class="flex flex-col items-center justify-center h-64 text-(--text2)">
                    <i class="bi bi-inbox text-5xl mb-4 opacity-50"></i>
                    <p>Vous n'avez aucun ticket de support en cours.</p>
                </div>
                <div v-else class="space-y-3 max-w-4xl mx-auto">
                    <div 
                        v-for="ticket in tickets" 
                        :key="ticket.id" 
                        @click="openTicket(ticket)"
                        class="bg-(--bg2) border border-(--border-color) rounded-xl p-4 cursor-pointer hover:border-(--primary)/50 transition-all flex items-center gap-4"
                    >
                        <div class="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                            :class="ticket.status === 'open' ? 'bg-green-500/10 text-green-500' : ticket.status === 'closed' ? 'bg-gray-500/10 text-gray-500' : 'bg-yellow-500/10 text-yellow-500'"
                        >
                            <i class="bi" :class="ticket.status === 'open' ? 'bi-envelope-open' : ticket.status === 'closed' ? 'bi-check2-circle' : 'bi-hourglass-split'"></i>
                        </div>
                        <div class="flex-1 min-w-0">
                            <div class="flex items-center gap-2 mb-1">
                                <div v-if="ticket.hasUnreadClient" class="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]" title="Nouveau message"></div>
                                <h3 class="font-bold text-(--text) truncate" :class="{ 'text-white': ticket.hasUnreadClient }">{{ ticket.subject }}</h3>
                                <span class="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-white/5 text-(--text2)">
                                    {{ ticket.domain }}
                                </span>
                            </div>
                            <p class="text-xs text-(--text2)">Créé le {{ new Date(ticket.createdAt).toLocaleDateString() }}</p>
                        </div>
                        <i class="bi bi-chevron-right text-(--text2)"></i>
                    </div>
                </div>
            </div>

            <TicketCreateForm 
                v-else-if="currentView === 'create'" 
                @created="onTicketCreated"
                @cancel="router.push('/support')"
            />

            <TicketChat 
                v-else-if="currentView === 'chat' && selectedTicket" 
                :ticket="selectedTicket"
            />
        </main>
    </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import TicketCreateForm from './TicketCreateForm.vue';
import TicketChat from './TicketChat.vue';
import sfetch from '@/assets/utils/sfetch';
import { useToast } from '@/composables/useToast';
import useWSocket from '@/composables/useWSocket';

const toast = useToast();
const route = useRoute();
const router = useRouter();

const currentView = ref<'list' | 'create' | 'chat'>('list');
const selectedTicket = ref<any>(null);
const tickets = ref<any[]>([]);
const loading = ref(false);

const updateViewFromRoute = () => {
    const ticketId = route.params.ticketId as string;
    if (!ticketId) {
        currentView.value = 'list';
        selectedTicket.value = null;
    } else if (ticketId === 'new') {
        currentView.value = 'create';
        selectedTicket.value = null;
    } else {
        currentView.value = 'chat';
        // Find ticket from list
        const ticket = tickets.value.find(t => t.id === ticketId);
        if (ticket) {
            ticket.hasUnreadClient = false;
            selectedTicket.value = ticket;
        } else {
            // If not found (maybe not loaded yet), we'll fetch it or just wait
        }
    }
};

const loadTickets = async () => {
    loading.value = true;
    try {
        const res = await sfetch('/api/support/tickets');
        if (res.ok) {
            tickets.value = await res.json();
            updateViewFromRoute();
        }
    } catch (e) {
        toast.show('Erreur lors du chargement des tickets', 'error');
    } finally {
        loading.value = false;
    }
};

watch(() => route.params.ticketId, () => {
    updateViewFromRoute();
});

onMounted(async () => {
    await loadTickets();
    
    const socketRef = await useWSocket();
    if (socketRef.value) {
        socketRef.value.on('ticket:update', (data: any) => {
            const ticket = tickets.value.find(t => t.id === data.id);
            if (ticket) {
                Object.assign(ticket, data);
            } else {
                loadTickets();
            }
        });
    }
});

const openTicket = (ticket: any) => {
    router.push(`/support/${ticket.id}`);
};

const onTicketCreated = (ticket: any) => {
    tickets.value.unshift(ticket);
    toast.show('Ticket créé avec succès', 'success');
    router.push(`/support/${ticket.id}`);
};
</script>

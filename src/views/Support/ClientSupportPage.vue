<template>
    <div class="flex flex-col h-screen bg-(--bg) text-(--text) w-full overflow-hidden">
        <header class="h-14 border-b border-(--border-color) flex items-center px-4 bg-(--bg2) shrink-0 gap-3">
            <button v-if="currentView !== 'list'" @click="currentView = 'list'" class="text-(--text2) hover:text-(--text)">
                <i class="bi bi-arrow-left text-xl"></i>
            </button>
            <router-link v-else to="/" class="text-(--text2) hover:text-(--text)">
                <i class="bi bi-house text-xl"></i>
            </router-link>
            <div class="w-8 h-8 rounded-full bg-(--primary)/20 flex items-center justify-center text-(--primary)">
                <i class="bi bi-headset text-lg"></i>
            </div>
            <h2 class="font-bold">
                {{ currentView === 'list' ? 'Mes Tickets de Support' : currentView === 'create' ? 'Nouveau Ticket' : 'Discussion Support' }}
            </h2>
            
            <button v-if="currentView === 'list'" @click="currentView = 'create'" class="ml-auto primary flex items-center gap-2 text-sm">
                <i class="bi bi-plus-lg"></i> Nouveau Ticket
            </button>
        </header>

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
                                <h3 class="font-bold text-(--text) truncate">{{ ticket.subject }}</h3>
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
                @cancel="currentView = 'list'"
            />

            <TicketChat 
                v-else-if="currentView === 'chat' && selectedTicket" 
                :ticket="selectedTicket"
            />
        </main>
    </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import TicketCreateForm from './TicketCreateForm.vue';
import TicketChat from './TicketChat.vue';
import sfetch from '@/assets/utils/sfetch';
import { useToast } from '@/composables/useToast';

const toast = useToast();

const currentView = ref<'list' | 'create' | 'chat'>('list');
const selectedTicket = ref<any>(null);
const tickets = ref<any[]>([]);
const loading = ref(false);

const loadTickets = async () => {
    loading.value = true;
    try {
        const res = await sfetch('/api/support/tickets');
        if (res.ok) {
            tickets.value = await res.json();
        }
    } catch (e) {
        toast.show('Erreur lors du chargement des tickets', 'error');
    } finally {
        loading.value = false;
    }
};

onMounted(() => {
    loadTickets();
});

const openTicket = (ticket: any) => {
    selectedTicket.value = ticket;
    currentView.value = 'chat';
};

const onTicketCreated = (ticket: any) => {
    tickets.value.unshift(ticket);
    openTicket(ticket);
    toast.show('Ticket créé avec succès', 'success');
};
</script>

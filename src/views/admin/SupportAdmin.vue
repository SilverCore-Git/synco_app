<template>
  <div class="flex gap-4 h-[calc(100vh-140px)] p-4 max-w-full">
    <!-- Left: Tickets List -->
    <div class="w-80 flex flex-col bg-(--bg) rounded-2xl border border-white/5 shadow-lg overflow-hidden shrink-0">
      <div class="p-4 border-b border-white/5 flex items-center justify-between">
        <h2 class="font-black text-lg flex items-center gap-2"><i class="bi bi-headset text-(--primary)"></i> SAV</h2>
        <button @click="loadTickets" class="text-(--text2) hover:text-(--primary) transition-colors"><i class="bi bi-arrow-clockwise"></i></button>
      </div>
      <div class="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
        <div v-if="loading" class="p-4 text-center text-(--text2) text-sm animate-pulse">Chargement...</div>
        <div v-else-if="tickets.length === 0" class="p-4 text-center text-(--text2) text-sm">Aucun ticket</div>
        <div 
          v-else 
          v-for="ticket in tickets" 
          :key="ticket.id" 
          @click="selectTicket(ticket)"
          class="p-4 border border-white/5 rounded-xl cursor-pointer hover:bg-white/5 transition-colors group"
          :class="{'bg-(--primary)/10 border-(--primary)/30': selectedTicket?.id === ticket.id}"
        >
          <div class="flex justify-between items-start mb-2">
            <span class="text-[10px] font-black px-2 py-1 rounded-md uppercase tracking-wider" :class="statusColors(ticket.status)">{{ ticket.status }}</span>
            <span class="text-[10px] font-black px-2 py-1 rounded-md uppercase tracking-wider" :class="urgencyColors(ticket.urgency)">{{ ticket.urgency }}</span>
          </div>
          <h3 class="font-bold text-sm truncate mb-1 text-(--text)">{{ ticket.subject }}</h3>
          <p class="text-xs text-(--text2) truncate flex items-center gap-1">
            <i class="bi bi-person-circle"></i> {{ ticket.creator?.name || 'Inconnu' }}
          </p>
        </div>
      </div>
    </div>

    <!-- Center: Chat -->
    <div class="flex-1 bg-(--bg) rounded-2xl border border-white/5 shadow-lg flex flex-col overflow-hidden min-w-0">
      <template v-if="selectedTicket">
        <div class="p-4 border-b border-white/5 flex items-center justify-between bg-(--bg2)/30">
          <h2 class="font-bold flex items-center gap-2 text-(--text)">
            <i class="bi bi-chat-text text-(--primary)"></i> #{{ selectedTicket.id.slice(-6).toUpperCase() }}
          </h2>
          <div class="text-xs font-mono text-(--text2) bg-white/5 px-2 py-1 rounded-md">{{ selectedTicket.domain }}</div>
        </div>
        
        <div class="flex-1 overflow-y-auto p-6 flex flex-col gap-6 bg-white/[0.01] custom-scrollbar" ref="chatContainer">
          <div v-if="loadingMessages" class="text-center text-(--text2) text-sm mt-10"><i class="bi bi-arrow-repeat animate-spin mr-2"></i>Chargement...</div>
          <div v-else-if="messages.length === 0" class="text-center text-(--text2) mt-10 flex flex-col items-center">
            <div class="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-4 border border-white/10"><i class="bi bi-chat-dots text-2xl text-(--text2)"></i></div>
            Aucun message.
          </div>
          <div v-else v-for="msg in messages" :key="msg.id" class="flex items-end gap-3" :class="msg.senderId === user?.id ? 'flex-row-reverse' : 'flex-row'">
            <img :src="msg.sender?.avatarUrl || `https://ui-avatars.com/api/?name=${msg.sender?.name || 'U'}&background=random`" class="w-8 h-8 rounded-full border border-white/10 shrink-0" />
            <div class="flex flex-col max-w-[80%]" :class="msg.senderId === user?.id ? 'items-end' : 'items-start'">
              <span class="text-[10px] text-(--text2) mb-1 ml-1">{{ msg.sender?.name }}</span>
              <div class="p-3 rounded-2xl text-sm whitespace-pre-wrap leading-relaxed shadow-sm" :class="msg.senderId === user?.id ? 'bg-(--primary) text-white rounded-br-sm' : 'bg-(--bg2) text-(--text) border border-white/5 rounded-bl-sm'">
                {{ msg.content }}
              </div>
            </div>
          </div>
        </div>

        <div class="p-4 border-t border-white/5 bg-(--bg2)/30">
          <form @submit.prevent="sendMessage" class="flex gap-2">
            <input 
              type="text" 
              v-model="newMessage" 
              class="flex-1 bg-(--bg) border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-(--primary)/50 focus:ring-1 focus:ring-(--primary)/50 transition-all placeholder:text-white/20 text-(--text)" 
              placeholder="Écrire une réponse..." 
              :disabled="sending || selectedTicket.status === 'CLOSED' || selectedTicket.status === 'ARCHIVED'"
            />
            <button 
              type="submit" 
              class="bg-(--primary) text-white px-5 rounded-xl hover:bg-(--primary-dark) transition-colors flex items-center gap-2 disabled:opacity-50 font-bold"
              :disabled="!newMessage.trim() || sending || selectedTicket.status === 'CLOSED' || selectedTicket.status === 'ARCHIVED'"
            >
              <i class="bi" :class="sending ? 'bi-hourglass-split' : 'bi-send-fill'"></i>
            </button>
          </form>
        </div>
      </template>
      <div v-else class="flex-1 flex flex-col items-center justify-center text-(--text2) p-8 text-center gap-4 bg-(--bg2)/10">
        <div class="w-24 h-24 rounded-3xl bg-white/5 flex items-center justify-center border border-white/10">
          <i class="bi bi-inboxes text-4xl text-(--text2)/50"></i>
        </div>
        <div>
          <p class="font-bold text-(--text) mb-1 text-lg">Aucun ticket sélectionné</p>
          <p class="text-sm">Sélectionnez un ticket dans la liste pour voir la conversation.</p>
        </div>
      </div>
    </div>

    <!-- Right: User Profile & Actions -->
    <div class="w-80 flex flex-col bg-(--bg) rounded-2xl border border-white/5 shadow-lg overflow-hidden shrink-0">
      <template v-if="selectedTicket">
        <div class="p-6 border-b border-white/5 flex flex-col items-center gap-3 bg-(--bg2)/30 relative overflow-hidden">
          <div class="absolute top-0 inset-x-0 h-16 bg-(--primary)/10 border-b border-(--primary)/20"></div>
          <img :src="selectedTicket.creator?.avatarUrl || `https://ui-avatars.com/api/?name=${selectedTicket.creator?.name}&background=random`" class="w-20 h-20 rounded-full object-cover border-4 border-(--bg) shadow-lg relative z-10" />
          <div class="text-center relative z-10">
            <h3 class="font-black text-lg text-(--text)">{{ selectedTicket.creator?.name || 'Inconnu' }}</h3>
            <p class="text-xs text-(--text2) font-mono mt-1">{{ selectedTicket.creator?.email || 'Pas d\'email' }}</p>
          </div>
          <div v-if="selectedTicket.organization" class="bg-(--bg) border border-white/5 px-3 py-1.5 rounded-lg text-xs font-bold mt-2 flex items-center gap-2 w-full justify-center shadow-sm">
            <i class="bi bi-building text-(--primary)"></i> <span class="truncate">{{ selectedTicket.organization.name }}</span>
          </div>
        </div>
        
        <div class="p-5 flex-1 flex flex-col gap-6 overflow-y-auto custom-scrollbar">
          
          <div class="space-y-4">
            <h4 class="text-[10px] font-black uppercase tracking-widest text-(--text2) flex items-center gap-2"><i class="bi bi-sliders"></i> Gestion</h4>
            
            <div class="space-y-1.5">
              <label class="text-xs font-bold text-(--text2)">Statut</label>
              <select v-model="formStatus" class="w-full bg-(--bg2) border border-white/5 rounded-xl p-2.5 text-sm focus:outline-none focus:border-(--primary)/50 focus:ring-1 focus:ring-(--primary)/50" @change="updateTicket">
                <option value="PENDING">En attente</option>
                <option value="OPEN">Ouvert</option>
                <option value="CLOSED">Fermé</option>
                <option value="ARCHIVED">Archivé</option>
              </select>
            </div>

            <div class="space-y-1.5">
              <label class="text-xs font-bold text-(--text2)">Urgence</label>
              <select v-model="formUrgency" class="w-full bg-(--bg2) border border-white/5 rounded-xl p-2.5 text-sm focus:outline-none focus:border-(--primary)/50 focus:ring-1 focus:ring-(--primary)/50" @change="updateTicket">
                <option value="LOW">Basse</option>
                <option value="MEDIUM">Moyenne</option>
                <option value="HIGH">Haute</option>
              </select>
            </div>
            
            <div class="space-y-1.5">
              <label class="text-xs font-bold text-(--text2)">Assigné à</label>
              <div class="w-full bg-(--bg2) border border-white/5 rounded-xl p-2.5 text-sm text-(--text) flex items-center gap-2">
                <i class="bi bi-person-badge text-(--primary)/70"></i> {{ selectedTicket.assignedModo?.name || 'Non assigné' }}
              </div>
            </div>
          </div>
          
          <div class="mt-auto pt-4 space-y-2">
             <button @click="acceptTicket" v-if="selectedTicket.status === 'PENDING'" class="w-full bg-(--primary) text-white font-bold py-2.5 rounded-xl hover:bg-(--primary)/90 transition-colors flex items-center justify-center gap-2 shadow-lg shadow-(--primary)/20">
               <i class="bi bi-person-check-fill"></i> Prendre en charge
             </button>
             <button @click="closeTicket" v-if="selectedTicket.status !== 'CLOSED' && selectedTicket.status !== 'ARCHIVED'" class="w-full bg-red-500/10 text-red-500 font-bold py-2.5 rounded-xl hover:bg-red-500/20 transition-colors flex items-center justify-center gap-2">
               <i class="bi bi-x-circle-fill"></i> Fermer le ticket
             </button>
          </div>
        </div>
      </template>
      <div v-else class="flex-1 flex items-center justify-center text-(--text2) p-4 text-center">
        <!-- Empty state -->
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue';
import sfetch from '@/assets/utils/sfetch';
import { user } from '@/assets/var';
import { useToast } from '@/composables/useToast';

const toast = useToast();

import { E2EEUnloked, privateKey, decryptThreadKeyWithRsa, encryptMessageWithContentKey, decryptMessageWithContentKey } from '@/assets/utils/crypto';

interface TicketUser {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
}

interface SupportTicket {
  id: string;
  domain: string;
  subject: string;
  urgency: string;
  status: string;
  threadId: string;
  creator: TicketUser;
  organization?: { id: string; name: string };
  assignedModo?: { id: string; name: string };
  createdAt: string;
  userEncryptedKey?: string;
}

const tickets = ref<SupportTicket[]>([]);
const loading = ref(true);
const selectedTicket = ref<SupportTicket | null>(null);

const messages = ref<any[]>([]);
const loadingMessages = ref(false);
const newMessage = ref('');
const sending = ref(false);
const chatContainer = ref<HTMLElement | null>(null);

const formStatus = ref('');
const formUrgency = ref('');

let currentThreadKey: CryptoKey | null = null;

const loadTickets = async () => {
  loading.value = true;
  try {
    const res = await sfetch('/api/admin/support/tickets');
    if (res.ok) {
      tickets.value = await res.json();
    } else {
      toast.show('Erreur de chargement des tickets', 'error');
    }
  } catch (e) {
    toast.show('Erreur serveur', 'error');
  } finally {
    loading.value = false;
  }
};

const loadMessages = async (threadId: string) => {
  loadingMessages.value = true;
  messages.value = [];
  try {
    const res = await sfetch(`/api/admin/support/threads/${threadId}/messages`);
    if (res.ok) {
      const msgs = await res.json();
      const decrypted = [];
      for (const msg of msgs) {
        if (!msg.content || !msg.iv || !currentThreadKey) {
          decrypted.push(msg);
        } else {
          try {
            const content = await decryptMessageWithContentKey(msg.content, msg.iv, currentThreadKey);
            decrypted.push({ ...msg, content });
          } catch(e) {
            decrypted.push({ ...msg, content: '[⚠️ Message chiffré illisible]' });
          }
        }
      }
      messages.value = decrypted;
      scrollToBottom();
    }
  } catch (e) {
    console.error(e);
  } finally {
    loadingMessages.value = false;
  }
};

const selectTicket = async (ticket: SupportTicket) => {
  selectedTicket.value = ticket;
  formStatus.value = ticket.status;
  formUrgency.value = ticket.urgency;
  
  currentThreadKey = null;
  if (ticket.userEncryptedKey && privateKey.value) {
    try {
      currentThreadKey = await decryptThreadKeyWithRsa(ticket.userEncryptedKey, privateKey.value);
    } catch (e) {
      toast.show('Erreur de déchiffrement', 'error');
    }
  }
  
  loadMessages(ticket.threadId);
};

const updateTicket = async () => {
  if (!selectedTicket.value) return;
  try {
    const res = await sfetch(`/api/admin/support/tickets/${selectedTicket.value.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: formStatus.value,
        urgency: formUrgency.value
      })
    });
    if (res.ok) {
      const updated = await res.json();
      const idx = tickets.value.findIndex(t => t.id === updated.id);
      if (idx !== -1) {
        tickets.value[idx] = { ...tickets.value[idx], ...updated };
      }
      selectedTicket.value = tickets.value[idx] || updated;
      toast.show('Ticket mis à jour', 'success');
    }
  } catch (e) {
    toast.show('Erreur mise à jour', 'error');
  }
};

const acceptTicket = async () => {
  if (!selectedTicket.value || !user.value) return;
  try {
    const res = await sfetch(`/api/admin/support/tickets/${selectedTicket.value.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: 'OPEN',
        assignedModoId: user.value.id
      })
    });
    if (res.ok) {
      const updated = await res.json();
      const idx = tickets.value.findIndex(t => t.id === updated.id);
      if (idx !== -1) {
        tickets.value[idx] = { ...tickets.value[idx], ...updated };
      }
      selectedTicket.value = tickets.value[idx] || updated;
      formStatus.value = 'OPEN';
      toast.show('Ticket pris en charge', 'success');
    }
  } catch (e) {
    toast.show('Erreur', 'error');
  }
};

const closeTicket = async () => {
  if (!selectedTicket.value) return;
  formStatus.value = 'CLOSED';
  await updateTicket();
};

const sendMessage = async () => {
  if (!selectedTicket.value || !newMessage.value.trim() || sending.value || !currentThreadKey) return;
  sending.value = true;
  try {
    const { ciphertext, iv } = await encryptMessageWithContentKey(newMessage.value.trim(), currentThreadKey);
    const res = await sfetch(`/api/admin/support/threads/${selectedTicket.value.threadId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content: ciphertext, iv })
    });
    if (res.ok) {
      const msg = await res.json();
      msg.content = newMessage.value.trim();
      messages.value.push(msg);
      newMessage.value = '';
      scrollToBottom();
    } else {
      toast.show('Erreur envoi message', 'error');
    }
  } catch (e) {
    toast.show('Erreur', 'error');
  } finally {
    sending.value = false;
  }
};

const scrollToBottom = () => {
  nextTick(() => {
    if (chatContainer.value) {
      chatContainer.value.scrollTop = chatContainer.value.scrollHeight;
    }
  });
};

const statusColors = (status: string) => {
  switch (status) {
    case 'PENDING': return 'bg-yellow-500/20 text-yellow-500';
    case 'OPEN': return 'bg-blue-500/20 text-blue-500';
    case 'CLOSED': return 'bg-green-500/20 text-green-500';
    case 'ARCHIVED': return 'bg-gray-500/20 text-gray-400';
    default: return 'bg-white/10 text-white/70';
  }
};

const urgencyColors = (urgency: string) => {
  switch (urgency) {
    case 'LOW': return 'bg-gray-500/20 text-gray-400';
    case 'MEDIUM': return 'bg-orange-500/20 text-orange-500';
    case 'HIGH': return 'bg-red-500/20 text-red-500';
    default: return 'bg-white/10 text-white/70';
  }
};

onMounted(() => {
  loadTickets();
});
</script>

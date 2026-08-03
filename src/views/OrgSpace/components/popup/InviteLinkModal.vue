<template>
  <Popup :is-open="isOpen" @close="closeModal">
    <template #title>Liens d'invitation</template>

    <div class="space-y-6">
      
      <!-- Liste des liens existants -->
      <div v-if="loadingList" class="flex flex-col items-center justify-center py-6">
        <i class="bi bi-arrow-repeat animate-spin text-3xl text-(--primary) mb-2"></i>
        <p class="text-sm text-(--text2)">Chargement des liens...</p>
      </div>

      <div v-else class="space-y-3">
        <h3 class="text-sm font-bold text-(--text)">Liens actifs pour ce salon</h3>
        
        <div v-if="invites.length === 0" class="text-sm text-(--text2) bg-(--bg2) border border-(--border-color) p-4 rounded-xl text-center">
          Aucun lien d'invitation actif.
        </div>

        <div v-else class="space-y-2 max-h-48 overflow-y-auto">
          <div v-for="invite in invites" :key="invite.id" class="flex flex-col gap-2 bg-(--bg2)/50 border border-(--border-color) rounded-xl p-3 relative group">
            
            <div class="flex items-center justify-between">
              <span class="text-xs font-semibold text-(--text)/70 flex items-center gap-1.5">
                <i class="bi bi-link-45deg"></i>
                Lien généré
              </span>
              <span class="text-[10px] text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-full flex items-center gap-1">
                <i class="bi bi-clock-history"></i>
                {{ formatExpiration(invite.expiresAt) }}
              </span>
            </div>

            <div class="flex items-center gap-2">
              <input 
                type="text" 
                :value="getInviteUrl(invite.code)"
                readonly
                class="flex-1 bg-(--bg) border border-(--border-color) rounded-lg text-xs text-(--text) px-2 py-1.5 outline-none select-all"
                @focus="handleFocus"
              />
              <button 
                @click="copyLink(getInviteUrl(invite.code))"
                class="bg-white/10 hover:bg-white/20 text-(--text) p-1.5 rounded-lg transition-colors flex items-center justify-center"
                title="Copier le lien"
              >
                <i class="bi bi-copy"></i>
              </button>
              <button 
                @click="deleteInvite(invite.id)"
                class="bg-red-500/10 hover:bg-red-500/20 text-red-500 p-1.5 rounded-lg transition-colors flex items-center justify-center"
                title="Supprimer le lien (révoquer)"
              >
                <i class="bi bi-trash3-fill"></i>
              </button>
            </div>
          </div>
        </div>
      </div>

      <hr class="border-(--border-color)" />

      <!-- Créer un nouveau lien -->
      <div class="space-y-3">
        <h3 class="text-sm font-bold text-(--text)">Générer un nouveau lien</h3>
        
        <div class="flex items-center gap-2">
          <select 
            v-model="expiresIn" 
            class="flex-1 bg-(--bg2) border border-(--border-color) rounded-xl px-3 py-2 text-sm text-(--text) focus:outline-none focus:border-(--primary)"
            :disabled="creating"
          >
            <option :value="1">Expire dans 1 heure</option>
            <option :value="24">Expire dans 24 heures</option>
            <option :value="168">Expire dans 7 jours</option>
            <option :value="0">N'expire jamais</option>
          </select>

          <button 
            @click="generateLink"
            :disabled="creating"
            class="bg-(--primary) text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-(--primary)/90 transition-colors shadow-lg flex items-center gap-2 disabled:opacity-50"
          >
            <i v-if="creating" class="bi bi-arrow-repeat animate-spin"></i>
            <i v-else class="bi bi-plus-lg"></i>
            Créer
          </button>
        </div>
      </div>

    </div>

    <template #footer>
      <button class="default" @click="closeModal">Fermer</button>
    </template>
  </Popup>

  <ConfirmDelete
    :show="showConfirmDelete"
    item-type="ce lien"
    item-name="Lien d'invitation"
    button-text="Révoquer"
    @cancel="showConfirmDelete = false"
    @confirm="confirmDeleteInvite"
  />
</template>

<script setup lang="ts">
import { ref } from 'vue';
import Popup from '@/components/Popup.vue';
import ConfirmDelete from '@/components/common/ConfirmDelete.vue';
import type { Thread } from '@/types/types';
import sfetch from '@/assets/utils/sfetch';
import { useToast } from '@/composables/useToast';

const props = defineProps<{
  thread: Thread;
}>();

const isOpen = ref(false);
const loadingList = ref(false);
const creating = ref(false);
const invites = ref<any[]>([]);
const expiresIn = ref(24);
const showConfirmDelete = ref(false);
const inviteToDelete = ref('');
const toast = useToast();

const openModal = async () => {
  isOpen.value = true;
  await fetchInvites();
};

const closeModal = () => {
  isOpen.value = false;
};

const handleFocus = (e: Event) => {
  const target = e.target as HTMLInputElement;
  if (target) target.select();
};

const getInviteUrl = (code: string) => {
  return `${window.location.origin}/invite/vocal/${code}`;
};

const formatExpiration = (dateStr: string) => {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = date.getTime() - now.getTime();
  
  if (diff > 1000 * 60 * 60 * 24 * 365) return "N'expire jamais"; // > 1 an = Jamais
  if (diff <= 0) return "Expiré";
  
  const diffDays = Math.floor(diff / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  
  if (diffDays > 0) return `Expire dans ${diffDays}j ${diffHours}h`;
  return `Expire dans ${diffHours}h`;
};

const fetchInvites = async () => {
  loadingList.value = true;
  try {
    const res = await sfetch(`/api/threads/${props.thread.id}/invites`);
    if (res.ok) {
      const data = await res.json();
      invites.value = data.invites || [];
    }
  } catch (e) {
    toast.show('Erreur de chargement des liens', 'error');
  } finally {
    loadingList.value = false;
  }
};

const generateLink = async () => {
  creating.value = true;
  try {
    const res = await sfetch(`/api/threads/${props.thread.id}/invites`, {
      method: 'POST',
      body: JSON.stringify({ expiresIn: expiresIn.value })
    });
    
    if (res.ok) {
      const data = await res.json();
      toast.show('Lien d\'invitation généré !', 'success');
      invites.value.unshift(data.invite);
      await copyLink(getInviteUrl(data.invite.code));
    } else {
      const data = await res.json();
      toast.show(data.error || 'Erreur lors de la création du lien', 'error');
    }
  } catch (e) {
    toast.show('Erreur de connexion', 'error');
  } finally {
    creating.value = false;
  }
};

const deleteInvite = (inviteId: string) => {
  inviteToDelete.value = inviteId;
  showConfirmDelete.value = true;
};

const confirmDeleteInvite = async () => {
  const inviteId = inviteToDelete.value;
  if (!inviteId) return;

  try {
    const res = await sfetch(`/api/threads/invites/${inviteId}`, { method: 'DELETE' });
    if (res.ok) {
      invites.value = invites.value.filter(i => i.id !== inviteId);
      toast.show('Lien supprimé', 'success');
    } else {
      toast.show('Erreur lors de la suppression', 'error');
    }
  } catch (e) {
    toast.show('Erreur de connexion', 'error');
  } finally {
    showConfirmDelete.value = false;
    inviteToDelete.value = '';
  }
};

const copyLink = async (url: string) => {
  try {
    await navigator.clipboard.writeText(url);
    toast.show('Lien copié dans le presse-papier !', 'success');
  } catch (e) {
    toast.show('Impossible de copier le lien automatiquement.', 'error');
  }
};

defineExpose({ openModal });
</script>

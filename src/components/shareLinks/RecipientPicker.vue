<template>
  <div>
    <label class="block text-xs font-semibold text-(--text2) mb-1.5">Destinataires (adresse e-mail de leur compte Synco)</label>
    <div class="flex gap-2">
      <input
        v-model="email"
        type="email"
        autocomplete="off"
        placeholder="prenom.nom@exemple.fr"
        @keydown.enter.prevent="add"
        class="flex-1 min-w-0 px-3 py-2 bg-(--bg2) border border-(--border-color) rounded-lg text-sm text-(--text) outline-none focus:border-(--primary) placeholder-(--text2)/50"
      />
      <button
        type="button"
        :disabled="!email.trim() || busy"
        @click="add"
        class="px-3 py-2 rounded-lg bg-(--text)/5 text-(--text) text-sm font-semibold hover:bg-(--text)/10 disabled:opacity-40 flex items-center gap-1.5"
      >
        <span v-if="busy" class="w-3.5 h-3.5 border-2 border-(--text)/20 border-t-(--text) rounded-full animate-spin" />
        <i v-else class="bi bi-person-plus" />
        Ajouter
      </button>
    </div>
    <p v-if="error" class="text-[11px] text-red-500 mt-1.5">{{ error }}</p>

    <ul v-if="modelValue.length" class="flex flex-col gap-1.5 mt-3">
      <li
        v-for="r in modelValue"
        :key="r.userId"
        class="flex items-center gap-3 p-2 pr-3 rounded-xl bg-(--bg2)/30 border border-(--border-color)"
      >
        <img v-if="r.avatarUrl" :src="r.avatarUrl" class="w-8 h-8 rounded-full object-cover shrink-0" />
        <div v-else class="w-8 h-8 rounded-full bg-(--primary)/20 flex items-center justify-center text-(--primary) font-bold uppercase shrink-0">
          {{ r.name?.charAt(0) || '?' }}
        </div>
        <div class="min-w-0 flex-1">
          <div class="text-sm font-semibold text-(--text) truncate">{{ $p(r.name) }}</div>
          <div class="text-[10px] text-(--text2) font-mono truncate" title="Empreinte de la clé publique du destinataire : comparez-la avec la sienne pour vérifier.">
            <i class="bi bi-fingerprint mr-0.5" />{{ shortFingerprint(r.fingerprint) }}
          </div>
        </div>
        <button type="button" class="text-(--text2) hover:text-red-500 p-1" :title="`Retirer ${r.name}`" @click="remove(r.userId)">
          <i class="bi bi-x-lg" />
        </button>
      </li>
    </ul>
  </div>
</template>

<script lang="ts" setup>
import { ref } from 'vue';
import { shareLinksApi, type RecipientCandidate } from '@/services/shareLinks/api';

const props = defineProps<{ orgId: string; modelValue: RecipientCandidate[]; exclude?: string[] }>();
const emit = defineEmits<{ 'update:modelValue': [RecipientCandidate[]] }>();

const email = ref('');
const busy = ref(false);
const error = ref('');

/** Groupes de 4 caractères, comme les empreintes affichées ailleurs dans Synco. */
const shortFingerprint = (fp: string) => fp.slice(0, 24).match(/.{1,4}/g)?.join(' ') ?? fp;

async function add() {
  const value = email.value.trim().toLowerCase();
  if (!value || busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    const candidate = await shareLinksApi.lookupRecipient(props.orgId, value);
    if (props.modelValue.some(r => r.userId === candidate.userId) || props.exclude?.includes(candidate.userId)) {
      error.value = 'Cette personne a déjà accès.';
      return;
    }
    emit('update:modelValue', [...props.modelValue, candidate]);
    email.value = '';
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Recherche impossible.';
  } finally {
    busy.value = false;
  }
}

function remove(userId: string) {
  emit('update:modelValue', props.modelValue.filter(r => r.userId !== userId));
}
</script>

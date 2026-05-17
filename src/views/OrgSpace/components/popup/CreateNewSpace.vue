<script setup lang="ts">

import { ref, reactive, nextTick, watch, computed } from 'vue';
import Popup from '@/components/Popup.vue';
import { useRoute, useRouter } from 'vue-router';
import IconSelector from '@/components/common/IconSelector.vue';
import { openedOrg } from '@/assets/var';
import sfetch from '@/assets/utils/sfetch';
import type { OrgMember } from '@/types/types';
import { useToast } from '@/composables/useToast';

const route = useRoute();
const router = useRouter();
const toast = useToast();

const isOpen = ref<boolean>(false);
const loading = ref<boolean>(false);
const state = ref<1 | 2 | 3>(1);
const nameInput = ref<HTMLInputElement | null>(null);

const currentUserId = computed(() => localStorage.getItem('userId'));

const form = reactive({
  name: '',
  logo: '',
  members: [] as OrgMember[],
});

watch(isOpen, (val) => {
  if (val) {
    state.value = 1;
    const me = openedOrg.value?.members?.find(m => m.user?.id === currentUserId.value);
    form.members = me ? [me] : [];
    nextTick(() => nameInput.value?.focus());
  }
});

const title = computed(() => {
  const titles = {
    1: 'Créer un nouvel espace de travail',
    2: `Icône pour "${form.name}"`,
    3: `Membres de "${form.name}"`
  };
  return titles[state.value];
});

const availableMembers = computed(() => {
  const selectedIds = form.members.map(m => m.userId);
  return openedOrg.value?.members?.filter(m => !selectedIds.includes(m.userId)) || [];
});

const closeModal = () => {
  isOpen.value = false;
  form.name = '';
  form.logo = '';
  state.value = 1;
};

const removeMember = (member: OrgMember) => {
  form.members = form.members.filter(m => m.userId !== member.userId);
};

const handleSubmit = async () => {

  if (state.value < 3) {
    state.value++;
    return;
  }

  loading.value = true;
  try {
    const orgId = route.params.orgId as string;
    const res = await sfetch(`/api/spaces/org/${orgId}`, {
      method: 'POST',
      body: JSON.stringify({ 
        ...form, 
        membersId: form.members.map(m => m.userId)
      }),
    });

    const data = await res.json();

    if (data.error) throw new Error(data.error);

    openedOrg.value?.spaces?.push(data);
    toast.show('Espace de travail créé !', 'success');
    closeModal();
    router.push({ name: 'SpaceView', params: { orgId, spaceId: data.id } });

  } catch (err) {
    toast.show('Erreur lors de la création', 'error');
    console.error(err);
  } finally {
    loading.value = false;
  }

};

</script>

<template>

  <div @click="isOpen = true" class="cursor-pointer">
    <slot />
  </div>

  <Popup :is-open="isOpen" @close="closeModal">

    <template #title>{{ title }}</template>

    <div class="min-h-80">

      <div v-if="state === 1" class="space-y-4 animate-in fade-in slide-in-from-bottom-2">
        <label class="text-[10px] font-black text-(--text)/40 uppercase tracking-widest">Nom de l'espace</label>
        <input 
          v-model="form.name"
          type="text" 
          ref="nameInput"
          placeholder="Ex: Marketing, Dev..."
          class="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-(--primary)/50 transition-all"
          @keyup.enter="form.name.trim() && (state = 2)"
        />
      </div>

      <div v-else-if="state === 2" class="space-y-4 animate-in fade-in slide-in-from-right-4">
        <label class="text-[10px] font-black text-(--text)/40 uppercase tracking-widest">Identité visuelle</label>
        <IconSelector v-model="form.logo" @on-base64="(logo: string) => form.logo = logo" />
      </div>

      <div v-else-if="state === 3" class="grid grid-cols-2 gap-6 h-100 animate-in fade-in slide-in-from-right-4">
      
        <div class="flex flex-col gap-3 overflow-hidden">
          <label class="text-[10px] font-black text-(--text)/40 uppercase tracking-widest">Disponibles</label>
          <div class="flex-1 overflow-y-auto pr-2 space-y-2 custom-scrollbar">
            <div v-for="m in availableMembers" :key="m.id" class="flex items-center justify-between p-2 bg-white/5 rounded-lg group">
              <div class="flex items-center gap-2">
                <img :src="m.user?.avatarUrl" class="w-6 h-6 rounded-full border border-white/10" />
                <span class="text-xs font-bold text-white/80 truncate w-24">{{ m.user?.name }}</span>
              </div>
              <button @click="form.members.push(m)" class="text-(--primary) text-[10px] font-black opacity-0 group-hover:opacity-100 transition-all">AJOUTER</button>
            </div>
          </div>
        </div>

        <div class="flex flex-col gap-3 overflow-hidden border-l border-white/5 pl-4">
          <label class="text-[10px] font-black text-(--text)/40 uppercase tracking-widest">Membres séléctionnés ({{ form.members.length }})</label>
          <div class="flex-1 overflow-y-auto pr-2 space-y-2 custom-scrollbar">
            <div v-for="m in form.members" :key="m.id" class="flex items-center justify-between p-2 bg-(--primary)/10 border border-(--primary)/20 rounded-lg group">
              <div class="flex items-center gap-2">
                <img :src="m.user?.avatarUrl" class="w-6 h-6 rounded-full" />
                <span class="text-xs font-bold text-white truncate w-24">{{ m.user?.name }}</span>
              </div>
              <button v-if="m.user?.id !== currentUserId" @click="removeMember(m)" class="text-red-400 text-[10px] font-black opacity-0 group-hover:opacity-100 transition-all">RETIRER</button>
            </div>
          </div>
        </div>

      </div>

    </div>

    <template #footer>
      <button @click="closeModal" class="default" :disabled="loading">Annuler</button>
      <button 
        @click="handleSubmit"
        class="primary"
        :disabled="loading || (state === 1 && !form.name.trim()) || (state === 2 && !form.logo.trim())"
        :class="{ 'loader': loading }"
      >
        {{ state < 3 ? 'Continuer' : 'Créer l\'espace' }}
      </button>
    </template>

  </Popup>

</template>
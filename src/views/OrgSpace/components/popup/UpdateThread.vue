<template>

    <Popup :is-open="isOpen" @close="closeModal">

        <template #title>Paramètres du salon</template>

        <form @submit.prevent="handleSubmit" class="space-y-5">

        <div class="flex gap-2 flex-col opacity-80">
            <label class="text-xs font-bold text-(--text2) uppercase tracking-wider">
                Type de salon
            </label>
            <div class="flex items-center gap-3 p-3 bg-(--bg2)/20 rounded-xl border border-(--border-color) text-white/50">
                <i class="bi" :class="form.type == 'text' ? 'bi-hash' : 'bi-volume-up-fill'" />
                <span class="capitalize">{{ form.type === 'text' ? 'Salon textuel' : 'Salon vocal' }}</span>
                <i class="bi bi-lock-fill ml-auto text-xs" />
            </div>
        </div>

        <div class="flex gap-2 flex-col">
            <label class="text-xs font-bold text-(--text2) uppercase tracking-wider">
                Nom du salon
            </label>
            <input 
                v-model="form.name"
                type="text" 
                placeholder="Nom du salon..."
                ref="nameInput"
                class="
                    w-full bg-(--bg2)/30 border border-white/10 rounded-xl 
                    px-4 py-3 text-(--text) placeholder:text-(--text)/20 
                    focus:outline-none focus:border-(--primary)/50 focus:ring-1
                    focus:ring-(--primary)/20 transition-all
                "
                :disabled="loading"
            />
        </div>

        <div v-if="form.type === 'text'" class="flex items-center justify-between mt-4">
            <label class="text-xs font-bold text-(--text2) uppercase tracking-wider">
                Salon en lecture seule
            </label>
            <label class="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" v-model="form.isReadOnly" class="sr-only peer">
              <div class="w-11 h-6 bg-black/40 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-(--primary) border border-white/5"></div>
            </label>
        </div>

        <div v-if="form.type === 'text' && form.isReadOnly" class="flex flex-col gap-2">
            <label class="text-xs font-bold text-(--text2) uppercase tracking-wider">
                Membres autorisés à écrire
            </label>
            <div class="max-h-32 overflow-y-auto bg-(--bg2)/20 border border-white/10 rounded-xl p-2 flex flex-col gap-1 custom-scrollbar">
                <label v-for="member in availableMembers" :key="member.user!.id" class="flex items-center gap-3 p-2 hover:bg-white/5 rounded-lg cursor-pointer transition-colors">
                    <input type="checkbox" :value="member.user!.id" v-model="form.writersId" class="w-4 h-4 rounded bg-black/20 border-white/10 text-(--primary) focus:ring-0 focus:ring-offset-0 cursor-pointer accent-(--primary)" />
                    <img :src="member.user!.avatarUrl || `https://ui-avatars.com/api/?name=${member.user!.name}&background=128a60&color=fff`" class="w-6 h-6 rounded-full object-cover" />
                    <span class="text-sm text-(--text)/90 font-medium">{{ member.user!.name }}</span>
                </label>
                <div v-if="availableMembers.length === 0" class="text-xs text-white/40 p-2 text-center">Aucun membre disponible</div>
            </div>
            <p class="text-[10px] text-white/40 leading-relaxed mt-1">Les administrateurs de l'organisation et vous-même pouvez toujours envoyer des messages. Sélectionnez d'autres membres si nécessaire.</p>
        </div>

        <div v-if="isPrivate" class="flex gap-2 flex-col mt-4">
            <label class="text-xs font-bold text-(--text2) uppercase tracking-wider flex items-center gap-2">
                <i class="bi bi-lock-fill text-(--primary)"></i>
                Accès Privé
            </label>
            <div class="bg-(--bg2)/20 border border-white/10 rounded-xl p-3 text-sm text-(--text)/80 leading-relaxed">
                Ce salon est privé. Actuellement, <span class="font-bold text-white">{{ props.thread.membersId.length }} membre(s)</span> y ont accès. 
                <br/><span class="text-xs text-white/40 mt-1 block">La modification des accès aux salons privés se fera dans une prochaine mise à jour.</span>
            </div>
        </div>

        </form>

        <template #footer>
            <button 
                @click="closeModal" 
                class="default"
                :disabled="loading"
            >
                Annuler
            </button>

            <button 
                @click="handleSubmit"
                class="primary"
                :class="[
                    loading ? 'loader' : ''
                ]"
                :disabled="loading || !form.name.trim() || !isChanged"
            >
                {{ loading ? 'Enregistrement...' : 'Enregistrer les modifications' }}
            </button>
        </template>

    </Popup>

</template>

<script setup lang="ts">

import { ref, reactive, nextTick, watch, computed } from 'vue';
import Popup from '@/components/Popup.vue';
import type { Thread } from '@/types/types';
import { useToast } from '@/composables/useToast';
import useWSocket from '@/composables/useWSocket';
import { openedOrg, user } from '@/assets/var';
import { useRoute } from 'vue-router';

const route = useRoute();

const emit = defineEmits([ 'close' ]);

const props = defineProps<{
    thread: Thread;
    isOpen: boolean
}>();

const loading = ref<boolean>(false);
const nameInput = ref<HTMLInputElement | null>(null);
const toast = useToast();

const form = reactive({
  name: props.thread.name,
  type: props.thread.type,
  isReadOnly: props.thread.isReadOnly || false,
  writersId: props.thread.writersId ? [...props.thread.writersId] : [] as string[]
});

const isHome = computed(()=> route.name == 'OrgHome' || route.name == 'OrgThreadHome');

const availableMembers = computed(() => {
    let members: any[] = [];
    if (isHome.value) {
        members = openedOrg.value?.members || [];
    } else {
        const spaceId = route.params.spaceId as string;
        const space = openedOrg.value?.spaces?.find(s => s.id === spaceId);
        members = openedOrg.value?.members?.filter(m => space?.membersId.includes(m.userId)) || [];
    }
    return members.filter(m => m.user && m.user.id !== user.value?.id);
});

const isPrivate = computed(() => {
    // If the thread membersId length is less than the total available members (+1 for current user), it's considered private
    return props.thread.membersId.length < (availableMembers.value.length + 1);
});

const isChanged = computed(() => {
    const writersChanged = JSON.stringify(form.writersId.sort()) !== JSON.stringify([...(props.thread.writersId || [])].sort());
    return form.name.trim() !== props.thread.name || form.isReadOnly !== (props.thread.isReadOnly || false) || writersChanged;
});

watch(() => props.isOpen, async (val) => {
    if (val) 
    {
        form.name = props.thread.name;
        form.type = props.thread.type;
        form.isReadOnly = props.thread.isReadOnly || false;
        form.writersId = props.thread.writersId ? [...props.thread.writersId] : [];
        await nextTick();
        nameInput.value?.focus();
    }
});

const closeModal = () => {
    emit('close')
};

const handleSubmit = async () => {

    if (!form.name.trim() || !isChanged.value) return;

    loading.value = true;

    try {
        
        const socket = await useWSocket();
        socket.value?.emit('thread:update', ({ 
            orgId: openedOrg.value?.id, 
            threadId: props.thread.id, 
            name: form.name,
            isReadOnly: form.isReadOnly,
            writersId: form.writersId
        }));

        closeModal();

    }
    catch (err: any) {
        toast.show('Une erreur est survenue.', 'error');
        console.error('Update error:', err);
    } 
    finally {
        loading.value = false;
    }

};

</script>
<template>

    <div @click="isOpen = true">
        <slot />
    </div>

    <Popup :is-open="isOpen" @close="closeModal">

        <template #title>Créer un salon</template>

        <form @submit.prevent="handleSubmit" class="space-y-5">

        <div class="flex gap-2 flex-col">

            <label class="text-xs font-bold text-(--text)/60 uppercase tracking-wider">
                Type de salon
            </label>

            <div class="flex flex-col gap-2 p-1 bg-(--bg2)/20 rounded-xl border border-white/5">
                <button 
                    v-for="tab in [ 'text', 'vocal' ]" 
                    :key="'tab-' + tab"
                    @click="form.type = tab"
                    type="button"
                    :class="[
                        'flex justify-start items-center gap-2 w-full pl-3 py-1.5 text-lg rounded-lg transition-all', 
                        form.type === tab ? 'bg-white/10 text-white shadow-sm' : 'text-white/40 hover:text-white/60'
                    ]"
                >
                    <i class="bi" :class="tab == 'text' ? 'bi-hash' : 'bi-volume-up-fill'" />
                    {{ tab }}
                </button>
            </div>

        </div>

        <div class="flex gap-2 flex-col">

            <label class="text-xs font-bold text-(--text)/60 uppercase tracking-wider">
                Nom du salon
            </label>

            <input 
                v-model="form.name"
                type="text" 
                placeholder="Ex: Marketing, Dev, Général..."
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
                loading ? 'loader' : '',
                !form.name.trim() || form.type == '' ? ' grayscale-100 pointer-events-none opacity-50' : ''
            ]"
            :disabled="loading || !form.name.trim() || form.type == ''"
        >
            {{ loading ? 'Création...' : 'Créer le salon' }}
        </button>

        </template>

    </Popup>

</template>

<script setup lang="ts">

import { ref, reactive, nextTick, watch, computed } from 'vue';
import Popup from '@/components/Popup.vue';
import { useRoute, useRouter } from 'vue-router';
import { openedOrg } from '@/assets/var';
import sfetch from '@/assets/utils/sfetch';
import type { Thread } from '@/types/types';
import { useToast } from '@/composables/useToast';

const route = useRoute();
const router = useRouter();
const isOpen = ref<boolean>(false);
const loading = ref<boolean>(false);
const nameInput = ref<HTMLInputElement | null>(null);
const toast = useToast();
const isHome = computed(()=> route.name == 'OrgHome' || route.name == 'OrgThreadHome');


const props = defineProps<{
    categoryId: string;
    index: number;
}>();


const form = reactive({
  name: '',
  type: 'text'
});

watch(isOpen, async (val) => {
  if (val) {
    await nextTick();
    nameInput.value?.focus();
  }
});

const closeModal = () => {
  isOpen.value = false;
  form.name = '';
};

const handleSubmit = async () => {

    if (!form.name.trim() || form.type == '') return;

    loading.value = true;

    try {

        const spaceId = route.params.spaceId as string;
        
        const res = await sfetch(`/api/threads/${isHome.value ? 'org' : 'spaces'}/${isHome.value ? route.params.orgId : spaceId}`, {
            method: 'POST',
            body: JSON.stringify({ ...form, index: props.index, categoryId: props.categoryId })
        }).then(res => res.json());

        if (res.error)
        {
            toast.show('Une erreur est survenue lors de la création du salon.', 'error');
            console.error('Error on thread creation : ', res.error);
        }
        else
        {
            if (isHome.value)
            {
                const thread: Thread = res;
                openedOrg.value?.home?.threads?.push(thread);
                await nextTick();
                router.push({ name: 'OrgThreadHome', params: { orgId: route.params.orgId, threadId: res.id } });
            }
            else
            {
                const thread: Thread = res;
                const space = openedOrg.value?.spaces?.find(s => s.id === route.params.spaceId);
                space?.threads?.push(thread);
                await nextTick();
                router.push({ name: 'SpaceView', params: { orgId: route.params.orgId, spaceId, threadId: res.id } });
            }

            toast.show('Salon créé avec succès.', 'success');

        }

        closeModal();

    } 
    catch (err: any) {
        toast.show('Une erreur est survenue lors de la création du salon.', 'error');
        console.error('Error on thread creation : ', err);
    } 
    finally {
        loading.value = false;
    }

};

</script>
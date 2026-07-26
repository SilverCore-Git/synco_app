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

            <div class="flex flex-col gap-2 p-1 bg-(--bg2)/20 rounded-xl border border-(--border-color)">
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
import { openedOrg, user } from '@/assets/var';
import sfetch from '@/assets/utils/sfetch';
import type { Thread } from '@/types/types';
import { useToast } from '@/composables/useToast';
import { generateThreadKey, encryptThreadKeyForMember, E2EEUnloked, privateKey } from '@/assets/utils/crypto';

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
        let encryptedKeysPayload: Array<{ userId: string; encryptedKey: string }> = [];

        if (form.type === 'text') 
        {

            try {
                
                const space = openedOrg.value?.spaces?.find(s => s.id === spaceId);
                
                let members = openedOrg.value?.members?.filter(m => space?.membersId.includes(m.userId)).map(m => m!.user!) || [];
                
                // S'assurer que le membre courant est inclus avec sa publicKey à jour
                const currentUser = user.value;
                if (currentUser && !members.some(m => m.id === currentUser.id)) {
                    members = [...members, currentUser];
                }

                // Vérifier que le membre courant a une clé E2EE valide
                if (!currentUser?.publicKey || typeof currentUser.publicKey !== 'string' || !currentUser.publicKey.trim().startsWith('{')) {
                    throw new Error("Votre clé publique de chiffrement E2EE n'est pas configurée.");
                }
                
                // Vérifier que la clé privée est déchiffrée et disponible
                if (!E2EEUnloked.value) {
                    throw new Error("Votre session E2EE n'est pas déverrouillée. Veuillez entrer votre code PIN.");
                }
                
                // Vérifier que la clé privée existe
                if (!privateKey.value) {
                    throw new Error("Votre clé privée n'est pas chargée. Veuillez recharger la page ou réinitialiser votre PIN.");
                }

                const newThreadKey = await generateThreadKey();

                for (const member of members) 
                {
                    
                    if (member.publicKey && typeof member.publicKey === 'string' && member.publicKey.trim().startsWith('{')) 
                    {
                        const encryptedKey = await encryptThreadKeyForMember(newThreadKey, member.publicKey);
                        encryptedKeysPayload.push({
                            userId: member.id,
                            encryptedKey: encryptedKey
                        });
                    }
                    else if (member.publicKey) 
                    {
                        console.warn(`[E2EE] Clé ignorée pour l'utilisateur ${member.id} (Format non-JWK ou pollué par Keycloak).`);
                    }
                }

                if (encryptedKeysPayload.length === 0) 
                {
                    throw new Error("Aucun membre du salon ne possède de clé de chiffrement E2EE valide.");
                }

            } catch (cryptoErr: any) {
                console.error('[E2EE] Erreur lors de la préparation des clés :', cryptoErr);
                toast.show(`Échec de la sécurité : ${cryptoErr.message || "Clés invalides."}`, 'error');
                loading.value = false;
                return;
            }
            
        }

        const payload = { 
            ...form, 
            index: props.index, 
            categoryId: props.categoryId,
            keys: encryptedKeysPayload
        };

        const res = await sfetch(`/api/threads/${isHome.value ? 'org' : 'space'}/${isHome.value ? route.params.orgId : spaceId}`, {
            method: 'POST',
            body: JSON.stringify(payload)
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

                import('@/services/LocalSearchVectorDB').then(({ localSearchDB }) => {
                    localSearchDB.insertDocument({
                        id: thread.id,
                        workspaceId: spaceId,
                        type: 'THREAD',
                        textContent: thread.name,
                        vector: Array(384).fill(0)
                    });
                });

                await nextTick();
                router.push({ name: 'SpaceView', params: { orgId: route.params.orgId, spaceId, threadId: res.id } });
            }

            toast.show('Salon créé avec succès.', 'success');

        }

        closeModal();

    } catch (err: any) {
        toast.show('Une erreur est survenue lors de la création du salon.', 'error');
        console.error('Error on thread creation : ', err);
    } finally {
        loading.value = false;
    }
    
};

</script>
<template>

    <Window :isOpen="isOpen" @close="emit('close')">

        <div class="flex w-full h-full bg-(--bg) text-(--text) rounded-xl overflow-hidden shadow-2xl relative">
            
            <aside class="w-64 bg-(--bg2) border-r border-white/5 p-4 flex flex-col gap-2 shrink-0">

                <h2 class="text-xl font-black text-(--text) mb-4 px-3 pt-2">Paramètres</h2>
                
                <button 
                    v-for="tab in tabs" 
                    :key="tab.id"
                    @click="activeTab = tab.id"
                    class="tab"
                    :class="activeTab === tab.id ? 'active' : ''"
                >
                    <i :class="[tab.icon, 'text-lg']" />
                    {{ tab.label }}
                </button>

                <div class="mt-auto pt-4 border-t border-white/5">
                    <button class="danger w-full" @click="showExitConfirm = true">
                        <i class="bi bi-door-open-fill text-lg" />
                        Quitter le Space
                    </button>
                </div>
                
            </aside>

            <main class="flex-1 p-8 overflow-y-auto bg-(--bg)">
                
                <section v-if="activeTab === 'general'" class="animate-fade-in space-y-8">

                    <div>
                        <h3 class="text-2xl font-black text-(--text) mb-1">Vue d'ensemble</h3>
                        <p class="text-sm text-(--text)/60">Configurez l'identité visuelle de votre espace de travail.</p>
                    </div>

                    <div class="flex items-center gap-8 p-6 bg-(--bg2) rounded-2xl border border-white/5">
                        <div class="relative group">
                            <div class="w-24 h-24 rounded-2xl bg-(--bg) border-2 border-dashed border-white/10 flex items-center justify-center overflow-hidden transition-all group-hover:border-(--primary)/50">
                                <i v-if="!formData.logo.startsWith('data:')" :class="formData.logo" class="text-4xl text-(--primary)" />
                                <img v-else :src="formData.logo" class="w-full h-full object-cover" />
                                
                                <div class="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center cursor-pointer transition-opacity">
                                    <i class="bi bi-camera-fill text-(--text) text-xl" />
                                </div>
                            </div>
                        </div>
                        
                        <div class="flex-1 space-y-4">
                            <div class="space-y-1.5">
                                <label class="text-xs font-black uppercase text-(--text)/50">Nom du Space</label>
                                <input 
                                    type="text" 
                                    v-model="formData.name" 
                                    placeholder="Nom de l'espace"
                                    class="w-full bg-(--bg) border border-white/10 rounded-lg px-4 py-2.5 text-(--text) focus:outline-none focus:border-(--primary) transition-all"
                                />
                            </div>
                        </div>
                    </div>

                    <div class="space-y-4">
                        <h4 class="text-xs font-black uppercase tracking-widest text-(--text)/50">ID de l'espace</h4>
                        <div class="flex items-center gap-2 bg-(--bg2) p-3 rounded-lg border border-white/5">
                            <code class="text-(--primary) text-sm flex-1">{{ space.id }}</code>
                            <button class="text-xs font-bold hover:text-(--text)">Copier</button>
                        </div>
                    </div>
                </section>

                <section v-if="activeTab === 'members'" class="animate-fade-in space-y-10">

                    <div class="flex items-center justify-between">
                        <div>
                            <h3 class="text-2xl font-black text-(--text) mb-1">Gestion des membres</h3>
                            <p class="text-sm text-(--text)/60">Invitez ou supprimez des membres de votre espace.</p>
                        </div>
                    </div>

                    <MembersManager 
                        :members="members as OrgMember[] || []" 
                        :ownerId="space.ownerId as string"
                        @add="addMember"
                        @remove="removeMember"
                    />

                </section>

                <section v-if="activeTab === 'security'" class="animate-fade-in space-y-6">
                    <div>
                        <h3 class="text-2xl font-black text-(--text) mb-1">Sécurité & Permissions</h3>
                        <p class="text-sm text-(--text)/60">Contrôlez qui peut voir et modifier ce salon.</p>
                    </div>

                    <div class="space-y-4">
                        <div class="p-4 bg-orange-500/10 border border-orange-500/20 rounded-xl flex gap-4">
                            <i class="bi bi-exclamation-triangle-fill text-orange-500 text-xl" />
                            <p class="text-sm text-orange-200/80">Seuls le propriétaire et les administrateurs de l'organisation peuvent modifier ces réglages.</p>
                        </div>

                        <div class="flex items-center justify-between p-4 bg-(--bg2) rounded-xl border border-white/5">
                            <div>
                                <h4 class="font-bold text-(--text)">Espace Privé</h4>
                                <p class="text-sm text-(--text)/60">Seuls les membres invités peuvent voir ce space</p>
                            </div>
                            <div class="w-12 h-6 bg-(--primary) rounded-full relative cursor-pointer">
                                <div class="w-5 h-5 bg-white rounded-full absolute right-0.5 top-0.5"></div>
                            </div>
                        </div>
                    </div>
                </section>

                <section v-if="activeTab === 'webhooks'" class="animate-fade-in space-y-6">
                    <div>
                        <h3 class="text-2xl font-black text-(--text) mb-1">Webhooks</h3>
                        <p class="text-sm text-(--text)/60">Configurez des webhooks pour recevoir des notifications depuis des services externes.</p>
                    </div>

                    <!-- Bouton pour créer un nouveau webhook -->
                    <div class="flex justify-end">
                        <button 
                            @click="showCreateWebhookModal = true"
                            class="primary gap-2 flex items-center"
                        >
                            <i class="bi bi-plus-lg" />
                            Nouveau Webhook
                        </button>
                    </div>

                    <!-- Liste des webhooks -->
                    <div class="space-y-4">
                        <WebhookList
                            :webhooks="webhooks"
                            :loading="loadingWebhooks"
                            :error="webhooksError"
                            @edit="openEditWebhook"
                            @delete="openDeleteWebhook"
                            @test="openTestWebhook"
                            @details="openDetailsWebhook"
                        />
                    </div>
                </section>

            </main>

            <SaveUpdateOverlay 
                :show="isModified" 
                @close="resetForm" 
                @save="saveChanges"
            />
            
        </div>

    </Window>

    <ConfirmDelete
        :show="showExitConfirm" 
        @confirm="exitSpace" 
        @cancel="showExitConfirm = false"
        :itemName="space.name"
        buttonText="Quitter l'espace"
    />
    
    <!-- Webhooks Modals -->
    <WebhookCreate
        v-if="showCreateWebhookModal && props.space?.id"
        :space-id="props.space.id"
        @close="showCreateWebhookModal = false"
        @created="onWebhookCreated"
    />
    
    <WebhookEdit
        v-if="showEditWebhookModal && editingWebhook"
        :webhook="editingWebhook"
        @close="showEditWebhookModal = false"
        @updated="onWebhookUpdated"
    />
    
    <WebhookDetails
        v-if="showDetailsWebhookModal && detailsWebhook"
        :webhook="detailsWebhook"
        @close="showDetailsWebhookModal = false"
        @edit="openEditWebhook"
        @delete="openDeleteWebhook"
        @test="openTestWebhook"
    />
    
    <WebhookTest
        v-if="showTestWebhookModal && testingWebhook"
        :webhook="testingWebhook"
        @close="showTestWebhookModal = false"
    />
    
    <Popup :is-open="showDeleteWebhookConfirm" @close="showDeleteWebhookConfirm = false">
        <template #title>Supprimer le Webhook</template>
        
        <div class="space-y-4">
            <p class="text-(--text)/80">
                Vous êtes sur le point de supprimer le webhook <strong>{{ deletingWebhook?.name }}</strong>.
            </p>
            <p class="text-(--text)/60 text-sm">
                Cette action est irréversible. Tous les messages et logs associés seront également supprimés.
            </p>
        </div>
        
        <template #footer>
            <button @click="showDeleteWebhookConfirm = false" class="default">Annuler</button>
            <button @click="confirmDeleteWebhook" class="danger">Supprimer</button>
        </template>
    </Popup>
    
</template>

<script setup lang="ts">

import { ref, reactive, computed, watch } from 'vue';
import Window from './Window.vue';
import type { OrgMember, WorkSpace } from '@/types/types';
import SaveUpdateOverlay from '../overlay/SaveUpdateOverlay.vue';
import { useToast } from '@/composables/useToast';
import MembersManager from '../settings/MembersManager.vue';
import { openedOrg, user } from '@/assets/var';
import sfetch from '@/assets/utils/sfetch';
import useWSocket from '@/composables/useWSocket';
import { encryptThreadKeyForMember, decryptThreadKeyWithRsa, privateKey } from '@/assets/utils/crypto';
import ConfirmDelete from '../common/ConfirmDelete.vue';
import { useWebhooks } from '@/composables/useWebhooks';
import type { Webhook } from '@/types/webhooks';
import Popup from '@/components/Popup.vue';
import WebhookList from '@/views/OrgSpace/views/settings/views/components/WebhookList.vue';
import WebhookCreate from '@/views/OrgSpace/views/settings/views/components/WebhookCreate.vue';
import WebhookEdit from '@/views/OrgSpace/views/settings/views/components/WebhookEdit.vue';
import WebhookDetails from '@/views/OrgSpace/views/settings/views/components/WebhookDetails.vue';
import WebhookTest from '@/views/OrgSpace/views/settings/views/components/WebhookTest.vue';

const props = defineProps<{
    space: WorkSpace;
    isOpen: boolean;
}>();

const toast = useToast();
const emit = defineEmits(['close']);

const showExitConfirm = ref<boolean>(false);
const activeTab = ref<string>('general');

const formData = reactive({
    name: props.space?.name || '',
    logo: props.space?.logo || ''
});

// Webhooks state
const showCreateWebhookModal = ref<boolean>(false);
const showEditWebhookModal = ref<boolean>(false);
const showDetailsWebhookModal = ref<boolean>(false);
const showTestWebhookModal = ref<boolean>(false);
const showDeleteWebhookConfirm = ref<boolean>(false);

const editingWebhook = ref<Webhook | null>(null);
const detailsWebhook = ref<Webhook | null>(null);
const testingWebhook = ref<Webhook | null>(null);
const deletingWebhook = ref<Webhook | null>(null);

const {
    webhooks,
    loading: loadingWebhooks,
    error: webhooksError,
    listWebhooks,
    deleteWebhook
} = useWebhooks();


const members = computed(() => {
    return props.space.membersId.map(id => {
        return (
            openedOrg.value?.members?.find(m => m.user?.id === id) 
            || {
                id,
                name: "Utilisateur inconnu",
                email: "email inconnu",
            }
        );
    });
});


watch(() => props.space, (newSpace) => {
    formData.name = newSpace.name;
    formData.logo = newSpace.logo!;
}, { deep: true });

const isModified = computed(() => {
    return formData.name !== props.space.name || formData.logo !== props.space.logo;
});

const tabs = [
    { id: 'general', label: 'Général', icon: 'bi bi-grid-fill' },
    { id: 'members', label: 'Membres', icon: 'bi bi-people-fill' },
    { id: 'webhooks', label: 'Webhooks', icon: 'bi bi-link-45deg' }
];

// Charger les webhooks quand on ouvre l'onglet webhooks ou que le space change
watch(() => [activeTab.value, props.space?.id], async ([newActiveTab, newSpaceId]) => {
    if (newActiveTab === 'webhooks' && newSpaceId) {
        await listWebhooks(newSpaceId);
    }
}, { immediate: false });

const resetForm = () => {
    formData.name = props.space.name;
    formData.logo = props.space.logo!;
};

const saveChanges = async () => {

    const res = await sfetch(`/api/spaces/${props.space.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
            name: formData.name,
            logo: formData.logo
        })
    });

    if (res.ok) 
    {

        const space = await res.json();

        openedOrg.value?.spaces?.splice(
            openedOrg.value.spaces?.findIndex(s => s.id === props.space.id) || 0, 
            1, 
            space
        );

        await WSpubSave();
        toast.show('Modifications enregistrées avec succès.', 'success');

    }
    else
    {
        toast.show('Erreur lors de l\'enregistrement des modifications.', 'error');
    }
    
};

const WSpubSave = async () => {

    const socket = await useWSocket();

    socket.value?.emit('space:update', { 
        orgId: openedOrg.value?.id, 
        spaceId: props.space.id,
        data: {
            name: formData.name,
            logo: formData.logo,
            members: props.space.membersId
        }
    });

};

const addMember = async (member: OrgMember) => {

    props.space.membersId.push(member.userId);

    let threadKeysPayload: Array<{ threadId: string, keys: Array<{ userId: string; encryptedKey: string }> }> = [];

    try {
        if (!privateKey.value) throw new Error("Clé privée introuvable. Veuillez déverrouiller votre espace sécurisé.");

        const resKeys = await sfetch(`/api/spaces/${props.space.id}/keys`);
        if (!resKeys.ok) throw new Error("Impossible de récupérer les clés des salons existants.");
        const myKeys = await resKeys.json();

        for (const myKey of myKeys) 
        {
            const rawThreadKey = await decryptThreadKeyWithRsa(myKey.encryptedKey, privateKey.value!);
            
            if (member.user?.publicKey && typeof member.user.publicKey === 'string' && member.user.publicKey.trim().startsWith('{')) 
            {
                const encryptedKeyForNew = await encryptThreadKeyForMember(rawThreadKey, member.user.publicKey);
                threadKeysPayload.push({
                    threadId: myKey.threadId,
                    keys: [{
                        userId: member.userId,
                        encryptedKey: encryptedKeyForNew
                    }]
                });
            }
            else if (member.user?.publicKey) 
            {
                console.warn(`[E2EE] Clé ignorée pour l'utilisateur ${member.userId} (Format non-JWK ou pollué par Keycloak).`);
            }
        }

        if (threadKeysPayload.length === 0 && myKeys.length > 0) 
        {
            console.warn("Le nouveau membre n'a pas pu recevoir les clés E2EE.");
        }

    } catch (cryptoErr: any) {
        console.error('[E2EE] Erreur lors de la préparation des clés :', cryptoErr);
        toast.show(`Échec de la sécurité : ${cryptoErr.message || "Clés invalides."}`, 'error');
        // On retire le membre car l'opération a échoué sécuritairement
        props.space.membersId.pop();
        return;
    }

    const res = await sfetch(`/api/spaces/${props.space.id}/members`, {
        method: 'PATCH',
        body: JSON.stringify({ 
            membersId: props.space.membersId, 
            keys: threadKeysPayload
        }),
    });

    if (res.ok) 
    {
        await WSpubSave();
        toast.show(`${member.user?.name} a été ajouté au space.`, 'success');
    }
    else
    {
        toast.show(`Erreur lors de l'invitation de ${member.user?.name}.`, 'error');
    }

};

const removeMember = async (id: string) => {

    const index = props.space.membersId.indexOf(id);
    if (index !== -1) 
    {

        props.space.membersId.splice(index, 1);

        const res = await sfetch(`/api/spaces/${props.space.id}/members`, {
            method: 'PATCH',
            body: JSON.stringify({ membersId: props.space.membersId }),
        });

        if (res.ok) 
        {
            await WSpubSave();
            toast.show(`Membre retiré avec succès.`, 'success');
        }
        else
        {
            toast.show(`Erreur lors de la suppression du membre.`, 'error');
        }
        
    }

};

const exitSpace = async () => {

    await removeMember(openedOrg.value?.members?.find(m => m.userId === user.value?.id)?.userId || '');

    openedOrg.value?.spaces?.splice(
        openedOrg.value.spaces?.findIndex(s => s.id === props.space.id) || 0, 
        1
    );

    showExitConfirm.value = false;
    emit('close');

};

// Webhooks methods
const openEditWebhook = (webhook: Webhook) => {
    editingWebhook.value = webhook;
    showEditWebhookModal.value = true;
};

const openDeleteWebhook = (webhook: Webhook) => {
    deletingWebhook.value = webhook;
    showDeleteWebhookConfirm.value = true;
};

const openTestWebhook = (webhook: Webhook) => {
    testingWebhook.value = webhook;
    showTestWebhookModal.value = true;
};

const openDetailsWebhook = (webhook: Webhook) => {
    detailsWebhook.value = webhook;
    showDetailsWebhookModal.value = true;
};

const confirmDeleteWebhook = async () => {
    if (deletingWebhook.value?.id) {
        const success = await deleteWebhook(deletingWebhook.value.id);
        if (success) {
            showDeleteWebhookConfirm.value = false;
            deletingWebhook.value = null;
            if (props.space.id) {
                await listWebhooks(props.space.id);
            }
        }
    }
};

const onWebhookCreated = () => {
    showCreateWebhookModal.value = false;
    if (props.space.id) {
        listWebhooks(props.space.id);
    }
};

const onWebhookUpdated = () => {
    showEditWebhookModal.value = false;
    editingWebhook.value = null;
    if (props.space.id) {
        listWebhooks(props.space.id);
    }
};

</script>

<style scoped>

.animate-fade-in {
    animation: fadeIn 0.15s ease-out forwards;
}

@keyframes fadeIn {
    from { 
        opacity: 0; 
        transform: translateY(4px); 
    }
    to { 
        opacity: 1; 
        transform: translateY(0); 
    }
}

</style>
<template>

    <Window :isOpen="isOpen" @close="emit('close')">

        <div class="flex flex-col sm:flex-row w-full h-full bg-(--bg) text-(--text) rounded-xl overflow-hidden shadow-2xl relative">
            
            <!-- En dessous de `sm`, la barre latérale devient un rail d'onglets
                 horizontal (même disposition que la fenêtre Paramètres
                 utilisateur) ; `pr-14` dégage le bouton de fermeture de la
                 fenêtre, qui flotte en haut à droite. -->
            <aside class="w-full sm:w-64 bg-(--bg2) border-b sm:border-b-0 sm:border-r border-(--border-color) p-2 sm:p-4 pr-14 sm:pr-4 flex flex-row sm:flex-col gap-2 shrink-0 overflow-x-auto hide-scrollbar">

                <h2 class="hidden sm:block text-xl font-black text-(--text) mb-4 px-3 pt-2">Paramètres</h2>
                
                <button 
                    v-for="tab in tabs" 
                    :key="tab.id"
                    @click="activeTab = tab.id"
                    class="tab whitespace-nowrap shrink-0 sm:w-full"
                    :class="activeTab === tab.id ? 'active' : ''"
                >
                    <i :class="[tab.icon, 'text-lg']" />
                    {{ tab.label }}
                </button>

            </aside>

            <!-- L'onglet Webhooks gère son propre défilement, colonne par
                 colonne : `overflow-y-auto` ici ferait défiler les deux d'un
                 bloc. Les deux règles sont exclusives plutôt que superposées,
                 leur ordre dans la feuille générée n'étant pas garanti. -->
            <main class="flex-1 min-h-0 bg-(--bg) relative" :class="activeTab === 'webhooks' || activeTab === 'permissions' ? 'overflow-hidden' : 'overflow-y-auto p-4 sm:p-8'">
                
                <section v-if="activeTab === 'general'" class="animate-fade-in space-y-8">

                    <div>
                        <h3 class="text-xl sm:text-2xl font-black text-(--text) mb-1">Vue d'ensemble</h3>
                        <p class="text-sm text-(--text2)">Configurez l'identité visuelle de votre espace de travail.</p>
                    </div>

                    <div class="flex flex-col sm:flex-row items-start sm:items-center gap-5 sm:gap-8 p-4 sm:p-6 bg-(--bg2) rounded-2xl border border-(--border-color)">
                        <div class="relative group">
                            <div class="w-24 h-24 rounded-2xl bg-(--bg) border-2 border-dashed border-(--text)/10 flex items-center justify-center overflow-hidden transition-all group-hover:border-(--primary)/50">
                                <i v-if="!formData.logo.startsWith('data:')" :class="formData.logo" class="text-4xl text-(--primary)" />
                                <img v-else :src="formData.logo" class="w-full h-full object-cover" />
                                
                                <div @click="showLogoPicker = true" class="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center cursor-pointer transition-opacity">
                                    <i class="bi bi-camera-fill text-(--text) text-xl" />
                                </div>
                            </div>
                        </div>
                        
                        <div class="w-full flex-1 space-y-4">
                            <div class="space-y-1.5">
                                <label class="text-xs font-black uppercase text-(--text2)">Nom du Space</label>
                                <input 
                                    type="text" 
                                    v-model="formData.name" 
                                    placeholder="Nom de l'espace"
                                    class="w-full bg-(--bg) border border-(--text)/10 rounded-lg px-4 py-2.5 text-(--text) focus:outline-none focus:border-(--primary) transition-all"
                                />
                            </div>
                        </div>
                    </div>

                    <div class="space-y-4">
                        <h4 class="text-xs font-black uppercase tracking-widest text-(--text2)">ID de l'espace</h4>
                        <div class="flex items-center gap-2 bg-(--bg2) p-3 rounded-lg border border-(--border-color)">
                            <code class="text-(--primary) text-sm flex-1 min-w-0 truncate">{{ space.id }}</code>
                            <button class="text-xs font-bold hover:text-(--text) shrink-0">Copier</button>
                        </div>
                    </div>
                </section>

                <section v-if="activeTab === 'members'" class="animate-fade-in space-y-10">

                    <div class="flex items-center justify-between">
                        <div>
                            <h3 class="text-xl sm:text-2xl font-black text-(--text) mb-1">Gestion des membres</h3>
                            <p class="text-sm text-(--text2)">Invitez ou supprimez des membres de votre espace.</p>
                        </div>
                    </div>

                    <MembersManager 
                        :members="members as OrgMember[] || []" 
                        :ownerId="space.ownerId as string"
                        @add="addMember"
                        @remove="removeMember"
                    />

                </section>

                <!-- Comme Webhooks, l'onglet gère sa propre mise en page en deux
                     colonnes (rôles à gauche, permissions à droite), d'où le
                     retrait du padding de <main>. Une fois ouvert il reste monté
                     (`v-show`) : changer d'onglet ne doit pas jeter
                     silencieusement des permissions à moitié modifiées. -->
                <section 
                    v-if="hasOpenedPermissions" 
                    v-show="activeTab === 'permissions'" 
                    class="animate-fade-in absolute inset-0"
                >
                    <SpacePermissionsPanel 
                        ref="permissionsPanel"
                        :space-id="space.id"
                        @dirty="isPermissionsModified = $event"
                    />
                </section>

                <!-- L'onglet reprend exactement l'écran de la page de réglages du
                     workspace : une seule implémentation à maintenir. Il gère sa
                     propre mise en page, d'où le retrait du padding de <main>. -->
                <section v-if="activeTab === 'webhooks'" class="animate-fade-in absolute inset-0">
                    <WebhooksManager v-if="props.space?.id" :space-id="props.space.id" />
                </section>

            </main>

            <SaveUpdateOverlay 
                :show="isModified || isPermissionsModified" 
                @close="resetAll" 
                @save="saveAll"
            />
            
        </div>

    </Window>

    <Popup :is-open="showLogoPicker" @close="showLogoPicker = false">
        <template #title>Modifier l'icône du Space</template>
        <div class="min-h-[250px]">
            <IconSelector type="square" ref="iconSelectorRef" v-model="formData.logo" @on-base64="onLogoCropped" />
        </div>
    </Popup>
    
</template>

<script setup lang="ts">
import { getWorkspaceKey, shareWorkspaceKeyWithMissingMembers } from '@/assets/utils/workspaceCrypto';

import { ref, reactive, computed, watch } from 'vue';
import Window from './Window.vue';
import type { OrgMember, WorkSpace } from '@/types/types';
import SaveUpdateOverlay from '../overlay/SaveUpdateOverlay.vue';
import { useToast } from '@/composables/useToast';
import MembersManager from '../settings/MembersManager.vue';
import { openedOrg } from '@/assets/var';
import sfetch from '@/assets/utils/sfetch';
import useWSocket from '@/composables/useWSocket';
import { encryptThreadKeyForMember, decryptThreadKeyWithRsa, privateKey } from '@/assets/utils/crypto';
import { resolveRecipientKey } from '@/assets/utils/keyTrust';
import { signKeyEnvelope } from '@/assets/utils/keyEnvelope';
import Popup from '@/components/Popup.vue';
import WebhooksManager from '@/views/OrgSpace/views/settings/views/components/WebhooksManager.vue';
import IconSelector from '@/components/common/IconSelector.vue';
import SpacePermissionsPanel from '@/components/permissions/SpacePermissionsPanel.vue';

const props = defineProps<{
    space: WorkSpace;
    isOpen: boolean;
}>();

const toast = useToast();
const emit = defineEmits(['close']);

const activeTab = ref<string>('general');

const formData = reactive({
    name: props.space?.name || '',
    logo: props.space?.logo || ''
});

const showLogoPicker = ref<boolean>(false);

const onLogoCropped = (base64: string) => {
    formData.logo = base64;
    showLogoPicker.value = false;
};

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
    { id: 'permissions', label: 'Permissions', icon: 'bi bi-shield-lock-fill' },
    { id: 'webhooks', label: 'Webhooks', icon: 'bi bi-link-45deg' }
];

const permissionsPanel = ref<InstanceType<typeof SpacePermissionsPanel> | null>(null);
const isPermissionsModified = ref<boolean>(false);
const hasOpenedPermissions = ref<boolean>(false);

watch(activeTab, (tab) => {
    if (tab === 'permissions') hasOpenedPermissions.value = true;
});

const resetForm = () => {
    formData.name = props.space.name;
    formData.logo = props.space.logo!;
};

// La barre d'enregistrement est commune aux onglets : elle n'agit que sur ceux
// qui portent réellement des modifications.
const resetAll = () => {
    if (isModified.value) resetForm();
    if (isPermissionsModified.value) permissionsPanel.value?.reset();
};

const saveAll = async () => {
    if (isModified.value) await saveChanges();
    if (isPermissionsModified.value) {
        const ok = await permissionsPanel.value?.save();
        if (ok) toast.show('Permissions enregistrées.', 'success');
    }
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

    let threadKeysPayload: Array<{ threadId: string, keys: Array<{ userId: string; encryptedKey: string }>, commitment?: string, signature?: string }> = [];

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
                // Clé épinglée du nouveau membre (audit FC1).
                const encryptedKeyForNew = await encryptThreadKeyForMember(rawThreadKey, await resolveRecipientKey(member.userId, member.user.publicKey));
                // FC4 §2 : le salon existe déjà, son id est connu — signable.
                const envelope = await signKeyEnvelope(rawThreadKey, `thread:${myKey.threadId}`, 1).catch(() => null);
                threadKeysPayload.push({
                    threadId: myKey.threadId,
                    keys: [{
                        userId: member.userId,
                        encryptedKey: encryptedKeyForNew
                    }],
                    ...envelope,
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
        // Clé de l'espace transmise tout de suite au nouveau membre (sinon il
        // ne pourrait déchiffrer aucun fichier de l'espace).
        getWorkspaceKey(props.space.id)
            .then(({ key, version }) => shareWorkspaceKeyWithMissingMembers(props.space.id, key, version, true))
            .catch((e) => console.warn("[E2EE] Clé d'espace non transmise au nouveau membre :", e));
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

</script>

<style scoped>

.hide-scrollbar::-webkit-scrollbar {
    display: none;
}
.hide-scrollbar {
    -ms-overflow-style: none;
    scrollbar-width: none;
}

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
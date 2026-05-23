<template>

    <Window :isOpen="isOpen" @close="emit('close')">

        <div class="flex w-full h-full bg-(--bg) text-(--text) rounded-xl overflow-hidden shadow-2xl relative">
            
            <aside class="w-64 bg-(--bg2) border-r border-white/5 p-4 flex flex-col gap-2 shrink-0">

                <h2 class="text-xl font-black text-(--white) mb-4 px-3 pt-2">Paramètres</h2>
                
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
                    <button class="danger w-full">
                        <i class="bi bi-door-open-fill text-lg" />
                        Quitter le Space
                    </button>
                </div>
                
            </aside>

            <main class="flex-1 p-8 overflow-y-auto bg-(--bg)">
                
                <section v-if="activeTab === 'general'" class="animate-fade-in space-y-8">

                    <div>
                        <h3 class="text-2xl font-black text-(--white) mb-1">Vue d'ensemble</h3>
                        <p class="text-sm text-(--text)/60">Configurez l'identité visuelle de votre espace de travail.</p>
                    </div>

                    <div class="flex items-center gap-8 p-6 bg-(--bg2) rounded-2xl border border-white/5">
                        <div class="relative group">
                            <div class="w-24 h-24 rounded-2xl bg-(--bg) border-2 border-dashed border-white/10 flex items-center justify-center overflow-hidden transition-all group-hover:border-(--primary)/50">
                                <i v-if="!formData.logo.startsWith('data:')" :class="formData.logo" class="text-4xl text-(--primary)" />
                                <img v-else :src="formData.logo" class="w-full h-full object-cover" />
                                
                                <div class="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center cursor-pointer transition-opacity">
                                    <i class="bi bi-camera-fill text-white text-xl" />
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
                                    class="w-full bg-(--bg) border border-white/10 rounded-lg px-4 py-2.5 text-(--white) focus:outline-none focus:border-(--primary) transition-all"
                                />
                            </div>
                        </div>
                    </div>

                    <div class="space-y-4">
                        <h4 class="text-xs font-black uppercase tracking-widest text-(--text)/50">ID de l'espace</h4>
                        <div class="flex items-center gap-2 bg-(--bg2) p-3 rounded-lg border border-white/5">
                            <code class="text-(--primary) text-sm flex-1">{{ space.id }}</code>
                            <button class="text-xs font-bold hover:text-(--white)">Copier</button>
                        </div>
                    </div>
                </section>

                <section v-if="activeTab === 'members'" class="animate-fade-in space-y-10">

                    <div class="flex items-center justify-between">
                        <div>
                            <h3 class="text-2xl font-black text-(--white) mb-1">Gestion des membres</h3>
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
                        <h3 class="text-2xl font-black text-(--white) mb-1">Sécurité & Permissions</h3>
                        <p class="text-sm text-(--text)/60">Contrôlez qui peut voir et modifier ce salon.</p>
                    </div>

                    <div class="space-y-4">
                        <div class="p-4 bg-orange-500/10 border border-orange-500/20 rounded-xl flex gap-4">
                            <i class="bi bi-exclamation-triangle-fill text-orange-500 text-xl" />
                            <p class="text-sm text-orange-200/80">Seuls le propriétaire et les administrateurs de l'organisation peuvent modifier ces réglages.</p>
                        </div>

                        <div class="flex items-center justify-between p-4 bg-(--bg2) rounded-xl border border-white/5">
                            <div>
                                <h4 class="font-bold text-(--white)">Espace Privé</h4>
                                <p class="text-sm text-(--text)/60">Seuls les membres invités peuvent voir ce space</p>
                            </div>
                            <div class="w-12 h-6 bg-(--primary) rounded-full relative cursor-pointer">
                                <div class="w-5 h-5 bg-white rounded-full absolute right-0.5 top-0.5"></div>
                            </div>
                        </div>
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
    
</template>

<script setup lang="ts">

import { ref, reactive, computed, watch } from 'vue';
import Window from './Window.vue';
import type { OrgMember, WorkSpace } from '@/types/types';
import SaveUpdateOverlay from '../overlay/SaveUpdateOverlay.vue';
import { useToast } from '@/composables/useToast';
import MembersManager from '../settings/MembersManager.vue';
import { openedOrg } from '@/assets/var';
import sfetch from '@/assets/utils/sfetch';
import useWSocket from '@/composables/useWSocket';
import { encryptThreadKeyForMember, generateThreadKey } from '@/assets/utils/crypto';

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
    { id: 'security', label: 'Sécurité', icon: 'bi bi-shield-lock-fill' },
];

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

    let encryptedKeysPayload: Array<{ userId: string; encryptedKey: string }> = [];

    try {
                
        const space = openedOrg.value?.spaces?.find(s => s.id === props.space.id);
                
        const members = openedOrg.value?.members?.filter(m => space?.membersId.includes(m.userId)).map(m => m!.user!) || [];

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
        return;
    }

    const res = await sfetch(`/api/spaces/${props.space.id}/members`, {
        method: 'PATCH',
        body: JSON.stringify({ 
            membersId: props.space.membersId, 
            keys: encryptedKeysPayload
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
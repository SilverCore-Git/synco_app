<template>
    <div class="flex flex-col h-full w-full overflow-hidden bg-(--bg3) text-(--text)">

        <main class="flex-1 overflow-y-auto p-6 lg:p-10">
            
            <div class="max-w-5xl mx-auto space-y-12">
                
                <div class="flex flex-col md:flex-row md:items-center justify-between gap-6">

                    <div>
                        <h1 class="text-2xl font-bold text-white flex items-center gap-3">
                            <i class="bi bi-people-fill text-(--primary)" />
                            Gestion de l'équipe
                        </h1>
                        <p class="text-(--text)/60 text-sm mt-1">
                            Gérez les membres, les rôles et les invitations de votre organisation.
                        </p>
                    </div>
                    
                    <div class="w-full md:w-64">
                        <CapacityGauge 
                            :used="openedOrg?.members?.length || 0"
                            :max="openedOrg?.maxTotalUsers || 100"
                            unit="Membres"
                            icon="bi-person-badge"
                            title="Capacité du serveur"
                        />
                    </div>

                </div>

                <section class="grid grid-cols-1 gap-6">

                    <div class="p-6 rounded-2xl bg-(--bg2) border border-(--text)/10 flex flex-col justify-between space-y-6 relative overflow-hidden group">
                      
                        <div class="absolute -right-10 -top-10 w-32 h-32 bg-(--primary)/5 rounded-full blur-3xl group-hover:bg-(--primary)/10 transition-colors pointer-events-none" />
                        
                        <div class="flex items-start flex-col relative z-10">
                            <div class="w-10 h-10 rounded-xl bg-(--primary-dark)/50 text-(--primary) flex items-center justify-center mb-4 border border-(--primary)/20">
                                <i class="bi bi-link-45deg text-xl" />
                            </div>
                            <h3 class="text-lg font-bold text-white">Lien d'invitation</h3>
                            <p class="text-sm text-(--text)/60 mt-1">
                                Partagez ce lien unique pour permettre à d'autres de rejoindre l'organisation instantanément.
                            </p>
                        </div>

                        <div class="flex gap-2 relative z-10">
                            <div class="flex-1 bg-(--bg3) border border-(--text)/10 rounded-xl px-4 py-3 text-sm text-(--text)/80 font-mono truncate flex items-center select-all">
                                {{ inviteLink || 'Cliquez pour générer un lien' }}
                            </div>
                            <button 
                                @click="inviteLink.length === 0 ? createInviteLink() : copyInvite()" 
                                class="bg-(--primary) hover:bg-(--primary-hover) text-white rounded-xl px-4 py-2 text-sm font-medium transition-all flex items-center gap-2"
                            >
                                <i class="bi" :class="inviteLink.length === 0 ? 'bi-stars' : copied ? 'bi-check-lg' : 'bi-copy'" />
                                {{ inviteLink.length === 0 ? 'Générer' : copied ? 'Copié' : 'Copier' }}
                            </button>
                        </div>

                    </div>

                    <div class="p-6 rounded-2xl bg-(--bg2) border border-(--text)/10 flex flex-col justify-between space-y-6 relative overflow-hidden group">
                      
                        <div class="absolute -right-10 -top-10 w-32 h-32 bg-(--primary)/5 rounded-full blur-3xl group-hover:bg-(--primary)/10 transition-colors pointer-events-none" />
                        
                        <div class="flex items-start flex-col relative z-10">
                            <div class="w-10 h-10 rounded-xl bg-(--bg3) text-(--text) flex items-center justify-center mb-4 border border-(--text)/10">
                                <i class="bi bi-person-plus text-xl" />
                            </div>
                            <h3 class="text-lg font-bold text-white">Ajout manuel</h3>
                            <p class="text-sm text-(--text)/60 mt-1">
                                Entrez l'identifiant (ID) unique d'un utilisateur pour l'ajouter directement.
                            </p>
                        </div>

                        <div class="flex gap-2 relative z-10">
                            
                            <input 
                                v-model="inviteId"
                                class="
                                    flex-1 bg-(--bg3) border border-(--text)/10
                                    rounded-xl px-4 py-3 text-sm text-white
                                    font-mono truncate outline-none
                                    placeholder:text-(--text)/30
                                    focus:border-(--primary)/50 focus:ring-1 focus:ring-(--primary)/50
                                    transition-all
                                "
                                placeholder="ex: ckm4z8x..."
                                type="text"
                                @keyup.enter="sendInvite"
                            />

                            <button 
                                @click="sendInvite" 
                                :disabled="invited || inviteId.length === 0"
                                class="bg-(--bg3) hover:bg-(--text)/10 border border-(--text)/10 text-white rounded-xl px-4 py-2 text-sm font-medium transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <i class="bi" :class="invited ? 'bi-check-lg text-(--primary)' : 'bi-send'" />
                                {{ invited ? 'Envoyé' : 'Inviter' }}
                            </button>

                        </div>

                    </div>

                </section>

                <section class="bg-(--bg2) rounded-3xl border border-(--text)/10 overflow-hidden flex flex-col">
                    
                    <div class="p-6 border-b border-(--text)/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-(--bg3)/30">

                        <h3 class="text-lg font-bold text-white flex items-center gap-2">
                            Membres 
                            <span class="bg-(--primary)/10 text-(--primary) py-0.5 px-2 rounded-md text-xs">
                                {{ openedOrg?.members?.length || 0 }}
                            </span>
                        </h3>

                        <div class="relative w-full sm:w-72">
                            <i class="bi bi-search absolute left-3 top-1/2 -translate-y-1/2 text-(--text)/40" />
                            <input 
                                v-model="searchQuery"
                                type="text" 
                                placeholder="Rechercher un nom ou un email..."
                                class="w-full bg-(--bg3) border border-(--text)/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-(--primary)/40 transition-all placeholder:text-(--text)/30"
                            />
                        </div>

                    </div>

                    <div class="overflow-x-auto">

                        <table class="w-full text-left border-collapse">

                            <thead>
                                <tr class="text-[10px] uppercase tracking-widest text-(--text)/50 bg-(--bg3)/50 border-b border-(--text)/5">
                                    <th class="px-6 py-4 font-bold">Utilisateur</th>
                                    <th class="px-6 py-4 font-bold">Rôle</th>
                                    <th class="px-6 py-4 font-bold">Date d'arrivée</th>
                                    <th class="px-6 py-4 font-bold text-right">Actions</th>
                                </tr>
                            </thead>

                            <tbody class="divide-y divide-(--text)/5">
                                <tr 
                                    v-for="member in filteredMembers" 
                                    :key="member.id" 
                                    class="group hover:bg-(--bg3)/50 transition-colors"
                                >
                                    <td class="px-6 py-4">
                                        <div class="flex items-center gap-3">
                                            <div class="relative">
                                                <img 
                                                    :src="member.user?.avatarUrl || `https://ui-avatars.com/api/?name=${member.user?.name}&background=062d1f&color=16ac77`" 
                                                    class="w-10 h-10 rounded-full object-cover bg-(--bg3) border border-(--text)/10" 
                                                />
                                                <div v-if="isSelf(member.user?.id!)" class="absolute -bottom-1 -right-1 bg-(--primary) w-3.5 h-3.5 rounded-full border-2 border-(--bg2)" title="Vous" />
                                            </div>
                                            <div class="flex flex-col">
                                                <span class="text-sm font-bold text-white group-hover:text-(--primary) transition-colors">
                                                    {{ member.user?.name || 'Utilisateur inconnu' }}
                                                </span>
                                                <span class="text-[11px] text-(--text)/50">{{ member.user?.email }}</span>
                                            </div>
                                        </div>
                                    </td>

                                    <td class="px-6 py-4">
                                        <select 
                                            :value="member?.role || 'unknow'"
                                            @change="updateRole(member.id, $event)"
                                            :disabled="isSelf(member.user?.id!) || !isAdmin"
                                            class="bg-(--bg3) border border-(--text)/10 rounded-lg px-3 py-1.5 text-xs text-(--text) focus:outline-none focus:border-(--primary)/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                                        >
                                            <option value="OWNER">Propriétaire</option>
                                            <option value="ADMIN">Administrateur</option>
                                            <option value="MEMBER">Membre</option>
                                            <option value="GUEST">Invité</option>
                                        </select>
                                    </td>

                                    <td class="px-6 py-4 text-xs text-(--text)/50">
                                        {{ new Date(member.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) }}
                                    </td>

                                    <td class="px-6 py-4 text-right">
                                        <button 
                                            v-if="!isSelf(member.user?.id!) && isAdmin"
                                            @click="confirmKickMember(member.id, member.user?.name || 'ce membre')"
                                            class="p-2 rounded-lg text-red-400 hover:bg-red-500/10 hover:text-red-500 transition-colors"
                                            title="Exclure le membre"
                                        >
                                            <i class="bi bi-person-x text-lg" />
                                        </button>
                                        <span v-else class="text-[10px] text-(--text)/30 uppercase tracking-widest px-2">
                                            -
                                        </span>
                                    </td>
                                </tr>
                                <tr v-if="filteredMembers.length === 0">
                                    <td colspan="4" class="px-6 py-12 text-center text-(--text)/40 text-sm">
                                        Aucun membre ne correspond à votre recherche.
                                    </td>
                                </tr>
                            </tbody>

                        </table>

                    </div>

                </section>

                <section v-if="inviteLinks.length > 0" class="bg-(--bg2) rounded-3xl border border-(--text)/10 overflow-hidden flex flex-col">

                    <div class="p-6 border-b border-(--text)/5 flex justify-between items-center bg-(--bg3)/30">
                        <h3 class="text-lg font-bold text-white flex items-center gap-2">
                            Liens actifs
                            <span class="bg-(--text)/10 text-(--text) py-0.5 px-2 rounded-md text-xs">
                                {{ inviteLinks.length }}
                            </span>
                        </h3>
                    </div>

                    <div class="overflow-x-auto">

                        <table class="w-full text-left border-collapse">

                            <thead>
                                <tr class="text-[10px] uppercase tracking-widest text-(--text)/50 bg-(--bg3)/50 border-b border-(--text)/5">
                                    <th class="px-6 py-4 font-bold">Code</th>
                                    <th class="px-6 py-4 font-bold">Utilisations</th>
                                    <th class="px-6 py-4 font-bold">Expiration</th>
                                    <th class="px-6 py-4 font-bold text-right">Actions</th>
                                </tr>
                            </thead>

                            <tbody class="divide-y divide-(--text)/5">
                                <tr 
                                    v-for="link in inviteLinks" 
                                    :key="link.id" 
                                    class="group hover:bg-(--bg3)/50 transition-colors"
                                >
                                    <td class="px-6 py-4">
                                        <span class="text-sm font-mono text-(--text) bg-(--bg3) px-2.5 py-1 rounded-md border border-(--text)/10">
                                            {{ link.code.substring(0, 8) }}...
                                        </span>
                                    </td>
                                    <td class="px-6 py-4 text-sm">
                                        <span :class="link.maxUses && link.uses >= link.maxUses ? 'text-red-400 font-bold' : 'text-white'">
                                            {{ link.uses }}
                                        </span>
                                        <span class="text-(--text)/40"> / {{ link.maxUses || '∞' }}</span>
                                    </td>
                                    <td class="px-6 py-4 text-xs text-(--text)/50">
                                        {{ link.expiresAt ? new Date(link.expiresAt).toLocaleDateString('fr-FR') : 'Jamais' }}
                                    </td>
                                    <td class="px-6 py-4 text-right">
                                        <div class="flex items-center justify-end gap-1">
                                            <button 
                                                @click="copyInviteLink(link.code)"
                                                class="p-2 rounded-lg text-(--text)/60 hover:text-white hover:bg-(--text)/10 transition-colors"
                                                title="Copier le lien complet"
                                            >
                                                <i class="bi bi-clipboard" />
                                            </button>
                                            <button 
                                                @click="deleteInvite(link.code, 1)"
                                                class="p-2 rounded-lg text-red-400/60 hover:text-red-500 hover:bg-red-500/10 transition-colors"
                                                title="Révoquer le lien"
                                            >
                                                <i class="bi bi-trash" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            </tbody>

                        </table>

                    </div>

                </section>

            </div>

        </main>

    </div>

    <ConfirmDelete 
        :show="showConfirmDelete !== null"
        item-name="ce lien d'invitation"
        @cancel="showConfirmDelete = null"
        @confirm="deleteInvite(showConfirmDelete!, 2)"
    />

    <ConfirmDelete 
        :show="showConfirmKick !== null"
        :item-name="memberNameToKick"
        @cancel="showConfirmKick = null"
        @confirm="removeMember(showConfirmKick!)"
    />

</template>

<script lang="ts" setup>

import { ref, computed, onMounted } from 'vue';
import { openedOrg } from '@/assets/var';
import isAdmin from '@/assets/isAdmin';
import { useToast } from '@/composables/useToast';
import sfetch from '@/assets/utils/sfetch';
import ConfirmDelete from '@/components/common/ConfirmDelete.vue';
import CapacityGauge from '@/components/common/CapacityGauge.vue';

const toast = useToast();

const searchQuery = ref<string>('');
const inviteId = ref<string>('');
const copied = ref<boolean>(false);
const invited = ref<boolean>(false);
const inviteLinks = ref<any[]>([]);
const inviteLink = ref<string>('');

// Modals state
const showConfirmDelete = ref<string | null>(null);
const showConfirmKick = ref<string | null>(null);
const memberNameToKick = ref<string>('');

const filteredMembers = computed(() => {
    if (!openedOrg.value?.members) return [];
    return openedOrg.value.members.filter(m => {
        const nameMatch = m.user?.name?.toLowerCase().includes(searchQuery.value.toLowerCase());
        const emailMatch = m.user?.email?.toLowerCase().includes(searchQuery.value.toLowerCase());
        return nameMatch || emailMatch;
    });
});

const isSelf = (userId: string) => {
    return localStorage.getItem('userId') === userId;
};

const copyInvite = () => {
    navigator.clipboard.writeText(inviteLink.value);
    copied.value = true;
    setTimeout(() => copied.value = false, 2000);
};

const copyInviteLink = (code: string) => {
    const fullUrl = `${window.location.origin}/invite/${code}`;
    navigator.clipboard.writeText(fullUrl);
    toast.show('Lien copié dans le presse-papier !', 'success');
};

const deleteInvite = async (code: string, state: 1 | 2) => {
    
    if (state === 1) 
    {
        showConfirmDelete.value = code;
    } 
    else if (state === 2) 
    {

        showConfirmDelete.value = null;
        const res = await sfetch(`/api/orgs/users/inviteLink/${code}`, {
            method: 'DELETE'
        });

        if (res.ok) 
        {
            toast.show('Lien révoqué avec succès.', 'success');
            inviteLinks.value = inviteLinks.value.filter(link => link.code !== code);
        } 
        else 
        {
            toast.show('Erreur lors de la révocation du lien.', 'error');
        }

    }

};

const sendInvite = async () => {

    const cuidRegex = /^c[a-z0-9]{24}$/;

    if (!inviteId.value || !cuidRegex.test(inviteId.value)) {
        toast.show('Veuillez entrer un identifiant valide.', 'error');
        return;
    }

    invited.value = true;

    try {

        const res = await sfetch(`/api/orgs/users/${openedOrg.value?.id}/invite/${inviteId.value}`, {
            method: 'POST'
        }).then(res => res.json());

        if (res.error) 
        {
            toast.show(res.error, 'error');
        } 
        else 
        {
            toast.show('Invitation envoyée avec succès.', 'success');
            inviteId.value = ''; 
        }

    } catch (err) {
        toast.show('Erreur lors de l\'envoi de l\'invitation.', 'error');
    } finally {
        setTimeout(() => invited.value = false, 2000);
    }

};

const updateRole = (memberId: string, event: Event) => {
    const newRole = (event.target as HTMLSelectElement).value;
    // do api call
    toast.show('Rôle mis à jour (simulation)', 'success');
};

const confirmKickMember = (memberId: string, memberName: string) => {
    memberNameToKick.value = `le membre ${memberName}`;
    showConfirmKick.value = memberId;
};

const removeMember = async (memberId: string) => {

    showConfirmKick.value = null;
    
    try {

        const res = await sfetch(`/api/orgs/users/${openedOrg.value!.id}/kick/${memberId}`, {
            method: 'POST'
        }).then(res => res.json());

        if (res.error) {
            toast.show(res.error, 'error');
        } else {
            toast.show(res.message, 'success');
        }

    } catch (err) {
        toast.show('Erreur lors de l\'exclusion du membre.', 'error');
    }

};

const createInviteLink = async () => {

    try {

        const invite = await sfetch('/api/orgs/users/inviteLink/create', {
            method: 'POST',
            body: JSON.stringify({ 
                organizationId: openedOrg.value?.id,
                maxUses: 1, 
                expiresInHours: 24
            })
        }).then(res => res.json());

        inviteLink.value = `${window.location.origin}/invite/${invite.code}`;

    } catch (err) {
        toast.show('Erreur lors de la création du lien.', 'error');
    }

};

onMounted(async () => {
    try {
        const res = await sfetch(`/api/orgs/users/inviteLink/${openedOrg.value?.id}`);
        if (res.ok) {
            inviteLinks.value = await res.json() || [];
        }
    } catch (err) {
        console.error("Erreur chargement liens", err);
    }
});

</script>
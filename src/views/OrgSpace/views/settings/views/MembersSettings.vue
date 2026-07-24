<template>
    <div class="flex flex-col h-full w-full overflow-hidden bg-(--bg3) text-(--text)">

        <main class="flex-1 overflow-y-auto p-6 lg:p-10">
            
            <div class="max-w-5xl mx-auto space-y-12">
                
                <div class="mb-6">
                    <h3 class="text-xl font-black text-(--text) mb-1">Gestion de l'équipe</h3>
                    <p class="text-sm text-(--text)/60">Gérez les membres, les rôles et les invitations de votre organisation.</p>
                </div>

                <section class="grid grid-cols-1 md:grid-cols-2 gap-6">

                    <div class="space-y-4">
                        <div class="space-y-1.5">
                            <label class="text-xs font-bold uppercase tracking-widest text-(--text)/50">Lien d'invitation</label>
                            <div class="relative flex gap-2">
                                <div class="relative flex-1">
                                    <div class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-(--text)/40">
                                        <i class="bi bi-link-45deg"></i>
                                    </div>
                                    <input 
                                        readonly
                                        type="text"
                                        :value="inviteLink || 'Cliquez pour générer un lien'"
                                        class="w-full bg-(--bg2) border border-white/5 rounded-xl pl-11 pr-4 py-3 text-sm text-(--text) focus:outline-none focus:border-(--primary) transition-all shadow-inner font-mono"
                                    />
                                </div>
                                <div class="relative w-24 hidden sm:block" v-if="inviteLink.length === 0">
                                    <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-(--text)/40" title="Nombre d'utilisations (0 = infini)">
                                        <i class="bi bi-people"></i>
                                    </div>
                                    <input 
                                        type="number"
                                        v-model.number="inviteMaxUses"
                                        min="0"
                                        class="w-full bg-(--bg2) border border-white/5 rounded-xl pl-9 pr-3 py-3 text-sm text-(--text) focus:outline-none focus:border-(--primary) transition-all shadow-inner"
                                        title="Nombre d'utilisations (0 = infini)"
                                    />
                                </div>
                                <button 
                                    @click="inviteLink.length === 0 ? createInviteLink() : copyInvite()" 
                                    class="bg-(--primary) hover:bg-(--primary-hover) text-white rounded-xl px-4 py-3 text-sm font-medium transition-all flex items-center gap-2 whitespace-nowrap"
                                >
                                    <i class="bi" :class="inviteLink.length === 0 ? 'bi-stars' : copied ? 'bi-check-lg' : 'bi-copy'" />
                                    {{ inviteLink.length === 0 ? 'Générer' : copied ? 'Copié' : 'Copier' }}
                                </button>
                            </div>
                            <p class="text-xs text-(--text)/40">Partagez ce lien unique pour permettre à d'autres de rejoindre l'organisation instantanément.</p>
                        </div>
                    </div>

                    <div class="flex items-center md:justify-end">
                        <div class="w-full md:w-64">
                            <CapacityGauge 
                                :used="openedOrg?.members?.length || 0"
                                :max="openedOrg?.maxUsers || 100"
                                unit="Membres"
                                icon="bi-person-badge"
                                title="Capacité du serveur"
                            />
                        </div>
                    </div>

                </section>

                <section class="bg-(--bg2) rounded-3xl border border-(--text)/10 overflow-hidden flex flex-col">
                    
                    <div class="p-6 border-b border-(--text)/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-(--bg3)/30">

                        <h3 class="text-lg font-bold text-(--text) flex items-center gap-2">
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
                                class="w-full bg-(--bg3) border border-(--text)/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-(--text) focus:outline-none focus:border-(--primary)/40 transition-all placeholder:text-(--text)/30"
                            />
                        </div>

                    </div>

                    <div class="p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        
                        <div 
                            v-for="member in filteredMembers" 
                            :key="member.id" 
                            class="bg-(--bg3) border border-(--text)/5 hover:border-(--primary)/50 rounded-2xl p-5 flex flex-col gap-4 transition-all group relative"
                        >
                            
                            <!-- Header: Avatar & Info -->
                            <div class="flex items-start justify-between">
                                <div class="flex items-center gap-3">
                                    <div class="relative shrink-0">
                                        <img 
                                            :src="member.user?.avatarUrl || `https://ui-avatars.com/api/?name=${member.user?.name}&background=062d1f&color=16ac77`" 
                                            class="w-12 h-12 rounded-full object-cover bg-(--bg2) border border-(--text)/10" 
                                        />
                                        <div v-if="isSelf(member.user?.id!)" class="absolute -bottom-1 -right-1 bg-(--primary) w-3.5 h-3.5 rounded-full border-2 border-(--bg3)" title="Vous" />
                                    </div>
                                    <div class="flex flex-col overflow-hidden">
                                        <span class="text-sm font-bold text-(--text) group-hover:text-(--primary) transition-colors truncate">
                                            {{ member.user?.name || 'Utilisateur inconnu' }}
                                        </span>
                                        <span class="text-xs text-(--text)/50 truncate">{{ member.user?.email }}</span>
                                    </div>
                                </div>
                                
                                <!-- Actions -->
                                <button 
                                    v-if="!isSelf(member.user?.id!) && isAdmin"
                                    @click="confirmKickMember(member.id, member.user?.name || 'ce membre')"
                                    class="p-2 -mr-2 -mt-2 rounded-lg text-red-400 hover:bg-red-500/10 hover:text-red-500 transition-colors shrink-0"
                                    title="Exclure le membre"
                                >
                                    <i class="bi bi-person-x text-lg" />
                                </button>
                            </div>

                            <div class="w-full h-px bg-(--text)/5"></div>

                            <!-- Footer: Role & Date -->
                            <div class="flex items-center justify-between mt-auto">
                                <div class="flex flex-col gap-1">
                                    <span class="text-[10px] uppercase tracking-widest text-(--text)/40 font-bold">Rôle</span>
                                    <select 
                                        :value="member?.role || 'unknow'"
                                        @change="updateRole(member.id, $event)"
                                        :disabled="isSelf(member.user?.id!) || !isAdmin"
                                        class="bg-(--bg2) border border-(--text)/10 rounded-lg px-2 py-1 text-xs text-(--text) focus:outline-none focus:border-(--primary)/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all -ml-1 w-max"
                                    >
                                        <option value="OWNER">Propriétaire</option>
                                        <option value="ADMIN">Administrateur</option>
                                        <option value="MEMBER">Membre</option>
                                        <option value="GUEST">Invité</option>
                                    </select>
                                </div>
                                <div class="flex flex-col gap-1 text-right">
                                    <span class="text-[10px] uppercase tracking-widest text-(--text)/40 font-bold">Arrivée</span>
                                    <span class="text-xs text-(--text)/60">{{ new Date(member.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) }}</span>
                                </div>
                            </div>
                            
                        </div>

                        <div v-if="filteredMembers.length === 0" class="col-span-full py-12 text-center text-(--text)/40 text-sm border-2 border-dashed border-(--text)/5 rounded-2xl">
                            Aucun membre ne correspond à votre recherche.
                        </div>

                    </div>

                </section>

                <section v-if="inviteLinks.length > 0" class="bg-(--bg2) rounded-3xl border border-(--text)/10 overflow-hidden flex flex-col">

                    <div class="p-6 border-b border-(--text)/5 flex justify-between items-center bg-(--bg3)/30">
                        <h3 class="text-lg font-bold text-(--text) flex items-center gap-2">
                            Liens actifs
                            <span class="bg-(--text)/10 text-(--text) py-0.5 px-2 rounded-md text-xs">
                                {{ inviteLinks.length }}
                            </span>
                        </h3>
                    </div>

                    <div class="p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">

                        <div 
                            v-for="link in inviteLinks" 
                            :key="link.id" 
                            class="bg-(--bg3) border border-(--text)/5 hover:border-(--primary)/30 rounded-2xl p-5 flex flex-col gap-4 transition-all relative group"
                        >
                            
                            <!-- Header -->
                            <div class="flex items-center justify-between">
                                <div class="flex flex-col gap-1">
                                    <span class="text-[10px] uppercase tracking-widest text-(--text)/40 font-bold">Code d'invitation</span>
                                    <span class="text-sm font-mono font-bold text-(--primary) bg-(--primary)/10 px-2.5 py-1 rounded-md border border-(--primary)/20 w-max">
                                        {{ link.code.substring(0, 8) }}...
                                    </span>
                                </div>
                                <div class="flex items-center gap-1 -mt-2 -mr-2">
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
                            </div>

                            <div class="w-full h-px bg-(--text)/5"></div>

                            <!-- Footer -->
                            <div class="flex items-center justify-between mt-auto">
                                <div class="flex flex-col gap-1">
                                    <span class="text-[10px] uppercase tracking-widest text-(--text)/40 font-bold">Utilisations</span>
                                    <div class="text-sm">
                                        <span :class="link.maxUses && link.uses >= link.maxUses ? 'text-red-400 font-bold' : 'text-(--text) font-bold'">
                                            {{ link.uses }}
                                        </span>
                                        <span class="text-(--text)/40 text-xs"> / {{ link.maxUses || '∞' }}</span>
                                    </div>
                                </div>
                                <div class="flex flex-col gap-1 text-right">
                                    <span class="text-[10px] uppercase tracking-widest text-(--text)/40 font-bold">Expiration</span>
                                    <span class="text-xs text-(--text)/60">{{ link.expiresAt ? new Date(link.expiresAt).toLocaleDateString('fr-FR') : 'Jamais' }}</span>
                                </div>
                            </div>

                        </div>

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
import { openedOrg, user } from '@/assets/var';
import isAdmin from '@/assets/isAdmin';
import { useToast } from '@/composables/useToast';
import sfetch from '@/assets/utils/sfetch';
import ConfirmDelete from '@/components/common/ConfirmDelete.vue';
import CapacityGauge from '@/components/common/CapacityGauge.vue';

const toast = useToast();

const searchQuery = ref<string>('');
const copied = ref<boolean>(false);
const inviteLinks = ref<any[]>([]);
const inviteLink = ref<string>('');
const inviteMaxUses = ref<number>(1);

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
    return user.value?.id === userId;
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

const updateRole = (_memberId: string, _event: Event) => {
    //const newRole = (event.target as HTMLSelectElement).value;
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
                maxUses: inviteMaxUses.value > 0 ? inviteMaxUses.value : null, 
                expiresInHours: 24
            })
        }).then(res => res.json());

        inviteLink.value = `${window.location.origin}/invite/${invite.code}`;
        
        // Add to the list to show immediately
        inviteLinks.value.unshift(invite);

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
<template>

    <div class="flex flex-col h-full w-full overflow-hidden">

        <main class="flex-1 overflow-y-auto p-6 lg:p-10">
            
            <div class="max-w-4xl mx-auto space-y-10">
                
                <section class="p-6 rounded-3xl bg-(--primary)/5 border border-(--primary)/10 space-y-4">

                    <div class="flex justify-between">
                        <h2 class="text-xl font-bold ">
                            Inviter de nouveaux membres
                        </h2>
                        <i class="bi bi-person-plus text-3xl text-(--primary)/40" />
                    </div>

                    <div>

                        <div class="flex items-start flex-col">
                            <h3 class="text-lg font-bold text-(--text)/80">
                                Avec un lien
                            </h3>
                            <p class="text-sm text-(--text)/50">
                                Partagez ce lien unique pour permettre à d'autres de rejoindre l'organisation.
                            </p>
                        </div>

                        <div class="flex gap-2">
                            <div class="flex-1 bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-sm text-(--text)/60 font-mono truncate">
                                {{ inviteLink }}
                            </div>
                            <button 
                                @click="inviteLink.length == 0 ? createInviteLink() : copyInvite()" 
                                class="primary gap-2"
                            >
                                <i class="bi" :class="inviteLink.length == 0 ? 'bi-plus-lg' : copied ? 'bi-check-lg' : 'bi-copy'" />
                                {{ inviteLink.length == 0 ? 'Créer un lien d\'invitation' : copied ? 'Copié !' : 'Copier' }}
                            </button>
                        </div>

                    </div>

                    <div>

                        <div class="flex items-start flex-col">
                            <h3 class="text-lg font-bold text-(--text)/80">
                                Avec l'identifiant de l'utilisateur
                            </h3>
                            <p class="text-sm text-(--text)/50">
                                Entrez l'identifiant unique d'un utilisateur pour lui envoyer une invitation directe.
                            </p>
                        </div>

                        <div class="flex gap-2">

                            <input 
                                v-model="inviteId"
                                class="
                                    flex-1 bg-black/20 border border-white/10
                                    rounded-xl px-4 py-3 text-sm text-(--text)
                                    font-mono truncate outline-0
                                    placeholder:text-(--text)/30
                                    focus:border-white/20 focus:bg-black/30
                                    transition-all
                                "
                                placeholder="ckm4z8x2a0001lq5f9r8b2t7y"
                                type="text"
                            />

                            <button 
                                @click="sendInvite" 
                                class="primary gap-2"
                            >
                                <i class="bi" :class="invited ? 'bi-check-lg' : 'bi-person-plus'" />
                                {{ invited ? 'Membre invité !' : 'Inviter le membre' }}
                            </button>

                        </div>

                    </div>

                </section>

                <section class="space-y-6">

                    <div class="flex items-center justify-between">

                        <h3 class="text-lg font-bold ">
                            Liens d'invitation actifs
                            <span class="text-(--text)/30 font-medium ml-2 text-sm">
                                {{ inviteLinks?.length || 0 }}
                            </span>
                        </h3>

                        <button class="bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-xs flex items-center gap-2 hover:bg-white/10">
                            <i class="bi bi-plus-lg" />
                            Créer un lien
                        </button>

                    </div>

                    <div class="rounded-2xl border border-white/5 overflow-hidden bg-white/1">

                        <table class="w-full text-left border-collapse">

                            <thead>
                                <tr class="text-[10px] uppercase tracking-widest text-(--text)/40 border-b border-white/5">
                                    <th class="px-6 py-4 font-bold">Code / Lien</th>
                                    <th class="px-6 py-4 font-bold">Utilisations</th>
                                    <th class="px-6 py-4 font-bold">Expiration</th>
                                    <th class="px-6 py-4 font-bold text-right">Actions</th>
                                </tr>
                            </thead>

                            <tbody class="divide-y divide-white/5">

                                <tr 
                                    v-for="link in inviteLinks" 
                                    :key="link.id" 
                                    class="group hover:bg-white/2 transition-colors relative"
                                >

                                    <td class="px-6 py-4">
                                        <div class="flex flex-col">
                                            <span 
                                                class="text-sm font-mono text-(--text) bg-white/5 px-2 py-0.5 rounded border border-white/10 truncate w-40" 
                                                :title="link.code"
                                            >
                                                {{ link.code.substring(0, 8) }}...
                                            </span>
                                        </div>
                                    </td>

                                    <td class="px-6 py-4 text-sm">
                                        <span :class="link.maxUses && link.uses >= link.maxUses ? 'text-red-400' : 'text-(--text)'">
                                            {{ link.uses }}
                                        </span>
                                        <span class="text-(--text)/30">
                                            / {{ link.maxUses || '∞' }}
                                        </span>
                                    </td>

                                    <td class="px-6 py-4 text-xs text-(--text)/40">
                                        {{ link.expiresAt ? new Date(link.expiresAt).toLocaleString() : 'Jamais' }}
                                    </td>

                                    <td class="px-6 py-4 text-right">

                                        <div class="flex items-center justify-end gap-2">

                                            <button 
                                                @click="copyInviteLink(link.code)"
                                                class="p-2 text-(--text)/40 hover:text-(--text) transition-colors"
                                                title="Copier le lien"
                                            >
                                                <i class="bi bi-clipboard text-lg" />
                                            </button>
                                            
                                            <button 
                                                @click="deleteInvite(link.code, 1)"
                                                class="p-2 text-red-500/40 hover:text-red-500 transition-colors"
                                                title="Supprimer le lien"
                                            >
                                                <i class="bi bi-trash text-lg" />
                                            </button>

                                        </div>

                                    </td>

                                </tr>

                            </tbody>

                        </table>

                    </div>

                </section>

                <section class="space-y-6">

                    <CapacityGauge 
                        :used="openedOrg?.members?.length || 0"
                        :max="openedOrg?.maxTotalUsers || 100"
                        unit="Utilisateurs"
                        icon="bi-people"
                        title="Slot utilisateur"
                    />

                    <div class="flex items-center justify-between">
                    
                        <h3 class="text-lg font-bold ">
                            Liste des membres 
                            <span class="text-(--text)/30 font-medium ml-2 text-sm">
                                {{ openedOrg?.members?.length }}
                            </span>
                        </h3>
                    
                        <div class="relative">
                            <i class="bi bi-search absolute left-3 top-1/2 -translate-y-1/2 text-(--text)/30 text-xs" />
                            <input 
                                v-model="searchQuery"
                                type="text" 
                                placeholder="Rechercher un membre..."
                                class="bg-white/5 border border-white/10 rounded-lg pl-9 pr-4 py-2 text-xs focus:outline-none focus:border-(--primary)/50 w-64"
                            />
                        </div>

                    </div>

                    <div class="rounded-2xl border border-white/5 overflow-hidden bg-white/1">

                        <table class="w-full text-left border-collapse">

                            <thead>

                                <tr class="text-[10px] uppercase tracking-widest text-(--text)/40 border-b border-white/5">

                                    <th class="px-6 py-4 font-bold">Utilisateur</th>
                                    <th class="px-6 py-4 font-bold">Rôle</th>
                                    <th class="px-6 py-4 font-bold">Arrivée</th>
                                    <th class="px-6 py-4 font-bold text-right">Actions</th>

                                </tr>

                            </thead>

                            <tbody class="divide-y divide-white/5">

                                <tr 
                                    v-for="member in filteredMembers" 
                                    :key="member.id" 
                                    class="group hover:bg-white/2 transition-colors relative"
                                >

                                    <td class="px-6 py-4">

                                        <div class="flex items-center gap-3">

                                            <img 
                                                :src="member.user?.avatarUrl" 
                                                class="w-8 h-8 rounded-full border border-white/10" 
                                                :class="isSelf(member.user?.id!) ? 'ring-2 ring-(--primary)' : ''"
                                            />

                                            <div class="flex flex-col">
                                                <span class="text-sm font-bold ">{{ member.user?.name }}</span>
                                                <span class="text-[10px] text-(--text)/30">{{ member.user?.email }}</span>
                                            </div>

                                        </div>

                                    </td>

                                    <td class="px-6 py-4">

                                        <select 
                                            :value="member?.role || 'unknow'"
                                            @change="updateRole(member.id, $event)"
                                            :disabled="isSelf(member.user?.id!) || !isAdmin"
                                            class="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-(--text) focus:outline-none disabled:opacity-50"
                                        >
                                            <option value="OWNER">Propriétaire</option>
                                            <option value="ADMIN">Admin</option>
                                            <option value="MEMBER">Membre</option>
                                            <option value="GUEST">Invité</option>
                                        </select>

                                    </td>

                                    <td class="px-6 py-4 text-xs text-(--text)/40">
                                        {{ new Date(member.createdAt).toLocaleDateString() }}
                                    </td>

                                    <td class="px-6 py-4 text-right">
                                        <button 
                                            v-if="!isSelf(member.user?.id!) && isAdmin"
                                            @click="removeMember(member.id)"
                                            class="p-2 text-red-500/40 hover:text-red-500 transition-colors"
                                            title="Exclure le membre"
                                        >
                                            <i class="bi bi-person-x-fill text-lg" />
                                        </button>
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
        item-name="le lien"
        @cancel="showConfirmDelete = null"
        @confirm="deleteInvite(showConfirmDelete!, 2)"
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
const showConfirmDelete = ref<string | null>(null);


const filteredMembers = computed(() => {
    if (!openedOrg.value?.members) return [];
    return openedOrg.value.members.filter(m => 
        m.user?.name?.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
        m.user?.email.toLowerCase().includes(searchQuery.value.toLowerCase())
    );
});


const isSelf = (userId: string) => {
    return localStorage.getItem('userId') == userId;
};

const copyInvite = () => {
    navigator.clipboard.writeText(inviteLink.value);
    copied.value = true;
    setTimeout(() => copied.value = false, 2000);
};

const copyInviteLink = (code: string) => {
    const fullUrl = `${window.location.origin}/invite/${code}`;
    navigator.clipboard.writeText(fullUrl);
    toast.show('Lien copié !', 'success');
};

// Fonction pour supprimer un lien (API call)
const deleteInvite = async (code: string, state: 1 | 2) => {

    if (state == 1)
    {
        showConfirmDelete.value = code;
    }
    else if (state == 2)
    {

        showConfirmDelete.value = null;

        const res = await sfetch(`/api/orgs/users/inviteLink/${code}`, {
            method: 'DELETE'
        })

        if (res.ok)
        {
            toast.show('Lien supprimé avec succès.', 'success');
            inviteLinks.value = inviteLinks.value.filter(link => link.code != code);
        }
        else
        {
            toast.show('Une erreur est survenue lors de la suppression.', 'error');
        }

    }

};

const sendInvite = async () => {

    const cuidRegex = /^c[a-z0-9]{24}$/;

    if (!inviteId.value || inviteId.value == '' || !cuidRegex.test(inviteId.value))
    {
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
            console.error(res.error);
            toast.show(res.error, 'error');
        }
        else
        {
            toast.show('Membre invité avec succès.', 'success');
        }

    }
    catch (err) {
        console.error(err);
        toast.show('Une erreur est survenue lors de l\'invitation.', 'error');
    }
    finally {
        invited.value = false;
    }

}

const updateRole = (memberId: string, event: Event) => {
    const newRole = (event.target as HTMLSelectElement).value;
    console.log(`Update member ${memberId} to role ${newRole}`);
    // Émettre un event Socket ici: socket.emit('update-member-role', { memberId, role: newRole })
};

const removeMember = async (memberId: string) => {

    if (confirm("Êtes-vous sûr de vouloir exclure ce membre ?")) 
    {

        const res = await sfetch(`/api/orgs/users/${openedOrg.value!.id}/kick/${memberId}`, {
            method: 'POST'
        }).then(res => res.json());

        if (res.error)
        {
            toast.show(res.error, 'error');
        }
        else
        {
            toast.show(res.message, 'success');
        }

    }

};


const createInviteLink = async () => {
    
    const invite = await sfetch('/api/orgs/users/inviteLink/create', {
        method: 'POST',
        body: JSON.stringify({ 
            organizationId: openedOrg.value?.id,
            maxUses: 1, 
            expiresInHours: 24
        })
    }).then(res => res.json())

    inviteLink.value = `${window.location.origin}/invite/${invite.code}`

}


onMounted(async () => {

    inviteLinks.value = await sfetch(`/api/orgs/users/inviteLink/${openedOrg.value?.id}`).then(res => res.json()) || [];

})

</script>
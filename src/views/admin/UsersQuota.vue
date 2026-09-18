<template>
    <div class="space-y-6">
        <div class="flex flex-col md:flex-row gap-4 items-center justify-between bg-(--bg) p-4 rounded-2xl border border-white/5 shadow-lg">
            <div class="relative w-full md:w-96">
                <i class="bi bi-search absolute left-4 top-1/2 -translate-y-1/2 text-(--text2)"></i>
                <input 
                    v-model="searchQuery" 
                    type="text" 
                    placeholder="Rechercher un utilisateur (nom, email, ID)..."
                    class="w-full bg-(--bg2) border border-white/5 rounded-xl pl-11 pr-4 py-3 text-sm focus:outline-none focus:border-(--primary)/50 focus:ring-1 focus:ring-(--primary)/50 transition-all"
                >
            </div>
            <div class="text-sm font-bold text-(--text2) px-4 py-2 bg-(--bg2) rounded-xl border border-white/5">
                {{ filteredUsers.length }} utilisateur(s)
            </div>
        </div>

        <div class="bg-(--bg) border border-white/5 rounded-2xl overflow-hidden shadow-xl">
            <div class="overflow-x-auto">
                <table class="w-full text-left border-collapse">
                    <thead>
                        <tr class="border-b border-white/5 bg-(--bg2)/50">
                            <th class="p-4 text-xs font-black uppercase tracking-widest text-(--text2)">Utilisateur</th>
                            <th class="p-4 text-xs font-black uppercase tracking-widest text-(--text2)">Organisations</th>
                            <th class="p-4 text-xs font-black uppercase tracking-widest text-(--text2) text-center">Orgs Créées / Max</th>
                            <th class="p-4 text-xs font-black uppercase tracking-widest text-(--text2) text-center">Max Users (par Org)</th>
                            <th class="p-4 text-xs font-black uppercase tracking-widest text-(--text2) text-center">Max Storage (par Org)</th>
                            <th class="p-4 text-xs font-black uppercase tracking-widest text-(--text2) text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-white/5">
                        <tr v-if="loading">
                            <td colspan="6" class="p-12 text-center">
                                <div class="w-8 h-8 border-4 border-(--primary)/30 border-t-(--primary) rounded-full animate-spin mx-auto"></div>
                            </td>
                        </tr>
                        <tr v-else-if="error">
                            <td colspan="6" class="p-12 text-center text-red-500 font-bold">
                                {{ error }}
                            </td>
                        </tr>
                        <tr v-else v-for="user in filteredUsers" :key="user.id" class="hover:bg-white/[0.02] transition-colors group">
                            <td class="p-4">
                                <div class="flex items-center gap-3">
                                    <div class="w-10 h-10 rounded-full bg-(--primary)/20 text-(--primary) flex items-center justify-center font-bold text-lg shrink-0">
                                        {{ $p(user.name) ? $p(user.name).charAt(0).toUpperCase() : '?' }}
                                    </div>
                                    <div>
                                        <p class="font-bold text-sm text-(--text)">{{ $p(user.name) || 'Sans nom' }}</p>
                                        <p class="text-xs text-(--text2) font-mono mt-0.5">{{ user.email }}</p>
                                    </div>
                                </div>
                            </td>

                            <td class="p-4">
                                <div v-if="!user.organizations?.length" class="text-xs text-(--text2)">—</div>
                                <div v-else class="flex flex-wrap gap-1 max-w-64">
                                    <span
                                        v-for="org in user.organizations"
                                        :key="org.id"
                                        class="text-[11px] font-bold px-2 py-0.5 rounded-full bg-white/5 text-(--text2) truncate max-w-32"
                                        :title="org.name"
                                    >
                                        {{ org.name }}
                                    </span>
                                </div>
                            </td>

                            <td class="p-4 text-center">
                                <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold"
                                        :class="user.ownedOrgsCount >= user.maxOrgs && user.maxOrgs > 0 ? 'bg-red-500/10 text-red-500' : 'bg-(--primary)/10 text-(--primary)'">
                                    {{ user.ownedOrgsCount }} / {{ user.maxOrgs }}
                                </div>
                            </td>

                            <td class="p-4 text-center">
                                <span class="text-sm font-medium text-(--text)">{{ user.orgMaxUsers.toLocaleString() }}</span>
                            </td>

                            <td class="p-4 text-center">
                                <span class="text-sm font-medium text-(--text)">{{ formatBytes(user.orgMaxStorage) }}</span>
                            </td>

                            <td class="p-4 text-right">
                                <button
                                    @click="openEditModal(user)"
                                    class="p-2 text-(--text2) hover:text-(--primary) hover:bg-(--primary)/10 rounded-lg transition-colors"
                                    title="Modifier les quotas"
                                >
                                    <i class="bi bi-pencil-square text-lg"></i>
                                </button>
                                <button
                                    @click="openDeleteModal(user)"
                                    class="p-2 text-(--text2) hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                                    title="Supprimer l'utilisateur"
                                >
                                    <i class="bi bi-trash3 text-lg"></i>
                                </button>
                            </td>
                        </tr>
                        <tr v-if="!loading && !error && filteredUsers.length === 0">
                            <td colspan="6" class="p-8 text-center text-(--text2) text-sm">
                                Aucun utilisateur trouvé.
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>

        <!-- Edit Quotas Modal -->
        <div v-if="selectedUser" class="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="closeModal"></div>
            
            <div class="relative w-full max-w-md bg-(--bg) rounded-2xl shadow-2xl border border-white/10 overflow-hidden animate-fade-in-up">
                
                <div class="p-6 border-b border-white/5 bg-(--bg2)">
                    <h3 class="text-xl font-black text-(--text)">Modifier les quotas</h3>
                    <p class="text-sm text-(--text2) mt-1">Pour l'utilisateur <span class="font-bold text-(--text)">{{ $p(selectedUser.name) }}</span></p>
                </div>

                <div class="p-6 space-y-5">
                    
                    <div class="space-y-1.5">
                        <label class="text-xs font-bold uppercase tracking-widest text-(--text2) flex items-center gap-2">
                            <i class="bi bi-building"></i> Max Organisations
                        </label>
                        <input 
                            type="number" 
                            v-model="editForm.maxOrgs" 
                            min="0"
                            max="2147483647"
                            class="w-full bg-(--bg2) border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-(--primary) focus:ring-1 focus:ring-(--primary) transition-all"
                        >
                        <p class="text-[10px] text-(--text2) mt-1">Nombre d'organisations que l'utilisateur a le droit de créer.</p>
                    </div>

                    <div class="space-y-1.5">
                        <label class="text-xs font-bold uppercase tracking-widest text-(--text2) flex items-center gap-2">
                            <i class="bi bi-people"></i> Max Users (Par Org)
                        </label>
                        <input 
                            type="number" 
                            v-model="editForm.orgMaxUsers" 
                            min="1"
                            max="2147483647"
                            class="w-full bg-(--bg2) border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-(--primary) focus:ring-1 focus:ring-(--primary) transition-all"
                        >
                        <p class="text-[10px] text-(--text2) mt-1">Limite du nombre de membres appliquées à ses prochaines créations.</p>
                    </div>

                    <div class="space-y-1.5">
                        <label class="text-xs font-bold uppercase tracking-widest text-(--text2) flex items-center gap-2">
                            <i class="bi bi-hdd"></i> Max Storage (Go)
                        </label>
                        <input 
                            type="number" 
                            v-model="editForm.orgMaxStorageGB" 
                            min="0"
                            max="8589934591"
                            step="0.1"
                            class="w-full bg-(--bg2) border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-(--primary) focus:ring-1 focus:ring-(--primary) transition-all"
                        >
                        <p class="text-[10px] text-(--text2) mt-1">Stockage maximal en Gigaoctets pour ses futures organisations.</p>
                    </div>

                </div>

                <div class="p-6 bg-(--bg2) border-t border-white/5 flex gap-3 justify-end">
                    <button 
                        @click="closeModal" 
                        class="px-5 py-2.5 rounded-xl font-bold text-sm bg-white/5 hover:bg-white/10 text-(--text) transition-colors"
                    >
                        Annuler
                    </button>
                    <button 
                        @click="saveQuotas" 
                        :disabled="isSaving"
                        class="primary flex items-center gap-2"
                    >
                        <i v-if="isSaving" class="bi bi-arrow-repeat animate-spin"></i>
                        <i v-else class="bi bi-check-lg"></i>
                        Sauvegarder
                    </button>
                </div>
            </div>
        </div>

        <ConfirmDelete
            :show="!!userToDelete"
            :itemName="userToDelete?.name || userToDelete?.email || 'cet utilisateur'"
            itemType="cet utilisateur"
            buttonText="Supprimer l'utilisateur"
            :checkbox="true"
            :loading="isDeleting"
            extraWarning="Toutes les données de ce compte (messages, fichiers, accès) seront supprimées définitivement, sur toutes les organisations dont il est membre."
            @confirm="confirmDeleteUser"
            @cancel="userToDelete = null"
        />

    </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import sfetch from '@/assets/utils/sfetch';
import { useToast } from '@/composables/useToast';
import ConfirmDelete from '@/components/common/ConfirmDelete.vue';

const toast = useToast();

interface AdminUser {
    id: string;
    name: string;
    email: string;
    maxOrgs: number;
    orgMaxUsers: number;
    orgMaxStorage: string | number; // BigInt as string
    ownedOrgsCount: number;
    organizations: { id: string; name: string; logo: string | null }[];
}

const users = ref<AdminUser[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const searchQuery = ref('');

const selectedUser = ref<AdminUser | null>(null);
const isSaving = ref(false);
const userToDelete = ref<AdminUser | null>(null);
const isDeleting = ref(false);
const editForm = ref({
    maxOrgs: 0,
    orgMaxUsers: 0,
    orgMaxStorageGB: 0
});

const filteredUsers = computed(() => {
    if (!searchQuery.value) return users.value;
    const q = searchQuery.value.toLowerCase();
    return users.value.filter(u => 
        (u.name && u.name.toLowerCase().includes(q)) || 
        (u.email && u.email.toLowerCase().includes(q)) ||
        u.id.toLowerCase().includes(q)
    );
});

const formatBytes = (bytes: string | number) => {
    const b = Number(bytes);
    if (b === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(b) / Math.log(k));
    return parseFloat((b / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const fetchData = async () => {
    loading.value = true;
    error.value = null;
    try {
        const res = await sfetch('/api/admin/users');
        if (res.ok) {
            const rawUsers: Partial<AdminUser>[] = await res.json();
            // Sécurité: certains utilisateurs créés avant l'ajout de ces
            // champs (organizations, ...) peuvent ne pas les avoir.
            users.value = rawUsers.map(u => ({
                id: u.id ?? '',
                name: u.name ?? '',
                email: u.email ?? '',
                maxOrgs: u.maxOrgs ?? 0,
                orgMaxUsers: u.orgMaxUsers ?? 0,
                orgMaxStorage: u.orgMaxStorage ?? 0,
                ownedOrgsCount: u.ownedOrgsCount ?? 0,
                organizations: u.organizations ?? []
            }));
        }
        else error.value = (await res.json()).error || 'Accès refusé.';
    } catch (e) {
        error.value = "Impossible de se connecter au serveur.";
    } finally {
        loading.value = false;
    }
};

const openEditModal = (user: AdminUser) => {
    selectedUser.value = user;
    editForm.value = {
        maxOrgs: user.maxOrgs,
        orgMaxUsers: user.orgMaxUsers,
        orgMaxStorageGB: Number(user.orgMaxStorage) / (1024 * 1024 * 1024)
    };
};

const closeModal = () => {
    selectedUser.value = null;
};

const saveQuotas = async () => {
    if (!selectedUser.value) return;
    isSaving.value = true;
    const safeMaxOrgs = Number(editForm.value.maxOrgs) || 0;
    const safeMaxUsers = Number(editForm.value.orgMaxUsers) || 1;
    const safeStorageGB = Number(editForm.value.orgMaxStorageGB) || 0;
    const storageBytes = Math.floor(safeStorageGB * 1024 * 1024 * 1024);
    
    try {
        const res = await sfetch(`/api/admin/users/${selectedUser.value.id}`, {
            method: 'PATCH',
            body: JSON.stringify({
                maxOrgs: safeMaxOrgs,
                orgMaxUsers: safeMaxUsers,
                orgMaxStorage: storageBytes.toString()
            })
        });
        if (res.ok) {
            const updatedUser = await res.json();
            const index = users.value.findIndex(u => u.id === updatedUser.id);
            if (index !== -1 && users.value[index]) {
                users.value[index]!.maxOrgs = updatedUser.maxOrgs;
                users.value[index]!.orgMaxUsers = updatedUser.orgMaxUsers;
                users.value[index]!.orgMaxStorage = updatedUser.orgMaxStorage;
            }
            toast.show('Quotas mis à jour avec succès', 'success');
            closeModal();
        } else toast.show((await res.json()).error || 'Erreur', 'error');
    } catch (e) {
        toast.show('Erreur de connexion', 'error');
    } finally {
        isSaving.value = false;
    }
};

const openDeleteModal = (user: AdminUser) => {
    userToDelete.value = user;
};

const confirmDeleteUser = async () => {
    if (!userToDelete.value) return;
    isDeleting.value = true;
    try {
        const res = await sfetch(`/api/admin/users/${userToDelete.value.id}`, {
            method: 'DELETE'
        });
        if (res.ok) {
            users.value = users.value.filter(u => u.id !== userToDelete.value!.id);
            toast.show('Utilisateur supprimé avec succès', 'success');
            userToDelete.value = null;
        } else {
            toast.show((await res.json()).error || 'Erreur lors de la suppression', 'error');
        }
    } catch (e) {
        toast.show('Erreur de connexion', 'error');
    } finally {
        isDeleting.value = false;
    }
};

onMounted(() => {
    fetchData();
});
</script>

<style scoped>
.animate-fade-in-up {
    animation: fadeInUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

@keyframes fadeInUp {
    from {
        opacity: 0;
        transform: translateY(20px) scale(0.95);
    }
    to {
        opacity: 1;
        transform: translateY(0) scale(1);
    }
}
</style>

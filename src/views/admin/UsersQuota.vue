<template>
    <div class="space-y-6">
        <div class="flex flex-col md:flex-row gap-4 items-center justify-between bg-(--bg) p-4 rounded-2xl border border-(--text)/5 shadow-lg">
            <div class="relative w-full md:w-96">
                <i class="bi bi-search absolute left-4 top-1/2 -translate-y-1/2 text-(--text2)"></i>
                <input 
                    v-model="searchQuery" 
                    type="text" 
                    placeholder="Rechercher un utilisateur (nom, email, ID)..."
                    class="w-full bg-(--bg2) border border-(--text)/5 rounded-xl pl-11 pr-4 py-3 text-sm focus:outline-none focus:border-(--primary)/50 focus:ring-1 focus:ring-(--primary)/50 transition-all"
                >
            </div>
            <div class="text-sm font-bold text-(--text2) px-4 py-2 bg-(--bg2) rounded-xl border border-(--text)/5">
                {{ filteredUsers.length }} utilisateur(s)
            </div>
        </div>

        <div class="bg-(--bg) border border-(--text)/5 rounded-2xl overflow-hidden shadow-xl">
            <div class="overflow-x-auto">
                <table class="w-full text-left border-collapse">
                    <thead>
                        <tr class="border-b border-(--text)/5 bg-(--bg2)/50">
                            <th class="p-4 text-xs font-black uppercase tracking-widest text-(--text2)">Utilisateur</th>
                            <th class="p-4 text-xs font-black uppercase tracking-widest text-(--text2)">Organisations</th>
                            <th class="p-4 text-xs font-black uppercase tracking-widest text-(--text2) text-center">Orgs Créées / Max</th>
                            <th class="p-4 text-xs font-black uppercase tracking-widest text-(--text2) text-center">Max Users (par Org)</th>
                            <th class="p-4 text-xs font-black uppercase tracking-widest text-(--text2) text-center">Max Storage (par Org)</th>
                            <th class="p-4 text-xs font-black uppercase tracking-widest text-(--text2) text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-(--text)/5">
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
                        <tr v-else v-for="user in filteredUsers" :key="user.id"
                            class="hover:bg-(--text)/[0.02] transition-colors group"
                            :class="{ 'bg-red-500/[0.04]': user.isBanned }">
                            <td class="p-4">
                                <div class="flex items-center gap-3">
                                    <div class="w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg shrink-0"
                                        :class="user.isBanned ? 'bg-red-500/15 text-red-500' : 'bg-(--primary)/20 text-(--primary)'">
                                        {{ $p(user.name) ? $p(user.name).charAt(0).toUpperCase() : '?' }}
                                    </div>
                                    <div class="min-w-0">
                                        <div class="flex items-center gap-2 flex-wrap">
                                            <p class="font-bold text-sm text-(--text)">{{ $p(user.name) || 'Sans nom' }}</p>
                                            <span v-if="user.isSuperAdmin"
                                                class="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-500"
                                                title="Administrateur principal">
                                                <i class="bi bi-shield-fill-check mr-1"></i>Principal
                                            </span>
                                            <span v-else-if="user.isAdmin"
                                                class="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-(--primary)/15 text-(--primary)">
                                                <i class="bi bi-shield-fill mr-1"></i>Admin
                                            </span>
                                            <span v-if="user.isBanned"
                                                class="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-red-500/15 text-red-500"
                                                :title="user.bannedReason || 'Aucun motif renseigné'">
                                                <i class="bi bi-slash-circle mr-1"></i>Banni
                                            </span>
                                        </div>
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
                                        class="text-[11px] font-bold px-2 py-0.5 rounded-full bg-(--text)/5 text-(--text2) truncate max-w-32"
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

                            <td class="p-4 text-right whitespace-nowrap">
                                <button
                                    @click="openEditModal(user)"
                                    class="p-2 text-(--text2) hover:text-(--primary) hover:bg-(--primary)/10 rounded-lg transition-colors"
                                    title="Modifier les quotas"
                                >
                                    <i class="bi bi-pencil-square text-lg"></i>
                                </button>
                                <!-- Donner/retirer le rôle administrateur : réservé à
                                     l'administrateur principal (l'API applique la même règle). -->
                                <button
                                    v-if="isSuperAdmin && !user.isSuperAdmin"
                                    @click="openAdminModal(user)"
                                    class="p-2 rounded-lg transition-colors"
                                    :class="user.isAdmin
                                        ? 'text-(--primary) hover:bg-(--primary)/10'
                                        : 'text-(--text2) hover:text-(--primary) hover:bg-(--primary)/10'"
                                    :title="user.isAdmin ? 'Retirer le rôle administrateur' : 'Passer administrateur'"
                                >
                                    <i class="text-lg" :class="user.isAdmin ? 'bi bi-shield-fill-check' : 'bi bi-shield-plus'"></i>
                                </button>
                                <button
                                    v-if="canModerate(user)"
                                    @click="user.isBanned ? unbanUser(user) : openBanModal(user)"
                                    class="p-2 rounded-lg transition-colors"
                                    :class="user.isBanned
                                        ? 'text-amber-500 hover:bg-amber-500/10'
                                        : 'text-(--text2) hover:text-red-500 hover:bg-red-500/10'"
                                    :title="user.isBanned ? 'Lever le bannissement' : 'Bannir l\'utilisateur'"
                                    :disabled="banActionUserId === user.id"
                                >
                                    <i class="text-lg"
                                        :class="banActionUserId === user.id
                                            ? 'bi bi-arrow-repeat animate-spin'
                                            : user.isBanned ? 'bi bi-arrow-counterclockwise' : 'bi bi-slash-circle'"></i>
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
            
            <div class="relative w-full max-w-md bg-(--bg) rounded-2xl shadow-2xl border border-(--text)/10 overflow-hidden animate-fade-in-up">
                
                <div class="p-6 border-b border-(--text)/5 bg-(--bg2)">
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
                            class="w-full bg-(--bg2) border border-(--text)/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-(--primary) focus:ring-1 focus:ring-(--primary) transition-all"
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
                            class="w-full bg-(--bg2) border border-(--text)/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-(--primary) focus:ring-1 focus:ring-(--primary) transition-all"
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
                            class="w-full bg-(--bg2) border border-(--text)/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-(--primary) focus:ring-1 focus:ring-(--primary) transition-all"
                        >
                        <p class="text-[10px] text-(--text2) mt-1">Stockage maximal en Gigaoctets pour ses futures organisations.</p>
                    </div>

                </div>

                <div class="p-6 bg-(--bg2) border-t border-(--text)/5 flex gap-3 justify-end">
                    <button 
                        @click="closeModal" 
                        class="px-5 py-2.5 rounded-xl font-bold text-sm bg-(--text)/5 hover:bg-(--text)/10 text-(--text) transition-colors"
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

        <!-- Bannissement : Popup maison (jamais de confirm() natif) avec saisie
             du motif, qui sera affiché tel quel à l'utilisateur banni au
             lancement de Synco. -->
        <Popup :isOpen="!!userToBan" @close="closeBanModal">
            <template #title>Bannir un utilisateur</template>

            <p class="text-sm text-(--text)">
                <span class="font-bold">{{ $p(userToBan?.name) || userToBan?.email }}</span>
                n'aura plus accès à Synco : la connexion lui sera refusée et ses sessions
                en cours seront coupées immédiatement.
            </p>
            <p class="text-xs text-(--text2) mt-2">
                Ses données et ses organisations sont conservées — le bannissement peut être levé à tout moment.
            </p>

            <label class="block text-xs font-bold uppercase tracking-widest text-(--text2) mt-5 mb-1.5">
                Motif (facultatif)
            </label>
            <textarea
                v-model="banReason"
                rows="3"
                :maxlength="MAX_BAN_REASON_LENGTH"
                placeholder="Ce motif sera affiché à l'utilisateur."
                class="w-full bg-(--bg2) border border-(--text)/10 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:border-(--primary) focus:ring-1 focus:ring-(--primary) transition-all"
            ></textarea>
            <p class="text-[10px] text-(--text2) mt-1 text-right">{{ banReason.length }} / {{ MAX_BAN_REASON_LENGTH }}</p>

            <template #footer>
                <button @click="closeBanModal" class="default">Annuler</button>
                <button @click="confirmBan" class="danger" :class="{ loader: isBanning }" :disabled="isBanning">
                    Bannir
                </button>
            </template>
        </Popup>

        <!-- Rôle administrateur : réservé à l'administrateur principal. -->
        <Popup :isOpen="!!userToToggleAdmin" @close="userToToggleAdmin = null">
            <template #title>
                {{ userToToggleAdmin?.isAdmin ? 'Retirer le rôle administrateur' : 'Passer administrateur' }}
            </template>

            <p class="text-sm text-(--text)">
                <template v-if="userToToggleAdmin?.isAdmin">
                    <span class="font-bold">{{ $p(userToToggleAdmin?.name) || userToToggleAdmin?.email }}</span>
                    perdra l'accès au panel admin.
                </template>
                <template v-else>
                    <span class="font-bold">{{ $p(userToToggleAdmin?.name) || userToToggleAdmin?.email }}</span>
                    aura accès au panel admin : quotas de tous les comptes et de toutes les
                    organisations, suppression de comptes, bannissement d'utilisateurs.
                </template>
            </p>
            <p v-if="!userToToggleAdmin?.isAdmin" class="text-xs text-amber-500/90 mt-3 font-medium">
                Un administrateur ne peut ni bannir, ni se voir retirer son rôle par un autre
                administrateur : vous seul, en tant qu'administrateur principal, pouvez le faire.
            </p>

            <template #footer>
                <button @click="userToToggleAdmin = null" class="default">Annuler</button>
                <button
                    @click="confirmAdminToggle"
                    :class="[userToToggleAdmin?.isAdmin ? 'danger' : 'primary', { loader: isTogglingAdmin }]"
                    :disabled="isTogglingAdmin"
                >
                    {{ userToToggleAdmin?.isAdmin ? 'Retirer' : 'Confirmer' }}
                </button>
            </template>
        </Popup>

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
import Popup from '@/components/Popup.vue';

const toast = useToast();

// Doit rester aligné avec MAX_BAN_REASON_LENGTH côté synco_api
// (routes/admin.ts), qui tronque au-delà.
const MAX_BAN_REASON_LENGTH = 500;

interface AdminUser {
    id: string;
    name: string;
    email: string;
    maxOrgs: number;
    orgMaxUsers: number;
    orgMaxStorage: string | number; // BigInt as string
    ownedOrgsCount: number;
    organizations: { id: string; name: string; logo: string | null }[];
    isAdmin: boolean;
    isSuperAdmin: boolean;
    isBanned: boolean;
    bannedAt: string | null;
    bannedReason: string | null;
}

const users = ref<AdminUser[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const searchQuery = ref('');

const selectedUser = ref<AdminUser | null>(null);
const isSaving = ref(false);
const userToDelete = ref<AdminUser | null>(null);
const isDeleting = ref(false);

// Qui consulte le panel : seul l'administrateur principal peut donner ou
// retirer le rôle administrateur (l'API refuse de toute façon les autres).
const isSuperAdmin = ref(false);
const currentUserId = ref<string | null>(null);

const userToBan = ref<AdminUser | null>(null);
const banReason = ref('');
const isBanning = ref(false);
const banActionUserId = ref<string | null>(null);

const userToToggleAdmin = ref<AdminUser | null>(null);
const isTogglingAdmin = ref(false);

/**
 * Mêmes règles que côté API : on ne se bannit pas soi-même, l'administrateur
 * principal n'est jamais bannissable, et un admin n'est sanctionnable que par
 * l'administrateur principal.
 */
const canModerate = (user: AdminUser): boolean => {
    if (user.isSuperAdmin) return false;
    if (user.id === currentUserId.value) return false;
    if (user.isAdmin && !isSuperAdmin.value) return false;
    return true;
};
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
                organizations: u.organizations ?? [],
                isAdmin: u.isAdmin ?? false,
                isSuperAdmin: u.isSuperAdmin ?? false,
                isBanned: u.isBanned ?? false,
                bannedAt: u.bannedAt ?? null,
                bannedReason: u.bannedReason ?? null
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

const openBanModal = (user: AdminUser) => {
    userToBan.value = user;
    banReason.value = '';
};

const closeBanModal = () => {
    userToBan.value = null;
    banReason.value = '';
};

const patchUser = (userId: string, patch: Partial<AdminUser>) => {
    const target = users.value.find(u => u.id === userId);
    if (target) Object.assign(target, patch);
};

const confirmBan = async () => {
    if (!userToBan.value) return;
    const target = userToBan.value;
    isBanning.value = true;
    try {
        const res = await sfetch(`/api/admin/users/${target.id}/ban`, {
            method: 'POST',
            body: JSON.stringify({ reason: banReason.value.trim() })
        });
        if (res.ok) {
            const data = await res.json();
            patchUser(target.id, {
                isBanned: true,
                bannedAt: data.bannedAt ?? new Date().toISOString(),
                bannedReason: data.bannedReason ?? null
            });
            toast.show('Utilisateur banni', 'success');
            closeBanModal();
        } else {
            toast.show((await res.json()).error || 'Erreur lors du bannissement', 'error');
        }
    } catch (e) {
        toast.show('Erreur de connexion', 'error');
    } finally {
        isBanning.value = false;
    }
};

// Lever un bannissement est immédiatement réversible et sans perte : pas de
// confirmation, l'action est directe.
const unbanUser = async (user: AdminUser) => {
    banActionUserId.value = user.id;
    try {
        const res = await sfetch(`/api/admin/users/${user.id}/ban`, { method: 'DELETE' });
        if (res.ok) {
            patchUser(user.id, { isBanned: false, bannedAt: null, bannedReason: null });
            toast.show('Bannissement levé', 'success');
        } else {
            toast.show((await res.json()).error || 'Erreur lors du débannissement', 'error');
        }
    } catch (e) {
        toast.show('Erreur de connexion', 'error');
    } finally {
        banActionUserId.value = null;
    }
};

const openAdminModal = (user: AdminUser) => {
    userToToggleAdmin.value = user;
};

const confirmAdminToggle = async () => {
    if (!userToToggleAdmin.value) return;
    const target = userToToggleAdmin.value;
    const revoking = target.isAdmin;
    isTogglingAdmin.value = true;
    try {
        const res = await sfetch(`/api/admin/admins/${target.id}`, {
            method: revoking ? 'DELETE' : 'POST'
        });
        if (res.ok) {
            patchUser(target.id, { isAdmin: !revoking });
            toast.show(revoking ? 'Rôle administrateur retiré' : 'Utilisateur passé administrateur', 'success');
            userToToggleAdmin.value = null;
        } else {
            toast.show((await res.json()).error || 'Erreur lors de la modification du rôle', 'error');
        }
    } catch (e) {
        toast.show('Erreur de connexion', 'error');
    } finally {
        isTogglingAdmin.value = false;
    }
};

const fetchAdminIdentity = async () => {
    try {
        const res = await sfetch('/api/admin/me');
        if (!res.ok) return;
        const data = await res.json();
        isSuperAdmin.value = data.isSuperAdmin === true;
        currentUserId.value = data.userId ?? null;
    } catch (e) {
        // Sans cette information on reste sur les valeurs par défaut : les
        // actions réservées à l'administrateur principal restent masquées.
        console.error('[AdminPanel] Identité admin indisponible', e);
    }
};

onMounted(() => {
    fetchAdminIdentity();
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

<template>
    <div class="space-y-6">
        <div class="bg-(--bg) p-6 rounded-2xl border border-(--text)/5 shadow-lg flex flex-col gap-4">
            <div class="flex items-center justify-between">
                <h3 class="font-black text-lg flex items-center gap-2"><i class="bi bi-hdd-network text-(--primary)"></i> Stockage Global Synco</h3>
                <span class="font-bold text-sm bg-(--text)/5 px-3 py-1 rounded-full">{{ formatBytes(totalUsedStorage) }} / {{ serverStorage.total > 0 ? formatBytes(serverStorage.total) : 'N/A' }}</span>
            </div>
            <div class="w-full bg-(--text)/5 rounded-full h-4 overflow-hidden relative">
                <div class="bg-(--primary) h-full transition-all duration-500" :style="{ width: serverStorage.total > 0 ? Math.min((Number(totalUsedStorage) / serverStorage.total) * 100, 100) + '%' : '0%' }"></div>
            </div>
        </div>

        <div class="flex flex-col md:flex-row gap-4 items-center justify-between bg-(--bg) p-4 rounded-2xl border border-(--text)/5 shadow-lg">
            <div class="relative w-full md:w-96">
                <i class="bi bi-search absolute left-4 top-1/2 -translate-y-1/2 text-(--text2)"></i>
                <input 
                    v-model="searchOrgQuery" 
                    type="text" 
                    placeholder="Rechercher une organisation..."
                    class="w-full bg-(--bg2) border border-(--text)/5 rounded-xl pl-11 pr-4 py-3 text-sm focus:outline-none focus:border-(--primary)/50 focus:ring-1 focus:ring-(--primary)/50 transition-all"
                >
            </div>
            <div class="text-sm font-bold text-(--text2) px-4 py-2 bg-(--bg2) rounded-xl border border-(--text)/5">
                {{ filteredOrgs.length }} organisation(s)
            </div>
        </div>

        <div class="bg-(--bg) border border-(--text)/5 rounded-2xl overflow-hidden shadow-xl">
            <div class="overflow-x-auto">
                <table class="w-full text-left border-collapse">
                    <thead>
                        <tr class="border-b border-(--text)/5 bg-(--bg2)/50">
                            <th class="p-4 text-xs font-black uppercase tracking-widest text-(--text2)">Organisation</th>
                            <th class="p-4 text-xs font-black uppercase tracking-widest text-(--text2)">Owner</th>
                            <th class="p-4 text-xs font-black uppercase tracking-widest text-(--text2) w-1/4">Utilisateurs</th>
                            <th class="p-4 text-xs font-black uppercase tracking-widest text-(--text2) w-1/4">Stockage</th>
                            <th class="p-4 text-xs font-black uppercase tracking-widest text-(--text2) text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-(--text)/5">
                        <tr v-if="loading">
                            <td colspan="5" class="p-12 text-center">
                                <div class="w-8 h-8 border-4 border-(--primary)/30 border-t-(--primary) rounded-full animate-spin mx-auto"></div>
                            </td>
                        </tr>
                        <tr v-else-if="error">
                            <td colspan="5" class="p-12 text-center text-red-500 font-bold">
                                {{ error }}
                            </td>
                        </tr>
                        <tr v-else v-for="org in filteredOrgs" :key="org.id"
                            class="hover:bg-(--text)/[0.02] transition-colors group"
                            :class="{ 'bg-red-500/[0.04]': org.isBanned }">
                            <td class="p-4">
                                <div class="flex items-center gap-3">
                                    <img v-if="org.logo && org.logo.includes('data:')" :src="org.logo" class="w-10 h-10 rounded-xl object-cover shrink-0" />
                                    <div v-else class="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-lg shrink-0"
                                        :class="org.isBanned ? 'bg-red-500/15 text-red-500' : 'bg-(--primary)/20 text-(--primary)'">
                                        <i class="bi" :class="org.logo || 'bi-building'"></i>
                                    </div>
                                    <div>
                                        <div class="flex items-center gap-2 flex-wrap">
                                            <p class="font-bold text-sm text-(--text)">{{ org.name }}</p>
                                            <span v-if="org.isBanned"
                                                class="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-red-500/15 text-red-500"
                                                :title="org.bannedReason || 'Aucun motif renseigné'">
                                                <i class="bi bi-slash-circle mr-1"></i>Bannie
                                            </span>
                                        </div>
                                        <p class="text-[10px] text-(--text2) font-mono mt-0.5">{{ org.id }}</p>
                                    </div>
                                </div>
                            </td>

                            <td class="p-4">
                                <div class="flex items-center gap-2 min-w-0">
                                    <div class="w-8 h-8 rounded-full bg-(--primary)/20 text-(--primary) flex items-center justify-center font-bold text-sm shrink-0">
                                        {{ (org.owner?.name || '?').charAt(0).toUpperCase() }}
                                    </div>
                                    <div class="min-w-0">
                                        <p class="text-sm font-medium text-(--text) truncate">{{ org.owner?.name || 'Sans nom' }}</p>
                                        <p class="text-[10px] text-(--text2) font-mono truncate">{{ org.owner?.email }}</p>
                                    </div>
                                </div>
                            </td>

                            <td class="p-4">
                                <div class="flex flex-col gap-1 w-full">
                                    <div class="flex justify-between text-xs font-bold">
                                        <span>{{ org.currentUsers.toLocaleString() }}</span>
                                        <span class="text-(--text2)">{{ org.maxUsers.toLocaleString() }}</span>
                                    </div>
                                    <div class="w-full bg-(--text)/5 rounded-full h-1.5 overflow-hidden">
                                        <div class="bg-(--primary) h-full transition-all" :style="{ width: Math.min((org.currentUsers / Math.max(org.maxUsers, 1)) * 100, 100) + '%' }"></div>
                                    </div>
                                </div>
                            </td>

                            <td class="p-4">
                                <div class="flex flex-col gap-1 w-full">
                                    <div class="flex justify-between text-xs font-bold">
                                        <span>{{ formatBytes(org.usedStorage) }}</span>
                                        <span class="text-(--text2)">{{ formatBytes(org.maxStorage) }}</span>
                                    </div>
                                    <div class="w-full bg-(--text)/5 rounded-full h-1.5 overflow-hidden">
                                        <div class="bg-(--primary) h-full transition-all" :style="{ width: Math.min((Number(org.usedStorage) / Math.max(Number(org.maxStorage), 1)) * 100, 100) + '%' }"></div>
                                    </div>
                                </div>
                            </td>

                            <td class="p-4 text-right whitespace-nowrap">
                                <button
                                    @click="openOrgEditModal(org)"
                                    class="p-2 text-(--text2) hover:text-(--primary) hover:bg-(--primary)/10 rounded-lg transition-colors"
                                    title="Modifier les quotas"
                                >
                                    <i class="bi bi-pencil-square text-lg"></i>
                                </button>
                                <button
                                    @click="org.isBanned ? unbanOrg(org) : openBanModal(org)"
                                    class="p-2 rounded-lg transition-colors"
                                    :class="org.isBanned
                                        ? 'text-amber-500 hover:bg-amber-500/10'
                                        : 'text-(--text2) hover:text-red-500 hover:bg-red-500/10'"
                                    :title="org.isBanned ? 'Lever le bannissement' : 'Bannir l\'organisation'"
                                    :disabled="banActionOrgId === org.id"
                                >
                                    <i class="text-lg"
                                        :class="banActionOrgId === org.id
                                            ? 'bi bi-arrow-repeat animate-spin'
                                            : org.isBanned ? 'bi bi-arrow-counterclockwise' : 'bi bi-slash-circle'"></i>
                                </button>
                            </td>
                        </tr>
                        <tr v-if="!loading && !error && filteredOrgs.length === 0">
                            <td colspan="5" class="p-8 text-center text-(--text2) text-sm">
                                Aucune organisation trouvée.
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>

        <!-- Edit Org Quotas Modal -->
        <div v-if="selectedOrg" class="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="closeOrgModal"></div>
            
            <div class="relative w-full max-w-md bg-(--bg) rounded-2xl shadow-2xl border border-(--text)/10 overflow-hidden animate-fade-in-up">
                
                <div class="p-6 border-b border-(--text)/5 bg-(--bg2)">
                    <h3 class="text-xl font-black text-(--text)">Modifier les quotas</h3>
                    <p class="text-sm text-(--text2) mt-1">Organisation <span class="font-bold text-(--text)">{{ selectedOrg.name }}</span></p>
                </div>

                <div class="p-6 space-y-5">
                    <div class="space-y-1.5">
                        <label class="text-xs font-bold uppercase tracking-widest text-(--text2) flex items-center gap-2">
                            <i class="bi bi-people"></i> Max Users
                        </label>
                        <input 
                            type="number" 
                            v-model="orgEditForm.maxUsers" 
                            min="1"
                            max="2147483647"
                            class="w-full bg-(--bg2) border border-(--text)/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-(--primary) focus:ring-1 focus:ring-(--primary) transition-all"
                        >
                        <p class="text-[10px] text-(--text2) mt-1">Limite de membres pour cette organisation.</p>
                    </div>

                    <div class="space-y-1.5">
                        <label class="text-xs font-bold uppercase tracking-widest text-(--text2) flex items-center gap-2">
                            <i class="bi bi-hdd"></i> Max Storage (Go)
                        </label>
                        <input 
                            type="number" 
                            v-model="orgEditForm.maxStorageGB" 
                            min="0"
                            max="8589934591"
                            step="0.1"
                            class="w-full bg-(--bg2) border border-(--text)/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-(--primary) focus:ring-1 focus:ring-(--primary) transition-all"
                        >
                        <p class="text-[10px] text-(--text2) mt-1">Stockage maximal en Gigaoctets alloué.</p>
                        <p class="text-[10px] text-(--text2) mt-0.5">
                            Espace serveur disponible : <span class="font-bold text-(--text)">{{ formatBytes(serverStorage.free) }}</span>.
                        </p>
                    </div>
                    <div class="space-y-1.5 pt-4 border-t border-(--text)/5">
                        <label class="text-xs font-bold uppercase tracking-widest text-(--text2) flex items-center gap-2 mb-3">
                            <i class="bi bi-box-seam"></i> Modules Autorisés
                        </label>
                        
                        <div class="flex items-center justify-between p-3 bg-(--text)/5 rounded-xl">
                            <div>
                                <p class="text-sm font-bold text-(--text)">Tâches</p>
                                <p class="text-[10px] text-(--text2)">Gestion des tâches et Kanban.</p>
                            </div>
                            <label class="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" v-model="orgEditForm.features.todo" class="sr-only peer">
                                <div class="w-11 h-6 bg-(--text)/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-(--primary)"></div>
                            </label>
                        </div>
                        
                        <div class="flex items-center justify-between p-3 bg-(--text)/5 rounded-xl mt-2">
                            <div>
                                <p class="text-sm font-bold text-(--text)">Fichiers</p>
                                <p class="text-[10px] text-(--text2)">Stockage et partage de fichiers.</p>
                            </div>
                            <label class="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" v-model="orgEditForm.features.files" class="sr-only peer">
                                <div class="w-11 h-6 bg-(--text)/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-(--primary)"></div>
                            </label>
                        </div>

                        <div class="flex items-center justify-between p-3 bg-(--text)/5 rounded-xl mt-2">
                            <div>
                                <p class="text-sm font-bold text-(--text)">Synco AI</p>
                                <p class="text-[10px] text-(--text2)">Assistant IA intégré.</p>
                            </div>
                            <label class="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" v-model="orgEditForm.features.ai" class="sr-only peer">
                                <div class="w-11 h-6 bg-(--text)/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-(--primary)"></div>
                            </label>
                        </div>
                        
                        <div class="flex items-center justify-between p-3 bg-(--text)/5 rounded-xl mt-2">
                            <div>
                                <p class="text-sm font-bold text-(--text)">Agenda</p>
                                <p class="text-[10px] text-(--text2)">Calendrier personnel et collaboratif avec RSVP et rappels.</p>
                            </div>
                            <label class="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" v-model="orgEditForm.features.agenda" class="sr-only peer">
                                <div class="w-11 h-6 bg-(--text)/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-(--primary)"></div>
                            </label>
                        </div>
                    </div>
                </div>

                <div class="p-6 bg-(--bg2) border-t border-(--text)/5 flex gap-3 justify-end">
                    <button 
                        @click="closeOrgModal" 
                        class="px-5 py-2.5 rounded-xl font-bold text-sm bg-(--text)/5 hover:bg-(--text)/10 text-(--text) transition-colors"
                    >
                        Annuler
                    </button>
                    <button 
                        @click="saveOrgQuotas" 
                        :disabled="isSavingOrg"
                        class="primary flex items-center gap-2"
                    >
                        <i v-if="isSavingOrg" class="bi bi-arrow-repeat animate-spin"></i>
                        <i v-else class="bi bi-check-lg"></i>
                        Sauvegarder
                    </button>
                </div>
            </div>
        </div>

        <!-- Bannissement : Popup maison (jamais de confirm() natif) avec saisie
             du motif, affiché tel quel dans l'organisation au prochain accès. -->
        <Popup :isOpen="!!orgToBan" @close="closeBanModal">
            <template #title>Bannir une organisation</template>

            <p class="text-sm text-(--text)">
                <span class="font-bold">{{ orgToBan?.name }}</span>
                devient inaccessible à tous ses membres, propriétaire compris :
                impossible de l'ouvrir, d'y envoyer ou d'y modifier quoi que ce soit.
            </p>
            <p class="text-xs text-(--text2) mt-2">
                Ses données sont conservées — le bannissement peut être levé à tout moment.
            </p>

            <label class="block text-xs font-bold uppercase tracking-widest text-(--text2) mt-5 mb-1.5">
                Motif (facultatif)
            </label>
            <textarea
                v-model="banReason"
                rows="3"
                :maxlength="MAX_BAN_REASON_LENGTH"
                placeholder="Ce motif sera affiché aux membres de l'organisation."
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

    </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import sfetch from '@/assets/utils/sfetch';
import { useToast } from '@/composables/useToast';
import Popup from '@/components/Popup.vue';

const toast = useToast();

// Doit rester aligné avec MAX_BAN_REASON_LENGTH côté synco_api
// (routes/admin.ts), qui tronque au-delà.
const MAX_BAN_REASON_LENGTH = 500;

interface AdminOrg {
    id: string;
    name: string;
    logo: string | null;
    owner: { id: string; name: string; email: string; avatarUrl: string | null };
    maxUsers: number;
    currentUsers: number;
    maxStorage: string | number;
    usedStorage: string | number;
    features: string[];
    isBanned: boolean;
    bannedAt: string | null;
    bannedReason: string | null;
}

const orgs = ref<AdminOrg[]>([]);
const serverStorage = ref({ total: 0, free: 0 });

const loading = ref(true);
const error = ref<string | null>(null);
const searchOrgQuery = ref('');

const selectedOrg = ref<AdminOrg | null>(null);
const isSavingOrg = ref(false);
const orgEditForm = ref({
    maxUsers: 0,
    maxStorageGB: 0,
    features: {
        todo: true,
        files: true,
        ai: true,
        agenda: true
    }
});

const orgToBan = ref<AdminOrg | null>(null);
const banReason = ref('');
const isBanning = ref(false);
const banActionOrgId = ref<string | null>(null);

const filteredOrgs = computed(() => {
    if (!searchOrgQuery.value) return orgs.value;
    const q = searchOrgQuery.value.toLowerCase();
    return orgs.value.filter(o => 
        (o.name && o.name.toLowerCase().includes(q)) || 
        o.id.toLowerCase().includes(q)
    );
});

const totalUsedStorage = computed(() => {
    return orgs.value.reduce((acc, curr) => acc + Number(curr.usedStorage), 0).toString();
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
        const [orgRes, storageRes] = await Promise.all([
            sfetch('/api/admin/organizations'),
            sfetch('/api/admin/system-storage')
        ]);
        
        if (orgRes.ok) {
            const rawOrgs: Partial<AdminOrg>[] = await orgRes.json();
            // Sécurité: certaines organisations créées avant l'ajout de ces
            // champs (owner, currentUsers, ...) peuvent ne pas les avoir.
            orgs.value = rawOrgs.map(o => ({
                id: o.id ?? '',
                name: o.name ?? 'Sans nom',
                logo: o.logo ?? null,
                owner: o.owner ?? { id: '', name: 'Utilisateur inconnu', email: '', avatarUrl: null },
                maxUsers: o.maxUsers ?? 0,
                currentUsers: o.currentUsers ?? 0,
                maxStorage: o.maxStorage ?? 0,
                usedStorage: o.usedStorage ?? 0,
                features: o.features ?? [],
                isBanned: o.isBanned ?? false,
                bannedAt: o.bannedAt ?? null,
                bannedReason: o.bannedReason ?? null
            }));
        }
        else error.value = (await orgRes.json()).error || 'Accès refusé.';

        if (storageRes.ok) {
            const data = await storageRes.json();
            serverStorage.value = {
                total: Number(data.totalDiskSpace || 0),
                free: Number(data.freeDiskSpace || 0)
            };
        }
    } catch (e) {
        error.value = "Impossible de se connecter au serveur.";
    } finally {
        loading.value = false;
    }
};

const openOrgEditModal = (org: AdminOrg) => {
    selectedOrg.value = org;
    orgEditForm.value = {
        maxUsers: org.maxUsers,
        maxStorageGB: Number(org.maxStorage) / (1024 * 1024 * 1024),
        features: {
            todo: org.features?.includes('todo') ?? true,
            files: org.features?.includes('files') ?? true,
            ai: org.features?.includes('ai') ?? true,
            agenda: org.features?.includes('agenda') ?? false,
        }
    };
};

const closeOrgModal = () => {
    selectedOrg.value = null;
};

const saveOrgQuotas = async () => {
    if (!selectedOrg.value) return;
    isSavingOrg.value = true;
    const safeMaxUsers = Number(orgEditForm.value.maxUsers) || 1;
    const safeStorageGB = Number(orgEditForm.value.maxStorageGB) || 0;
    const storageBytes = Math.floor(safeStorageGB * 1024 * 1024 * 1024);
    
    try {
        const featuresArray = [];
        if (orgEditForm.value.features.todo) featuresArray.push('todo');
        if (orgEditForm.value.features.files) featuresArray.push('files');
        if (orgEditForm.value.features.ai) featuresArray.push('ai');
        if (orgEditForm.value.features.agenda) featuresArray.push('agenda');

        const res = await sfetch(`/api/admin/organizations/${selectedOrg.value.id}`, {
            method: 'PATCH',
            body: JSON.stringify({
                maxUsers: safeMaxUsers,
                maxStorage: storageBytes.toString(),
                features: featuresArray
            })
        });
        if (res.ok) {
            const updatedOrg = await res.json();
            const index = orgs.value.findIndex(o => o.id === updatedOrg.id);
            if (index !== -1 && orgs.value[index]) {
                orgs.value[index]!.maxUsers = updatedOrg.maxUsers;
                orgs.value[index]!.maxStorage = updatedOrg.maxStorage;
                orgs.value[index]!.features = updatedOrg.features;
            }
            toast.show('Quotas et configuration mis à jour', 'success');
            closeOrgModal();
        } else toast.show((await res.json()).error || 'Erreur', 'error');
    } catch (e) {
        toast.show('Erreur de connexion', 'error');
    } finally {
        isSavingOrg.value = false;
    }
};

const openBanModal = (org: AdminOrg) => {
    orgToBan.value = org;
    banReason.value = '';
};

const closeBanModal = () => {
    orgToBan.value = null;
    banReason.value = '';
};

const patchOrg = (orgId: string, patch: Partial<AdminOrg>) => {
    const target = orgs.value.find(o => o.id === orgId);
    if (target) Object.assign(target, patch);
};

const confirmBan = async () => {
    if (!orgToBan.value) return;
    const target = orgToBan.value;
    isBanning.value = true;
    try {
        const res = await sfetch(`/api/admin/organizations/${target.id}/ban`, {
            method: 'POST',
            body: JSON.stringify({ reason: banReason.value.trim() })
        });
        if (res.ok) {
            const data = await res.json();
            patchOrg(target.id, {
                isBanned: true,
                bannedAt: data.bannedAt ?? new Date().toISOString(),
                bannedReason: data.bannedReason ?? null
            });
            toast.show('Organisation bannie', 'success');
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
// confirmation, l'action est directe (même choix que pour un utilisateur).
const unbanOrg = async (org: AdminOrg) => {
    banActionOrgId.value = org.id;
    try {
        const res = await sfetch(`/api/admin/organizations/${org.id}/ban`, { method: 'DELETE' });
        if (res.ok) {
            patchOrg(org.id, { isBanned: false, bannedAt: null, bannedReason: null });
            toast.show('Bannissement levé', 'success');
        } else {
            toast.show((await res.json()).error || 'Erreur lors du débannissement', 'error');
        }
    } catch (e) {
        toast.show('Erreur de connexion', 'error');
    } finally {
        banActionOrgId.value = null;
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

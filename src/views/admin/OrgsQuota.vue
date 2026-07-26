<template>
    <div class="space-y-6">
        <div class="bg-(--bg) p-6 rounded-2xl border border-white/5 shadow-lg flex flex-col gap-4">
            <div class="flex items-center justify-between">
                <h3 class="font-black text-lg flex items-center gap-2"><i class="bi bi-hdd-network text-(--primary)"></i> Stockage Global Synco</h3>
                <span class="font-bold text-sm bg-white/5 px-3 py-1 rounded-full">{{ formatBytes(totalUsedStorage) }} / 4 TB</span>
            </div>
            <div class="w-full bg-white/5 rounded-full h-4 overflow-hidden relative">
                <div class="bg-(--primary) h-full transition-all duration-500" :style="{ width: Math.min((Number(totalUsedStorage) / (4 * 1024 * 1024 * 1024 * 1024)) * 100, 100) + '%' }"></div>
            </div>
        </div>

        <div class="flex flex-col md:flex-row gap-4 items-center justify-between bg-(--bg) p-4 rounded-2xl border border-white/5 shadow-lg">
            <div class="relative w-full md:w-96">
                <i class="bi bi-search absolute left-4 top-1/2 -translate-y-1/2 text-(--text)/40"></i>
                <input 
                    v-model="searchOrgQuery" 
                    type="text" 
                    placeholder="Rechercher une organisation..."
                    class="w-full bg-(--bg2) border border-white/5 rounded-xl pl-11 pr-4 py-3 text-sm focus:outline-none focus:border-(--primary)/50 focus:ring-1 focus:ring-(--primary)/50 transition-all"
                >
            </div>
            <div class="text-sm font-bold text-(--text)/60 px-4 py-2 bg-(--bg2) rounded-xl border border-white/5">
                {{ filteredOrgs.length }} organisation(s)
            </div>
        </div>

        <div class="bg-(--bg) border border-white/5 rounded-2xl overflow-hidden shadow-xl">
            <div class="overflow-x-auto">
                <table class="w-full text-left border-collapse">
                    <thead>
                        <tr class="border-b border-white/5 bg-(--bg2)/50">
                            <th class="p-4 text-xs font-black uppercase tracking-widest text-(--text)/50">Organisation</th>
                            <th class="p-4 text-xs font-black uppercase tracking-widest text-(--text)/50 w-1/4">Utilisateurs</th>
                            <th class="p-4 text-xs font-black uppercase tracking-widest text-(--text)/50 w-1/4">Stockage</th>
                            <th class="p-4 text-xs font-black uppercase tracking-widest text-(--text)/50 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-white/5">
                        <tr v-if="loading">
                            <td colspan="4" class="p-12 text-center">
                                <div class="w-8 h-8 border-4 border-(--primary)/30 border-t-(--primary) rounded-full animate-spin mx-auto"></div>
                            </td>
                        </tr>
                        <tr v-else-if="error">
                            <td colspan="4" class="p-12 text-center text-red-500 font-bold">
                                {{ error }}
                            </td>
                        </tr>
                        <tr v-else v-for="org in filteredOrgs" :key="org.id" class="hover:bg-white/[0.02] transition-colors group">
                            <td class="p-4">
                                <div class="flex items-center gap-3">
                                    <img v-if="org.logo && org.logo.includes('data:')" :src="org.logo" class="w-10 h-10 rounded-xl object-cover shrink-0" />
                                    <div v-else class="w-10 h-10 rounded-xl bg-(--primary)/20 text-(--primary) flex items-center justify-center font-bold text-lg shrink-0">
                                        <i class="bi" :class="org.logo || 'bi-building'"></i>
                                    </div>
                                    <div>
                                        <p class="font-bold text-sm text-(--text)">{{ org.name }}</p>
                                        <p class="text-[10px] text-(--text)/40 font-mono mt-0.5">{{ org.id }}</p>
                                    </div>
                                </div>
                            </td>
                            
                            <td class="p-4">
                                <div class="flex flex-col gap-1 w-full">
                                    <div class="flex justify-between text-xs font-bold">
                                        <span>{{ org.currentUsers.toLocaleString() }}</span>
                                        <span class="text-(--text)/50">{{ org.maxUsers.toLocaleString() }}</span>
                                    </div>
                                    <div class="w-full bg-white/5 rounded-full h-1.5 overflow-hidden">
                                        <div class="bg-(--primary) h-full transition-all" :style="{ width: Math.min((org.currentUsers / Math.max(org.maxUsers, 1)) * 100, 100) + '%' }"></div>
                                    </div>
                                </div>
                            </td>

                            <td class="p-4">
                                <div class="flex flex-col gap-1 w-full">
                                    <div class="flex justify-between text-xs font-bold">
                                        <span>{{ formatBytes(org.usedStorage) }}</span>
                                        <span class="text-(--text)/50">{{ formatBytes(org.maxStorage) }}</span>
                                    </div>
                                    <div class="w-full bg-white/5 rounded-full h-1.5 overflow-hidden">
                                        <div class="bg-(--primary) h-full transition-all" :style="{ width: Math.min((Number(org.usedStorage) / Math.max(Number(org.maxStorage), 1)) * 100, 100) + '%' }"></div>
                                    </div>
                                </div>
                            </td>

                            <td class="p-4 text-right">
                                <button 
                                    @click="openOrgEditModal(org)"
                                    class="p-2 text-(--text)/40 hover:text-(--primary) hover:bg-(--primary)/10 rounded-lg transition-colors"
                                    title="Modifier les quotas"
                                >
                                    <i class="bi bi-pencil-square text-lg"></i>
                                </button>
                            </td>
                        </tr>
                        <tr v-if="!loading && !error && filteredOrgs.length === 0">
                            <td colspan="4" class="p-8 text-center text-(--text)/40 text-sm">
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
            
            <div class="relative w-full max-w-md bg-(--bg) rounded-2xl shadow-2xl border border-white/10 overflow-hidden animate-fade-in-up">
                
                <div class="p-6 border-b border-white/5 bg-(--bg2)">
                    <h3 class="text-xl font-black text-(--text)">Modifier les quotas</h3>
                    <p class="text-sm text-(--text)/60 mt-1">Organisation <span class="font-bold text-(--text)">{{ selectedOrg.name }}</span></p>
                </div>

                <div class="p-6 space-y-5">
                    <div class="space-y-1.5">
                        <label class="text-xs font-bold uppercase tracking-widest text-(--text)/50 flex items-center gap-2">
                            <i class="bi bi-people"></i> Max Users
                        </label>
                        <input 
                            type="number" 
                            v-model="orgEditForm.maxUsers" 
                            min="1"
                            max="2147483647"
                            class="w-full bg-(--bg2) border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-(--primary) focus:ring-1 focus:ring-(--primary) transition-all"
                        >
                        <p class="text-[10px] text-(--text)/40 mt-1">Limite de membres pour cette organisation.</p>
                    </div>

                    <div class="space-y-1.5">
                        <label class="text-xs font-bold uppercase tracking-widest text-(--text)/50 flex items-center gap-2">
                            <i class="bi bi-hdd"></i> Max Storage (Go)
                        </label>
                        <input 
                            type="number" 
                            v-model="orgEditForm.maxStorageGB" 
                            min="0"
                            max="8589934591"
                            step="0.1"
                            class="w-full bg-(--bg2) border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-(--primary) focus:ring-1 focus:ring-(--primary) transition-all"
                        >
                        <p class="text-[10px] text-(--text)/40 mt-1">Stockage maximal en Gigaoctets alloué.</p>
                    </div>
                </div>

                <div class="p-6 bg-(--bg2) border-t border-white/5 flex gap-3 justify-end">
                    <button 
                        @click="closeOrgModal" 
                        class="px-5 py-2.5 rounded-xl font-bold text-sm bg-white/5 hover:bg-white/10 text-(--text) transition-colors"
                    >
                        Annuler
                    </button>
                    <button 
                        @click="saveOrgQuotas" 
                        :disabled="isSavingOrg"
                        class="px-5 py-2.5 rounded-xl font-bold text-sm bg-(--primary) text-white hover:brightness-110 flex items-center gap-2 transition-all disabled:opacity-50"
                    >
                        <i v-if="isSavingOrg" class="bi bi-arrow-repeat animate-spin"></i>
                        <i v-else class="bi bi-check-lg"></i>
                        Sauvegarder
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import sfetch from '@/assets/utils/sfetch';
import { useToast } from '@/composables/useToast';

const toast = useToast();

interface AdminOrg {
    id: string;
    name: string;
    logo: string | null;
    maxUsers: number;
    currentUsers: number;
    maxStorage: string | number;
    usedStorage: string | number;
}

const orgs = ref<AdminOrg[]>([]);

const loading = ref(true);
const error = ref<string | null>(null);
const searchOrgQuery = ref('');

const selectedOrg = ref<AdminOrg | null>(null);
const isSavingOrg = ref(false);
const orgEditForm = ref({
    maxUsers: 0,
    maxStorageGB: 0
});

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
        const res = await sfetch('/api/admin/organizations');
        if (res.ok) orgs.value = await res.json();
        else error.value = (await res.json()).error || 'Accès refusé.';
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
        maxStorageGB: Number(org.maxStorage) / (1024 * 1024 * 1024)
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
        const res = await sfetch(`/api/admin/organizations/${selectedOrg.value.id}`, {
            method: 'PATCH',
            body: JSON.stringify({
                maxUsers: safeMaxUsers,
                maxStorage: storageBytes.toString()
            })
        });
        if (res.ok) {
            const updatedOrg = await res.json();
            const index = orgs.value.findIndex(o => o.id === updatedOrg.id);
            if (index !== -1 && orgs.value[index]) {
                orgs.value[index]!.maxUsers = updatedOrg.maxUsers;
                orgs.value[index]!.maxStorage = updatedOrg.maxStorage;
            }
            toast.show('Quotas d\'organisation mis à jour', 'success');
            closeOrgModal();
        } else toast.show((await res.json()).error || 'Erreur', 'error');
    } catch (e) {
        toast.show('Erreur de connexion', 'error');
    } finally {
        isSavingOrg.value = false;
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

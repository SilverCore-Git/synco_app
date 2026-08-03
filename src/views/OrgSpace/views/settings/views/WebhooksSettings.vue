<template>
    <div class="flex flex-col h-full w-full overflow-hidden bg-(--bg3) text-(--text)">
        <main class="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-10">
            <div class="max-w-5xl mx-auto space-y-12">
                
                <div class="mb-8 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div>
                        <h3 class="text-2xl font-black text-(--text) mb-2">Webhooks</h3>
                        <p class="text-sm text-(--text2)">Configurez des webhooks pour recevoir des notifications automatiques depuis des services externes.</p>
                    </div>
                    <button 
                        @click="showCreateModal = true"
                        class="primary gap-2 flex items-center shadow-sm shrink-0 whitespace-nowrap"
                    >
                        <i class="bi bi-plus-lg" />
                        Nouveau Webhook
                    </button>
                </div>

                <div class="space-y-6">
                    <!-- Filtres et recherche -->
                    <div class="flex flex-col sm:flex-row gap-4 items-center justify-between">
                        <div class="relative w-full sm:w-80 group">
                            <i class="bi bi-search absolute left-4 top-1/2 -translate-y-1/2 text-(--text2) group-focus-within:text-(--primary) transition-colors" />
                            <input 
                                v-model="searchQuery"
                                type="text" 
                                placeholder="Rechercher un webhook..."
                                class="w-full bg-(--bg) border border-(--border-color) rounded-xl pl-11 pr-4 py-2.5 text-sm text-(--text) focus:outline-none focus:border-(--primary) focus:ring-1 focus:ring-(--primary) transition-all shadow-inner placeholder:text-(--text2)"
                            />
                        </div>
                        
                        <div class="flex gap-2 w-full sm:w-auto p-1 bg-(--bg2) border border-(--border-color) rounded-xl shadow-inner overflow-x-auto custom-scrollbar">
                            <button 
                                @click="filterStatus = 'all'"
                                :class="['px-4 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap', 
                                         filterStatus === 'all' ? 'bg-(--primary) text-white shadow-sm' : 'text-(--text2) hover:text-(--text) hover:bg-(--bg3)']"
                            >
                                Tous ({{ totalWebhooks }})
                            </button>
                            <button 
                                @click="filterStatus = 'active'"
                                :class="['px-4 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap', 
                                         filterStatus === 'active' ? 'bg-(--primary) text-white shadow-sm' : 'text-(--text2) hover:text-(--text) hover:bg-(--bg3)']"
                            >
                                Actifs ({{ activeWebhooks.length }})
                            </button>
                            <button 
                                @click="filterStatus = 'inactive'"
                                :class="['px-4 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap', 
                                         filterStatus === 'inactive' ? 'bg-(--primary) text-white shadow-sm' : 'text-(--text2) hover:text-(--text) hover:bg-(--bg3)']"
                            >
                                Inactifs ({{ inactiveWebhooks.length }})
                            </button>
                        </div>
                    </div>

                    <!-- Liste des webhooks -->
                    <WebhookList
                        :webhooks="filteredWebhooks"
                        :loading="loading"
                        :error="error"
                        @edit="openEditModal"
                        @delete="openDeleteModal"
                        @test="openTestModal"
                        @details="openDetailsModal"
                        @toggle="toggleWebhook"
                    />
                </div>

                <!-- Modals -->
                <WebhookCreate
                    v-if="showCreateModal"
                    :space-id="currentSpaceId"
                    @close="showCreateModal = false"
                    @created="onWebhookCreated"
                />

                <WebhookEdit
                    v-if="editingWebhook && showEditModal"
                    :webhook="editingWebhook"
                    @close="showEditModal = false"
                    @updated="onWebhookUpdated"
                />

                <WebhookDetails
                    v-if="detailsWebhook && showDetailsModal"
                    :webhook="detailsWebhook"
                    @close="showDetailsModal = false"
                    @edit="openEditModalFromDetails"
                    @delete="openDeleteModalFromDetails"
                    @test="openTestModalFromDetails"
                />

                <WebhookTest
                    v-if="testingWebhook && showTestModal"
                    :webhook="testingWebhook"
                    @close="showTestModal = false"
                />

                <!-- Confirmation de suppression -->
                <Popup :is-open="showDeleteConfirm" @close="showDeleteConfirm = false">
                    <template #title>Supprimer le Webhook</template>
                    
                    <div class="space-y-4">
                        <p class="text-(--text)">
                            Vous êtes sur le point de supprimer le webhook <strong class="text-(--primary)">{{ deletingWebhook?.name }}</strong>.
                        </p>
                        <div class="p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
                            <p class="text-red-500 text-sm font-bold flex items-center gap-2">
                                <i class="bi bi-exclamation-triangle-fill"></i>
                                Action irréversible
                            </p>
                            <p class="text-red-500/80 text-xs mt-1">
                                Tous les messages et logs associés seront également supprimés.
                            </p>
                        </div>
                    </div>

                    <template #footer>
                        <button @click="showDeleteConfirm = false" class="default px-6 py-2.5 rounded-xl text-sm font-medium">Annuler</button>
                        <button @click="confirmDelete" class="danger px-6 py-2.5 rounded-xl text-sm font-medium flex items-center gap-2">
                            <i class="bi bi-trash-fill"></i>
                            Supprimer
                        </button>
                    </template>
                </Popup>

            </div>
        </main>
    </div>
</template>

<script lang="ts" setup>

import { ref, computed, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import Popup from '@/components/Popup.vue';
import WebhookList from './components/WebhookList.vue';
import WebhookCreate from './components/WebhookCreate.vue';
import WebhookEdit from './components/WebhookEdit.vue';
import WebhookDetails from './components/WebhookDetails.vue';
import WebhookTest from './components/WebhookTest.vue';
import { useWebhooks } from '@/composables/useWebhooks';
import type { Webhook } from '@/types/webhooks';

const route = useRoute();

const { 
    webhooks, 
    loading, 
    error, 
    activeWebhooks, 
    inactiveWebhooks, 
    totalWebhooks,
    listWebhooks,
    deleteWebhook,
    toggleWebhookActive
} = useWebhooks();

// State local
const currentSpaceId = computed(() => route.params.spaceId as string);
const searchQuery = ref<string>('');
const filterStatus = ref<'all' | 'active' | 'inactive'>('all');

// Modals
const showCreateModal = ref<boolean>(false);
const showEditModal = ref<boolean>(false);
const showDetailsModal = ref<boolean>(false);
const showTestModal = ref<boolean>(false);
const showDeleteConfirm = ref<boolean>(false);

// Webhooks sélectionnés
const editingWebhook = ref<Webhook | null>(null);
const detailsWebhook = ref<Webhook | null>(null);
const testingWebhook = ref<Webhook | null>(null);
const deletingWebhook = ref<Webhook | null>(null);

// Webhooks filtrés
const filteredWebhooks = computed(() => {
    let result = webhooks.value;
    
    // Filtre par statut
    if (filterStatus.value === 'active') {
        result = result.filter(wh => wh.isActive);
    } else if (filterStatus.value === 'inactive') {
        result = result.filter(wh => !wh.isActive);
    }
    
    // Filtre par recherche
    if (searchQuery.value) {
        const query = searchQuery.value.toLowerCase();
        result = result.filter(wh => 
            wh.name.toLowerCase().includes(query) ||
            wh.description?.toLowerCase().includes(query) ||
            wh.id.includes(query)
        );
    }
    
    // Tri par date de création (plus récent en premier)
    return result.sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
});

// Charger les webhooks au montage
onMounted(async () => {
    if (currentSpaceId.value) {
        await listWebhooks(currentSpaceId.value);
    }
});

// Recharger si le spaceId change
watch(() => currentSpaceId.value, async (newSpaceId) => {
    if (newSpaceId) {
        await listWebhooks(newSpaceId);
    }
});

// Handlers pour les modals
const openEditModal = (webhook: Webhook) => {
    editingWebhook.value = webhook;
    showEditModal.value = true;
};

const openDeleteModal = (webhook: Webhook) => {
    deletingWebhook.value = webhook;
    showDeleteConfirm.value = true;
};

const openTestModal = (webhook: Webhook) => {
    testingWebhook.value = webhook;
    showTestModal.value = true;
};

const openDetailsModal = (webhook: Webhook) => {
    detailsWebhook.value = webhook;
    showDetailsModal.value = true;
};

const openEditModalFromDetails = (webhook: Webhook) => {
    showDetailsModal.value = false;
    editingWebhook.value = webhook;
    showEditModal.value = true;
};

const openDeleteModalFromDetails = (webhook: Webhook) => {
    showDetailsModal.value = false;
    deletingWebhook.value = webhook;
    showDeleteConfirm.value = true;
};

const openTestModalFromDetails = (webhook: Webhook) => {
    showDetailsModal.value = false;
    testingWebhook.value = webhook;
    showTestModal.value = true;
};

// Suppression confirmée
const confirmDelete = async () => {
    if (deletingWebhook.value?.id) {
        const success = await deleteWebhook(deletingWebhook.value.id);
        if (success) {
            showDeleteConfirm.value = false;
            deletingWebhook.value = null;
        }
    }
};

// Toggle statut
const toggleWebhook = async (webhook: Webhook, isActive: boolean) => {
    await toggleWebhookActive(webhook.id, isActive);
};

// Callbacks
const onWebhookCreated = () => {
    showCreateModal.value = false;
    if (currentSpaceId.value) {
        listWebhooks(currentSpaceId.value);
    }
};

const onWebhookUpdated = () => {
    showEditModal.value = false;
    editingWebhook.value = null;
    if (currentSpaceId.value) {
        listWebhooks(currentSpaceId.value);
    }
};

</script>

<style scoped>

</style>

<template>

    <div class="space-y-6 p-6 lg:p-10 max-w-5xl mx-auto">
        
        <div class="mb-6">
            <h3 class="text-xl font-black text-(--text) mb-1">Webhooks</h3>
            <p class="text-sm text-(--text)/60">Configurez des webhooks pour recevoir des notifications automatiques depuis des services externes.</p>
        </div>

        <div class="mb-8">
            <button 
                @click="showCreateModal = true"
                class="primary gap-2 flex items-center"
            >
                <i class="bi bi-plus-lg" />
                Nouveau Webhook
            </button>
        </div>

        <!-- Filtres et recherche -->
        <div class="flex flex-wrap gap-4 items-center">
            <div class="relative flex-1 min-w-48">
                <i class="bi bi-search absolute left-3 top-1/2 -translate-y-1/2 text-(--text)/30 text-[10px]" />
                <input 
                    v-model="searchQuery"
                    type="text" 
                    placeholder="Rechercher un webhook..."
                    class="bg-(--white)/5 border border-(--white)/10 rounded-xl pl-9 pr-4 py-2 text-xs focus:outline-none focus:border-(--primary)/40 w-full transition-all"
                />
            </div>
            
            <div class="flex gap-2">
                <button 
                    @click="filterStatus = 'all'"
                    :class="['px-3 py-2 rounded-lg text-sm transition-all', 
                             filterStatus === 'all' ? 'bg-(--primary)/20 text-(--primary)' : 'bg-(--white)/5 text-(--text)/60 hover:bg-(--white)/10']"
                >
                    Tous ({{ totalWebhooks }})
                </button>
                <button 
                    @click="filterStatus = 'active'"
                    :class="['px-3 py-2 rounded-lg text-sm transition-all', 
                             filterStatus === 'active' ? 'bg-(--primary)/20 text-(--primary)' : 'bg-(--white)/5 text-(--text)/60 hover:bg-(--white)/10']"
                >
                    Actifs ({{ activeWebhooks.length }})
                </button>
                <button 
                    @click="filterStatus = 'inactive'"
                    :class="['px-3 py-2 rounded-lg text-sm transition-all', 
                             filterStatus === 'inactive' ? 'bg-(--primary)/20 text-(--primary)' : 'bg-(--white)/5 text-(--text)/60 hover:bg-(--white)/10']"
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
                <p class="text-(--text)/80">
                    Vous êtes sur le point de supprimer le webhook <strong>{{ deletingWebhook?.name }}</strong>.
                </p>
                <p class="text-(--text)/60 text-sm">
                    Cette action est irréversible. Tous les messages et logs associés seront également supprimés.
                </p>
            </div>

            <template #footer>
                <button @click="showDeleteConfirm = false" class="default">Annuler</button>
                <button @click="confirmDelete" class="danger">Supprimer</button>
            </template>
        </Popup>

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

<template>

    <!-- Même disposition maître/détail que « Rôles & Permissions » : la liste
         reste visible pendant qu'on configure, et la configuration se fait à
         plat dans la page au lieu d'empiler des pop-ups les unes sur les
         autres. Seule la création — trois champs — reste une pop-up. -->
    <div class="flex h-full w-full bg-(--bg) overflow-hidden relative">

        <!-- ── Colonne gauche : liste ───────────────────────────────────── -->
        <aside
            class="w-full md:w-[340px] md:max-w-[340px] bg-(--bg2)/50 border-r border-(--border-color) flex flex-col h-full shrink-0"
            :class="selectedWebhook ? 'hidden md:flex' : 'flex'"
        >

            <div class="p-5 border-b border-(--border-color) flex items-center justify-between gap-3 shrink-0">
                <div class="min-w-0">
                    <h1 class="text-xl font-bold text-(--text)">Webhooks</h1>
                    <p class="text-xs text-(--text2) mt-1 leading-snug">
                        Laissez un service externe poster dans vos salons.
                    </p>
                </div>
                <button
                    class="primary !p-0 !w-9 !h-9 flex items-center justify-center shadow-sm shrink-0"
                    title="Nouveau webhook"
                    @click="showCreateModal = true"
                >
                    <i class="bi bi-plus-lg text-lg" />
                </button>
            </div>

            <div v-if="webhooks.length > 4" class="px-3 pt-3 shrink-0">
                <div class="relative">
                    <i class="bi bi-search absolute left-3 top-1/2 -translate-y-1/2 text-xs text-(--text2)" />
                    <input
                        v-model="searchQuery"
                        type="search"
                        placeholder="Rechercher..."
                        class="w-full bg-(--bg) border border-(--border-color) rounded-lg pl-8 pr-3 py-2 text-sm text-(--text) outline-none focus:border-(--primary) transition-colors placeholder-(--text2)/60"
                    />
                </div>
            </div>

            <div class="flex-1 overflow-y-auto">
                <WebhookList
                    :webhooks="filteredWebhooks"
                    :channels="channels"
                    :selected-id="selectedWebhookId"
                    :loading="loading"
                    :error="error"
                    :has-query="searchQuery.trim().length > 0"
                    @select="selectWebhook"
                />
            </div>

        </aside>

        <!-- ── Colonne droite : configuration ───────────────────────────── -->
        <div class="flex-1 min-w-0 h-full" :class="selectedWebhook ? 'block' : 'hidden md:block'">

            <WebhookPanel
                v-if="selectedWebhook"
                :key="selectedWebhook.id"
                :webhook="selectedWebhook"
                :channels="channels"
                :loading-channels="loadingChannels"
                :just-created="justCreatedId === selectedWebhook.id"
                @updated="onWebhookUpdated"
                @delete="askDelete"
                @toggle-active="toggleWebhook"
                @back="selectedWebhookId = null"
            />

            <!-- État vide -->
            <div v-else class="h-full flex flex-col items-center justify-center p-10 text-center relative">
                <div class="absolute inset-0 flex items-center justify-center opacity-[0.02] pointer-events-none">
                    <i class="bi bi-link-45deg" style="font-size: 20rem;" />
                </div>
                <div class="w-16 h-16 bg-(--bg2) border border-(--border-color) rounded-2xl flex items-center justify-center text-3xl mb-4 relative z-10">
                    <i class="bi bi-link-45deg text-(--primary)" />
                </div>
                <h3 class="text-xl font-bold text-(--text) relative z-10">
                    {{ webhooks.length === 0 ? 'Aucun webhook pour l\'instant' : 'Sélectionnez un webhook' }}
                </h3>
                <p class="text-sm text-(--text2) mt-2 max-w-sm relative z-10 leading-relaxed">
                    Un webhook donne à un service externe — CI, monitoring,
                    automatisation — une identité et une adresse privée pour poster
                    dans un salon de ce workspace.
                </p>
                <button
                    v-if="webhooks.length === 0"
                    class="primary mt-6 flex items-center gap-2 relative z-10"
                    @click="showCreateModal = true"
                >
                    <i class="bi bi-plus-lg" />
                    Créer un webhook
                </button>
            </div>

        </div>

        <!-- ── Création ─────────────────────────────────────────────────── -->
        <WebhookCreate
            v-if="showCreateModal"
            :space-id="currentSpaceId"
            @close="showCreateModal = false"
            @created="onWebhookCreated"
        />

        <!-- ── Suppression ──────────────────────────────────────────────── -->
        <ConfirmDelete
            v-if="deletingWebhook"
            :show="showDeleteConfirm"
            item-type="le webhook"
            :item-name="deletingWebhook.name"
            :loading="deleting"
            extra-warning="L'adresse d'envoi cessera de fonctionner immédiatement et l'historique des appels sera supprimé."
            @cancel="cancelDelete"
            @confirm="confirmDelete"
        />

    </div>

</template>

<script lang="ts" setup>

import { ref, computed, onMounted, watch } from 'vue';
import ConfirmDelete from '@/components/common/ConfirmDelete.vue';
import WebhookList from './WebhookList.vue';
import WebhookCreate from './WebhookCreate.vue';
import WebhookPanel from './WebhookPanel.vue';
import { useWebhooks } from '@/composables/useWebhooks';
import type { Webhook, WebhookTargetChannel } from '@/types/webhooks';

// Le même écran sert la page de réglages du workspace et l'onglet
// « Webhooks » de la fenêtre Paramètres du space : l'espace est donc passé
// en propriété plutôt que lu dans la route.
const props = defineProps<{
    spaceId: string;
}>();

const {
    webhooks,
    loading,
    error,
    listWebhooks,
    getWebhook,
    deleteWebhook,
    toggleWebhookActive,
    getSpaceChannels
} = useWebhooks();

const currentSpaceId = computed<string>(() => props.spaceId);

const searchQuery = ref<string>('');
const selectedWebhookId = ref<string | null>(null);
// L'URL complète n'est renvoyée qu'à la création : on retient lequel vient
// d'être créé pour la dévoiler au lieu de la masquer comme les autres.
const justCreatedId = ref<string | null>(null);

const showCreateModal = ref<boolean>(false);
const showDeleteConfirm = ref<boolean>(false);
const deletingWebhook = ref<Webhook | null>(null);
const deleting = ref<boolean>(false);

const channels = ref<WebhookTargetChannel[]>([]);
const loadingChannels = ref<boolean>(false);

const selectedWebhook = computed<Webhook | null>(() =>
    webhooks.value.find(wh => wh.id === selectedWebhookId.value) || null
);

const filteredWebhooks = computed<Webhook[]>(() => {

    const query = searchQuery.value.trim().toLowerCase();

    const result = query
        ? webhooks.value.filter(wh =>
            wh.name.toLowerCase().includes(query)
            || wh.description?.toLowerCase().includes(query))
        : [...webhooks.value];

    return result.sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

});

// ── Chargement ────────────────────────────────────────────────────────

const loadSpace = async (spaceId: string) => {

    selectedWebhookId.value = null;
    justCreatedId.value = null;

    loadingChannels.value = true;
    const result = await getSpaceChannels(spaceId);
    channels.value = result || [];
    loadingChannels.value = false;

    await listWebhooks(spaceId);

};

onMounted(() => {
    if (currentSpaceId.value) loadSpace(currentSpaceId.value);
});

watch(currentSpaceId, (spaceId) => {
    if (spaceId) loadSpace(spaceId);
});

// ── Sélection ─────────────────────────────────────────────────────────

const selectWebhook = async (webhook: Webhook) => {

    selectedWebhookId.value = webhook.id;

    // Le listing masque le jeton et n'expose pas la clé publique E2EE : on
    // recharge la version détaillée pour que le panneau affiche l'adresse
    // complète quand l'utilisateur courant est le créateur.
    if (webhook.id === justCreatedId.value) return;

    // Dès qu'on regarde ailleurs, le webhook fraîchement créé perd son
    // statut : sa version complète n'est plus garantie en mémoire.
    justCreatedId.value = null;

    const result = await getWebhook(webhook.id);
    if (!result?.success || !result.webhook) return;

    const index = webhooks.value.findIndex(wh => wh.id === webhook.id);
    if (index !== -1) webhooks.value[index] = result.webhook;

};

// ── Callbacks ─────────────────────────────────────────────────────────

const onWebhookCreated = async (webhook: Webhook) => {

    showCreateModal.value = false;
    justCreatedId.value = webhook.id;
    selectedWebhookId.value = webhook.id;

    // `createWebhook` a déjà poussé le webhook dans le state : on rafraîchit
    // la liste en arrière-plan sans repasser par selectWebhook(), qui
    // écraserait l'URL complète par sa version masquée.
    if (currentSpaceId.value) await listWebhooks(currentSpaceId.value);

    const created = webhooks.value.find(wh => wh.id === webhook.id);
    if (created) Object.assign(created, webhook);

};

const onWebhookUpdated = (webhook: Webhook) => {
    const index = webhooks.value.findIndex(wh => wh.id === webhook.id);
    if (index !== -1) webhooks.value[index] = webhook;
};

const toggleWebhook = async (webhook: Webhook, isActive: boolean) => {
    await toggleWebhookActive(webhook.id, isActive);
};

// ── Suppression ───────────────────────────────────────────────────────

const askDelete = (webhook: Webhook) => {
    deletingWebhook.value = webhook;
    showDeleteConfirm.value = true;
};

const cancelDelete = () => {
    showDeleteConfirm.value = false;
    deletingWebhook.value = null;
};

const confirmDelete = async () => {

    if (!deletingWebhook.value) return;

    deleting.value = true;
    const deletedId = deletingWebhook.value.id;
    const success = await deleteWebhook(deletedId);
    deleting.value = false;

    if (!success) return;

    if (selectedWebhookId.value === deletedId) selectedWebhookId.value = null;
    if (justCreatedId.value === deletedId) justCreatedId.value = null;
    cancelDelete();

};

</script>

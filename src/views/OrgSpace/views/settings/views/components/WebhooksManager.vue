<template>

    <!-- Même disposition maître/détail que « Rôles & Permissions » : la liste
         reste visible pendant qu'on configure, et la configuration se fait à
         plat dans la page au lieu d'empiler des pop-ups les unes sur les
         autres. Seule la création — trois champs — reste une pop-up. -->
    <div ref="rootRef" class="flex h-full w-full bg-(--bg) overflow-hidden relative">

        <!-- ── Colonne gauche : liste ───────────────────────────────────── -->
        <!-- Deux colonnes ou une seule : la bascule dépend de la largeur
             RÉELLEMENT disponible, pas de celle de la fenêtre. Cet écran est
             aussi monté dans la fenêtre Paramètres du space, derrière une
             barre latérale de 256 px : un point de rupture en `md:` y
             afficherait deux colonnes dans 660 px. -->
        <aside
            v-show="isSplitView || !selectedWebhook"
            class="bg-(--bg2)/50 border-r border-(--border-color) flex flex-col h-full shrink-0"
            :class="isSplitView ? 'w-[320px]' : 'w-full'"
        >

            <div class="p-4 border-b border-(--border-color) flex items-center justify-between gap-3 shrink-0">
                <div class="min-w-0">
                    <h1 class="text-xl font-bold text-(--text)">Webhooks</h1>
                    <p class="text-xs text-(--text2) mt-1 leading-snug">
                        {{ isMultiSpace
                            ? 'Tous les espaces de l\'organisation.'
                            : 'Laissez un outil extérieur poster dans vos salons.' }}
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
                    :channels-by-space="channelsBySpace"
                    :space-names="spaceNames"
                    :show-space="isMultiSpace"
                    :selected-id="selectedWebhookId"
                    :loading="loading"
                    :error="error"
                    :has-query="searchQuery.trim().length > 0"
                    @select="selectWebhook"
                />
            </div>

        </aside>

        <!-- ── Colonne droite : configuration ───────────────────────────── -->
        <div v-show="isSplitView || selectedWebhook" class="flex-1 min-w-0 h-full overflow-hidden">

            <!-- La fiche entre par la droite et ressort par la droite : le
                 geste dit d'où vient ce qu'on ouvre et où ça repart, ce qui
                 compte surtout en colonne unique, où elle recouvre la liste.
                 `out-in` plutôt qu'un croisement : les deux fiches occupent la
                 même place dans le flux, les superposer imposerait de les en
                 sortir et de figer la hauteur. -->
            <Transition name="webhook-panel" mode="out-in">

            <WebhookPanel
                v-if="selectedWebhook"
                :key="selectedWebhook.id"
                :webhook="selectedWebhook"
                :channels="channelsOf(selectedWebhook.spaceId)"
                :loading-channels="loadingChannels"
                :space-name="isMultiSpace ? spaceName(selectedWebhook.spaceId) : ''"
                :just-created="justCreatedId === selectedWebhook.id"
                :split-view="isSplitView"
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
                    Un webhook est une adresse que vous donnez à un outil extérieur.
                    Ce qu'il envoie dessus s'affiche dans le salon choisi, sous le nom
                    et la photo du webhook.
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

            </Transition>

        </div>

        <!-- ── Création ─────────────────────────────────────────────────── -->
        <WebhookCreate
            v-if="showCreateModal"
            :spaces="scopeSpaces"
            :channels-by-space="channelsBySpace"
            :loading-channels="loadingChannels"
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

import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import ConfirmDelete from '@/components/common/ConfirmDelete.vue';
import WebhookList from './WebhookList.vue';
import WebhookCreate from './WebhookCreate.vue';
import WebhookPanel from './WebhookPanel.vue';
import { useWebhooks } from '@/composables/useWebhooks';
import { openedOrg } from '@/assets/var';
import type { Webhook, WebhookScopeSpace, WebhookTargetChannel } from '@/types/webhooks';

// Le même écran sert deux points d'entrée, qui ne diffèrent que par leur
// périmètre : l'onglet Webhooks de la fenêtre Paramètres d'un space
// (`spaceId`, un seul espace) et les réglages de l'organisation (`orgId`,
// tous ses espaces).
const props = defineProps<{
    spaceId?: string;
    orgId?: string;
}>();

const {
    webhooks,
    loading,
    error,
    listWebhooks,
    listOrgWebhooks,
    getWebhook,
    deleteWebhook,
    toggleWebhookActive,
    getSpaceChannels
} = useWebhooks();

// Espaces couverts par cet écran. En périmètre organisation, `openedOrg` ne
// contient que ceux auxquels l'utilisateur a accès — le backend refiltre de
// toute façon sur ORG_WEBHOOKS espace par espace.
const scopeSpaces = computed<WebhookScopeSpace[]>(() => {

    const spaces = openedOrg.value?.spaces || [];

    if (props.spaceId) {
        const space = spaces.find(s => s.id === props.spaceId);
        return [{ id: props.spaceId, name: space?.name || 'Cet espace' }];
    }

    return spaces.map(space => ({ id: space.id, name: space.name }));

});

// Un seul espace : inutile d'afficher partout à quel espace appartient un
// webhook, ni de demander lequel choisir à la création.
const isMultiSpace = computed<boolean>(() => scopeSpaces.value.length > 1);

const spaceNames = computed<Record<string, string>>(() =>
    Object.fromEntries(scopeSpaces.value.map(space => [space.id, space.name]))
);

const spaceName = (spaceId?: string): string =>
    (spaceId && spaceNames.value[spaceId]) || '';

const searchQuery = ref<string>('');
const selectedWebhookId = ref<string | null>(null);
// L'URL complète n'est renvoyée qu'à la création : on retient lequel vient
// d'être créé pour la dévoiler au lieu de la masquer comme les autres.
const justCreatedId = ref<string | null>(null);

const showCreateModal = ref<boolean>(false);
const showDeleteConfirm = ref<boolean>(false);
const deletingWebhook = ref<Webhook | null>(null);
const deleting = ref<boolean>(false);

// Salons par espace : en périmètre organisation, deux webhooks voisins dans
// la liste ne visent pas les mêmes salons.
const channelsBySpace = ref<Record<string, WebhookTargetChannel[]>>({});
const loadingChannels = ref<boolean>(false);

const channelsOf = (spaceId?: string): WebhookTargetChannel[] =>
    (spaceId && channelsBySpace.value[spaceId]) || [];

// ── Largeur disponible ────────────────────────────────────────────────

// Mesurée sur le conteneur et non sur la fenêtre : cet écran sert à la fois
// la page de réglages du workspace (pleine largeur) et l'onglet Webhooks de
// la fenêtre Paramètres du space, où une barre latérale mange 256 px.
// En dessous de ce seuil, liste et fiche se relaient au lieu de cohabiter.
const SPLIT_VIEW_MIN_WIDTH = 700;

const rootRef = ref<HTMLElement | null>(null);
const containerWidth = ref<number>(0);

const isSplitView = computed<boolean>(() => containerWidth.value >= SPLIT_VIEW_MIN_WIDTH);

let resizeObserver: ResizeObserver | null = null;

onMounted(() => {
    if (!rootRef.value) return;
    containerWidth.value = rootRef.value.clientWidth;
    resizeObserver = new ResizeObserver(([entry]) => {
        if (entry) containerWidth.value = entry.contentRect.width;
    });
    resizeObserver.observe(rootRef.value);
});

onUnmounted(() => {
    resizeObserver?.disconnect();
    resizeObserver = null;
});

const selectedWebhook = computed<Webhook | null>(() =>
    webhooks.value.find(wh => wh.id === selectedWebhookId.value) || null
);

const filteredWebhooks = computed<Webhook[]>(() => {

    const query = searchQuery.value.trim().toLowerCase();

    const result = query
        ? webhooks.value.filter(wh =>
            wh.name.toLowerCase().includes(query)
            || wh.description?.toLowerCase().includes(query)
            || spaceName(wh.spaceId).toLowerCase().includes(query))
        : [...webhooks.value];

    return result.sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

});

// ── Chargement ────────────────────────────────────────────────────────

const refreshWebhookList = async (): Promise<void> => {
    if (props.spaceId) await listWebhooks(props.spaceId);
    else if (props.orgId) await listOrgWebhooks(props.orgId);
};

// Les salons viennent du store local, pas du réseau : les charger pour tous
// les espaces du périmètre ne coûte rien, et la fiche d'un webhook a besoin
// de ceux de SON espace, pas de ceux de l'espace courant.
const loadChannels = async () => {

    loadingChannels.value = true;

    const entries = await Promise.all(
        scopeSpaces.value.map(async space =>
            [space.id, (await getSpaceChannels(space.id)) || []] as const
        )
    );

    channelsBySpace.value = Object.fromEntries(entries);
    loadingChannels.value = false;

};

// `openedOrg` est alimenté par le WebSocket : au premier rendu la liste des
// espaces peut être vide, et arriver ensuite. Sans ce suivi, les salons
// resteraient introuvables pour toute la durée de la session.
watch(() => scopeSpaces.value.map(space => space.id).join(','), loadChannels);

const loadScope = async () => {

    selectedWebhookId.value = null;
    justCreatedId.value = null;

    await loadChannels();
    await refreshWebhookList();

    // Ouvrir le premier de la liste plutôt que l'écran d'accueil : quand il y
    // a des webhooks, le clic supplémentaire n'apprend rien. En colonne unique
    // en revanche, la fiche recouvre la liste — l'utilisateur atterrirait dans
    // un webhook sans avoir vu ce qu'il y a d'autre ni le bouton de création.
    await nextTick();

    const first = filteredWebhooks.value[0];
    if (first && !selectedWebhookId.value && isSplitView.value) {
        await selectWebhook(first);
    }

};

onMounted(loadScope);

watch(() => [props.spaceId, props.orgId], loadScope);

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
    await refreshWebhookList();

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

<style scoped>

/* Même courbe que la feuille mobile de Popup.vue : décélération franche à
   l'arrivée, sortie plus courte et plus sèche. */
.webhook-panel-enter-active {
    transition: transform 0.24s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.24s ease;
}

.webhook-panel-leave-active {
    transition: transform 0.16s cubic-bezier(0.32, 0, 0.67, 0), opacity 0.16s ease;
}

.webhook-panel-enter-from,
.webhook-panel-leave-to {
    transform: translateX(100%);
    opacity: 0;
}

.webhook-panel-enter-to,
.webhook-panel-leave-from {
    transform: translateX(0);
    opacity: 1;
}

/* Le glissement est décoratif : on garde le fondu, qui suffit à signaler le
   changement, et on retire le déplacement. */
@media (prefers-reduced-motion: reduce) {
    .webhook-panel-enter-active,
    .webhook-panel-leave-active {
        transition: opacity 0.12s ease;
    }

    .webhook-panel-enter-from,
    .webhook-panel-leave-to {
        transform: none;
    }
}

</style>

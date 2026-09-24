<template>

    <div class="flex flex-col h-full bg-(--bg) relative overflow-hidden">

        <!-- ── En-tête : identité du webhook + actions ─────────────────── -->
        <header class="px-5 sm:px-8 py-5 border-b border-(--border-color) shrink-0 flex items-center gap-4 bg-(--bg)/95 backdrop-blur-sm z-10">

            <button
                class="md:hidden text-(--text2) hover:text-(--text) transition-colors shrink-0"
                title="Retour à la liste"
                @click="emit('back')"
            >
                <i class="bi bi-chevron-left text-xl" />
            </button>

            <WebhookAvatar
                :avatar-url="form.avatarUrl"
                :name="form.name"
                :size="44"
                :status="webhook.isActive ? 'active' : 'paused'"
            />

            <div class="min-w-0 flex-1">
                <h2 class="text-lg sm:text-xl font-black text-(--text) truncate">
                    {{ form.name || 'Webhook sans nom' }}
                </h2>
                <p class="text-xs text-(--text2) truncate">
                    {{ webhook.isActive ? 'Actif' : 'En pause' }}
                    <template v-if="currentChannelName"> · poste dans #{{ currentChannelName }}</template>
                </p>
            </div>

            <div class="flex items-center gap-2 shrink-0">

                <button
                    class="h-9 px-3 rounded-lg text-sm font-semibold border border-(--border-color) text-(--text2) hover:text-(--text) hover:bg-(--text)/5 transition-colors flex items-center gap-2"
                    :title="webhook.isActive ? 'Mettre en pause' : 'Réactiver'"
                    @click="emit('toggle-active', webhook, !webhook.isActive)"
                >
                    <i class="bi" :class="webhook.isActive ? 'bi-pause-fill' : 'bi-play-fill'" />
                    <span class="hidden sm:inline">{{ webhook.isActive ? 'Pause' : 'Activer' }}</span>
                </button>

                <button
                    class="w-9 h-9 flex items-center justify-center rounded-lg text-red-400 bg-red-400/10 hover:bg-red-400/20 transition-colors"
                    title="Supprimer ce webhook"
                    @click="emit('delete', webhook)"
                >
                    <i class="bi bi-trash" />
                </button>

            </div>

        </header>

        <!-- ── Contenu ──────────────────────────────────────────────────── -->
        <div class="flex-1 overflow-y-auto px-5 sm:px-8 py-6">

            <div class="max-w-2xl mx-auto flex flex-col gap-8 pb-28">

                <!-- Identité -->
                <section class="flex flex-col gap-4">

                    <h3 class="text-xs font-black uppercase tracking-widest text-(--primary) border-b border-(--border-color) pb-2">
                        Identité
                    </h3>

                    <div class="rounded-2xl border border-(--border-color) bg-(--bg2) p-5 flex flex-col gap-5">

                        <WebhookAvatarInput v-model="form.avatarUrl" :name="form.name" />

                        <div class="flex flex-col gap-2">
                            <label class="text-xs font-bold uppercase tracking-wider text-(--text2)">Nom affiché</label>
                            <input
                                v-model="form.name"
                                type="text"
                                :maxlength="100"
                                placeholder="Ex: Déploiements"
                                class="w-full bg-(--bg) border border-(--border-color) rounded-xl px-4 py-2.5 text-sm font-semibold text-(--text) outline-none focus:border-(--primary) transition-colors"
                            />
                        </div>

                        <div class="flex flex-col gap-2">
                            <label class="text-xs font-bold uppercase tracking-wider text-(--text2)">
                                Note interne <span class="font-medium normal-case tracking-normal text-(--text2)/70">— optionnelle</span>
                            </label>
                            <textarea
                                v-model="form.description"
                                rows="2"
                                :maxlength="500"
                                placeholder="À quoi sert ce webhook ? Visible par l'équipe uniquement."
                                class="w-full bg-(--bg) border border-(--border-color) rounded-xl px-4 py-2.5 text-sm text-(--text) outline-none focus:border-(--primary) transition-colors resize-none placeholder-(--text2)/60"
                            />
                        </div>

                        <!-- Aperçu : la seule façon honnête de montrer ce que
                             « photo de profil » veut dire, c'est de montrer le
                             message tel qu'il apparaîtra dans le fil. -->
                        <div class="rounded-xl border border-(--border-color) bg-(--bg) p-4">
                            <p class="text-[10px] font-bold uppercase tracking-widest text-(--text2) mb-3">Aperçu dans le salon</p>
                            <div class="flex items-start gap-3">
                                <WebhookAvatar :avatar-url="form.avatarUrl" :name="form.name" :size="36" />
                                <div class="min-w-0">
                                    <div class="flex items-center gap-2 flex-wrap">
                                        <span class="text-sm font-bold text-(--text)">{{ form.name || 'Webhook' }}</span>
                                        <span class="text-[9px] font-black uppercase tracking-wider bg-(--primary)/15 text-(--primary) px-1.5 py-0.5 rounded">Bot</span>
                                    </div>
                                    <p class="text-sm text-(--text2) mt-0.5">Déploiement terminé en 42 s ✅</p>
                                </div>
                            </div>
                        </div>

                    </div>

                </section>

                <!-- Destination -->
                <section class="flex flex-col gap-4">

                    <h3 class="text-xs font-black uppercase tracking-widest text-(--primary) border-b border-(--border-color) pb-2">
                        Destination
                    </h3>

                    <div class="rounded-2xl border border-(--border-color) bg-(--bg2) p-5 flex flex-col gap-3">
                        <p class="text-xs text-(--text2) leading-relaxed">
                            Salon dans lequel les messages arrivent quand le service
                            externe n'en précise aucun.
                        </p>
                        <WebhookChannelPicker
                            v-model="form.targetChannelId"
                            :channels="channels"
                            :loading="loadingChannels"
                        />
                    </div>

                </section>

                <!-- Adresse d'envoi -->
                <section class="flex flex-col gap-4">

                    <h3 class="text-xs font-black uppercase tracking-widest text-(--primary) border-b border-(--border-color) pb-2">
                        Adresse d'envoi
                    </h3>

                    <div class="rounded-2xl border border-(--border-color) bg-(--bg2) p-5 flex flex-col gap-4">

                        <div
                            v-if="justCreated"
                            class="flex items-start gap-3 p-3 rounded-xl bg-green-500/10 border border-green-500/20"
                        >
                            <i class="bi bi-check-circle-fill text-green-500 shrink-0 mt-0.5" />
                            <p class="text-xs text-green-500 leading-snug">
                                Webhook créé. Copiez l'adresse maintenant : elle ne sera plus
                                affichée en clair une fois cette page quittée.
                            </p>
                        </div>

                        <p class="text-xs text-(--text2) leading-relaxed">
                            Collez cette adresse dans le service externe. Elle contient
                            un jeton : quiconque la possède peut poster sous cette identité.
                        </p>

                        <div class="flex items-stretch gap-2">
                            <code class="flex-1 min-w-0 bg-(--bg) border border-(--border-color) rounded-xl px-4 py-2.5 text-xs text-(--text2) font-mono overflow-x-auto whitespace-nowrap flex items-center">
                                {{ displayedUrl }}
                            </code>
                            <button
                                v-if="webhook.url"
                                class="w-10 shrink-0 rounded-xl border border-(--border-color) text-(--text2) hover:text-(--text) hover:bg-(--text)/5 transition-colors"
                                :title="urlRevealed ? 'Masquer' : 'Afficher'"
                                @click="urlRevealed = !urlRevealed"
                            >
                                <i class="bi" :class="urlRevealed ? 'bi-eye-slash' : 'bi-eye'" />
                            </button>
                            <button
                                class="w-10 shrink-0 rounded-xl border border-(--border-color) text-(--text2) hover:text-(--primary) hover:bg-(--primary)/5 transition-colors"
                                title="Copier l'adresse"
                                @click="copyUrl"
                            >
                                <i class="bi bi-clipboard" />
                            </button>
                        </div>

                        <p v-if="!webhook.url" class="text-xs text-amber-500 flex items-start gap-2">
                            <i class="bi bi-info-circle shrink-0 mt-0.5" />
                            <span>L'adresse complète n'est révélée qu'à son créateur. Régénérez-la pour en obtenir une nouvelle.</span>
                        </p>

                        <button
                            class="self-start text-xs font-semibold text-(--text2) hover:text-amber-500 transition-colors flex items-center gap-2"
                            @click="showRegenerateConfirm = true"
                        >
                            <i class="bi bi-arrow-repeat" />
                            Régénérer l'adresse
                        </button>

                    </div>

                </section>

                <!-- Test -->
                <section class="flex flex-col gap-4">

                    <h3 class="text-xs font-black uppercase tracking-widest text-(--primary) border-b border-(--border-color) pb-2">
                        Test
                    </h3>

                    <div class="rounded-2xl border border-(--border-color) bg-(--bg2) p-5 flex flex-col gap-3">
                        <p class="text-xs text-(--text2) leading-relaxed">
                            Poste un vrai message dans le salon de destination, sous
                            l'identité du webhook.
                        </p>
                        <div class="flex flex-col sm:flex-row gap-2">
                            <input
                                v-model="testMessage"
                                type="text"
                                :maxlength="500"
                                placeholder="Message de test"
                                class="flex-1 bg-(--bg) border border-(--border-color) rounded-xl px-4 py-2.5 text-sm text-(--text) outline-none focus:border-(--primary) transition-colors placeholder-(--text2)/60"
                                @keydown.enter.prevent="sendTest"
                            />
                            <button
                                class="primary flex items-center justify-center gap-2 !py-2.5 shrink-0"
                                :disabled="testing || !testMessage.trim()"
                                :class="testing || !testMessage.trim() ? 'opacity-40 cursor-not-allowed' : ''"
                                @click="sendTest"
                            >
                                <span v-if="testing" class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                <i v-else class="bi bi-send-fill" />
                                Envoyer
                            </button>
                        </div>
                    </div>

                </section>

                <!-- Activité -->
                <section class="flex flex-col gap-4">

                    <h3 class="text-xs font-black uppercase tracking-widest text-(--primary) border-b border-(--border-color) pb-2">
                        Activité
                    </h3>

                    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div class="rounded-xl border border-(--border-color) bg-(--bg2) p-4">
                            <div class="text-2xl font-black text-(--text)">{{ webhook.usageCount }}</div>
                            <div class="text-[11px] text-(--text2) mt-0.5">Messages reçus</div>
                        </div>
                        <div class="rounded-xl border border-(--border-color) bg-(--bg2) p-4">
                            <div class="text-2xl font-black" :class="webhook.errorCount > 0 ? 'text-red-500' : 'text-(--text)'">
                                {{ webhook.errorCount }}
                            </div>
                            <div class="text-[11px] text-(--text2) mt-0.5">Erreurs</div>
                        </div>
                        <div class="rounded-xl border border-(--border-color) bg-(--bg2) p-4">
                            <div class="text-sm font-bold text-(--text) mt-1.5">{{ formatRelative(webhook.lastUsedAt) }}</div>
                            <div class="text-[11px] text-(--text2) mt-0.5">Dernier appel</div>
                        </div>
                        <div class="rounded-xl border border-(--border-color) bg-(--bg2) p-4">
                            <div class="text-sm font-bold text-(--text) mt-1.5">{{ formatDate(webhook.createdAt) }}</div>
                            <div class="text-[11px] text-(--text2) mt-0.5">Créé le</div>
                        </div>
                    </div>

                </section>

                <!-- Réglages avancés, repliés par défaut -->
                <section class="flex flex-col gap-4">

                    <button
                        class="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-(--text2) hover:text-(--text) transition-colors border-b border-(--border-color) pb-2"
                        @click="showAdvanced = !showAdvanced"
                    >
                        <i class="bi transition-transform" :class="showAdvanced ? 'bi-chevron-down' : 'bi-chevron-right'" />
                        Réglages avancés
                    </button>

                    <div v-if="showAdvanced" class="flex flex-col gap-5">

                        <div class="flex flex-col gap-2">
                            <p class="text-xs font-bold uppercase tracking-wider text-(--text2)">Ce que ce webhook a le droit de faire</p>
                            <div class="flex flex-col gap-2">
                                <WebhookToggle
                                    v-for="permission in allPermissions"
                                    :key="permission"
                                    :model-value="form.permissions.includes(permission)"
                                    :label="WEBHOOK_PERMISSION_META[permission].label"
                                    :description="WEBHOOK_PERMISSION_META[permission].description"
                                    :icon="WEBHOOK_PERMISSION_META[permission].icon"
                                    @update:model-value="togglePermission(permission)"
                                />
                            </div>
                        </div>

                        <div class="flex flex-col gap-2">
                            <p class="text-xs font-bold uppercase tracking-wider text-(--text2)">Sécurité</p>

                            <WebhookToggle
                                v-model="form.requireSignature"
                                label="Exiger une signature HMAC"
                                description="Le service externe doit signer ses requêtes avec le secret. Fortement recommandé."
                                icon="bi-shield-lock"
                            />

                            <WebhookToggle
                                v-model="form.e2eeEnabled"
                                label="Chiffrement de bout en bout"
                                description="Le service externe chiffre ses messages avec la clé publique du webhook. À n'activer que si l'intégration sait le faire."
                                icon="bi-lock-fill"
                            />
                        </div>

                        <div v-if="webhook.e2eeEnabled && webhook.publicKey" class="flex flex-col gap-2">
                            <p class="text-xs font-bold uppercase tracking-wider text-(--text2)">Clé publique E2EE</p>
                            <div class="relative">
                                <textarea
                                    :value="webhook.publicKey"
                                    readonly
                                    rows="4"
                                    class="w-full bg-(--bg) border border-(--border-color) rounded-xl p-3 pr-11 text-[11px] font-mono text-(--text2) resize-none outline-none"
                                />
                                <button
                                    class="absolute top-2 right-2 w-8 h-8 rounded-lg text-(--text2) hover:text-(--primary) hover:bg-(--primary)/5 transition-colors"
                                    title="Copier la clé publique"
                                    @click="copyPublicKey"
                                >
                                    <i class="bi bi-clipboard" />
                                </button>
                            </div>
                        </div>

                        <div class="flex flex-col gap-2">
                            <p class="text-xs font-bold uppercase tracking-wider text-(--text2)">Secret HMAC</p>
                            <div class="flex items-stretch gap-2">
                                <code class="flex-1 min-w-0 bg-(--bg) border border-(--border-color) rounded-xl px-4 py-2.5 text-xs font-mono text-(--text2) overflow-x-auto whitespace-nowrap flex items-center">
                                    {{ webhook.secret || '••••••••••••••••' }}
                                </code>
                                <button
                                    class="w-10 shrink-0 rounded-xl border border-(--border-color) text-(--text2) hover:text-(--primary) hover:bg-(--primary)/5 transition-colors"
                                    title="Copier le secret"
                                    @click="copySecret"
                                >
                                    <i class="bi bi-clipboard" />
                                </button>
                            </div>
                            <p class="text-xs text-(--text2)">
                                Le secret n'est affiché en clair qu'à la création du webhook.
                            </p>
                        </div>

                    </div>

                </section>

            </div>

        </div>

        <!-- ── Barre de sauvegarde ──────────────────────────────────────── -->
        <div
            class="absolute bottom-0 left-0 right-0 border-t border-(--border-color) bg-(--bg)/95 backdrop-blur-md px-5 sm:px-8 py-3 flex items-center justify-between gap-4 transition-transform duration-300 z-20 shadow-2xl"
            :class="isDirty ? 'translate-y-0' : 'translate-y-full opacity-0 pointer-events-none'"
        >
            <span class="text-sm font-semibold text-yellow-500 flex items-center gap-2 min-w-0">
                <i class="bi bi-exclamation-triangle-fill shrink-0" />
                <span class="truncate">Modifications non enregistrées</span>
            </span>
            <div class="flex items-center gap-3 shrink-0">
                <button
                    class="px-4 py-2 text-sm font-semibold text-(--text2) hover:text-(--text) transition-colors"
                    :disabled="saving"
                    @click="resetForm"
                >
                    Annuler
                </button>
                <button
                    class="primary flex items-center gap-2 !py-2"
                    :disabled="saving || !isFormValid"
                    :class="saving || !isFormValid ? 'opacity-40 cursor-not-allowed' : ''"
                    @click="save"
                >
                    <span v-if="saving" class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Enregistrer
                </button>
            </div>
        </div>

        <ConfirmDelete
            :show="showRegenerateConfirm"
            item-type="l'adresse"
            :item-name="webhook.name"
            title="Régénérer l'adresse d'envoi ?"
            message="L'adresse actuelle cessera immédiatement de fonctionner. Tout service externe qui l'utilise devra être mis à jour avec la nouvelle."
            button-text="Régénérer"
            :loading="regenerating"
            @cancel="showRegenerateConfirm = false"
            @confirm="regenerate"
        />

    </div>

</template>

<script lang="ts" setup>

import { ref, computed, watch } from 'vue';
import WebhookAvatar from './WebhookAvatar.vue';
import WebhookAvatarInput from './WebhookAvatarInput.vue';
import WebhookChannelPicker from './WebhookChannelPicker.vue';
import WebhookToggle from './WebhookToggle.vue';
import ConfirmDelete from '@/components/common/ConfirmDelete.vue';
import { useWebhooks } from '@/composables/useWebhooks';
import { useToast } from '@/composables/useToast';
import {
    ALL_WEBHOOK_PERMISSIONS,
    WEBHOOK_PERMISSION_META,
    type Webhook,
    type WebhookPermission,
    type WebhookTargetChannel,
    type UpdateWebhookDTO
} from '@/types/webhooks';

const props = defineProps<{
    webhook: Webhook;
    channels: WebhookTargetChannel[];
    loadingChannels?: boolean;
    // Vrai juste après une création : l'adresse complète n'est renvoyée qu'à
    // ce moment-là par le backend, donc on la dévoile d'emblée au lieu
    // d'obliger l'utilisateur à deviner qu'il doit cliquer sur l'œil.
    justCreated?: boolean;
}>();

const emit = defineEmits<{
    (e: 'updated', webhook: Webhook): void;
    (e: 'delete', webhook: Webhook): void;
    (e: 'toggle-active', webhook: Webhook, isActive: boolean): void;
    (e: 'back'): void;
}>();

const {
    updateWebhook,
    regenerateWebhookToken,
    testWebhook,
    copyWebhookUrl,
    copyWebhookSecret,
    copyWebhookPublicKey
} = useWebhooks();

const toast = useToast();

const allPermissions = ALL_WEBHOOK_PERMISSIONS;

// ── Formulaire ────────────────────────────────────────────────────────

interface WebhookForm {
    name: string;
    description: string;
    avatarUrl: string | null;
    targetChannelId: string;
    permissions: WebhookPermission[];
    requireSignature: boolean;
    e2eeEnabled: boolean;
}

const buildForm = (webhook: Webhook): WebhookForm => ({
    name: webhook.name || '',
    description: webhook.description || '',
    avatarUrl: webhook.avatarUrl || null,
    targetChannelId: webhook.targetChannelId || webhook.defaultThreadId || '',
    permissions: [...(webhook.permissions || [])],
    requireSignature: webhook.requireSignature ?? true,
    e2eeEnabled: webhook.e2eeEnabled
});

const form = ref<WebhookForm>(buildForm(props.webhook));

const resetForm = () => { form.value = buildForm(props.webhook); };

// On ne repart du serveur que quand le webhook affiché change réellement :
// un simple rafraîchissement de la liste ne doit pas écraser une saisie en
// cours. Les autres champs sont resynchronisés par `save()`.
watch(() => props.webhook.id, resetForm);

const isDirty = computed<boolean>(() => {
    const initial = buildForm(props.webhook);
    return form.value.name !== initial.name
        || form.value.description !== initial.description
        || form.value.avatarUrl !== initial.avatarUrl
        || form.value.targetChannelId !== initial.targetChannelId
        || form.value.requireSignature !== initial.requireSignature
        || form.value.e2eeEnabled !== initial.e2eeEnabled
        || form.value.permissions.length !== initial.permissions.length
        || form.value.permissions.some(p => !initial.permissions.includes(p));
});

const isFormValid = computed<boolean>(() =>
    form.value.name.trim().length > 0
    && form.value.targetChannelId.length > 0
    && form.value.permissions.length > 0
);

const togglePermission = (permission: WebhookPermission) => {
    const permissions = form.value.permissions;
    const index = permissions.indexOf(permission);
    if (index === -1) permissions.push(permission);
    else permissions.splice(index, 1);
};

const currentChannelName = computed<string>(() =>
    props.channels.find(c => c.id === form.value.targetChannelId)?.name || ''
);

// ── Sauvegarde ────────────────────────────────────────────────────────

const saving = ref<boolean>(false);

const save = async () => {

    if (!isFormValid.value || saving.value) return;

    saving.value = true;

    const dto: UpdateWebhookDTO = {
        name: form.value.name.trim(),
        description: form.value.description.trim(),
        targetChannelId: form.value.targetChannelId,
        permissions: form.value.permissions,
        requireSignature: form.value.requireSignature,
        e2eeEnabled: form.value.e2eeEnabled
    };

    // La photo ne repart que si elle a changé : une data URL pèse une
    // trentaine de kilo-octets, inutile de la renvoyer à chaque renommage.
    // `null` la retire explicitement, `undefined` la laisse en place.
    if (form.value.avatarUrl !== (props.webhook.avatarUrl || null)) {
        dto.avatarUrl = form.value.avatarUrl;
    }

    try {
        const result = await updateWebhook(props.webhook.id, dto);
        if (result?.success && result.webhook) emit('updated', result.webhook);
    } finally {
        saving.value = false;
    }

};

// ── Adresse d'envoi ───────────────────────────────────────────────────

const urlRevealed = ref<boolean>(props.justCreated === true);
const showRegenerateConfirm = ref<boolean>(false);
const regenerating = ref<boolean>(false);

watch(() => props.webhook.id, () => { urlRevealed.value = props.justCreated === true; });

const displayedUrl = computed<string>(() => {
    if (!props.webhook.url) return props.webhook.urlPreview || 'Adresse masquée';
    if (urlRevealed.value) return props.webhook.url;
    // Même forme que l'aperçu masqué du backend : on garde l'identifiant
    // lisible (utile pour retrouver le webhook dans des journaux) et on ne
    // cache que le jeton.
    return props.webhook.url.replace(/\/[^/]+$/, `/${'•'.repeat(24)}`);
});

const copyUrl = () => copyWebhookUrl(props.webhook);
const copySecret = () => copyWebhookSecret(props.webhook);
const copyPublicKey = () => copyWebhookPublicKey(props.webhook);

const regenerate = async () => {

    regenerating.value = true;

    try {
        const result = await regenerateWebhookToken(props.webhook.id);
        if (result?.success && result.webhook) {
            urlRevealed.value = true;
            emit('updated', result.webhook);
        }
    } finally {
        regenerating.value = false;
        showRegenerateConfirm.value = false;
    }

};

// ── Test ──────────────────────────────────────────────────────────────

const testMessage = ref<string>('Message de test depuis Synco ✅');
const testing = ref<boolean>(false);

const sendTest = async () => {

    const content = testMessage.value.trim();
    if (!content || testing.value) return;

    if (isDirty.value) {
        toast.show('Enregistrez vos modifications avant de tester', 'warning');
        return;
    }

    testing.value = true;

    try {
        await testWebhook(props.webhook.id, {
            content,
            username: props.webhook.name,
            // `?? undefined` et pas `avatarUrl` brut : le backend renvoie
            // `null` pour un webhook sans photo, et le champ est déclaré
            // optionnel — pas nullable — dans le schéma du payload.
            avatar_url: props.webhook.avatarUrl ?? undefined
        });
    } finally {
        testing.value = false;
    }

};

// ── Réglages avancés ──────────────────────────────────────────────────

const showAdvanced = ref<boolean>(false);

// ── Formatage ─────────────────────────────────────────────────────────

const formatDate = (date: string | Date | undefined): string => {
    if (!date) return '—';
    return new Date(date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
};

const formatRelative = (date: string | Date | undefined): string => {

    if (!date) return 'Jamais';

    const diff = Date.now() - new Date(date).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `Il y a ${days} j`;
    if (hours > 0) return `Il y a ${hours} h`;
    if (minutes > 0) return `Il y a ${minutes} min`;
    return "À l'instant";

};

</script>

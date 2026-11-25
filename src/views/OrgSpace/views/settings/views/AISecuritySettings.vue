<template>
    <div class="space-y-6 pb-28">

        <div>
            <h3 class="text-2xl font-black text-(--text) mb-2">Sécurité de Synco AI</h3>
            <p class="text-sm text-(--text2) max-w-2xl">Des réglages pratiques mais moins sûrs. Choisissez qui peut les utiliser ; chaque personne les active ensuite elle-même, après un avertissement.</p>
        </div>

        <div v-if="loadError" class="p-5 rounded-2xl bg-(--bg2) border border-(--border-color) flex items-center gap-4">
            <i class="bi bi-wifi-off text-xl text-(--text2)"></i>
            <p class="flex-1 text-sm text-(--text)">Les politiques n'ont pas pu être chargées.</p>
            <button class="default px-4 py-2 rounded-xl text-sm font-medium" @click="load">Réessayer</button>
        </div>
        <div v-else-if="loading" class="space-y-4" aria-busy="true">
            <div v-for="n in 3" :key="n" class="h-48 rounded-3xl bg-(--bg2) animate-pulse"></div>
        </div>

        <template v-else>
            <FeaturePolicyCard
                v-for="p in policies" :key="p.feature" :ref="el => setCardRef(p.feature, el)"
                :summary="p" :api="deps.api" :org-id="orgId" :note="p.feature === 'web_access' ? webNote : undefined" @state="onState" />

            <p class="text-xs text-(--text2) flex items-center gap-2">
                <i class="bi bi-journal-text"></i>
                Chaque changement est inscrit au journal, gardé un an.
                <button type="button" class="text-(--primary) font-semibold hover:underline" @click="openJournal">Voir le journal</button>
            </p>
        </template>

        <Transition name="fade-bottom">
            <div v-if="dirtyFeatures.length" class="fixed bottom-0 inset-x-0 z-30 bg-(--bg2) border-t border-(--border-color) px-4 sm:px-8 py-4 flex flex-col sm:flex-row sm:items-center gap-3 pb-[max(1rem,env(safe-area-inset-bottom))]" role="status" aria-live="polite">
                <i class="bi shrink-0 text-xl" :class="totalAffected !== 0 ? 'bi-exclamation-triangle-fill text-amber-500' : 'bi-info-circle-fill text-(--text2)'"></i>
                <div class="flex-1 min-w-0 text-sm text-(--text) leading-snug space-y-1">
                    <p v-for="a in announcements" :key="a.feature">{{ a.text }}</p>
                    <p v-if="!announcements.length">Les modifications prendront effet à l'enregistrement.</p>
                </div>
                <div class="flex gap-3 justify-end shrink-0">
                    <button class="default px-6 py-2.5 rounded-xl text-sm font-medium" :disabled="saving" @click="cancel">Annuler</button>
                    <button class="primary px-6 py-2.5 rounded-xl text-sm font-medium" :class="saving ? 'loader' : ''" :disabled="saving" @click="saveAll">Enregistrer</button>
                </div>
            </div>
        </Transition>

        <Popup :is-open="journalOpen" @close="journalOpen = false">
            <template #title>Journal des politiques</template>
            <div class="flex gap-1 mb-3 flex-wrap">
                <button v-for="f in FEATURES" :key="f" class="px-3 py-1.5 rounded-full text-xs font-semibold border" :class="journalFeature === f ? 'border-(--primary) text-(--primary) bg-(--primary)/10' : 'border-(--border-color) text-(--text2)'" @click="selectJournal(f)">{{ LABELS[f] }}</button>
            </div>
            <p v-if="journalError" class="text-sm text-red-500">Le journal n'a pas pu être chargé.</p>
            <ul class="space-y-2">
                <li v-for="e in events" :key="e.id" class="text-sm text-(--text) leading-snug">
                    <span class="text-(--text2) text-xs block">{{ formatDate(e.createdAt) }}</span>
                    {{ describeEvent(e) }}
                </li>
            </ul>
            <p v-if="!events.length && !journalLoading && !journalError" class="text-sm text-(--text2)">Aucun changement enregistré.</p>
            <button v-if="journalNext" class="default mt-4 px-4 py-2 rounded-xl text-sm font-medium" :disabled="journalLoading" @click="loadEvents(true)">Voir plus</button>
            <template #footer>
                <button class="primary px-6 py-2.5 rounded-xl text-sm font-medium" @click="journalOpen = false">Fermer</button>
            </template>
        </Popup>

    </div>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref, watch, type ComponentPublicInstance } from 'vue';
import { openedOrg } from '@/assets/var';
import { useToast } from '@/composables/useToast';
import Popup from '@/components/Popup.vue';
import { runtimeDeps } from '@/services/aiRuntimeUi';
import {
    fetchMyFeatures, listPolicies, listPolicyEvents, webProviderLabel,
    type PolicyAnnouncement, type WebProvider, type PolicyEvent, type PolicyFeature, type PolicySummary,
} from '@/services/aiFeaturePolicies';
import FeaturePolicyCard from './components/FeaturePolicyCard.vue';
import { personOf } from './components/policyMembers';

const toast = useToast();
const deps = runtimeDeps();
const orgId = computed(() => openedOrg.value?.id ?? '');

const FEATURES: PolicyFeature[] = ['autonomous_mode', 'runtime_mode', 'tool_auto_accept', 'web_access'];
const LABELS: Record<PolicyFeature, string> = { autonomous_mode: 'Mode autonome', runtime_mode: 'Mode runtime', tool_auto_accept: 'Toujours accepter', web_access: 'Accès web' };

/**
 * Service de recherche déclaré par le runtime (`GET /me`, champ `provider`) : l'ouvrir revient à l'accepter comme
 * sous-traitant (12 §11.3, catalogue L14 §8.9). Le choix du service se fait dans la configuration du runtime.
 */
const webProvider = ref<WebProvider | null | undefined>(undefined);
const webNote = computed(() => {
    if (webProvider.value === undefined) return undefined;
    if (webProvider.value === null) return "Votre runtime n'a déclaré aucun service de recherche : tant qu'il n'en a pas, l'agent ne peut pas chercher sur internet, même autorisé.";
    return `Les recherches partent chez ${webProviderLabel(webProvider.value)}, choisi dans la configuration de votre runtime. Ouvrir l'accès web revient à l'accepter comme sous-traitant de votre organisation (son contrat de traitement des données est à signer par vous).`;
});

const policies = ref<PolicySummary[]>([]);
const loading = ref(true);
const loadError = ref(false);

const load = async () => {
    if (!orgId.value) return;
    loading.value = true;
    loadError.value = false;
    try {
        const all = await listPolicies(deps.api, orgId.value);
        policies.value = FEATURES.flatMap(f => all.filter(p => p.feature === f));
        // Lecture du service sans bloquer les cartes : en cas d'échec, pas de précision affichée.
        void fetchMyFeatures(deps.api, orgId.value)
            .then(f => { webProvider.value = f.find(x => x.feature === 'web_access')?.provider ?? null; })
            .catch(() => { webProvider.value = undefined; });
    } catch {
        loadError.value = true;
    } finally {
        loading.value = false;
    }
};
onMounted(load);
watch(orgId, () => { cardStates.value = {}; void load(); });

type CardHandle = { save: () => Promise<boolean>; reset: () => void };
const cards = new Map<PolicyFeature, CardHandle>();
const setCardRef = (feature: PolicyFeature, el: Element | ComponentPublicInstance | null) => {
    if (el && 'save' in el) cards.set(feature, el as unknown as CardHandle);
    else cards.delete(feature);
};

const cardStates = ref<Partial<Record<PolicyFeature, { dirty: boolean; announcement: PolicyAnnouncement }>>>({});
const onState = (feature: PolicyFeature, dirty: boolean, announcement: PolicyAnnouncement) => {
    cardStates.value = { ...cardStates.value, [feature]: { dirty, announcement } };
};
const dirtyFeatures = computed(() => FEATURES.filter(f => cardStates.value[f]?.dirty));
const announcements = computed(() => dirtyFeatures.value
    .map(feature => ({ feature, text: cardStates.value[feature]?.announcement.text ?? null }))
    .filter((a): a is { feature: PolicyFeature; text: string } => !!a.text));
/** `null` (inconnu d'avance) compte comme une perte possible. */
const totalAffected = computed(() => dirtyFeatures.value.reduce((n, f) => {
    const a = cardStates.value[f]?.announcement.affected;
    return n + (a === null || a === undefined ? 1 : a);
}, 0));

const saving = ref(false);
const cancel = () => { for (const f of dirtyFeatures.value) cards.get(f)?.reset(); };
const saveAll = async () => {
    saving.value = true;
    let failed = false;
    try {
        for (const f of dirtyFeatures.value) {
            const ok = await cards.get(f)?.save();
            if (ok === false) failed = true;
        }
    } finally {
        saving.value = false;
    }
    if (failed) {
        toast.show("Certaines politiques n'ont pas pu être enregistrées.", 'error');
        return;
    }
    toast.show('Politiques enregistrées.', 'success');
    await load();
};

const journalOpen = ref(false);
const journalFeature = ref<PolicyFeature>('autonomous_mode');
const events = ref<PolicyEvent[]>([]);
const journalNext = ref<string | null>(null);
const journalLoading = ref(false);
const journalError = ref(false);

const loadEvents = async (more = false) => {
    journalLoading.value = true;
    journalError.value = false;
    try {
        const page = await listPolicyEvents(deps.api, orgId.value, journalFeature.value, more ? journalNext.value ?? undefined : undefined);
        events.value = more ? [...events.value, ...page.events] : page.events;
        journalNext.value = page.next;
    } catch {
        journalError.value = true;
    } finally {
        journalLoading.value = false;
    }
};
const selectJournal = (f: PolicyFeature) => { journalFeature.value = f; events.value = []; journalNext.value = null; void loadEvents(); };
const openJournal = () => { journalOpen.value = true; selectJournal(journalFeature.value); };

const MODE_WORD: Record<string, string> = { all: 'Tout le monde', none: 'Personne', list: 'Personne sauf…' };
const formatDate = (iso: string) => (iso ? new Date(iso).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' }) : '');
const describeEvent = (e: PolicyEvent): string => {
    const actor = personOf(e.actorId).name;
    switch (e.type) {
        case 'mode_changed':
            return `${actor} a passé « ${MODE_WORD[e.fromMode ?? ''] ?? '?'} » à « ${MODE_WORD[e.toMode ?? ''] ?? '?'} »${e.removedCount ? ` (${e.removedCount} personne${e.removedCount > 1 ? 's' : ''} retirée${e.removedCount > 1 ? 's' : ''} de la liste)` : ''}.`;
        case 'member_added':
            return `${actor} a ajouté ${e.userId ? personOf(e.userId).name : 'une personne'} à la liste.`;
        case 'member_removed':
            return `${actor} a retiré ${e.userId ? personOf(e.userId).name : 'une personne'} de la liste.`;
        case 'opt_in':
            return `${actor} a activé la fonctionnalité pour lui-même.`;
        case 'opt_out':
            return `${actor} a désactivé la fonctionnalité pour lui-même.`;
        case 'revoked':
            return `${e.userId ? personOf(e.userId).name : 'Une personne'} a perdu la fonctionnalité (retrait par ${actor}).`;
        default:
            return `${actor} : ${e.type.replace(/_/g, ' ')}.`;
    }
};
</script>

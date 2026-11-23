<template>
    <section class="rounded-3xl border bg-(--bg2) p-5 sm:p-6 transition-colors" :class="meta.cardClass" :aria-labelledby="`pol-${summary.feature}`">

        <header class="flex items-start gap-4">
            <div class="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0" :class="meta.iconClass">
                <i class="bi text-2xl" :class="meta.icon"></i>
            </div>
            <div class="flex-1 min-w-0">
                <h4 :id="`pol-${summary.feature}`" class="text-lg font-black text-(--text)">{{ meta.title }}</h4>
                <p class="text-sm text-(--text2) leading-relaxed mt-1">{{ meta.risk }}</p>
            </div>
            <div class="text-right text-xs text-(--text2) shrink-0 hidden sm:block leading-relaxed">
                <p><strong class="text-(--text)">{{ summary.memberCount }}</strong> personne{{ summary.memberCount > 1 ? 's' : '' }} autorisée{{ summary.memberCount > 1 ? 's' : '' }}</p>
                <p v-if="meta.showUsage"><strong class="text-(--text)">{{ summary.enabledCount }}</strong> l'utilise{{ summary.enabledCount > 1 ? 'nt' : '' }}</p>
            </div>
        </header>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-3 mt-5" role="radiogroup" :aria-label="`Qui peut utiliser : ${meta.title}`">
            <label v-for="o in options" :key="o.mode" class="option" :class="draftMode === o.mode ? 'option-on' : ''">
                <input type="radio" class="sr-only" :name="`mode-${summary.feature}`" :value="o.mode" v-model="draftMode" :disabled="saving" />
                <span class="radio-dot" :class="draftMode === o.mode ? 'radio-dot-on' : ''" aria-hidden="true"></span>
                <span class="min-w-0">
                    <span class="block font-bold text-sm text-(--text)">{{ o.label }}</span>
                    <span class="block text-xs text-(--text2) leading-snug mt-0.5">{{ o.hint }}</span>
                </span>
            </label>
        </div>

        <div v-if="draftMode === 'list'" class="mt-4">
            <div class="flex flex-wrap items-center gap-2">
                <span v-for="p in visibleChips" :key="p.userId" class="chip" :class="p.removed ? 'chip-removed' : ''">
                    <img :src="personOf(p.userId).avatar" alt="" class="w-5 h-5 rounded-full object-cover" />
                    <span :class="p.removed ? 'line-through' : ''">{{ personOf(p.userId).name }}</span>
                    <button v-if="!p.removed" type="button" class="chip-x" :aria-label="`Retirer ${personOf(p.userId).name}`" :disabled="saving" @click="removeChip(p.userId)"><i class="bi bi-x-lg"></i></button>
                    <button v-else type="button" class="chip-x" :aria-label="`Garder ${personOf(p.userId).name}`" :disabled="saving" @click="undoRemove(p.userId)"><i class="bi bi-arrow-counterclockwise"></i></button>
                </span>
                <button v-if="hiddenCount > 0 || listNext" type="button" class="chip chip-more" :disabled="loadingList" @click="showAll">
                    {{ expanded ? 'Voir moins' : `+${hiddenCount}${listNext ? '…' : ''}` }}
                </button>
                <MemberPicker :exclude="excluded" :disabled="saving" @pick="addPerson" />
            </div>
            <p v-if="!allChips.length" class="text-xs text-(--text2) mt-3">Aucune personne choisie : c'est équivalent à « Personne ».</p>
        </div>

        <p v-else-if="draftMode === 'none' && meta.noneNote" class="text-xs text-(--text2) mt-3">{{ meta.noneNote }}</p>

        <p v-if="error" class="mt-4 text-sm text-red-500 flex items-start gap-2" role="alert"><i class="bi bi-exclamation-octagon-fill mt-0.5"></i>{{ error }}</p>
    </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import type { ApiPort } from '@/services/aiRuntime/ports';
import {
    addPolicyMembers, listPolicyMembers, policyAnnouncement, PolicyApiError, removePolicyMembers, setPolicyMode,
    type PolicyAnnouncement, type PolicyFeature, type PolicyMember, type PolicyMode, type PolicySummary,
} from '@/services/aiFeaturePolicies';
import MemberPicker from './MemberPicker.vue';
import { personOf } from './policyMembers';

interface Meta {
    title: string; risk: string; icon: string; iconClass: string; cardClass: string; showUsage: boolean;
    all: string; none: string; noneNote?: string;
}
const METAS: Record<PolicyFeature, Meta> = {
    autonomous_mode: {
        title: 'Mode autonome', icon: 'bi-lightning-charge-fill', showUsage: true,
        iconClass: 'bg-amber-500/15 text-amber-500', cardClass: 'border-amber-500/40',
        risk: "L'agent crée des salons chiffrés sans plan à valider. Un message piégé pourrait lui faire créer un salon non voulu.",
        all: "Chaque membre peut l'activer pour lui", none: 'Valeur conseillée, administrateurs compris',
        noneNote: 'Personne ne peut activer le mode autonome : chaque action de l\'agent passe par un plan à valider.',
    },
    runtime_mode: {
        title: 'Mode runtime', icon: 'bi-hdd-network', showUsage: true,
        iconClass: 'bg-(--primary)/15 text-(--primary)', cardClass: 'border-(--border-color)',
        risk: "Confier ses clés au runtime de l'organisation pour que l'agent continue de travailler quand l'app est fermée.",
        all: 'Chaque membre choisit pour lui', none: 'Personne ne peut confier ses clés',
        noneNote: 'Les délégations existantes sont révoquées à l\'enregistrement.',
    },
    tool_auto_accept: {
        title: '« Toujours accepter » une action', icon: 'bi-check2-all', showUsage: false,
        iconClass: 'bg-(--text)/10 text-(--text2)', cardClass: 'border-(--border-color)',
        risk: "Ne plus demander pour une action déjà acceptée. Jamais possible pour une suppression ou un envoi hors de Synco.",
        all: 'Valeur par défaut', none: 'Chaque action se valide',
    },
};

const props = defineProps<{ summary: PolicySummary; api: ApiPort; orgId: string }>();
const emit = defineEmits<{ state: [feature: PolicyFeature, dirty: boolean, announcement: PolicyAnnouncement] }>();

const meta = computed(() => METAS[props.summary.feature]);
const options = computed<Array<{ mode: PolicyMode; label: string; hint: string }>>(() => [
    { mode: 'all', label: 'Tout le monde', hint: meta.value.all },
    { mode: 'none', label: 'Personne', hint: meta.value.none },
    { mode: 'list', label: 'Personne sauf…', hint: 'Seulement les personnes choisies' },
]);

const draftMode = ref<PolicyMode>(props.summary.mode);
const loaded = ref<PolicyMember[]>([]);
const listNext = ref<string | null>(null);
const loadingList = ref(false);
const added = ref<string[]>([]);
const removed = ref<Set<string>>(new Set());
const expanded = ref(false);
const saving = ref(false);
const error = ref('');

const CHIPS_FOLDED = 5;

const loadPage = async (after?: string) => {
    loadingList.value = true;
    try {
        const page = await listPolicyMembers(props.api, props.orgId, props.summary.feature, { after, limit: 100 });
        loaded.value = after ? [...loaded.value, ...page.members] : page.members;
        listNext.value = page.next;
    } catch {
        error.value = 'La liste des personnes n\'a pas pu être chargée.';
    } finally {
        loadingList.value = false;
    }
};

const reset = () => {
    draftMode.value = props.summary.mode;
    added.value = [];
    removed.value = new Set();
    expanded.value = false;
    error.value = '';
    loaded.value = [];
    listNext.value = null;
    if (props.summary.mode === 'list') void loadPage();
};
onMounted(reset);
watch(() => props.summary, reset);

const allChips = computed(() => [
    ...loaded.value.map(m => ({ userId: m.userId, removed: removed.value.has(m.userId) })),
    ...added.value.filter(id => !loaded.value.some(m => m.userId === id)).map(userId => ({ userId, removed: false })),
]);
const visibleChips = computed(() => expanded.value ? allChips.value : allChips.value.slice(0, CHIPS_FOLDED));
const hiddenCount = computed(() => Math.max(0, allChips.value.length - CHIPS_FOLDED));
const excluded = computed(() => new Set(allChips.value.filter(c => !c.removed).map(c => c.userId)));

const showAll = async () => {
    if (expanded.value) { expanded.value = false; return; }
    expanded.value = true;
    while (listNext.value && !loadingList.value) await loadPage(listNext.value);
};

const addPerson = (userId: string) => {
    if (removed.value.has(userId)) return undoRemove(userId);
    if (!added.value.includes(userId)) added.value = [...added.value, userId];
};
const removeChip = (userId: string) => {
    if (added.value.includes(userId)) { added.value = added.value.filter(i => i !== userId); return; }
    removed.value = new Set(removed.value).add(userId);
};
const undoRemove = (userId: string) => {
    const next = new Set(removed.value);
    next.delete(userId);
    removed.value = next;
};

const dirty = computed(() => draftMode.value !== props.summary.mode
    || (draftMode.value === 'list' && (added.value.length > 0 || removed.value.size > 0)));

const announcement = computed<PolicyAnnouncement>(() => policyAnnouncement({
    feature: props.summary.feature,
    currentMode: props.summary.mode,
    nextMode: draftMode.value,
    enabledCount: props.summary.enabledCount,
    removed: loaded.value.filter(m => removed.value.has(m.userId)).map(m => ({ name: personOf(m.userId).name, enabled: m.enabled })),
    addedCount: added.value.length,
}));

watch([dirty, announcement], () => emit('state', props.summary.feature, dirty.value, announcement.value), { immediate: true });

const ERROR_TEXT: Record<string, string> = {
    forbidden: "Vous n'avez pas le droit de modifier cette politique.",
    feature_reserved: "Cette fonctionnalité n'est pas encore disponible.",
    policy_not_list: "La liste n'est modifiable que dans le mode « Personne sauf… ».",
    rate_limited: 'Trop de modifications, réessayez dans un instant.',
};

/** Enregistre ; en cas d'erreur la carte garde le choix et l'affiche en ligne. */
const save = async (): Promise<boolean> => {
    if (!dirty.value) return true;
    saving.value = true;
    error.value = '';
    try {
        const f = props.summary.feature;
        if (draftMode.value !== props.summary.mode) await setPolicyMode(props.api, props.orgId, f, draftMode.value);
        if (draftMode.value === 'list') {
            if (added.value.length) await addPolicyMembers(props.api, props.orgId, f, added.value);
            const gone = [...removed.value];
            if (gone.length) await removePolicyMembers(props.api, props.orgId, f, gone);
        }
        return true;
    } catch (e) {
        error.value = e instanceof PolicyApiError ? (ERROR_TEXT[e.code] ?? "L'enregistrement a échoué. Rien n'a été perdu : réessayez.") : "L'enregistrement a échoué. Réessayez.";
        return false;
    } finally {
        saving.value = false;
    }
};

defineExpose({ save, reset, dirty });
</script>

<style scoped>
.option {
    display: flex; align-items: flex-start; gap: 0.8rem; padding: 0.9rem 1rem; cursor: pointer;
    border-radius: 1rem; border: 1px solid var(--border-color); background: var(--bg);
    transition: border-color 0.15s, background 0.15s;
}
.option:hover { border-color: color-mix(in srgb, var(--text) 25%, transparent); }
.option:has(input:focus-visible) { outline: 2px solid var(--primary); outline-offset: 2px; }
.option-on { border-color: var(--primary); background: color-mix(in srgb, var(--primary) 7%, var(--bg)); }
.radio-dot {
    flex: none; width: 1.15rem; height: 1.15rem; margin-top: 0.1rem; border-radius: 999px;
    border: 2px solid color-mix(in srgb, var(--text) 35%, transparent); transition: all 0.15s;
}
.radio-dot-on { border: 5px solid var(--primary); }
.chip {
    display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.3rem 0.5rem 0.3rem 0.35rem;
    border-radius: 999px; font-size: 0.8rem; font-weight: 500; color: var(--text);
    background: var(--bg); border: 1px solid var(--border-color);
}
.chip-removed { color: #dc2626; border-color: rgb(220 38 38 / 0.4); background: rgb(220 38 38 / 0.07); }
.chip-more { padding-left: 0.8rem; padding-right: 0.8rem; color: var(--primary); font-weight: 700; }
.chip-x { color: var(--text2); font-size: 0.7rem; padding: 0.15rem; border-radius: 999px; }
.chip-x:hover:not(:disabled) { color: var(--text); background: color-mix(in srgb, var(--text) 10%, transparent); }
</style>

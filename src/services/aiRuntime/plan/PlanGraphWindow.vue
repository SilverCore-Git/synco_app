<template>
    <component :is="isMobile ? 'div' : DraggableWindow" v-bind="frameProps" :class="isMobile ? 'fixed inset-0 z-50' : ''">
        <template v-if="!isMobile" #header><PlanWindowHeader v-bind="headerProps" draggable @close="emit('close')" /></template>
        <div
            class="flex flex-col bg-(--bg2) text-(--text) overflow-hidden"
            :class="isMobile ? 'h-full' : 'h-[min(80vh,780px)] -m-4 rounded-b-2xl border border-(--text)/10 shadow-2xl'"
            role="dialog"
            aria-modal="false"
            aria-label="Plan d'action de Synco AI"
        >
            <PlanWindowHeader v-if="isMobile" v-bind="headerProps" @close="emit('close')" />

            <div v-if="invalid" class="mx-5 mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-500" role="alert">Plan illisible, refusé sans rien faire.</div>
            <div v-else-if="expired && mode === 'validate'" class="mx-5 mt-3 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-600"><i class="bi bi-hourglass-split" /> Ce plan a expiré : il ne peut plus être validé.</div>
            <div v-if="otherDevice" class="mx-5 mt-3 rounded-lg bg-(--text)/6 px-3 py-2 text-sm"><i class="bi bi-laptop" /> En cours sur votre autre appareil.</div>
            <div v-if="mode !== 'validate' && waitingRuntime" class="mx-5 mt-3 rounded-lg bg-(--text)/6 px-3 py-2 text-sm"><i class="bi bi-hourglass-split" /> En attente du runtime : les actions de Synco AI restent « en cours ».</div>
            <div v-if="queuedBanner" class="mx-5 mt-3 rounded-lg bg-sky-500/10 px-3 py-2 text-sm text-sky-600">{{ queuedBanner }} <button type="button" class="underline font-medium" @click="stopAsk = true">Arrêter le plan</button> pour le traiter maintenant.</div>
            <div v-if="failBanner" class="mx-5 mt-3 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-600">{{ failBanner }}</div>

            <blockquote v-if="model.summary" class="mx-5 mt-3 border-l-4 border-(--text)/20 bg-(--text)/4 px-3 py-2 text-sm">
                <span class="text-(--text2)">Texte de Synco AI, présenté tel quel : </span><span class="font-semibold break-words">« {{ model.summary }} »</span>
            </blockquote>
            <div v-if="mode === 'validate' && result.cascades.length" class="mx-5 mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700">
                <i class="bi bi-arrow-return-right" /> <template v-for="c in result.cascades" :key="c.root">Décocher <strong>« {{ label(c.root) }} »</strong> retire aussi <strong v-for="(d, i) in c.dropped" :key="d">{{ i ? ', ' : '' }}« {{ label(d) }} »</strong>, qui en dépend. </template>
            </div>

            <div v-if="loading" class="flex-1 grid grid-cols-3 gap-4 p-5" aria-busy="true"><div v-for="i in 3" :key="i" class="h-40 rounded-xl bg-(--text)/6 animate-pulse" /></div>
            <div v-else class="flex-1 min-h-0 flex" :class="isMobile ? 'flex-col' : ''">
                <div class="flex-1 min-w-0 overflow-auto p-5">
                    <PlanList v-if="isMobile" :model="model" :mode="cardMode" :checked="checkedSet" :ignored="ignoredMap" :progress="progress?.byAction" :interactive="canDecide" @toggle="toggle" @select="selected = $event" />
                    <template v-else>
                        <div class="flex gap-10 mb-2 text-xs font-semibold text-(--text2) sticky top-0" :style="{ width: graphWidth + 'px' }">
                            <span v-for="l in model.maxLevel" :key="l" class="w-72 shrink-0">{{ levelTitle(l) }}</span>
                        </div>
                        <PlanGraph :model="model" :mode="cardMode" :checked="checkedSet" :ignored="ignoredMap" :progress="progress?.byAction" :selected="selected" :interactive="canDecide" :expanded="expanded" @toggle="toggle" @select="selected = $event" @toggle-band="toggleBand" />
                    </template>
                </div>
                <div v-if="selectedAction && !isMobile" class="w-80 shrink-0 overflow-auto border-l border-(--text)/10 p-5">
                    <PlanActionDetail :model="model" :action="selectedAction" :resolver="resolver" :checked="checkedSet.has(selectedAction.n)" :can-toggle="canDecide" :progress="progress?.byAction.get(selectedAction.n)" @toggle="toggle" />
                </div>
                <div v-else-if="selectedAction && isMobile" class="absolute inset-x-0 bottom-0 max-h-[70%] overflow-auto rounded-t-2xl bg-(--bg2) border-t border-(--text)/15 p-5 shadow-2xl">
                    <button type="button" class="float-right p-1" aria-label="Fermer le détail" @click="selected = null"><i class="bi bi-x-lg" /></button>
                    <PlanActionDetail :model="model" :action="selectedAction" :resolver="resolver" :checked="checkedSet.has(selectedAction.n)" :can-toggle="canDecide" :progress="progress?.byAction.get(selectedAction.n)" @toggle="toggle" />
                </div>
            </div>

            <footer class="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-t border-(--text)/10">
                <p class="text-xs text-(--text2) min-w-0 flex-1 basis-60">
                    <template v-if="mode === 'validate'">Exécuté par <strong class="text-(--text)">votre appareil</strong> ({{ result.device }}) et par <strong class="text-(--text)">Synco AI</strong> sur le runtime ({{ result.agent }}).</template>
                    <template v-else-if="progress">{{ dockText }}</template>
                </p>
                <template v-if="mode === 'validate'">
                    <span v-if="offline" class="text-xs text-(--text2)">Reconnectez-vous pour décider</span>
                    <span v-else-if="result.pendingSensitive.length" class="text-xs text-amber-600"><i class="bi bi-exclamation-triangle-fill" /> Cochez ou retirez les actions à vérifier pour continuer</span>
                    <button type="button" class="rounded-lg bg-red-500/10 text-red-500 px-4 py-2 font-semibold disabled:opacity-50" :disabled="!canDecide" @click="emit('reject')">Refuser tout</button>
                    <button type="button" class="rounded-lg bg-(--primary) text-white px-4 py-2 font-semibold disabled:opacity-40 disabled:cursor-not-allowed" :disabled="!canDecide || !result.canAccept" @click="emit('accept', result.accepted)">
                        <i class="bi bi-check2-all" /> Accepter {{ result.accepted.length }} action{{ result.accepted.length > 1 ? 's' : '' }}
                    </button>
                </template>
                <template v-else-if="mode === 'follow'">
                    <button type="button" class="rounded-lg bg-(--text)/8 px-4 py-2 font-semibold" @click="emit('followInDock')">Suivre dans le dock</button>
                    <button type="button" class="rounded-lg bg-red-500/10 text-red-500 px-4 py-2 font-semibold disabled:opacity-50" :disabled="offline || !!otherDevice" @click="stopAsk = true">Arrêter le plan</button>
                </template>
            </footer>
        </div>
        <ConfirmDelete
            :show="stopAsk"
            item-name="le plan"
            title="Arrêter le plan ?"
            message="Les actions déjà en cours vont à leur terme ; les suivantes ne sont pas lancées et Synco AI en est informé."
            button-text="Arrêter le plan"
            @cancel="stopAsk = false"
            @confirm="stopAsk = false; emit('stop')"
        />
    </component>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, toRef, watch } from 'vue';
import DraggableWindow from '@/components/common/DraggableWindow.vue';
import ConfirmDelete from '@/components/common/ConfirmDelete.vue';
import PlanWindowHeader from './PlanWindowHeader.vue';
import PlanGraph from './PlanGraph.vue';
import PlanList from './PlanList.vue';
import PlanActionDetail from './PlanActionDetail.vue';
import { usePlanSelection } from './usePlanSelection';
import { GEO, levelTitle, type PlanModel } from './planModel';
import type { NameResolver } from './planLabels';
import { dockLabel, failureBanner, queuedMessageBanner, type Progress } from './planProgress';

const props = defineProps<{
    model: PlanModel;
    /** `validate` : cases ; `follow` : états en direct ; `review` : lecture seule après la clôture (PC56). */
    mode: 'validate' | 'follow' | 'review';
    resolver: NameResolver;
    progress?: Progress | null;
    /** Actions acceptées (suivi et revue). */
    accepted?: readonly number[];
    loading?: boolean;
    invalid?: boolean;
    expired?: boolean;
    offline?: boolean;
    otherDevice?: boolean;
    waitingRuntime?: boolean;
    queuedMessage?: string;
    scope?: string;
}>();
const emit = defineEmits<{
    (e: 'accept', accepted: number[]): void;
    (e: 'reject' | 'close' | 'stop' | 'followInDock'): void;
}>();

const { sel, result, toggle: toggleSel } = usePlanSelection(toRef(props, 'model'));
const selected = ref<number | null>(null);
const expanded = ref<ReadonlySet<string>>(new Set());
const stopAsk = ref(false);

const cardMode = computed(() => (props.mode === 'validate' ? 'select' : 'follow'));
const canDecide = computed(() => props.mode === 'validate' && !props.offline && !props.invalid && !props.expired && !props.loading);
const checkedSet = computed<ReadonlySet<number>>(() => (props.mode === 'validate' ? sel.value.checked : new Set(props.accepted ?? [])));
const ignoredMap = computed(() => (props.mode === 'validate' ? result.value.ignoredBecause : new Map<number, number>()));
const toggle = (n: number) => { if (canDecide.value) toggleSel(n); };
const toggleBand = (id: string) => { const s = new Set(expanded.value); if (!s.delete(id)) s.add(id); expanded.value = s; };
const selectedAction = computed(() => (selected.value ? props.model.actions[selected.value - 1] ?? null : null));
const label = (n: number) => props.model.actions[n - 1]?.label ?? String(n);
const graphWidth = computed(() => props.model.maxLevel * (GEO.colW + GEO.colGap));

const title = computed(() => props.mode === 'validate'
    ? `Synco AI vous propose ${props.model.actions.length} action${props.model.actions.length > 1 ? 's' : ''}`
    : props.progress ? (props.progress.finished ? 'Plan terminé' : `Plan en cours · ${props.progress.done} sur ${props.progress.total} faites`) : 'Plan');
const expiryText = computed(() => `${props.expired ? 'Expiré' : 'Expire'} le ${new Date(props.model.expiresAt).toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`);
const headerProps = computed(() => ({ title: title.value, expiry: props.model.expiresAt ? expiryText.value : undefined, scope: props.scope, reassure: props.mode === 'validate' }));
const dockText = computed(() => (props.progress ? dockLabel(props.progress) : ''));
const failBanner = computed(() => (props.progress && props.mode !== 'validate' ? failureBanner(props.model, props.accepted ?? [], props.progress) : null));
const queuedBanner = computed(() => (props.queuedMessage && props.mode === 'follow' ? queuedMessageBanner(props.queuedMessage) : null));

const isMobile = ref(false);
let mq: MediaQueryList | null = null;
const syncMq = () => { isMobile.value = !!mq?.matches; };
onMounted(() => { mq = window.matchMedia('(max-width: 767px)'); syncMq(); mq.addEventListener('change', syncMq); });
onUnmounted(() => mq?.removeEventListener('change', syncMq));
watch(() => props.model.planId, () => { selected.value = null; });

const frameProps = computed(() => (isMobile.value ? {} : { width: 'min(1180px, 94vw)', height: 'auto', initialX: 60, initialY: 40 }));
</script>

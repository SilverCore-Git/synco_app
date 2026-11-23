<template>
    <div class="my-2">
        <p v-if="initFailed" class="max-w-xl rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-600" role="alert">
            Le plan n'a pas pu être chargé.
            <button type="button" class="ml-1 underline font-medium" @click="retry">Réessayer</button>
        </p>

        <div v-else-if="!f || f.status === 'loading' || f.status === 'idle'" class="max-w-xl rounded-2xl border border-(--text)/10 bg-(--bg2) p-4" aria-busy="true">
            <div class="h-4 w-1/2 rounded bg-(--text)/10 animate-pulse" />
            <div class="mt-3 h-3 w-3/4 rounded bg-(--text)/10 animate-pulse" />
        </div>

        <p v-else-if="f.status === 'error'" class="max-w-xl rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-600" role="alert">
            {{ f.error || "Le plan n'a pas pu être chargé." }}
            <button type="button" class="ml-1 underline font-medium" @click="f.load()">Réessayer</button>
        </p>

        <p v-else-if="f.status === 'invalid'" class="max-w-xl rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-500" role="alert">Plan illisible, refusé sans rien faire.</p>

        <p v-else-if="f.status === 'ended'" class="max-w-xl text-xs text-(--text2)"><i class="bi bi-diagram-3" /> Plan clos.</p>

        <template v-else-if="f.loaded">
            <PlanCard
                v-if="f.status === 'proposed'"
                :model="f.loaded.model"
                :offline="offline"
                :expired="f.expired"
                @accept="onAccept($event, 'card')"
                @reject="onReject"
                @review="openMode = 'validate'"
            />
            <PlanSummary
                v-else-if="f.progress && f.progress.finished"
                :model="f.loaded.model"
                :progress="f.progress"
                :expired="f.view?.status === 'expired'"
                @review="openMode = 'review'"
            />
            <div v-else class="max-w-xl rounded-2xl border border-(--text)/10 bg-(--bg2) p-4 text-(--text)">
                <div class="flex items-center gap-3">
                    <div class="h-10 w-10 shrink-0 rounded-xl bg-(--primary)/15 text-(--primary) flex items-center justify-center text-lg"><i class="bi bi-diagram-3" /></div>
                    <div class="min-w-0 flex-1">
                        <h3 class="font-bold leading-snug">{{ f.progress ? dockLabel(f.progress) : 'Plan en cours' }}</h3>
                        <p class="text-xs text-(--text2)">{{ followHint }}</p>
                    </div>
                </div>
                <div v-if="f.progress" class="mt-3 flex h-1.5 overflow-hidden rounded-full bg-(--text)/10" role="progressbar" :aria-valuenow="f.progress.done" :aria-valuemin="0" :aria-valuemax="f.progress.total">
                    <span class="bg-emerald-500" :style="{ width: gaugeParts.done + '%' }" />
                    <span class="bg-(--primary)" :style="{ width: gaugeParts.running + '%' }" />
                    <span class="bg-red-500" :style="{ width: gaugeParts.failed + '%' }" />
                </div>
                <button type="button" class="mt-3 w-full rounded-lg bg-(--text)/8 px-3 py-2 text-sm font-semibold" @click="openMode = 'follow'">Suivre le plan</button>
            </div>

            <PlanGraphWindow
                v-if="openMode"
                :model="f.loaded.model"
                :mode="openMode"
                :resolver="resolver"
                :progress="f.progress"
                :accepted="f.localAccepted ?? undefined"
                :loading="f.busy"
                :expired="f.expired"
                :offline="offline"
                :other-device="f.otherDevice"
                :queued-message="queuedMessage"
                @accept="onAccept($event, 'graph')"
                @reject="onReject"
                @stop="f.stop()"
                @close="openMode = null"
                @follow-in-dock="openMode = null"
            />
        </template>

        <p v-if="f && f.error && f.status !== 'error'" class="mt-1 max-w-xl text-xs text-red-500" role="alert">{{ f.error }}</p>
    </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue';
import { openedOrg } from '@/assets/var';
import { openConversationKey } from '@/services/aiRuntime';
import { loadToolManifest } from '@/services/agent/clientAgent';
import { runtimeDeps } from '@/services/aiRuntimeUi';
import { fetchPendingToolCall } from '@/services/aiRuntime/conversation/wiring';
import PlanCard from '@/services/aiRuntime/plan/PlanCard.vue';
import PlanGraphWindow from '@/services/aiRuntime/plan/PlanGraphWindow.vue';
import PlanSummary from '@/services/aiRuntime/plan/PlanSummary.vue';
import { loadPlanEnv, orgKnownLocalId, orgResolver } from '@/services/aiRuntime/plan/planEnv';
import { usePlanFlow, type PlanFlow } from '@/services/aiRuntime/plan/planFlow';
import { dockLabel, gauge } from '@/services/aiRuntime/plan/planProgress';
import type { PendingPlanCall } from '@/services/aiRuntime/actionPlan';

const props = defineProps<{ orgId: string; sessionId: string; toolCallId: string; offline?: boolean; queuedMessage?: string }>();

const resolver = orgResolver(() => openedOrg.value);
const flow = shallowRef<PlanFlow | null>(null);
/** `reactive` déballe les refs : le gabarit lit `f.status`, `f.loaded`… */
const f = computed(() => (flow.value ? reactive(flow.value) : null));
const openMode = ref<'validate' | 'follow' | 'review' | null>(null);
const initFailed = ref(false);
const gaugeParts = computed(() => (f.value?.progress ? gauge(f.value.progress) : { done: 0, running: 0, failed: 0, rest: 100 }));
const followHint = computed(() => (f.value?.otherDevice ? 'En cours sur votre autre appareil' : 'Les actions de votre appareil s’exécutent tant que cet onglet reste ouvert.'));

const asPendingCall = (raw: unknown): PendingPlanCall | null => {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;
    if (typeof r.id !== 'string' || typeof r.name !== 'string' || typeof r.args !== 'string') return null;
    return { id: r.id, name: r.name, args: r.args, planId: typeof r.planId === 'string' ? r.planId : undefined };
};

async function init(): Promise<void> {
    const deps = runtimeDeps();
    const [ck, env] = await Promise.all([
        openConversationKey(deps, props.orgId, props.sessionId),
        loadPlanEnv(deps, props.orgId, props.sessionId, o => loadToolManifest(o)),
    ]);
    flow.value = usePlanFlow({
        session: {
            api: deps.api, ck, orgId: props.orgId, sessionId: props.sessionId, context: env.context, flags: env.flags,
            resolver, knownLocalId: orgKnownLocalId(() => openedOrg.value),
        },
        pendingCall: async () => {
            const call = asPendingCall(await fetchPendingToolCall(props.orgId, props.sessionId));
            // Seul l'appel en attente est un plan à décider ; un plan plus ancien n'a plus de carte active.
            return call && call.id === props.toolCallId ? call : null;
        },
        now: () => Date.now(),
    });
    await flow.value.load();
}

const onAccept = (accepted: number[], from: 'card' | 'graph') => { void flow.value?.accept(accepted, from).then(ok => { if (ok && from === 'graph') openMode.value = 'follow'; }); };
const onReject = () => { void flow.value?.reject().then(() => { openMode.value = null; }); };

const retry = () => { initFailed.value = false; flow.value = null; void init().catch(() => { initFailed.value = true; }); };
onMounted(retry);
onBeforeUnmount(() => { openMode.value = null; });
watch(() => props.toolCallId, retry);
</script>

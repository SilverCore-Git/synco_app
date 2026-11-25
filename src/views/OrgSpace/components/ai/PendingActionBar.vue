<template>

    <div class="action-card relative bg-(--bg2) border border-(--border-color) rounded-2xl p-4 shadow-2xl flex flex-col gap-3 overflow-hidden">

        <!-- L'IA pose une question : réponse rapide (options) ou texte libre -->
        <template v-if="tool.name === 'ask_question'">
            <div class="flex items-start gap-3 text-sm text-(--text)">
                <span class="icon-badge w-9 h-9 rounded-full bg-(--primary)/15 flex items-center justify-center shrink-0">
                    <i class="bi bi-question-circle text-(--primary) text-base relative z-10"></i>
                </span>
                <p class="font-medium pt-1.5">{{ args.question }}</p>
            </div>
            <TransitionGroup
                v-if="args.options?.length"
                name="list" tag="div" appear
                class="flex flex-wrap gap-2"
            >
                <button
                    v-for="(opt, i) in args.options" :key="opt"
                    :style="{ transitionDelay: `${Number(i) * 40}ms` }"
                    @click="$emit('answer', opt)"
                    class="text-xs font-medium px-3 py-1.5 rounded-lg border border-(--border-color) bg-(--bg) hover:border-(--primary)/50 hover:bg-(--primary)/5 text-(--text) transition-colors"
                >{{ opt }}</button>
            </TransitionGroup>
            <form @submit.prevent="submitAnswer" class="flex gap-2">
                <input
                    v-model="answerText"
                    type="text"
                    placeholder="Ou réponds ici..."
                    class="flex-1 bg-(--bg) border border-(--border-color) rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-(--primary)"
                />
                <button type="submit" :disabled="!answerText.trim()" class="primary px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-40 disabled:pointer-events-none">Envoyer</button>
            </form>
        </template>

        <!-- Upload d'image (ex: logo d'un espace) -->
        <template v-else-if="tool.name === 'request_image_upload'">
            <div class="flex items-center gap-3 text-sm text-(--text) font-medium">
                <span class="icon-badge w-9 h-9 rounded-full bg-(--primary)/15 flex items-center justify-center shrink-0">
                    <i class="bi bi-image text-(--primary) text-base relative z-10"></i>
                </span>
                {{ args.prompt || 'Sélectionne une image' }}
            </div>
            <IconSelector model-value="" @on-base64="(base64: string) => $emit('image', base64)" />
        </template>

        <!-- Envoi web retenu par la garde du runtime (10 §4.4) : texte exact, motifs, jamais « toujours accepter » -->
        <template v-else-if="isWeb">
            <div class="flex items-start gap-3 text-sm text-(--text)">
                <span class="icon-badge w-9 h-9 rounded-full bg-sky-500/15 flex items-center justify-center shrink-0">
                    <i class="bi bi-globe2 text-sky-500 text-base relative z-10" aria-hidden="true"></i>
                </span>
                <div class="min-w-0 flex-1 flex flex-col gap-2">
                    <p class="font-medium pt-1.5">{{ tool.name === 'web_fetch' ? 'Synco AI veut lire cette page. Vérifiez l’adresse avant de l’envoyer :' : 'Synco AI veut envoyer cette recherche sur internet. Vérifiez-la :' }}</p>
                    <p class="rounded-xl bg-(--bg) border border-(--border-color) px-3 py-2 text-sm break-all whitespace-pre-wrap select-all" :aria-label="tool.name === 'web_fetch' ? 'Adresse complète' : 'Requête exacte'"><template v-for="(seg, i) in webSegments" :key="i"><mark v-if="seg.marked" class="web-mark">{{ seg.text }}</mark><template v-else>{{ seg.text }}</template></template></p>
                    <p v-if="webSummary" class="text-xs text-(--text2) break-all">{{ webSummary }}</p>
                    <ul v-if="guard?.reasons.length" class="flex flex-col gap-1 text-xs text-(--text)">
                        <li v-for="r in guard.reasons" :key="r" class="flex items-start gap-1.5"><i class="bi bi-exclamation-triangle-fill text-amber-500 mt-0.5" aria-hidden="true"></i>{{ capitalize(guardReasonText(r)) }}</li>
                    </ul>
                    <p v-else-if="guardState === 'loading'" class="text-xs text-(--text2)">Lecture des motifs…</p>
                    <p v-else-if="guardState === 'error'" class="text-xs text-(--text2)">Les motifs n’ont pas pu être lus sur cet appareil ; le texte ci-dessus est celui qui partirait.</p>
                    <p class="text-xs text-(--text2)">Rien n’est envoyé sans votre accord. Les passages surlignés viennent de vos données Synco.</p>
                </div>
            </div>
            <div class="flex flex-wrap gap-2">
                <button type="button" @click="$emit('accept')" class="primary px-4 py-2 rounded-xl text-sm font-medium">Envoyer</button>
                <button type="button" @click="$emit('reject')" class="danger px-4 py-2 rounded-xl text-sm font-medium">Ne pas envoyer</button>
            </div>
        </template>

        <!-- Confirmation d'une action mutante (create_space, create_task, delete_task...) -->
        <template v-else>
            <div class="flex items-center gap-3 text-sm text-(--text)">
                <span class="icon-badge w-9 h-9 rounded-full bg-(--primary)/15 flex items-center justify-center shrink-0">
                    <i :class="icon" class="text-(--primary) text-base relative z-10"></i>
                </span>
                <span class="min-w-0 break-words">
                    <span class="font-medium">Synco AI veut : {{ label }}</span>
                    <span v-if="summary" class="text-(--text2) break-all"> — {{ summary }}</span>
                </span>
            </div>
            <TransitionGroup name="list" tag="div" appear class="flex flex-wrap gap-2">
                <button key="accept" style="transition-delay: 0ms" @click="$emit('accept')" class="primary px-4 py-2 rounded-xl text-sm font-medium">Accepter</button>
                <button key="always" style="transition-delay: 40ms" @click="$emit('always-accept')" class="default px-4 py-2 rounded-xl text-sm font-medium">
                    Toujours accepter « {{ label }} » (cette session)
                </button>
                <button key="reject" style="transition-delay: 80ms" @click="$emit('reject')" class="danger px-4 py-2 rounded-xl text-sm font-medium">Refuser</button>
            </TransitionGroup>
        </template>

    </div>

</template>

<script setup lang="ts">

import { ref, computed } from 'vue';
import type { ToolStep } from './agentTypes';
import { toolLabel } from './agentTypes';
import IconSelector from '@/components/common/IconSelector.vue';
import { openedOrg } from '@/assets/var';
import { useCalendarAccess } from '@/composables/useCalendarAccess';
import { summarizeTool, type SummaryContext } from '@/components/ai/summaries/summaryRegistry';
import { summaryModules } from '@/components/ai/summaries/summaryModules';
import { orgResolver } from '@/services/aiRuntime/plan/planEnv';
import { guardedText, guardReasonText, guardSegments, isWebGuardTool, type WebGuard } from '@/services/aiRuntime/conversation/webGuard';

/**
 * `guard` / `guardState` : motifs de la garde web déchiffrés par la vue (runtime seulement) ; sans eux, la carte
 * web montre quand même le texte exact et les boutons « Envoyer / Ne pas envoyer ».
 */
const props = defineProps<{ tool: ToolStep; guard?: WebGuard | null; guardState?: 'loading' | 'ready' | 'none' | 'error' }>();
const emit = defineEmits<{
    accept: [];
    'always-accept': [];
    reject: [];
    answer: [value: string];
    image: [base64: string];
}>();

const { label, icon } = toolLabel(props.tool.name);

// Le tool en attente peut venir de la boucle legacy (ChatMessage['tool_call'], champ `arguments`)
// ou de la nouvelle boucle d'agent (ToolStep, champ `args`) — on accepte les deux formes plutôt que
// d'imposer une copie normalisée côté OrgAI.vue, qui casserait la référence que handleToolCall/
// handleAgentToolDecision doivent muter en place pour que le statut se reflète dans l'UI.
const args = computed<any>(() => {
    const raw = (props.tool as any).args ?? (props.tool as any).arguments;
    try {
        return typeof raw === 'string' ? JSON.parse(raw || '{}') : (raw || {});
    } catch {
        return {};
    }
});

// Un champ représentatif par outil, pour donner un aperçu sans déplier le détail complet du tool
// dans la timeline — juste assez pour décider sans avoir à aller chercher l'info ailleurs.
const calendarAccess = useCalendarAccess();
if (props.tool.name === 'respond_calendar_access' && openedOrg.value) void calendarAccess.fetchGrants(openedOrg.value.id);

// Contexte local des résumés de domaine : noms de l'annuaire de l'org, partages d'agenda déjà chargés.
const nameResolver = orgResolver(() => openedOrg.value ?? null);
const summaryContext: SummaryContext = {
    userName: id => openedOrg.value?.members?.find(m => m.userId === id)?.user?.name ?? null,
    spaceName: id => nameResolver.resolve('space', id),
    threadName: id => nameResolver.resolve('thread', id),
    grant: id => {
        const owned = calendarAccess.asOwner.value.find(g => g.id === id);
        if (owned) return { who: owned.grantee?.name ?? 'Membre', level: owned.level === 'WRITE' ? 'modification' : 'lecture seule', direction: 'owner' };
        const received = calendarAccess.asGrantee.value.find(g => g.id === id);
        return received ? { who: received.owner?.name ?? 'Membre', level: received.level === 'WRITE' ? 'modification' : 'lecture seule', direction: 'grantee' } : null;
    },
};

const summary = computed(() => {
    const a = args.value;
    const domainSummary = summarizeTool(props.tool.name, a, summaryContext, summaryModules);
    if (domainSummary) return domainSummary;
    switch (props.tool.name) {
        case 'create_space': return a.name;
        case 'create_task': return a.title;
        case 'create_thread': return (a.threads || []).map((t: any) => t.name).join(', ');
        case 'create_folder': return a.name;
        case 'create_file': return a.name;
        case 'update_task': return a.title;
        case 'update_space': return a.name;
        case 'create_email_report': return a.name;
        default: return '';
    }
});

const isWeb = computed(() => isWebGuardTool(props.tool.name));
const webSegments = computed(() => guardSegments(guardedText(props.tool.name, args.value) ?? '(texte absent)', props.guard?.spans ?? []));
/** Précisions du résumé de domaine (site, caractères invisibles, http…), sans répéter le texte. */
const webSummary = computed(() => {
    if (!isWeb.value) return '';
    const s = summarizeTool(props.tool.name, args.value, summaryContext, summaryModules);
    if (props.tool.name === 'web_fetch') { const i = s.lastIndexOf(' — '); return i >= 0 ? s.slice(i + 3) : ''; }
    return s.includes('ATTENTION') ? 'ATTENTION : la requête contient des caractères invisibles, non affichés.' : '';
});
const capitalize = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

const answerText = ref('');
function submitAnswer() {
    const value = answerText.value.trim();
    if (!value) return;
    emit('answer', value);
    answerText.value = '';
}

</script>

<style scoped>
/* Passage de la requête ou de l'adresse qui vient des données de Synco (garde web). */
.web-mark {
    background: rgba(245, 158, 11, 0.28);
    color: inherit;
    border-radius: 0.25rem;
    padding: 0 0.1rem;
}

/* Respiration douce du contour : rappelle que la barre attend une décision
   sans être une alerte agressive (lent, variation d'opacité faible). */
.action-card {
    animation: pending-breathe 2.4s ease-in-out infinite;
}

@keyframes pending-breathe {
    0%, 100% { box-shadow: 0 0 0 1px rgba(var(--primary-rgb), 0.08), 0 10px 30px -14px rgba(var(--primary-rgb), 0.18); }
    50% { box-shadow: 0 0 0 1px rgba(var(--primary-rgb), 0.2), 0 10px 34px -10px rgba(var(--primary-rgb), 0.35); }
}

/* Anneau qui s'étend et s'efface derrière l'icône, façon indicateur "en direct" —
   signale que l'action est en attente d'une réponse plutôt qu'un simple statut. */
.icon-badge {
    position: relative;
}

.icon-badge::before {
    content: '';
    position: absolute;
    inset: -4px;
    border-radius: 9999px;
    background: rgba(var(--primary-rgb), 0.3);
    animation: pending-ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;
}

@keyframes pending-ping {
    0% { transform: scale(0.8); opacity: 0.6; }
    80%, 100% { transform: scale(1.8); opacity: 0; }
}

@media (prefers-reduced-motion: reduce) {
    .action-card { animation: none; }
    .icon-badge::before { animation: none; display: none; }
}
</style>

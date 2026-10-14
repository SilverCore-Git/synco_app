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

        <!-- Confirmation d'une action mutante (create_space, create_task, delete_task...) -->
        <template v-else>
            <div class="flex items-center gap-3 text-sm text-(--text)">
                <span class="icon-badge w-9 h-9 rounded-full bg-(--primary)/15 flex items-center justify-center shrink-0">
                    <i :class="icon" class="text-(--primary) text-base relative z-10"></i>
                </span>
                <span class="min-w-0 truncate">
                    <span class="font-medium">Synco AI veut : {{ label }}</span>
                    <span v-if="summary" class="text-(--text2)"> — {{ summary }}</span>
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

const props = defineProps<{ tool: ToolStep }>();
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
const summary = computed(() => {
    const a = args.value;
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

const answerText = ref('');
function submitAnswer() {
    const value = answerText.value.trim();
    if (!value) return;
    emit('answer', value);
    answerText.value = '';
}

</script>

<style scoped>
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

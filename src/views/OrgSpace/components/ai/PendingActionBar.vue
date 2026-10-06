<template>

    <div class="bg-(--bg2) border border-(--border-color) rounded-2xl p-4 shadow-2xl flex flex-col gap-3">

        <!-- L'IA pose une question : réponse rapide (options) ou texte libre -->
        <template v-if="tool.name === 'ask_question'">
            <div class="flex items-start gap-2 text-sm text-(--text)">
                <i class="bi bi-question-circle text-(--primary) mt-0.5 shrink-0"></i>
                <p class="font-medium">{{ args.question }}</p>
            </div>
            <div v-if="args.options?.length" class="flex flex-wrap gap-2">
                <button
                    v-for="opt in args.options" :key="opt"
                    @click="$emit('answer', opt)"
                    class="text-xs font-medium px-3 py-1.5 rounded-lg border border-(--border-color) bg-(--bg) hover:border-(--primary)/50 hover:bg-(--primary)/5 text-(--text) transition-colors"
                >{{ opt }}</button>
            </div>
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
            <div class="flex items-center gap-2 text-sm text-(--text) font-medium">
                <i class="bi bi-image text-(--primary)"></i>
                {{ args.prompt || 'Sélectionne une image' }}
            </div>
            <IconSelector model-value="" @on-base64="(base64: string) => $emit('image', base64)" />
        </template>

        <!-- Confirmation d'une action mutante (create_space, create_task, delete_task...) -->
        <template v-else>
            <div class="flex items-center gap-2 text-sm text-(--text)">
                <i :class="icon" class="text-(--primary)"></i>
                <span class="font-medium">Synco AI veut : {{ label }}</span>
                <span v-if="summary" class="text-(--text2) truncate">— {{ summary }}</span>
            </div>
            <div class="flex flex-wrap gap-2">
                <button @click="$emit('accept')" class="primary px-4 py-2 rounded-xl text-sm font-medium">Accepter</button>
                <button @click="$emit('always-accept')" class="default px-4 py-2 rounded-xl text-sm font-medium">
                    Toujours accepter « {{ label }} » (cette session)
                </button>
                <button @click="$emit('reject')" class="danger px-4 py-2 rounded-xl text-sm font-medium">Refuser</button>
            </div>
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

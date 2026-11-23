<template>
    <aside class="flex flex-col h-full w-full max-w-xl bg-(--bg2) text-(--text) border-l border-(--text)/10" aria-label="Visionneuse de fichier">
        <header class="flex items-center gap-2 px-4 py-3 border-b border-(--text)/10">
            <i class="bi shrink-0 text-lg" :class="[info.color, info.icon]" />
            <h3 class="min-w-0 flex-1 truncate font-bold" :title="name">{{ name }}</h3>
            <button type="button" class="p-2 rounded-lg hover:bg-(--text)/10" aria-label="Fermer" @click="emit('close')"><i class="bi bi-x-lg" /></button>
        </header>

        <div v-if="state === 'loading'" class="p-6 text-sm text-(--text2)" aria-busy="true">Déchiffrement…</div>
        <div v-else-if="state === 'error'" class="m-4 rounded-xl bg-(--text)/6 p-4 text-sm"><i class="bi bi-file-earmark-x" /> Fichier illisible sur cet appareil.</div>
        <div v-else class="flex-1 min-h-0 overflow-auto p-4 text-sm leading-relaxed">
            <template v-if="blocks">
                <template v-for="(b, i) in shown" :key="i">
                    <h4 v-if="b.t === 'h'" class="font-bold mt-3 mb-1" :class="b.level === 1 ? 'text-lg' : 'text-base'">{{ b.text }}</h4>
                    <p v-else-if="b.t === 'p'" class="my-2 break-words">{{ b.text }}</p>
                    <ul v-else-if="b.t === 'ul'" class="list-disc pl-5 my-2"><li v-for="(it, j) in b.items" :key="j" class="break-words">{{ it }}</li></ul>
                    <ol v-else-if="b.t === 'ol'" class="list-decimal pl-5 my-2"><li v-for="(it, j) in b.items" :key="j" class="break-words">{{ it }}</li></ol>
                    <blockquote v-else-if="b.t === 'quote'" class="my-2 border-l-4 border-(--text)/20 pl-3 text-(--text2) break-words">{{ b.text }}</blockquote>
                    <pre v-else class="my-2 overflow-x-auto rounded-lg bg-(--text)/6 p-3 text-xs"><code>{{ b.text }}</code></pre>
                </template>
            </template>
            <pre v-else class="whitespace-pre-wrap break-words text-xs">{{ shownText }}</pre>
            <button v-if="hasMore" type="button" class="mt-3 text-(--primary) underline" @click="limit += CHUNK">Afficher la suite</button>
        </div>

        <footer class="px-4 py-3 border-t border-(--text)/10">
            <div class="flex flex-wrap gap-2">
                <button type="button" class="rounded-lg bg-(--text)/8 px-3 py-1.5 text-sm font-medium disabled:opacity-40" :disabled="state !== 'ready'" @click="emit('download')"><i class="bi bi-download" /> Télécharger</button>
                <button type="button" class="rounded-lg bg-(--text)/8 px-3 py-1.5 text-sm font-medium disabled:opacity-40" :disabled="state !== 'ready'" @click="copy"><i class="bi bi-clipboard" /> {{ copied ? 'Copié' : 'Copier' }}</button>
                <button type="button" class="rounded-lg bg-(--primary) text-white px-3 py-1.5 text-sm font-medium disabled:opacity-40" :disabled="state !== 'ready' || offline" :title="offline ? 'Reconnectez-vous pour enregistrer' : ''" @click="emit('save')"><i class="bi bi-folder-plus" /> Enregistrer dans un espace</button>
            </div>
            <p class="mt-2 text-[11px] text-(--text2)">Ce fichier vit dans la conversation, chiffré avec elle, et disparaît quand vous la supprimez. Une copie enregistrée dans un espace suit les règles de l'espace.</p>
        </footer>
    </aside>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { getFileInfo } from '@/assets/utils/getFileIcon';
import { isMarkdownName, parseMarkdown, readVerified, type ArtifactMeta, type ArtifactSource } from './artifactModel';

const CHUNK = 20_000;
const props = defineProps<{ meta: ArtifactMeta; source: ArtifactSource; offline?: boolean }>();
const emit = defineEmits<{ (e: 'close' | 'download' | 'save'): void }>();

const state = ref<'loading' | 'ready' | 'error'>('loading');
const text = ref('');
const limit = ref(CHUNK);
const copied = ref(false);
const name = computed(() => props.meta.name);
const info = computed(() => getFileInfo({ originalName: props.meta.name, mimeType: props.meta.mimeType }));
// Chargement par morceaux : seul le début est rendu, la suite à la demande (fichier long).
const shownText = computed(() => text.value.slice(0, limit.value));
const hasMore = computed(() => text.value.length > limit.value);
const blocks = computed(() => (isMarkdownName(props.meta.name) ? parseMarkdown(shownText.value) : null));
const shown = computed(() => blocks.value ?? []);

watch(() => props.meta.id, async () => {
    state.value = 'loading'; text.value = ''; limit.value = CHUNK;
    try {
        text.value = new TextDecoder('utf-8', { fatal: false }).decode(await readVerified(props.source, props.meta));
        state.value = 'ready';
    } catch { state.value = 'error'; }
}, { immediate: true });

const copy = async () => {
    try { await navigator.clipboard.writeText(text.value); copied.value = true; setTimeout(() => { copied.value = false; }, 1500); } catch { /* presse-papiers refusé */ }
};
</script>

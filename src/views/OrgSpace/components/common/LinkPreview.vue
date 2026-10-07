<template>
    <a
        v-if="preview && hasContent && safeUrl(preview.url)"
        :href="safeUrl(preview.url)!"
        target="_blank"
        rel="noopener noreferrer"
        class="mt-2 flex flex-col w-full max-w-[500px] overflow-hidden rounded-md border border-(--text)/10 bg-black/10 hover:bg-black/15 transition-colors"
    >
        <div class="flex flex-col gap-0.5 p-2.5 min-w-0">
            <span v-if="preview.siteName" class="text-[10px] uppercase tracking-wide text-(--text2)">{{ preview.siteName }}</span>
            <span v-if="preview.title" class="text-sm font-semibold text-(--primary) line-clamp-2">{{ preview.title }}</span>
            <span v-if="preview.description" class="text-xs text-(--text2) line-clamp-2">{{ preview.description }}</span>
        </div>
        <img
            v-if="imageSrc"
            :src="imageSrc"
            loading="lazy"
            decoding="async"
            class="w-full max-h-64 object-cover"
        />
    </a>
    <div v-else-if="loading" class="mt-2 h-16 w-full max-w-[500px] rounded-md bg-(--text)/5 animate-pulse" />
</template>

<script setup lang="ts">
import { computed, watch } from 'vue';
import { useLinkPreview, extractFirstUrl } from '@/composables/useLinkPreview';

const props = defineProps<{
    content: string;
}>();

const { preview, loading, load } = useLinkPreview();

const url = computed(() => extractFirstUrl(props.content));

watch(url, (u) => {
    if (u) load(u);
}, { immediate: true });

const hasContent = computed(() => !!(preview.value?.title || preview.value?.description || preview.value?.image));

// synco_api renvoie toujours un chemin relatif vers son propre proxy
// d'image (routes/linkPreviewImage.ts), jamais l'URL externe directement —
// CSP img-src n'autorise que https://api.synco.one, pas un domaine
// arbitraire. On y préfixe la même base que sfetch.ts.
const imageSrc = computed(() => {
    const img = preview.value?.image;
    if (typeof img !== 'string' || !img.startsWith('/api/link-preview-image?')) return null;
    return `${import.meta.env.VITE_API_URL}${img}`;
});

// Même garde que WebhookEmbed.vue : ne jamais faire confiance au schéma d'une
// URL qui vient d'un tiers (ici, la page distante dont on a parsé les
// balises Open Graph) — seuls http(s) sont autorisés.
const safeUrl = (u: unknown): string | null => {
    if (typeof u !== 'string') return null;
    try {
        const p = new URL(u);
        return p.protocol === 'https:' || p.protocol === 'http:' ? p.href : null;
    } catch { return null; }
};
</script>

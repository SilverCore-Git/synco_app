<template>
    <div v-if="renderedHtml" class="simple-markdown" v-html="renderedHtml" />
</template>

<script setup lang="ts">
/**
 * Rendu markdown minimal pour un texte saisi par un administrateur (motif de
 * bannissement, compte ou organisation) : contrairement à MarkdownRender.vue
 * (OrgSpace/views/), pas de mentions/références/tâches — ce texte ne vit pas
 * dans le contexte d'une organisation ouverte, et peut même s'afficher avant
 * tout accès à l'API (écran de bannissement au lancement).
 *
 * Mêmes bibliothèques, même précaution anti-clobbering (FORBID_ATTR class/
 * style/id) que MarkdownRender.vue : un motif de bannissement reste un texte
 * saisi par un tiers (l'administrateur), jamais par l'utilisateur qui le lit.
 */
import { computed } from 'vue';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

const props = defineProps<{
    content: string | null;
}>();

marked.setOptions({ breaks: true, gfm: true });

const ALLOWED_TAGS = [
    'p', 'br', 'strong', 'em', 'del', 'code', 'pre',
    'ul', 'ol', 'li', 'blockquote', 'a',
];

const renderedHtml = computed(() => {
    const source = props.content?.trim();
    if (!source) return '';

    const rawHtml = marked.parse(source) as string;
    return DOMPurify.sanitize(rawHtml, {
        ALLOWED_TAGS,
        ALLOWED_ATTR: ['href'],
        FORBID_ATTR: ['class', 'style', 'id', 'name'],
        ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
    });
});
</script>

<style scoped>

.simple-markdown {
    contain: layout paint;
    isolation: isolate;
}

.simple-markdown :deep(p) {
    margin-bottom: 0.5rem;
}
.simple-markdown :deep(p:last-child) {
    margin-bottom: 0;
}

.simple-markdown :deep(code) {
    background-color: rgba(255, 255, 255, 0.08);
    padding: 0.15rem 0.35rem;
    border-radius: 4px;
    font-family: monospace;
    font-size: 90%;
}

.simple-markdown :deep(pre) {
    background-color: rgba(0, 0, 0, 0.2);
    padding: 0.6rem;
    border-radius: 8px;
    overflow-x: auto;
    margin: 0.5rem 0;
}

.simple-markdown :deep(pre code) {
    background: none;
    padding: 0;
}

.simple-markdown :deep(a) {
    color: var(--primary, #3b82f6);
    text-decoration: underline;
}

.simple-markdown :deep(ul) {
    list-style-type: disc;
    padding-left: 1.25rem;
    margin-bottom: 0.5rem;
}
.simple-markdown :deep(ol) {
    list-style-type: decimal;
    padding-left: 1.25rem;
    margin-bottom: 0.5rem;
}

.simple-markdown :deep(blockquote) {
    border-left: 3px solid rgba(255, 255, 255, 0.2);
    padding: 0.4rem 0.75rem;
    margin: 0.5rem 0;
    opacity: 0.85;
}

</style>

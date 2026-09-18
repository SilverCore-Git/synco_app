<template>
    <div class="markdown-body text-sm leading-relaxed wrap-break-word" v-html="renderedHtml" />
</template>

<script setup lang="ts">

import { computed } from 'vue';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

const props = withDefaults(defineProps<{
  content: string;
  // 'chat': bulles de message (compact, pas d'images/tableaux). 'document':
  // fichier markdown du file manager (moins restrictif).
  mode?: 'chat' | 'document';
}>(), {
  mode: 'chat'
});

marked.setOptions({
  breaks: true,
  gfm: true,
});

// Register DOMPurify hook once at module level (not per computed evaluation)
DOMPurify.addHook('afterSanitizeAttributes', function(node) {
    if ('target' in node) {
        node.setAttribute('target', '_blank');
        node.setAttribute('rel', 'noopener noreferrer');
    }
    if (node.tagName === 'IMG') {
        node.setAttribute('loading', 'lazy');
        node.setAttribute('decoding', 'async');
    }
});

const CHAT_ALLOWED_TAGS = [
    'p', 'br', 'strong', 'em', 'del', 'code', 'pre',
    'ul', 'ol', 'li', 'blockquote', 'a', 'h1', 'h2', 'h3'
];

// Un document markdown (file manager) a des besoins plus larges qu'un
// message de chat : titres profonds, tableaux, images, séparateurs, cases
// à cocher GFM. Rien qui permette des gestionnaires d'événements ou du CSS.
const DOCUMENT_ALLOWED_TAGS = [
    ...CHAT_ALLOWED_TAGS,
    'h4', 'h5', 'h6', 'hr', 'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'input'
];

const ALLOWED_URI_REGEXP = /^(?:(?:https?|mailto):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i;

const sanitizeOptions = computed(() => props.mode === 'document' ? {
    ALLOWED_TAGS: DOCUMENT_ALLOWED_TAGS,
    ALLOWED_ATTR: ['href', 'target', 'class', 'rel', 'src', 'alt', 'title', 'type', 'checked', 'disabled', 'align'],
    ALLOWED_URI_REGEXP
} : {
    ALLOWED_TAGS: CHAT_ALLOWED_TAGS,
    ALLOWED_ATTR: ['href', 'target', 'class', 'rel'],
    ALLOWED_URI_REGEXP
});

// Simple cache to avoid re-parsing identical markdown content, namespaced by
// mode so a 'chat' render of some text can't be reused for 'document' (and
// vice versa) even if the raw content string happens to match.
const htmlCache = new Map<string, string>();
const MAX_CACHE_SIZE = 200;

const renderedHtml = computed(() => {

    if (!props.content) return '';

    const cacheKey = `${props.mode}:${props.content}`;
    const cached = htmlCache.get(cacheKey);
    if (cached) return cached;

    const rawHtml = marked.parse(props.content) as string;
    const sanitized = DOMPurify.sanitize(rawHtml, sanitizeOptions.value);

    // Evict oldest entries if cache grows too large
    if (htmlCache.size >= MAX_CACHE_SIZE) {
        const firstKey = htmlCache.keys().next().value;
        if (firstKey) htmlCache.delete(firstKey);
    }
    htmlCache.set(cacheKey, sanitized);

    return sanitized;
});

</script>

<style scoped>

.markdown-body :deep(p) {
  margin-bottom: 0.5rem;
}
.markdown-body :deep(p:last-child) {
  margin-bottom: 0;
}

.markdown-body :deep(code:not(pre code)) {
  background-color: rgba(255, 255, 255, 0.08);
  color: #ff79c6;
  padding: 0.2rem 0.4rem;
  border-radius: 4px;
  font-family: monospace;
  font-size: 85%;
}

.markdown-body :deep(pre) {
  background-color: rgba(0, 0, 0, 0.3);
  border: 1px border;
  border-color: rgba(255, 255, 255, 0.05);
  padding: 0.75rem;
  border-radius: 8px;
  overflow-x: auto;
  font-family: monospace;
  margin: 0.5rem 0;
}

.markdown-body :deep(pre code) {
  color: #e2e8f0;
  font-size: 0.875rem;
  background: none;
  padding: 0;
}

.markdown-body :deep(a) {
  color: var(--primary, #3b82f6);
  text-decoration: underline;
}

.markdown-body :deep(ul) {
  list-style-type: disc;
  padding-left: 1.25rem;
  margin-bottom: 0.5rem;
}
.markdown-body :deep(ol) {
  list-style-type: decimal;
  padding-left: 1.25rem;
  margin-bottom: 0.5rem;
}

.markdown-body :deep(blockquote) {
  border-left: 4px solid var(--primary, #3b82f6);
  background-color: rgba(255, 255, 255, 0.03);
  padding: 0.5rem 0.75rem;
  margin: 0.5rem 0;
  color: rgba(255, 255, 255, 0.7);
  border-radius: 0 4px 4px 0;
}

.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3) {
  color: #ffffff;
  font-weight: 800;
  line-height: 1.3;
  margin-top: 1rem;
  margin-bottom: 0.5rem;
}

.markdown-body :deep(h1) {
  font-size: 1.5rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  padding-bottom: 0.3rem;
}

.markdown-body :deep(h2) {
  font-size: 1.25rem;
}

.markdown-body :deep(h3) {
  font-size: 1.1rem;
  color: rgba(255, 255, 255, 0.9);
}

.markdown-body :deep(h1:first-child),
.markdown-body :deep(h2:first-child),
.markdown-body :deep(h3:first-child) {
  margin-top: 0;
}

.markdown-body :deep(h4),
.markdown-body :deep(h5),
.markdown-body :deep(h6) {
  color: rgba(255, 255, 255, 0.9);
  font-weight: 700;
  line-height: 1.3;
  margin-top: 1rem;
  margin-bottom: 0.5rem;
}

.markdown-body :deep(hr) {
  border: none;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  margin: 1rem 0;
}

.markdown-body :deep(img) {
  max-width: 100%;
  border-radius: 8px;
  margin: 0.5rem 0;
}

.markdown-body :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 0.5rem 0;
  font-size: 0.9em;
}

.markdown-body :deep(th),
.markdown-body :deep(td) {
  border: 1px solid rgba(255, 255, 255, 0.1);
  padding: 0.4rem 0.6rem;
  text-align: left;
}

.markdown-body :deep(th) {
  background-color: rgba(255, 255, 255, 0.05);
  font-weight: 700;
}

</style>
<template>

    <div class="relative w-full flex flex-col">
        
        <MentionsList
            :is-open="showMentions"
            :search-query="mentionQuery"
            :users="activeList"
            :active-index="activeMentionIndex"
            :kind="activeTriggerKind ?? 'user'"
            @select="insertMention"
        />

        <textarea 
            ref="textareaRef"
            :value="modelValue"
            @input="onInput"
            :placeholder="placeholder"
            rows="1"
            class="
                bg-transparent border-none outline-none 
                resize-none w-full text-sm text-(--text) 
                placeholder:text-(--text2)
                py-2 pr-8 overflow-hidden
                disabled:cursor-not-allowed disabled:text-white/40
            "
            :disabled="disabled"
            @keydown.enter="handleEnter"
            @keydown="handleKeydown"
        />

    </div>

</template>

<script lang="ts" setup>

import { openedOrg } from '@/assets/var';
import MentionsList from '@/components/common/MentionsList.vue';
import { buildMentionableList, type MentionEntry } from '@/composables/useMentions';
import { TRIGGERS, TRIGGER_QUERY_REGEX, buildReferenceToken, type ReferenceKind } from '@/composables/useReferences';
import sfetch from '@/assets/utils/sfetch';
import { ref, computed, watch, nextTick, onMounted } from 'vue';
import { useRoute } from 'vue-router';

const props = withDefaults(defineProps<{
    modelValue: string;
    placeholder?: string;
    disabled?: boolean;
    // true (chat) : Entrée seule envoie. false (ex. description de tâche,
    // formulaire multi-ligne) : Entrée insère un saut de ligne normal, seul
    // Ctrl/Cmd+Entrée envoie.
    submitOnEnter?: boolean;
    // false quand un autre champ du même formulaire doit garder le focus
    // initial (ex. le titre dans CreateTaskModal) — sans quoi ce composant
    // volerait le focus à l'ouverture, comme le fait le composer de chat.
    autoFocus?: boolean;
}>(), {
    submitOnEnter: true,
    autoFocus: true
});

const emit = defineEmits<{
    (e: 'update:modelValue', value: string): void;
    (e: 'send', value: string): void;
    (e: 'input'): void;
    (e: 'edit-last'): void;
}>();

const route = useRoute();
const textareaRef = ref<HTMLTextAreaElement | null>(null);
// ----------------------------------

const showMentions = ref<boolean>(false);
const mentionQuery = ref<string>('');
const activeMentionIndex = ref<number>(0);
const startMentionIndex = ref<number>(-1);
const activeTriggerKind = ref<ReferenceKind | null>(null);

const mentionableUsers = ref<MentionEntry[]>(buildMentionableList(openedOrg.value?.members));
const searchResults = ref<MentionEntry[]>([]);

watch(() => openedOrg.value?.members, (members) => {
    mentionableUsers.value = buildMentionableList(members);
});

const activeList = computed<MentionEntry[]>(() =>
    activeTriggerKind.value === 'user' || !activeTriggerKind.value ? mentionableUsers.value : searchResults.value
);

let searchDebounceTimer: ReturnType<typeof setTimeout> | undefined;

// #/!/& n'ont pas de liste locale équivalente aux membres du salon — les
// noms sont chiffrés côté serveur (voir mentions.ts), impossible de filtrer
// sans un aller-retour réseau.
const searchRemote = (kind: ReferenceKind, query: string) => {
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(async () => {
        const orgId = route.params.orgId as string | undefined;
        const spaceId = route.params.spaceId as string | undefined;
        if (!orgId) { searchResults.value = []; return; }

        try {
            const params = new URLSearchParams({ q: query, types: kind, orgId });
            if (spaceId) params.set('spaceId', spaceId);
            const res = await sfetch(`/api/mentions/search?${params.toString()}`);
            if (!res.ok) { searchResults.value = []; return; }
            const data = await res.json();
            const entries: { id: string; label: string; subtitle?: string }[] = data[kind] || [];
            searchResults.value = entries.map(e => ({ id: e.id, name: e.label, pseudo: e.subtitle }));
        } catch (err) {
            console.error('[ThreadTextarea] mentions/search failed:', err);
            searchResults.value = [];
        }
    }, 200);
};

const updateMentionState = (text: string, selectionStart: number) => {

    if (text === '') {
        showMentions.value = false;
        return;
    }

    const textBeforeCursor = text.slice(0, selectionStart);
    const mentionMatch = textBeforeCursor.match(TRIGGER_QUERY_REGEX);

    if (mentionMatch)
    {
        const triggerChar = mentionMatch[1]!;
        const kind = TRIGGERS[triggerChar]?.kind ?? 'user';
        showMentions.value = true;
        activeTriggerKind.value = kind;
        mentionQuery.value = mentionMatch[2] || '';
        startMentionIndex.value = textBeforeCursor.lastIndexOf(triggerChar);

        if (kind !== 'user') searchRemote(kind, mentionQuery.value);
    }
    else
    {
        showMentions.value = false;
    }

};

const insertMention = (entry: MentionEntry) => {

    if (startMentionIndex.value === -1) return;

    const text = props.modelValue;
    const beforeMention = text.slice(0, startMentionIndex.value);
    const afterMention = text.slice(textareaRef.value?.selectionStart || 0);

    // @everyone/@here n'ont pas d'id réel derrière (pas une entité, un mot-clé
    // de diffusion) — on garde le texte littéral que l'ancien renderMentions
    // sait déjà résoudre, plutôt qu'un faux token <@:__everyone__>.
    const insertText = entry.special
        ? `@${entry.pseudo}`
        : buildReferenceToken(activeTriggerKind.value ?? 'user', entry.id);

    const updatedValue = `${beforeMention}${insertText} ${afterMention}`;
    emit('update:modelValue', updatedValue);

    showMentions.value = false;
    activeMentionIndex.value = 0;

    nextTick(() => {
        textareaRef.value?.focus();
        adjustHeight();
    });

};

const handleKeydown = (e: KeyboardEvent) => {

    if (e.key === 'ArrowUp' && !showMentions.value && props.modelValue === '') {
        emit('edit-last');
        return;
    }

    if (!showMentions.value) return;

    const query = mentionQuery.value?.toLowerCase() || '';
    // searchResults est déjà filtré côté serveur pour #/!/& — un second
    // filtre client sur un `label` déchiffré serait redondant.
    const filtered = activeTriggerKind.value === 'user' || !activeTriggerKind.value
        ? mentionableUsers.value.filter(u => u.name.toLowerCase().includes(query) || (u.pseudo && u.pseudo.toLowerCase().includes(query)))
        : searchResults.value;

    if (!filtered.length) return;

    if (e.key === 'ArrowDown') 
    {
        e.preventDefault();
        activeMentionIndex.value = (activeMentionIndex.value + 1) % filtered.length;
    } 
    else if (e.key === 'ArrowUp') 
    {
        e.preventDefault();
        activeMentionIndex.value = (activeMentionIndex.value - 1 + filtered.length) % filtered.length;
    } 
    else if (e.key === 'Enter' || e.key === 'Tab') 
    {
        e.preventDefault();
        insertMention(filtered[activeMentionIndex.value]!);
    } 
    else if (e.key === 'Escape') 
    {
        e.preventDefault();
        showMentions.value = false;
    }

};

defineExpose({
  textarea: textareaRef
});

const adjustHeight = () => {
    const textarea = textareaRef.value;
    if (!textarea) return;

    textarea.style.height = 'auto';
    const newHeight = Math.min(textarea.scrollHeight, 200);
    textarea.style.height = `${newHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > 200 ? 'auto' : 'hidden';
};

const onInput = (event: Event) => {
    const target = event.target as HTMLTextAreaElement;
    emit('update:modelValue', target.value);
    emit('input');
    adjustHeight();
    updateMentionState(target.value, target.selectionStart ?? target.value.length);
};

const handleEnter = (event: KeyboardEvent) => {

    if (showMentions.value) return;
    if (event.shiftKey) return;
    // submitOnEnter=false : seule Ctrl/Cmd+Entrée envoie, Entrée seule doit
    // pouvoir insérer un saut de ligne normalement (pas de preventDefault).
    if (!props.submitOnEnter && !event.ctrlKey && !event.metaKey) return;

    event.preventDefault();
    if (props.modelValue.trim() !== '')
    {
        emit('send', props.modelValue);
    }

};

watch(() => props.modelValue, (newVal) => {
    if (newVal === '')
    {
        showMentions.value = false;
        nextTick(() => {
            if (textareaRef.value) {
                textareaRef.value.style.height = 'auto';
                textareaRef.value.style.overflowY = 'hidden';
            }
        });
    }
});

watch(() => route.params.threadId, async () => {
    showMentions.value = false;
    await nextTick();
    textareaRef.value?.focus();
});

onMounted(async () => {
    if (!props.autoFocus) return;
    await nextTick();
    textareaRef.value?.focus();
});

</script>
<template>

    <div class="relative w-full flex flex-col">
        
        <MentionsList
            :is-open="showMentions"
            :search-query="mentionQuery"
            :users="mentionableUsers"
            :active-index="activeMentionIndex"
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
import { buildMentionableList, MENTION_QUERY_REGEX, type MentionEntry } from '@/composables/useMentions';
import { ref, watch, nextTick, onMounted } from 'vue';
import { useRoute } from 'vue-router';

const props = defineProps<{
    modelValue: string;
    placeholder?: string;
    disabled?: boolean;
}>();

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

const mentionableUsers = ref<MentionEntry[]>(buildMentionableList(openedOrg.value?.members));

watch(() => openedOrg.value?.members, (members) => {
    mentionableUsers.value = buildMentionableList(members);
});

const updateMentionState = (text: string, selectionStart: number) => {

    if (text === '') {
        showMentions.value = false;
        return;
    }

    const textBeforeCursor = text.slice(0, selectionStart);
    const mentionMatch = textBeforeCursor.match(MENTION_QUERY_REGEX);

    if (mentionMatch)
    {
        showMentions.value = true;
        mentionQuery.value = mentionMatch[1] || '';
        startMentionIndex.value = textBeforeCursor.lastIndexOf('@');
    }
    else
    {
        showMentions.value = false;
    }

};

const insertMention = (user: MentionEntry) => {

    if (startMentionIndex.value === -1) return;

    const text = props.modelValue;
    const beforeMention = text.slice(0, startMentionIndex.value);
    const afterMention = text.slice(textareaRef.value?.selectionStart || 0);

    const mentionText = user.pseudo ? user.pseudo : user.name.replace(/\s+/g, '');
    const updatedValue = `${beforeMention}@${mentionText} ${afterMention}`;
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
    const filtered = mentionableUsers.value.filter(u =>
        u.name.toLowerCase().includes(query) || (u.pseudo && u.pseudo.toLowerCase().includes(query))
    );

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
    await nextTick();
    textareaRef.value?.focus();
});

</script>
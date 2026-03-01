<template>
    
    <textarea 
        ref="textareaRef"
        :value="modelValue"
        @input="onInput"
        :placeholder="placeholder"
        rows="1"
        class="
            bg-transparent border-none outline-none 
            resize-none w-full text-sm text-(--text) 
            placeholder:text-(--text)/20
            py-2.5 overflow-hidden
        "
        @keydown.enter="handleEnter"
    />

</template>

<script lang="ts" setup>

import { ref, watch, nextTick } from 'vue';

const props = defineProps<{
  modelValue: string;
  placeholder?: string;
}>();

const emit = defineEmits<{
    (e: 'update:modelValue', value: string): void;
    (e: 'send', value: string): void;
}>();

const textareaRef = ref<HTMLTextAreaElement | null>(null);

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
    adjustHeight();
};

const handleEnter = (event: KeyboardEvent) => {

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
        nextTick(() => {
            if (textareaRef.value) {
                textareaRef.value.style.height = 'auto';
                textareaRef.value.style.overflowY = 'hidden';
            }
        });
    }
});

</script>
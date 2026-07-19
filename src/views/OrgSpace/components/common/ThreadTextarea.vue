<template>

    <div class="relative w-full flex flex-col">
        
        <MentionsList
            :is-open="showMentions"
            :search-query="mentionQuery"
            :users="mockWorkspaceUsers"
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
                placeholder:text-(--text)/20
                py-2 pr-8 overflow-hidden
                disabled:cursor-not-allowed disabled:text-white/40
            "
            :disabled="disabled"
            @keydown.enter="handleEnter"
            @keydown="handleKeydown"
        />

        <button 
            type="button"
            @click="toggleDictation"
            class="absolute right-0 bottom-1 text-white/50 transition-colors flex items-center justify-center w-8 h-8 rounded-full"
            :class="isListening ? 'text-red-500 animate-pulse bg-red-500/10' : 'hover:text-(--primary)'"
            title="Dicter un message"
        >
            <i v-if="isProcessing" class="bi bi-arrow-repeat animate-spin text-lg text-(--primary)"></i>
            <i v-else class="bi text-lg" :class="isListening ? 'bi-mic-fill' : 'bi-mic'"></i>
        </button>

        <div v-if="sttIsLoadingModel" class="absolute -top-6 right-0 text-[10px] text-white/50 flex items-center gap-1">
            <i class="bi bi-cloud-download animate-bounce"></i>
            {{ sttLoadingText }}
        </div>

    </div>

</template>

<script lang="ts" setup>

import { openedOrg } from '@/assets/var';
import MentionsList from '@/components/common/MentionsList.vue';
import { ref, watch, nextTick, onMounted, onUnmounted } from 'vue';
import { useRoute } from 'vue-router';
import { useToast } from '@/composables/useToast';
import { sttService, sttIsLoadingModel, sttLoadingText } from '@/services/STTService';

const props = defineProps<{
    modelValue: string;
    placeholder?: string;
    disabled?: boolean;
}>();

const emit = defineEmits<{
    (e: 'update:modelValue', value: string): void;
    (e: 'send', value: string): void;
    (e: 'input'): void;
}>();

const route = useRoute();
const textareaRef = ref<HTMLTextAreaElement | null>(null);
const toast = useToast();

// --- Dictation (Local Whisper STT) ---
const isListening = ref(false);
const isProcessing = ref(false);
let audioContext: AudioContext | null = null;
let mediaStream: MediaStream | null = null;
let scriptProcessor: ScriptProcessorNode | null = null;
let pcmData: Float32Array = new Float32Array(0);
let chunkInterval: any = null;

let baseText = '';

const processChunk = async () => {
    if (pcmData.length === 0 || isProcessing.value) return;
    
    // Copy current pcmData to process
    const audioBuffer = new Float32Array(pcmData);
    
    isProcessing.value = true;
    try {
        const text = await sttService.transcribe(audioBuffer);
        if (text) {
            const currentText = baseText;
            const newText = currentText + (currentText && !currentText.endsWith(' ') ? ' ' : '') + text.trim() + ' ';
            emit('update:modelValue', newText);
            
            nextTick(() => {
                if (textareaRef.value) {
                    textareaRef.value.style.height = 'auto';
                    textareaRef.value.style.height = `${textareaRef.value.scrollHeight}px`;
                }
            });
        }
    } catch (err) {
        console.error("Transcription error:", err);
    } finally {
        isProcessing.value = false;
    }
};

const startRecording = async () => {
    sttService.init();
    
    try {
        mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
        
        const mediaStreamSource = audioContext.createMediaStreamSource(mediaStream);
        scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1);
        
        const dummyGain = audioContext.createGain();
        dummyGain.gain.value = 0;
        
        pcmData = new Float32Array(0);
        baseText = props.modelValue;

        scriptProcessor.onaudioprocess = (e) => {
            if (!isListening.value) return;
            const inputData = e.inputBuffer.getChannelData(0);
            const newData = new Float32Array(pcmData.length + inputData.length);
            newData.set(pcmData);
            newData.set(inputData, pcmData.length);
            pcmData = newData;
        };

        mediaStreamSource.connect(scriptProcessor);
        scriptProcessor.connect(dummyGain);
        dummyGain.connect(audioContext.destination);

        isListening.value = true;
        
        // Start chunk interval (every 1.5s transcribe accumulated data)
        chunkInterval = setInterval(() => {
            if (isListening.value) processChunk();
        }, 1500);

    } catch (err) {
        toast.show("Impossible d'accéder au microphone.", "error");
        console.error(err);
    }
};

const stopRecording = async () => {
    isListening.value = false;
    
    if (chunkInterval) {
        clearInterval(chunkInterval);
        chunkInterval = null;
    }

    if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
        mediaStream = null;
    }
    
    if (scriptProcessor) {
        scriptProcessor.disconnect();
        scriptProcessor = null;
    }
    
    if (audioContext) {
        await audioContext.close();
        audioContext = null;
    }

    // Final transcription
    await processChunk();
    pcmData = new Float32Array(0);
};

const toggleDictation = () => {
    if (isListening.value) {
        stopRecording();
    } else {
        startRecording();
    }
};

onUnmounted(() => {
    if (isListening.value) stopRecording();
});
// ----------------------------------

const showMentions = ref<boolean>(false);
const mentionQuery = ref<string>('');
const activeMentionIndex = ref<number>(0);
const startMentionIndex = ref<number>(-1);

const mockWorkspaceUsers = ref<{ id: string; name: string }[]>(openedOrg.value?.members?.map(m => ({ id: m.userId, name: m.user!.name })) || []);

watch(() => props.modelValue, (text) => {

    if (text === '') {
        showMentions.value = false;
        return;
    }

    const selectionStart = textareaRef.value?.selectionStart || 0;
    const textBeforeCursor = text.slice(0, selectionStart);
    const mentionMatch = textBeforeCursor.match(/(?:^|\s)@(\w*)$/);

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

});

const insertMention = (user: { id: string; name: string }) => {

    if (startMentionIndex.value === -1) return;

    const text = props.modelValue;
    const beforeMention = text.slice(0, startMentionIndex.value);
    const afterMention = text.slice(textareaRef.value?.selectionStart || 0);

    const updatedValue = `${beforeMention}@${user.name} ${afterMention}`;
    emit('update:modelValue', updatedValue);
    
    showMentions.value = false;
    activeMentionIndex.value = 0;
    
    nextTick(() => {
        textareaRef.value?.focus();
        adjustHeight();
    });

};

const handleKeydown = (e: KeyboardEvent) => {
    
    if (!showMentions.value) return;

    const filtered = mockWorkspaceUsers.value.filter(u => 
        u.name.toLowerCase().includes(mentionQuery.value?.toLowerCase() || '')
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
        nextTick(() => {
            if (textareaRef.value) {
                textareaRef.value.style.height = 'auto';
                textareaRef.value.style.overflowY = 'hidden';
            }
        });
    }
});

watch(() => route.params.threadId, async () => {
    await nextTick();
    textareaRef.value?.focus();
});

onMounted(async () => {
    await nextTick();
    textareaRef.value?.focus();
});

</script>
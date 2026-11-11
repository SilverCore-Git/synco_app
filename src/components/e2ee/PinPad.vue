<template>

    <div class="flex flex-col items-center">

        <div class="flex gap-4 mb-8" :class="{ 'shake': shaking }">
            <div v-for="i in length" :key="i"
                class="w-14 h-18 border-2 rounded-2xl flex items-center justify-center transition-all duration-150"
                :class="modelValue.length >= i ? 'border-(--primary) bg-(--primary)/10 scale-105' : 'border-(--border-color) bg-(--text)/5'">
                <div class="w-3 h-3 rounded-full transition-all duration-300"
                    :class="modelValue.length >= i ? 'bg-(--primary)' : 'bg-(--text)/10'" />
            </div>
        </div>

        <div class="grid grid-cols-3 gap-4 max-w-xs w-full">
            <button v-for="num in [1, 2, 3, 4, 5, 6, 7, 8, 9]" :key="num" type="button" :disabled="disabled"
                @click="press(String(num))" class="h-16 default-primary border-none">
                {{ num }}
            </button>
            <button type="button" class="default" :disabled="disabled" @click="emit('update:modelValue', '')">EFFACER</button>
            <button type="button" class="h-16 default-primary border-none" :disabled="disabled" @click="press('0')">0</button>
            <button type="button" class="primary" :disabled="disabled || modelValue.length < length" @click="emit('submit')">
                <span class="font-bold tracking-widest text-lg">OK</span>
            </button>
        </div>

    </div>

</template>

<script setup lang="ts">

import { onMounted, onUnmounted, ref, watch } from 'vue';

/**
 * Pavé de code PIN local (E2EE v4). Le PIN ne quitte jamais l'appareil : il n'ouvre que le coffre
 * local. `autoSubmit` : validation dès le dernier chiffre (déverrouillage) ; jamais pour choisir un
 * PIN, où l'utilisateur doit pouvoir relire avant de valider.
 */
const props = withDefaults(defineProps<{
    modelValue: string;
    length?: number;
    disabled?: boolean;
    autoSubmit?: boolean;
    /** Écoute le clavier physique (un seul pavé actif à la fois). */
    keyboard?: boolean;
    /** Incrémenter pour signaler une erreur (petite secousse). */
    errorTick?: number;
}>(), { length: 4, disabled: false, autoSubmit: false, keyboard: true, errorTick: 0 });

const emit = defineEmits<{ 'update:modelValue': [value: string]; submit: [] }>();

const shaking = ref(false);
watch(() => props.errorTick, () => {
    shaking.value = true;
    setTimeout(() => { shaking.value = false; }, 400);
});

const press = (digit: string) => {
    if (props.disabled || props.modelValue.length >= props.length) return;
    const next = props.modelValue + digit;
    emit('update:modelValue', next);
    if (window.navigator.vibrate) window.navigator.vibrate(10);
    if (props.autoSubmit && next.length === props.length) setTimeout(() => emit('submit'), 50);
};

const onKey = (e: KeyboardEvent) => {
    if (!props.keyboard || props.disabled) return;
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
    if (e.key >= '0' && e.key <= '9') press(e.key);
    else if (e.key === 'Backspace') emit('update:modelValue', props.modelValue.slice(0, -1));
    else if (e.key === 'Enter' && props.modelValue.length === props.length) emit('submit');
};

onMounted(() => window.addEventListener('keydown', onKey));
onUnmounted(() => window.removeEventListener('keydown', onKey));

</script>

<style scoped>
.shake {
    animation: shake 0.35s ease;
}
@keyframes shake {
    0%, 100% { transform: translateX(0); }
    25% { transform: translateX(-8px); }
    75% { transform: translateX(8px); }
}
@media (prefers-reduced-motion: reduce) {
    .shake { animation: none; }
}
</style>

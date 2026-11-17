<template>

    <!-- Ligne de réglage : titre + description à gauche, interrupteur à droite.
         Toute la ligne est le bouton (role="switch"), donc cliquable et
         utilisable au clavier ; le slot `extra` reçoit ce qui dépend du
         réglage (aperçu, sous-choix) sans faire partie de la zone cliquable. -->
    <div class="setting-row" :class="{ 'is-disabled': disabled }">
        <button
            type="button"
            role="switch"
            :aria-checked="modelValue"
            :aria-describedby="description ? descId : undefined"
            :disabled="disabled"
            class="setting-row-hit"
            @click="emit('update:modelValue', !modelValue)"
        >
            <i v-if="icon" :class="icon" class="setting-row-icon" aria-hidden="true" />
            <span class="flex-1 min-w-0 text-left">
                <span class="block font-bold text-(--text)">{{ title }}</span>
                <span v-if="description" :id="descId" class="block text-sm text-(--text2) mt-0.5">{{ description }}</span>
            </span>
            <span class="switch-track" :class="{ on: modelValue }" aria-hidden="true">
                <span class="switch-knob" />
            </span>
        </button>
        <div v-if="$slots.extra" class="setting-row-extra">
            <slot name="extra" />
        </div>
    </div>

</template>

<script setup lang="ts">

import { useId } from 'vue';

defineProps<{
    modelValue: boolean;
    title: string;
    description?: string;
    icon?: string;
    disabled?: boolean;
}>();

const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>();
const descId = useId();

</script>

<style scoped>

.setting-row + .setting-row {
    border-top: 1px solid var(--border-color);
}

.setting-row-hit {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 16px 20px;
    background: transparent;
    border: none;
    cursor: pointer;
    transition: background-color .15s ease;
}
.setting-row-hit:hover:not(:disabled) {
    background: color-mix(in srgb, var(--text) 4%, transparent);
}
.setting-row-hit:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: -2px;
    border-radius: inherit;
}
.setting-row-hit:disabled {
    cursor: not-allowed;
}
.is-disabled .setting-row-hit > span:not(.switch-track) {
    opacity: .6;
}

.setting-row-icon {
    font-size: 1.1rem;
    color: var(--text2);
    width: 20px;
    text-align: center;
    flex: none;
}

.setting-row-extra {
    padding: 0 20px 16px 54px;
}

/* Interrupteur : vert Synco quand actif, le rond glisse avec un léger rebond. */
.switch-track {
    flex: none;
    position: relative;
    width: 44px;
    height: 24px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--text) 18%, transparent);
    transition: background-color .2s ease;
}
.switch-track.on {
    background: var(--primary);
}
.switch-knob {
    position: absolute;
    top: 3px;
    left: 3px;
    width: 18px;
    height: 18px;
    border-radius: 999px;
    background: #fff;
    transition: transform .22s cubic-bezier(.3, 1.4, .5, 1);
}
.switch-track.on .switch-knob {
    transform: translateX(20px);
}

:global(html.motion-off) .switch-knob,
:global(html.motion-off) .switch-track {
    transition: none;
}

@media (max-width: 640px) {
    .setting-row-hit { padding: 14px 16px; }
    .setting-row-extra { padding: 0 16px 14px 16px; }
}

</style>

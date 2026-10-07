<template>

    <div
        ref="rootRef"
        class="group relative"
        :style="{ '--glow-rgb': glowRgb }"
        @mouseenter="onMouseEnter"
        @mouseleave="hovering = false"
    >

        <button
            @click="$emit('click')"
            :aria-label="label"
            class="
                relative flex items-center justify-center
                w-12 h-12 cursor-pointer transition-all duration-300 ease-out
                bg-(--bg2)/50 rounded-xl overflow-hidden
            "
            :class="[
                inVoice ? 'border-green-500 border-2' : (active ? 'border-(--primary)/50 border-2' : 'border-(--text)/10 border'),
                redhover ? 'hover:border-red-500/50' : 'hover:border-(--primary)/50'
            ]"
            :style="[
                inVoice ? 'box-shadow: 0 0 12px 2px rgba(34,197,94,0.5)' : (active ? 'box-shadow: 0 0 10px 2px var(--primary-dark)' : '')
            ]"
        >

            <div
                class="
                    absolute inset-0
                    opacity-0 group-hover:opacity-10
                    transition-opacity
                "
                :style="{ backgroundColor: 'rgb(var(--glow-rgb))' }"
            />

            <img
                v-if="icon && icon.includes('data:')"
                :src="icon"
                :alt="label"
                class="
                     rounded-md object-cover
                    group-active:scale-50 group-hover:scale-110
                    transition-all duration-300 ease-out
                "
            />

            <i
                v-else-if="icon"
                class="
                    bi text-[28px] relative z-10
                    group-active:scale-50 group-hover:scale-110
                    transition-all duration-300 ease-out
                "
                :class="[
                    active && iconFillOnActive ? icon + '-fill' : icon,
                    active ? 'text-(--primary)' : 'text-(--text)',
                    redhover ? 'group-hover:text-red-500' : 'group-hover:text-(--primary)'
                ]"
            />

            <div v-else class="w-full h-full bg-(--bg) flex items-center justify-center group-hover:scale-110 group-active:scale-50 transition-all duration-300 ease-out ">
                <span class="text-xl font-black text-(--primary)">{{ label.substring(0, 2).toUpperCase() }}</span>
            </div>

        </button>

        <div v-if="hasUnread" class="absolute top-0 right-0 w-3 h-3 bg-red-500 rounded-full border-2 border-(--bg) z-20"></div>

        <div
            v-if="muted"
            class="absolute bottom-0 left-0 w-5 h-5 bg-(--bg2) rounded-full border-2 border-(--bg) z-20 flex items-center justify-center"
            title="Notifications désactivées"
        >
            <i class="bi bi-bell-slash-fill text-(--text2) text-[9px]" />
        </div>

        <div
            v-if="inVoice"
            class="absolute bottom-0 right-0 w-5 h-5 bg-green-500 rounded-full border-2 border-(--bg) z-20 flex items-center justify-center"
            title="En vocal"
        >
            <i class="bi bi-mic-fill text-white text-[9px]" />
        </div>

        <!-- Teleporté sur <body> : SpaceBar.vue liste ces boutons dans un
             `ul` en overflow-y-auto, qui clippe tout descendant positionné en
             absolu dépassant la largeur de la sidebar (overflow-y non
             'visible' force overflow-x à se comporter comme 'auto' — CSS
             Overflow Module) — le tooltip était donc invisible, pas
             seulement mal empilé. Même pattern que DropDown.vue : on
             recalcule sa position depuis le bouton et on le sort du flux
             clippé plutôt que de jouer sur z-index, qui n'aurait rien changé
             au clipping. `--glow-rgb` est redéfini ici car Teleport déplace
             le nœud hors de son parent dans le DOM réel : il n'hérite plus
             de la valeur posée sur `rootRef`. -->
        <Teleport to="body">
            <div
                v-if="hovering"
                class="fixed z-[1000] pointer-events-none"
                :style="{ ...tooltipPosition, '--glow-rgb': glowRgb }"
            >
                <span
                    class="
                        bg-(--bg2) text-(--text) text-xs font-bold
                        px-3 py-1.5 rounded-lg border relative
                        shadow-xl shadow-black/50 whitespace-nowrap
                        animate-silver-load
                    "
                    :style="{ borderColor: 'rgba(var(--glow-rgb), 0.3)' }"
                >
                    {{ label }}

                    <div
                        class="
                            absolute -left-1 top-1/2
                            -translate-y-1/2 w-2 h-2
                            border-l border-b
                            rotate-45 bg-(--bg2)
                        "
                        :style="{ borderColor: 'rgba(var(--glow-rgb), 0.3)' }"
                    />

                </span>

            </div>
        </Teleport>

    </div>

</template>

<script lang="ts" setup>

import { ref, computed, watch } from 'vue';
import { getAverageColor, hexToRgb } from '@/assets/utils/getAverageColor';

const props = defineProps<{
    icon: string; // bi | http
    label: string;
    active?: boolean;
    iconFillOnActive?: boolean;
    redhover?: boolean;
    inVoice?: boolean;
    hasUnread?: boolean;
    muted?: boolean;
}>();

defineEmits<{
    (e: 'click'): void;
}>();

// Couleur tampon de l'image du space (même principe que les bannières
// utilisateur, cf. UserDropDown.vue) : teinte le halo au survol, l'overlay
// et le tooltip. `null` pour les boutons sans image (icônes bi-*, logo
// absent) : --glow-rgb retombe alors sur --primary-rgb, le rendu d'avant.
const dominantRgb = ref<string | null>(null);

watch(() => props.icon, async (icon) => {
    dominantRgb.value = icon && icon.includes('data:') ? hexToRgb(await getAverageColor(icon)) : null;
}, { immediate: true });

const glowRgb = computed(() => {
    if (props.redhover) return '239, 68, 68'; // red-500, cf. classes hover existantes
    return dominantRgb.value || 'var(--primary-rgb)';
});

const rootRef = ref<HTMLElement | null>(null);
const hovering = ref(false);
const tooltipPosition = ref<Record<string, string>>({});

const onMouseEnter = () => {
    hovering.value = true;
    if (!rootRef.value) return;
    const rect = rootRef.value.getBoundingClientRect();
    tooltipPosition.value = {
        top: `${rect.top + rect.height / 2}px`,
        left: `${rect.right + 8}px`,
        transform: 'translateY(-50%)'
    };
};

</script>

<style scoped>

button:hover {
  box-shadow: 0 0 15px -3px rgba(var(--glow-rgb), 0.2);
}

.animate-silver-load {
  animation: silver-bounce 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}

</style>

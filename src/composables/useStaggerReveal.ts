import { onBeforeUnmount, onMounted, ref } from 'vue';

/**
 * Fenêtre de l'apparition échelonnée (style.css, « Apparition échelonnée ») : vrai au montage, faux après
 * `durationMs`. À poser en classe `.stagger-reveal` sur la racine de l'écran. Passé ce délai, ce qui s'ajoute
 * (nouveau message, nouveau salon) apparaît sans animation d'entrée. La durée couvre le dernier élément :
 * 3 zones × 70 ms + 100 ms + 40 rangs au plus × 28 ms + 450 ms ≈ 1,9 s.
 */
export function useStaggerReveal(durationMs = 2000) {
    const revealing = ref(false);
    let timer: ReturnType<typeof setTimeout> | undefined;
    onMounted(() => {
        revealing.value = true;
        timer = setTimeout(() => { revealing.value = false; }, durationMs);
    });
    onBeforeUnmount(() => clearTimeout(timer));
    return revealing;
}

import { computed, ref } from 'vue';
import useSettingsItem from '@/composables/useSettingsItem';

/**
 * Animations de Synco : un seul interrupteur pour toute l'app.
 *
 * - `animations`        : réglage de l'utilisateur (Paramètres › Apparence),
 *                         synchronisé avec son compte. true par défaut.
 * - `systemReduced`     : l'OS demande de réduire les animations
 *                         (prefers-reduced-motion), suivi en direct.
 * - `animationsEnabled` : ce qu'un composant doit consulter avant d'animer.
 *
 * App.vue reflète aussi l'état sur <html> (classe `motion-off`) pour que les
 * animations CSS puissent être coupées globalement.
 */

const mql = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null;
const systemReduced = ref<boolean>(mql ? mql.matches : false);
mql?.addEventListener('change', (e) => { systemReduced.value = e.matches; });

export default function useMotion() {
    const { Item: animations } = useSettingsItem('animations', true);
    // Tant que le réglage n'est pas chargé (undefined), on anime.
    const animationsEnabled = computed(() => animations.value !== false && !systemReduced.value);
    return { animations, animationsEnabled, systemReduced };
}

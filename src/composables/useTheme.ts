import { computed, ref } from 'vue';
import useSettingsItem from '@/composables/useSettingsItem';

export type ThemeSetting = 'auto' | 'light' | 'dark';

// Thème de l'OS (prefers-color-scheme), suivi en direct : un changement du réglage système
// (ou le passage automatique jour/nuit) est répercuté sans recharger l'app.
const mql = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null;
const systemDark = ref<boolean>(mql ? mql.matches : true);
mql?.addEventListener('change', (e) => { systemDark.value = e.matches; });

/**
 * `theme`         : réglage choisi par l'utilisateur ('auto' | 'light' | 'dark'), persisté.
 * `resolvedTheme` : thème réellement appliqué ('light' | 'dark'), 'auto' suivant l'OS.
 */
export default function useTheme() {
    const { Item: theme } = useSettingsItem('theme', 'auto');
    const resolvedTheme = computed<'light' | 'dark'>(() => {
        const t = theme.value;
        if (t === 'light' || t === 'dark') return t;
        return systemDark.value ? 'dark' : 'light';
    });
    return { theme, resolvedTheme };
}

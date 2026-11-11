import { Capacitor, registerPlugin } from '@capacitor/core';

interface AppChromePlugin {
    setColors(options: { color: string; dark: boolean }): Promise<void>;
}

// Plugin natif local (android/app/src/main/java/fr/silvercore/synco/AppChromePlugin.java).
const AppChrome = registerPlugin<AppChromePlugin>('AppChrome');

/**
 * Android : barre d'état et barre de navigation au fond de l'app (--bg du thème appliqué sur <body>), icônes
 * claires en thème sombre et sombres en thème clair. À appeler après avoir posé la classe du thème.
 */
export function syncSystemBars(theme: 'light' | 'dark'): void {
    if (Capacitor.getPlatform() !== 'android') return;
    const color = getComputedStyle(document.body).getPropertyValue('--bg').trim();
    if (!color) return;
    AppChrome.setColors({ color, dark: theme === 'dark' }).catch((e) => console.warn('[systemBars]', e));
}

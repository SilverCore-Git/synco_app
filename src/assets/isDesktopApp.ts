// Vrai dans l'app de bureau Tauri (fenêtre sans décorations natives : la barre de titre est topBar.vue,
// et les layouts arrondissent leur coin supérieur sous cette barre). Faux dans le navigateur et dans
// l'app mobile (Capacitor), qui n'injectent pas __TAURI_INTERNALS__.
export default function isDesktopApp(): boolean
{
    return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

// macOS garde ses boutons natifs (feu tricolore) en surimpression sur topBar.vue
// (tauri.macos.conf.json : titleBarStyle Overlay) : la barre leur laisse la place à gauche.
export function isMacDesktop(): boolean
{
    return isDesktopApp() && /Mac/i.test(navigator.platform || navigator.userAgent);
}

/**
 * État affiché sur une barre réduite du dock (C3 §1.1) et sur la bulle de notification (PC80).
 * Texte fixe, jamais celui du runtime.
 */
import type { LinkState } from '@/services/aiRuntime/conversation/connection';

export type BarTone = 'busy' | 'attention' | 'done' | 'error' | 'idle';

export interface BarState { label: string; tone: BarTone; /** Anneau ou point animé. */ live: boolean; /** Bordure ambre. */ amber: boolean }

export type WaitKind = 'confirmation' | 'question' | 'upload' | 'key';

/** Ce que la conversation attend de l'utilisateur, ou null. */
export function waitKind(status: string | null | undefined): WaitKind | null {
    switch (status) {
        case 'awaiting_confirmation': return 'confirmation';
        case 'awaiting_user':
        case 'awaiting_input': return 'question';
        case 'awaiting_upload': return 'upload';
        case 'awaiting_key': return 'key';
        default: return null;
    }
}

/** Seules la confirmation et la question méritent une bulle (PC80) ; la clé et le fichier se règlent dans la conversation. */
export function nudgeLabel(kind: WaitKind): string | null {
    if (kind === 'confirmation') return 'Une action à valider';
    if (kind === 'question') return 'Une question pour vous';
    return null;
}

export function barState(status: string | null | undefined, link?: LinkState): BarState {
    if (link === 'offline' || link === 'refused') return { label: 'Runtime injoignable', tone: 'error', live: false, amber: false };
    const wait = waitKind(status);
    if (wait === 'confirmation') return { label: 'Une action à valider', tone: 'attention', live: false, amber: true };
    if (wait === 'question') return { label: 'Une question pour vous', tone: 'attention', live: false, amber: true };
    if (wait === 'upload') return { label: 'Fichier attendu', tone: 'attention', live: false, amber: true };
    if (wait === 'key') return { label: 'Clé manquante', tone: 'error', live: false, amber: true };
    switch (status) {
        case 'queued': return { label: 'En attente', tone: 'busy', live: true, amber: false };
        case 'running': return { label: 'Travaille…', tone: 'busy', live: true, amber: false };
        case 'failed': return { label: 'Échec · réessayer', tone: 'error', live: false, amber: false };
        case 'cancelled': return { label: 'Annulé', tone: 'idle', live: false, amber: false };
        case 'idle': return { label: 'Terminé', tone: 'done', live: false, amber: false };
        default: return { label: 'Prête', tone: 'idle', live: false, amber: false };
    }
}

export const regimeLabel = (regime: string | null | undefined): string => (regime === 'runtime' ? 'Runtime' : 'Appareil');

/**
 * Raccourci Ctrl/Cmd+J. Vérifié dans l'app : aucun champ de saisie ni éditeur n'y lie Ctrl+J
 * (seul useDesktopCallPopup.ts écoute Ctrl+Alt+J, que ce raccourci ignore). On ne vole la touche que
 * si personne ne l'a déjà prise : évènement déjà géré, éditeur de code ou de texte riche, ou
 * élément marqué `data-no-agent-shortcut`.
 */
export type ShortcutAction = 'toggle' | 'ignore';

export interface ShortcutEventLike {
    key: string;
    ctrlKey: boolean;
    metaKey: boolean;
    altKey: boolean;
    shiftKey: boolean;
    defaultPrevented: boolean;
    isComposing?: boolean;
    repeat?: boolean;
}

interface TargetLike { closest?(selector: string): unknown; isContentEditable?: boolean }

const OWNED_BY_EDITOR = '.cm-editor, .monaco-editor, .ProseMirror, [data-no-agent-shortcut]';

export function agentShortcutAction(e: ShortcutEventLike, target: unknown): ShortcutAction {
    if (e.key.toLowerCase() !== 'j') return 'ignore';
    if (!(e.ctrlKey || e.metaKey) || (e.ctrlKey && e.metaKey) || e.altKey || e.shiftKey) return 'ignore';
    if (e.defaultPrevented || e.isComposing || e.repeat) return 'ignore';
    const t = (target && typeof target === 'object' ? target : null) as TargetLike | null;
    if (t?.isContentEditable) return 'ignore';
    if (typeof t?.closest === 'function' && t.closest(OWNED_BY_EDITOR)) return 'ignore';
    return 'toggle';
}

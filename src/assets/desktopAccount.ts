/**
 * Dernier compte ouvert dans l'application de bureau, pour l'accueillir par son prénom à l'écran de connexion
 * (« Bon retour, Mark »). Seul le prénom est gardé : ni e-mail, ni identifiant, ni jeton. Il survit à la
 * déconnexion (c'est son rôle) et s'efface par « Ce n'est pas vous ? ».
 */
const KEY = 'synco.desktopAccount';
const MAX_LENGTH = 40;

export function lastDesktopAccount(): string | null {
    try {
        const raw = localStorage.getItem(KEY);
        const name = raw ? (JSON.parse(raw) as { firstName?: unknown }).firstName : null;
        return typeof name === 'string' && name.trim() ? name.trim().slice(0, MAX_LENGTH) : null;
    } catch {
        return null;
    }
}

/** Prénom, ou à défaut le premier mot du nom affiché. */
export function rememberDesktopAccount(user: { firstName?: string; name?: string } | null | undefined): void {
    const firstName = (user?.firstName || user?.name?.split(/\s+/)[0] || '').trim().slice(0, MAX_LENGTH);
    if (!firstName) return;
    try { localStorage.setItem(KEY, JSON.stringify({ firstName })); } catch { /* stockage indisponible */ }
}

export function forgetDesktopAccount(): void {
    try { localStorage.removeItem(KEY); } catch { /* idem */ }
}

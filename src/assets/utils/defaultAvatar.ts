// Avatar par défaut généré localement, en initiales sur fond de couleur. Les
// 57 appels directs à ui-avatars.com envoyaient le nom complet de chaque
// membre/webhook affiché, avec l'IP et l'empreinte navigateur de
// l'utilisateur, à ce service tiers à chaque affichage d'une liste de
// membres — fuite passive de métadonnées (annuaire des organisations
// clientes) vers un sous-traitant non déclaré (audit FX8).
const cache = new Map<string, string>();

export function defaultAvatar(name: string | null | undefined, bg: string = '#128a60'): string {
    const label = (name ?? '?').trim();
    const key = `${label}|${bg}`;
    const hit = cache.get(key);
    if (hit) return hit;

    const initials = label.split(/\s+/).filter(Boolean).slice(0, 2)
        .map((w) => [...w][0]!.toUpperCase()).join('') || '?';
    // Échappé : un nom contenant & < > " ' ne doit jamais casser le SVG
    // (ou pire, y injecter du balisage — même si un <img> n'exécute rien).
    const esc = initials.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">`
        + `<rect width="64" height="64" fill="${bg}"/>`
        + `<text x="50%" y="50%" dy=".35em" text-anchor="middle" font-family="sans-serif" font-size="26" fill="#fff">${esc}</text></svg>`;
    const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    cache.set(key, url);
    return url;
}

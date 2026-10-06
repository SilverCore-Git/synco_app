// Garde-fou côté client pour useLinkPreview.ts : un lien collé dans un
// message est une URL tierce arbitraire, et le fetch qu'on en fait part
// automatiquement, sans clic, dès l'affichage du message (cf. revue de
// sécurité). Sans ça, un lien pointant vers une IP privée/locale (réseau
// de l'utilisateur, service interne sans authentification) serait requêté
// par son propre navigateur à son insu — un CSRF-like côté client.
//
// Contrairement à synco_api/src/utils/ssrfGuard.ts, on n'a ici ni `dns` ni
// `net.BlockList` : seules les IP littérales et les noms d'hôtes évidents
// (localhost, .local, .internal) sont détectables avant la requête. Un nom
// public qui résout en DNS vers une IP privée (rebinding) n'est pas
// détectable depuis le JS du navigateur — limite assumée, pas une garantie
// complète comme côté serveur.
function ipv4ToInt(a: number, b: number, c: number, d: number): number {
    return ((a << 24) | (b << 16) | (c << 8) | d) >>> 0;
}

const IPV4_BLOCKS: ReadonlyArray<readonly [string, number]> = [
    ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
    ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
    ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 3],
];

function isPrivateIPv4(ip: string): boolean {
    const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (!m) return false;
    const parts = m.slice(1).map(Number);
    if (parts.some((p) => p > 255)) return false;
    const addr = ipv4ToInt(parts[0], parts[1], parts[2], parts[3]);
    return IPV4_BLOCKS.some(([net, prefix]) => {
        const netMatch = net.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/)!;
        const netParts = netMatch.slice(1).map(Number);
        const netAddr = ipv4ToInt(netParts[0], netParts[1], netParts[2], netParts[3]);
        const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
        return (addr & mask) === (netAddr & mask);
    });
}

function isPrivateIPv6(ip: string): boolean {
    const lower = ip.toLowerCase();
    if (lower === '::1' || lower === '::') return true;
    // IPv4-mapped (::ffff:a.b.c.d) : reclasser sous les règles IPv4.
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIPv4(mapped[1]);
    // Link-local (fe80::/10, soit fe80: à febf:), ULA (fc00::/7, soit fc00: à fdff:).
    if (/^fe[89ab][0-9a-f]:/.test(lower)) return true;
    if (/^f[cd][0-9a-f]{2}:/.test(lower)) return true;
    return false;
}

export function isPrivateOrLocalHostname(hostname: string): boolean {
    const h = hostname.toLowerCase();
    if (h === 'localhost' || h.endsWith('.localhost')) return true;
    if (h.endsWith('.local') || h.endsWith('.internal')) return true;
    if (isPrivateIPv4(h)) return true;
    if (h.includes(':') && isPrivateIPv6(h)) return true;
    return false;
}

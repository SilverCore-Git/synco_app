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
// complète comme côté serveur. Les plages IPv4/IPv6 bloquées ci-dessous sont
// délibérément les mêmes que ssrfGuard.ts (BLOCKED_IPV4/BLOCKED_IPV6) : un
// jeu de règles plus restreint ici créerait un contournement trivial — coller
// un lien que le serveur refuserait mais que le client fetch quand même.

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
        const netParts = net.split('.').map(Number);
        const netAddr = ipv4ToInt(netParts[0], netParts[1], netParts[2], netParts[3]);
        const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
        return (addr & mask) === (netAddr & mask);
    });
}

// Parse une adresse IPv6 (compression "::" et IPv4 imbriquée comprises, ex.
// "64:ff9b::192.168.1.1") en un entier 128 bits. BigInt plutôt que 8 groupes
// séparés : simplifie le masquage par préfixe ci-dessous à un AND unique.
function parseIPv6(ip: string): bigint | null {
    if (ip === '' || ip.split('::').length > 2) return null;

    const sides = ip.split('::');
    const splitSide = (side: string): string[] => (side.length ? side.split(':') : []);
    let head = splitSide(sides[0]);
    let tail = sides.length === 2 ? splitSide(sides[1]) : [];

    // IPv4 imbriquée dans le dernier groupe (::192.168.1.1, 64:ff9b::192.168.1.1...).
    const tailEnd = (sides.length === 2 ? tail : head).slice(-1)[0];
    if (tailEnd && tailEnd.includes('.')) {
        const v4 = tailEnd.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
        if (!v4) return null;
        const nums = v4.slice(1).map(Number);
        if (nums.some((n) => n > 255)) return null;
        const hiHex = ((nums[0] << 8) | nums[1]).toString(16);
        const loHex = ((nums[2] << 8) | nums[3]).toString(16);
        if (sides.length === 2) tail = [...tail.slice(0, -1), hiHex, loHex];
        else head = [...head.slice(0, -1), hiHex, loHex];
    }

    let groups: string[];
    if (sides.length === 2) {
        const missing = 8 - (head.length + tail.length);
        if (missing < 0) return null;
        groups = [...head, ...new Array(missing).fill('0'), ...tail];
    } else {
        if (head.length !== 8) return null;
        groups = head;
    }
    if (groups.length !== 8) return null;

    let value = 0n;
    for (const g of groups) {
        if (!/^[0-9a-f]{1,4}$/i.test(g)) return null;
        value = (value << 16n) | BigInt(parseInt(g, 16));
    }
    return value;
}

// Mêmes plages que BLOCKED_IPV6 dans ssrfGuard.ts : loopback/non spécifiée,
// IPv4-compatible obsolète (::/96), NAT64 (64:ff9b::/96 et 64:ff9b:1::/48 —
// une passerelle NAT64 traduit 64:ff9b::a9fe:a9fe vers 169.254.169.254),
// discard-only (100::/64), documentation (2001:db8::/32), 6to4 (2002::/16,
// encapsule une IPv4 arbitraire dans les 32 bits suivants), ULA (fc00::/7),
// link-local (fe80::/10), multicast (ff00::/8).
const IPV6_BLOCKS: ReadonlyArray<readonly [string, number]> = [
    ['::', 128], ['::1', 128], ['::', 96], ['64:ff9b::', 96],
    ['64:ff9b:1::', 48], ['100::', 64], ['2001:db8::', 32], ['2002::', 16], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8],
];

function isPrivateIPv6(ip: string): boolean {
    // IPv4-mappée (::ffff:a.b.c.d) : reclasser sous les règles IPv4 — sinon un
    // hôte qui ne résout qu'en IPv4-mappée contourne IPV4_BLOCKS.
    const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIPv4(mapped[1]);

    const addr = parseIPv6(ip);
    // Forme IPv6 inattendue/invalide : fail-closed, comme ssrfGuard.ts.
    if (addr === null) return true;

    return IPV6_BLOCKS.some(([net, prefix]) => {
        const netAddr = parseIPv6(net);
        if (netAddr === null) return false;
        const shift = BigInt(128 - prefix);
        const mask = prefix === 0 ? 0n : (((1n << 128n) - 1n) >> shift) << shift;
        return (addr & mask) === (netAddr & mask);
    });
}

export function isPrivateOrLocalHostname(hostname: string): boolean {
    let h = hostname.toLowerCase();
    // URL.hostname porte les crochets d'un hôte IPv6 littéral (ex. "[::1]") —
    // sans ce retrait, aucune comparaison IPv6 ci-dessous ne matchait jamais
    // et toute adresse IPv6, loopback inclus, passait intacte.
    if (h.startsWith('[') && h.endsWith(']')) h = h.slice(1, -1);

    if (h === 'localhost' || h.endsWith('.localhost')) return true;
    if (h.endsWith('.local') || h.endsWith('.internal')) return true;
    if (isPrivateIPv4(h)) return true;
    if (h.includes(':')) return isPrivateIPv6(h);
    return false;
}

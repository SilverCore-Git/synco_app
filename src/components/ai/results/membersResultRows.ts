/**
 * Lignes affichées pour le résultat d'un outil du domaine `members` (L15d). Pur, sans Vue : le texte
 * (noms, rôles, adresses) vient de tiers, il n'est jamais rendu en HTML par le composant.
 */

export interface MemberRow {
    key: string;
    icon?: string;
    avatarUrl?: string;
    title: string;
    subtitle?: string;
    /** Identifiant d'utilisateur : ouvre la conversation privée. */
    userId?: string;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const rec = (v: unknown): Record<string, unknown> => (v !== null && typeof v === 'object' ? (v as Record<string, unknown>) : {});
const list = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter((x) => x !== null && typeof x === 'object') as Record<string, unknown>[] : []);

const expiry = (iso: unknown): string => {
    const t = typeof iso === 'string' ? Date.parse(iso) : NaN;
    return Number.isNaN(t) ? 'sans expiration' : `expire le ${new Date(t).toLocaleDateString('fr-FR')}`;
};

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

const memberRow = (m: Record<string, unknown>, subtitle?: string): MemberRow => ({
    key: str(m.userId) || str(m.id),
    avatarUrl: str(m.avatarUrl) || undefined,
    title: str(m.name) || str(m.pseudo) || 'Membre',
    subtitle: subtitle ?? (str(m.pseudo) || undefined),
    userId: str(m.userId) || str(m.id) || undefined,
});

/** Texte seul de confirmation pour les outils qui ne rendent pas une liste. */
export function membersSummary(name: string, result: unknown): string | null {
    const r = rec(result);
    switch (name) {
        case 'update_org': return `Organisation mise à jour : ${str(r.name)}`;
        case 'remove_member': return 'Membre exclu de l\'organisation';
        case 'revoke_org_invite': return 'Invitation révoquée';
        case 'create_role': return `Rôle créé : ${str(r.name)}`;
        case 'update_role': return `Rôle modifié : ${str(r.name)}`;
        case 'reorder_roles': return 'Hiérarchie des rôles mise à jour';
        case 'delete_role': return 'Rôle supprimé';
        case 'add_role_member': return plural(Array.isArray(r.assigned) ? r.assigned.length : 0, 'membre a reçu le rôle', 'membres ont reçu le rôle');
        case 'remove_role_member': return plural(Array.isArray(r.removed) ? r.removed.length : 0, 'membre a perdu le rôle', 'membres ont perdu le rôle');
        case 'set_member_role': return 'Rôle du membre mis à jour';
        case 'set_permissions': return plural(typeof r.overrideCount === 'number' ? r.overrideCount : 0, 'surcharge enregistrée', 'surcharges enregistrées');
        case 'create_org_invite_link': return `Lien créé — à copier dans Paramètres > Invitations (${expiry(r.expiresAt)})`;
        case 'get_my_permissions': {
            const perms = rec(r.permissions);
            const granted = Object.values(perms).filter((v) => v === true).length;
            return `${granted} permission${granted > 1 ? 's' : ''} sur ${Object.keys(perms).length}`;
        }
        default: return null;
    }
}

/** Résultats d'envoi d'e-mails d'invitation, un par adresse. */
export function inviteEmailRows(result: unknown): MemberRow[] {
    return list(rec(result).results).map((r) => ({
        key: str(r.email),
        icon: r.status === 'sent' ? 'bi-envelope-check' : 'bi-envelope-exclamation',
        title: str(r.email),
        subtitle: r.status === 'sent' ? 'Invitation envoyée' : (str(r.reason) || 'Échec'),
    }));
}

/** Lignes d'un résultat de lecture ; tableau vide si l'outil n'a pas de liste. */
export function membersRows(name: string, result: unknown): MemberRow[] {
    switch (name) {
        case 'list_members': return list(result).map((m) => memberRow(m));
        case 'list_role_members': return list(rec(result).members).map((m) => memberRow(m));
        case 'get_member': {
            const m = rec(result);
            if (!m.id) return [];
            const roles = list(m.roles).map((r) => str(r.name)).filter(Boolean).join(', ');
            return [memberRow(m, [str(m.job), roles].filter(Boolean).join(' · ') || undefined)];
        }
        case 'get_org': {
            const o = rec(result);
            if (!o.id) return [];
            return [{ key: str(o.id), icon: 'bi-building', title: str(o.name) || 'Organisation', subtitle: `${plural(Number(o.memberCount) || 0, 'membre', 'membres')} sur ${Number(o.memberLimit) || 0}` }];
        }
        case 'list_my_orgs': return list(result).map((o) => ({ key: str(o.id), icon: 'bi-building', title: str(o.name) || 'Organisation' }));
        case 'list_roles': return list(result).map((r) => ({
            key: str(r.id), icon: 'bi-shield-lock', title: str(r.name), subtitle: plural(Number(r.memberCount) || 0, 'membre', 'membres'),
        }));
        case 'list_org_invites': return list(rec(result).invites).map((i) => ({
            key: str(i.id),
            icon: i.kind === 'email' ? 'bi-envelope' : 'bi-link-45deg',
            title: i.kind === 'email' ? (str(i.email) || 'Invitation par e-mail') : 'Lien d\'invitation',
            subtitle: `${expiry(i.expiresAt)} · ${Number(i.uses) || 0}${i.maxUses ? `/${Number(i.maxUses)}` : ''} utilisation${(Number(i.uses) || 0) > 1 ? 's' : ''}`,
        }));
        case 'get_permissions': return list(rec(result).overrides).map((o, i) => ({
            key: `${str(o.roleId) || str(o.userId)}-${str(o.permission)}-${i}`,
            icon: o.value === 'ALLOW' ? 'bi-check-circle' : 'bi-slash-circle',
            title: str(o.permission),
            subtitle: `${o.value === 'ALLOW' ? 'Autorisé' : 'Refusé'} · ${str(rec(o.role).name) || (o.userId ? 'membre' : 'rôle')}`,
        }));
        case 'send_org_invite_email': return inviteEmailRows(result);
        default: return [];
    }
}

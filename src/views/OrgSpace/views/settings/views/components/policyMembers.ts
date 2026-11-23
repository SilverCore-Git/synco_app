import { openedOrg } from '@/assets/var';
import { defaultAvatar } from '@/assets/utils/defaultAvatar';

export interface DirectoryPerson {
    userId: string;
    name: string;
    role: string;
    avatar: string;
}

const toPerson = (m: NonNullable<NonNullable<typeof openedOrg.value>['members']>[number]): DirectoryPerson => ({
    userId: m.userId,
    name: m.user?.name || m.user?.email || 'Membre',
    role: typeof m.role === 'string' && m.role !== 'member' && m.role !== 'admin' ? m.role : (m.role === 'admin' ? 'Administrateur' : 'Membre'),
    avatar: m.user?.avatarUrl || defaultAvatar(m.user?.name, '#062d1f'),
});

/** Une personne de l'org par identifiant ; inconnue (membre parti) : identifiant tronqué, jamais d'erreur. */
export function personOf(userId: string): DirectoryPerson {
    const m = openedOrg.value?.members?.find(x => x.userId === userId);
    if (m) return toPerson(m);
    return { userId, name: `Ancien membre (${userId.slice(0, 6)})`, role: '', avatar: defaultAvatar('?', '#555555') };
}

export const orgMemberCount = (): number => openedOrg.value?.members?.length ?? 0;

/** Recherche dans l'annuaire local de l'org ouverte (nom ou e-mail) : au plus `limit` résultats, jamais la liste entière. */
export function searchPeople(query: string, exclude: ReadonlySet<string>, limit = 8): { people: DirectoryPerson[]; total: number } {
    const q = query.trim().toLowerCase();
    const members = openedOrg.value?.members ?? [];
    const hits = members.filter(m => !exclude.has(m.userId) && (!q || (m.user?.name ?? '').toLowerCase().includes(q) || (m.user?.email ?? '').toLowerCase().includes(q)));
    return { people: hits.slice(0, limit).map(toPerson), total: hits.length };
}

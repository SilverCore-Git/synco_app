import { describe, expect, test } from 'bun:test';
import { openedOrg } from '@/assets/var';
import { orgMemberCount, personOf, searchPeople } from './policyMembers';

const members = Array.from({ length: 1200 }, (_, i) => ({
    id: `m${i}`, organizationId: 'o', userId: `u${i}`, role: i === 0 ? 'admin' : 'member', createdAt: '', updatedAt: '',
    user: { id: `u${i}`, name: `Personne ${i}`, email: `p${i}@ex.fr` },
}));

describe('sélecteur de personnes (orgs de 1 000 membres et plus)', () => {
    test('ne renvoie jamais plus de 8 résultats, avec le total', () => {
        openedOrg.value = { id: 'o', members } as never;
        const r = searchPeople('', new Set());
        expect(r.people.length).toBe(8);
        expect(r.total).toBe(1200);
        expect(orgMemberCount()).toBe(1200);
    });

    test('filtre par nom ou e-mail et exclut les personnes déjà choisies', () => {
        openedOrg.value = { id: 'o', members } as never;
        const r = searchPeople('personne 11', new Set(['u11']));
        expect(r.people.map(p => p.userId)).not.toContain('u11');
        expect(r.people.every(p => p.name.includes('Personne 11'))).toBe(true);
        expect(searchPeople('p7@ex', new Set()).people[0]!.userId).toBe('u7');
    });

    test('un membre parti reste affichable', () => {
        openedOrg.value = { id: 'o', members } as never;
        expect(personOf('u-parti-123456').name).toContain('Ancien membre');
        expect(personOf('u0').role).toBe('Administrateur');
    });
});

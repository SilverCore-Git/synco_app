import { describe, expect, test } from 'bun:test';
import { domainFromResultPath } from './resultRegistry';
import { inviteUrlOf, membersRows, membersSummary } from './membersResultRows';

describe('rendu des résultats du domaine members', () => {
    test('membres : tableau historique, résultat paginé, profil et rôles', () => {
        expect(membersRows('list_members', [{ id: 'u1', name: 'Zoé', pseudo: 'zo', avatarUrl: 'https://x/a.png', cursor: 'c1' }, { id: 'u2', name: 'Léo' }]))
            .toMatchObject([{ key: 'u1', title: 'Zoé', subtitle: 'zo', userId: 'u1', avatarUrl: 'https://x/a.png' }, { key: 'u2', title: 'Léo', userId: 'u2' }]);
        expect(membersRows('list_role_members', { members: [{ userId: 'u3', name: 'Ana' }], next: null })).toMatchObject([{ key: 'u3', userId: 'u3', title: 'Ana' }]);
        expect(membersRows('get_member', { id: 'u1', name: 'Zoé', job: 'Dev', roles: [{ name: 'ADMIN' }, { name: 'Compta' }] })[0]!.subtitle).toBe('Dev · ADMIN, Compta');
        expect(membersRows('get_member', { error: 'x' })).toEqual([]);
    });

    test('un résultat inattendu ne casse pas le rendu (tableaux vides, champs absents)', () => {
        for (const v of [null, undefined, 'texte', 3, [], {}, [null, 'x']]) {
            for (const name of ['list_members', 'list_roles', 'list_org_invites', 'get_permissions', 'send_org_invite_email', 'get_org']) {
                expect(() => membersRows(name, v)).not.toThrow();
            }
        }
        expect(membersRows('list_roles', [null, 'x'])).toEqual([]);
    });

    test('rôles, invitations et permissions', () => {
        expect(membersRows('list_roles', [{ id: 'r1', name: 'Compta', memberCount: 2 }])).toMatchObject([{ title: 'Compta', subtitle: '2 membres' }]);
        const inv = membersRows('list_org_invites', { invites: [{ id: 'i1', kind: 'email', email: 'a@b.fr', uses: 0, maxUses: 1, expiresAt: '2026-12-01T00:00:00.000Z' }, { id: 'i2', kind: 'link', uses: 2, maxUses: null, expiresAt: null }] });
        expect(inv[0]).toMatchObject({ icon: 'bi-envelope', title: 'a@b.fr' });
        expect(inv[0]!.subtitle).toContain('0/1 utilisation');
        expect(inv[1]).toMatchObject({ title: "Lien d'invitation", subtitle: 'sans expiration · 2 utilisations' });
        expect(membersRows('get_permissions', { overrides: [{ roleId: 'r1', permission: 'THREAD_CREATE', value: 'DENY', role: { name: 'Membre' } }] }))
            .toMatchObject([{ title: 'THREAD_CREATE', subtitle: 'Refusé · Membre' }]);
        expect(membersRows('send_org_invite_email', { results: [{ email: 'a@b.fr', status: 'sent' }, { email: 'c@d.fr', status: 'failed', reason: 'org_member_limit' }] }))
            .toMatchObject([{ subtitle: 'Invitation envoyée' }, { subtitle: 'org_member_limit' }]);
    });

    test('résumés des outils mutants et lien d’invitation en texte', () => {
        expect(membersSummary('remove_member', { removedUserId: 'u' })).toBe("Membre exclu de l'organisation");
        expect(membersSummary('add_role_member', { assigned: ['a', 'b'] })).toBe('2 membres ont reçu le rôle');
        expect(membersSummary('set_permissions', { overrideCount: 1 })).toBe('1 surcharge enregistrée');
        expect(membersSummary('get_my_permissions', { permissions: { A: true, B: false, C: true } })).toBe('2 permissions sur 3');
        expect(membersSummary('list_members', [])).toBeNull();
        expect(inviteUrlOf('create_org_invite_link', { inviteUrl: 'https://app.test/invite/abc' })).toBe('https://app.test/invite/abc');
        expect(inviteUrlOf('create_org_invite_link', {})).toBeNull();
        expect(inviteUrlOf('list_roles', { inviteUrl: 'x' })).toBeNull();
    });

    test('du texte HTML de tiers reste du texte brut (aucune interprétation dans les lignes)', () => {
        const [row] = membersRows('list_members', [{ id: 'u', name: '<img src=x onerror=alert(1)>' }]);
        expect(row!.title).toBe('<img src=x onerror=alert(1)>');
    });
});

describe('enregistrement du rendu', () => {
    test('MembersResult.vue s’enregistre sous le domaine members', () => {
        expect(domainFromResultPath('./MembersResult.vue')).toBe('members');
    });
});

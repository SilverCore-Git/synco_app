import { describe, expect, test } from 'bun:test';
import { deleteMyAccount, type AccountDeletionPorts } from './accountDeletion';

function ports(over: Partial<AccountDeletionPorts> = {}): { calls: string[]; ports: AccountDeletionPorts } {
    const calls: string[] = [];
    return {
        calls,
        ports: {
            keyguardConfigured: true,
            ownsAnOrganization: false,
            disableKeyguard: async () => { calls.push('keyguard'); },
            deleteMe: async () => { calls.push('me'); return { ok: true, status: 200 }; },
            ...over,
        },
    };
}

describe('suppression du compte (R2)', () => {
    test('DELETE /v1/setup du keyguard AVANT DELETE /me', async () => {
        const { calls, ports: p } = ports();
        expect(await deleteMyAccount(p)).toEqual({ ok: true, keyguard: 'disabled' });
        expect(calls).toEqual(['keyguard', 'me']);
    });

    test('keyguard injoignable : la suppression continue (filet : liste signée)', async () => {
        const { calls, ports: p } = ports({ disableKeyguard: async () => { calls.push('keyguard'); throw new Error('réseau'); } });
        expect(await deleteMyAccount(p)).toEqual({ ok: true, keyguard: 'failed' });
        expect(calls).toEqual(['keyguard', 'me']);
    });

    test('keyguard non configuré : seulement DELETE /me', async () => {
        const { calls, ports: p } = ports({ keyguardConfigured: false });
        expect((await deleteMyAccount(p)).keyguard).toBe('skipped');
        expect(calls).toEqual(['me']);
    });

    test("propriétaire d'org : le keyguard n'est pas touché, l'API répond 409", async () => {
        const { calls, ports: p } = ports({
            ownsAnOrganization: true,
            deleteMe: async () => { calls.push('me'); return { ok: false, status: 409, error: 'propriétaire' }; },
        });
        expect(await deleteMyAccount(p)).toEqual({ ok: false, status: 409, error: 'propriétaire', keyguard: 'skipped' });
        expect(calls).toEqual(['me']);
    });
});

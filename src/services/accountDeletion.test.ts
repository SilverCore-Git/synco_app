import { describe, expect, test } from 'bun:test';
import { deleteMyAccount, type AccountDeletionPorts } from './accountDeletion';

function ports(over: Partial<AccountDeletionPorts> = {}): { calls: string[]; ports: AccountDeletionPorts } {
    const calls: string[] = [];
    return {
        calls,
        ports: {
            keyguardConfigured: true,
            disableKeyguard: async () => { calls.push('keyguard'); },
            deleteMe: async () => { calls.push('me'); return { ok: true, status: 200 }; },
            ...over,
        },
    };
}

describe('suppression du compte (R2)', () => {
    test('DELETE /me AVANT DELETE /v1/setup du keyguard', async () => {
        const { calls, ports: p } = ports();
        expect(await deleteMyAccount(p)).toEqual({ ok: true, keyguard: 'disabled' });
        expect(calls).toEqual(['me', 'keyguard']);
    });

    test('keyguard injoignable après succès : la suppression réussit (filet : liste signée)', async () => {
        const { calls, ports: p } = ports({ disableKeyguard: async () => { calls.push('keyguard'); throw new Error('réseau'); } });
        expect(await deleteMyAccount(p)).toEqual({ ok: true, keyguard: 'failed' });
        expect(calls).toEqual(['me', 'keyguard']);
    });

    test('keyguard non configuré : seulement DELETE /me', async () => {
        const { calls, ports: p } = ports({ keyguardConfigured: false });
        expect((await deleteMyAccount(p)).keyguard).toBe('skipped');
        expect(calls).toEqual(['me']);
    });

    test("DELETE /me refusé (409, 403, 5xx) : le keyguard n'est jamais touché", async () => {
        for (const status of [409, 403, 500]) {
            const { calls, ports: p } = ports({
                deleteMe: async () => { calls.push('me'); return { ok: false, status, error: 'refus' }; },
            });
            expect(await deleteMyAccount(p)).toEqual({ ok: false, status, error: 'refus', keyguard: 'skipped' });
            expect(calls).toEqual(['me']);
        }
    });
});

/**
 * Écrans de L11 : erreurs expliquées, bascule aller-retour (services simulés par le banc de L10),
 * enregistrement des conversations runtime (PC81).
 */
import { beforeEach, describe, expect, test } from 'bun:test';
import { AiRuntimeError, clearDelegationKeys, isKnownRuntimeConversation } from '@/services/aiRuntime';
import { ORG, makeHarness, type Harness } from '@/services/aiRuntime/testHarness';
import {
    explainRuntimeError,
    registerOpenedRuntimeConversation,
    switchConversationToLocal,
    switchConversationToRuntime,
    SwitchRefusedError,
    SwitchUnavailableError,
    type SwitchBodyBuilder,
} from './aiRuntimeUi';

const SESSION = 'cm3session000000000000001';
let h: Harness;

const builder: SwitchBodyBuilder = async ({ sessionId, runtimeId, delegationId }) => ({
    runtimeId, delegationId, baseRev: 0, messages: [], title: 'gcm1:x',
    convEntry: { kind: 'conv', ref: sessionId, version: 1, ciphertext: 'c' },
});
const path = (a: string) => `/api/orgs/${ORG}/ai/sessions/${SESSION}/${a}`;

beforeEach(async () => {
    clearDelegationKeys();
    h = await makeHarness();
});

describe('erreurs expliquées', () => {
    test('clé changée : alerte avec les deux empreintes et l\'acceptation explicite', () => {
        const p = explainRuntimeError(new AiRuntimeError('runtime_key_changed', { fingerprint: 'AAAA', pinnedFingerprint: 'BBBB' }));
        expect(p.severity).toBe('alert');
        expect(p.action).toBe('accept_new_key');
        expect([p.fingerprint, p.pinnedFingerprint]).toEqual(['AAAA', 'BBBB']);
    });

    test('première vue après un désappairage : même alerte, avec l\'ancienne empreinte (pinnedFpr)', () => {
        const p = explainRuntimeError(new AiRuntimeError('runtime_first_seen', { fingerprint: 'NEW', previouslyPinned: true }), { pinnedFingerprint: 'OLD' });
        expect(p.severity).toBe('alert');
        expect(p.pinnedFingerprint).toBe('OLD');
        const fresh = explainRuntimeError(new AiRuntimeError('runtime_first_seen', { fingerprint: 'NEW' }));
        expect(fresh.severity).toBe('warning');
        expect(fresh.pinnedFingerprint).toBeUndefined();
    });

    test('runtime hors ligne, délégation expirée, durée trop courte', () => {
        expect(explainRuntimeError(new AiRuntimeError('runtime_unavailable')).title).toContain('hors ligne');
        expect(explainRuntimeError(new AiRuntimeError('delegation_expired')).action).toBe('renew_delegation');
        const short = explainRuntimeError(new AiRuntimeError('delegation_duration_too_short'));
        expect(short.severity).toBe('alert');
        expect(short.detail).toContain('Paramètres › Synco AI › Runtime');
    });

    test('une erreur inconnue ne laisse rien fuir', () => {
        const p = explainRuntimeError(new Error('secret interne'));
        expect(p.code).toBe('unknown');
        expect(JSON.stringify(p)).not.toContain('secret interne');
    });
});

describe('bascule', () => {
    test('aller-retour : délégation créée, conversation enregistrée, retour en local', async () => {
        h.override = (method, p) => (method === 'POST' && p === path('switch-to-runtime') ? { status: 200, body: { regime: 'runtime' } }
            : method === 'POST' && p === path('switch-to-local') ? { status: 200, body: { regime: 'client' } } : undefined);
        expect(await isKnownRuntimeConversation(h.deps, ORG, SESSION)).toBe(false);

        const summary = await switchConversationToRuntime(h.deps, ORG, SESSION, { builder, confirmFirstSeen: true });
        expect(summary.status).toBe('active');
        expect(await isKnownRuntimeConversation(h.deps, ORG, SESSION)).toBe(true);
        const sent = h.requests.find(r => r.path === path('switch-to-runtime'));
        expect((sent!.body as { delegationId: string }).delegationId).toBe(summary.delegationId);

        await switchConversationToLocal(h.deps, ORG, SESSION);
        expect(h.requests.some(r => r.path === path('switch-to-local'))).toBe(true);
    });

    test('« Revenir en local » : la conversation est rechargée après le succès, jamais après un échec', async () => {
        const reloaded: string[] = [];
        h.override = (method, p) => (method === 'POST' && p === path('switch-to-local') ? { status: 200, body: { regime: 'client' } } : undefined);
        await switchConversationToLocal(h.deps, ORG, SESSION, async id => { reloaded.push(id); });
        expect(reloaded).toEqual([SESSION]);
        h.override = (method, p) => (method === 'POST' && p === path('switch-to-local') ? { status: 409, body: { error: 'session_busy' } } : undefined);
        await switchConversationToLocal(h.deps, ORG, SESSION, async id => { reloaded.push(id); }).catch(() => undefined);
        expect(reloaded).toEqual([SESSION]);
    });

    test('sans constructeur de corps (L10) : refus typé, rien n\'est enregistré ni délégué', async () => {
        const err = await switchConversationToRuntime(h.deps, ORG, SESSION, { builder: null }).catch(e => e);
        expect(err).toBeInstanceOf(SwitchUnavailableError);
        expect(h.requests.some(r => r.method === 'POST')).toBe(false);
        expect(await isKnownRuntimeConversation(h.deps, ORG, SESSION)).toBe(false);
    });

    test('refus de l\'API : erreur typée et conversation non enregistrée', async () => {
        h.override = (method, p) => (method === 'POST' && p === path('switch-to-runtime') ? { status: 403, body: { error: 'delegation_expired' } } : undefined);
        const err = await switchConversationToRuntime(h.deps, ORG, SESSION, { builder, confirmFirstSeen: true }).catch(e => e);
        expect(err).toBeInstanceOf(AiRuntimeError);
        expect((err as AiRuntimeError).code).toBe('delegation_expired');
        expect(await isKnownRuntimeConversation(h.deps, ORG, SESSION)).toBe(false);

        h.override = (method, p) => (method === 'POST' && p === path('switch-to-runtime') ? { status: 409, body: { error: 'session_busy' } } : undefined);
        const busy = await switchConversationToRuntime(h.deps, ORG, SESSION, { builder }).catch(e => e);
        expect(busy).toBeInstanceOf(SwitchRefusedError);
        expect((busy as SwitchRefusedError).code).toBe('session_busy');
    });

    test('première vue du runtime sans confirmation : runtime_first_seen, aucune bascule envoyée', async () => {
        const err = await switchConversationToRuntime(h.deps, ORG, SESSION, { builder }).catch(e => e);
        expect((err as AiRuntimeError).code).toBe('runtime_first_seen');
        expect(h.requests.some(r => r.path === path('switch-to-runtime'))).toBe(false);
    });

    test('ouverture d\'une conversation runtime : enregistrée (PC81), sans jamais lever', async () => {
        expect(await registerOpenedRuntimeConversation(h.deps, ORG, SESSION)).toBe(true);
        expect(await isKnownRuntimeConversation(h.deps, ORG, SESSION)).toBe(true);
        expect(await registerOpenedRuntimeConversation(h.deps, ORG, 'identifiant invalide !')).toBe(false);
    });
});

describe("vue d'administration", () => {
    test('runtime appairé : empreinte, état en ligne et politique lus sans défi ni épingle', async () => {
        const { loadRuntimeAdminView } = await import('./aiRuntimeUi');
        h.registry.policy = { enabled: true, maxDelegationDays: 3, toolPolicy: { delete_task: 'deny', bad: 'x' } };
        const v = await loadRuntimeAdminView(h.deps, ORG);
        expect(v.runtime?.online).toBe(true);
        expect(v.runtime?.fingerprint).toBeTruthy();
        expect(v.runtime?.pinState).toBe('first_seen');
        expect(v.policy).toEqual({ enabled: true, maxDelegationDays: 3, toolPolicy: { delete_task: 'deny' } });
        expect(h.requests.some(r => r.path.endsWith('/challenge') || r.method === 'POST')).toBe(false);
    });

    test("aucun runtime : vue vide, politique par défaut", async () => {
        const { loadRuntimeAdminView } = await import('./aiRuntimeUi');
        h.registry.runtime = null;
        h.registry.policy = {};
        const v = await loadRuntimeAdminView(h.deps, ORG);
        expect(v.runtime).toBeNull();
        expect(v.policy).toEqual({ enabled: false, maxDelegationDays: 7, toolPolicy: {} });
    });
});

describe('disponibilité', () => {
    test('runtime autorisé et en ligne, puis non autorisé', async () => {
        const { runtimeAvailability } = await import('./aiRuntimeUi');
        expect(await runtimeAvailability(h.deps, ORG)).toEqual({ available: true, online: true });
        h.registry.allowedForMe = false;
        expect((await runtimeAvailability(h.deps, ORG)).available).toBe(false);
        h.registry.runtime = null;
        expect(await runtimeAvailability(h.deps, ORG)).toEqual({ available: false, online: false });
    });
});

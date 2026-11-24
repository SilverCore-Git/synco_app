import { describe, expect, test } from 'bun:test';
import { agentMarkView, agentPreviewMark } from './agentMessageMark';

describe('mention « avec Synco AI » et avertissement (12 §4.3, §10.7, PC88, PC100)', () => {
    test('message écrit à la main : rien', () => {
        expect(agentMarkView({ authState: 'verified' })).toBeNull();
        expect(agentMarkView({ nonce: 'd2.AAEC.cid.sig', authState: 'verified' })).toBeNull();
    });
    test('auteur ai : mention, sans avertissement ; non vérifié signalé', () => {
        expect(agentMarkView({ mark: { author: 'ai' }, authState: 'verified', senderName: 'Alice' })).toMatchObject({ label: 'avec Synco AI', warning: null });
        expect(agentMarkView({ mark: { author: 'ai' }, authState: 'unsigned' })!.label).toBe('avec Synco AI (non vérifié)');
    });
    test('MP d3 authentifié : mention lue au format du nonce', () => {
        expect(agentMarkView({ nonce: 'd3.AAEC.cid.ai.sig.0', authState: 'verified' })!.label).toBe('avec Synco AI');
        expect(agentMarkView({ nonce: 'd3.AAEC.cid.ai.sig.0', authState: undefined })).toBeNull();
    });
    test('mode autonome, texte confirmé : mention seule', () => {
        const v = agentMarkView({ mark: { author: 'rt1', delegationId: 'd', text: 'text_verified' }, authState: 'verified', senderName: 'Alice' })!;
        expect(v.label).toBe('avec Synco AI · mode autonome');
        expect(v.tooltip).toContain('Alice');
        expect(v.warning).toBeNull();
    });
    test('texte non confirmé : un seul avertissement visible, la raison dans les détails', () => {
        const v = agentMarkView({ mark: { author: 'rt1', delegationId: 'd', text: 'text_unverified', reason: 'text_mismatch' }, authState: 'verified', senderName: 'Alice' })!;
        expect(v.warning).toBe("Texte non confirmé par Alice : il peut différer de ce qu'il a accepté");
        expect(v.detail).toBe('Détail : texte différent de celui accepté.');
        const other = agentMarkView({ mark: { author: 'rt1', delegationId: 'd', text: 'text_unverified', reason: 'absent' }, authState: 'verified', senderName: 'Alice' })!;
        expect(other.warning).toBe(v.warning);
    });
    test('message invalid : déjà masqué, aucune mention', () => {
        expect(agentMarkView({ mark: { author: 'ai' }, authState: 'invalid' })).toBeNull();
    });
    test('aperçu : même marque, avertissement compris', () => {
        expect(agentPreviewMark({ mark: { author: 'rt1', delegationId: 'd', text: 'text_unverified' }, authState: 'unsigned', senderName: 'Bob' }))
            .toEqual({ title: "Texte non confirmé par Bob : il peut différer de ce qu'il a accepté", warning: true });
    });
});

import { describe, expect, test } from 'bun:test';
import { isBusyStatus, linkBanner, messageWillQueue, statusLabel } from './status';

describe('états et lien', () => {
    test('libellés de 08 §7, état inconnu neutre', () => {
        expect(statusLabel('running')).toBe('Synco AI travaille');
        expect(statusLabel('awaiting_key')).toBe('Ouvrez Synco pour donner accès');
        expect(statusLabel('<script>')).toBe('État inconnu');
    });
    test('mise en file pendant le travail ou l’attente d’une confirmation', () => {
        expect(isBusyStatus('running') && isBusyStatus('queued')).toBe(true);
        expect(messageWillQueue('awaiting_confirmation')).toBe(true);
        expect(messageWillQueue('idle')).toBe(false);
    });
    test('hors ligne et refus : lecture seule, en direct : rien', () => {
        expect(linkBanner('live')).toBeNull();
        expect(linkBanner('offline')?.readOnly).toBe(true);
        expect(linkBanner('refused')?.tone).toBe('error');
        expect(linkBanner('resuming')?.readOnly).toBe(false);
    });
});

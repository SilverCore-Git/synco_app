import { describe, expect, test } from 'bun:test';
import { discardV3Migration, handOffV3Migration, takeV3Migration, v3MigrationOffered } from './v3MigrationHandoff';

const source = (fill: number) => ({ rsaPkcs8: new Uint8Array(8).fill(fill), signPkcs8: new Uint8Array(8).fill(fill), verifier: 'v' });

describe('remise des clés v3 à la fenêtre de migration', () => {
    test('rendue une seule fois, et le compteur prévient la fenêtre', () => {
        const before = v3MigrationOffered.value;
        const s = source(7);
        handOffV3Migration(s);
        expect(v3MigrationOffered.value).toBe(before + 1);
        expect(takeV3Migration()).toBe(s);
        expect(takeV3Migration()).toBeNull();
        // Rendue telle quelle : c'est la fenêtre qui l'efface après usage.
        expect(s.rsaPkcs8.every(b => b === 7)).toBe(true);
    });

    test('une nouvelle remise efface la précédente', () => {
        const first = source(1);
        handOffV3Migration(first);
        handOffV3Migration(source(2));
        expect(first.rsaPkcs8.every(b => b === 0)).toBe(true);
        expect(first.signPkcs8.every(b => b === 0)).toBe(true);
        expect(takeV3Migration()?.rsaPkcs8[0]).toBe(2);
    });

    test('discard efface une remise que personne n\'a prise', () => {
        const s = source(3);
        handOffV3Migration(s);
        discardV3Migration();
        expect(s.rsaPkcs8.every(b => b === 0)).toBe(true);
        expect(s.signPkcs8.every(b => b === 0)).toBe(true);
        expect(takeV3Migration()).toBeNull();
    });

    test('le compteur réactif ne porte aucun secret', () => {
        handOffV3Migration(source(9));
        expect(typeof v3MigrationOffered.value).toBe('number');
        discardV3Migration();
    });
});

import { describe, expect, test } from 'bun:test';
import { autonomyToggleDisabled, redelegateAfterKeyAcceptance } from './aiAgentRules';

const base = { busy: false, featuresFailed: false, allowed: true, autonomyOn: false, onRuntime: true };

describe('interrupteur du mode autonome', () => {
    test('activer exige le runtime : sur cet appareil, rien ne crée de délégation en douce', () => {
        expect(autonomyToggleDisabled({ ...base, onRuntime: false })).toBe(true);
        expect(autonomyToggleDisabled(base)).toBe(false);
    });
    test('activer exige l\'autorisation de l\'org et un état lisible', () => {
        expect(autonomyToggleDisabled({ ...base, allowed: false })).toBe(true);
        expect(autonomyToggleDisabled({ ...base, featuresFailed: true })).toBe(true);
    });
    test('désactiver reste possible même si l\'org a retiré la fonctionnalité', () => {
        expect(autonomyToggleDisabled({ ...base, autonomyOn: true, allowed: false })).toBe(false);
        expect(autonomyToggleDisabled({ ...base, autonomyOn: true, featuresFailed: true, onRuntime: false })).toBe(false);
        expect(autonomyToggleDisabled({ ...base, autonomyOn: true, busy: true })).toBe(true);
    });
});

describe('nouvelle clé du runtime acceptée', () => {
    test('redélégation seulement si une délégation était active', () => {
        expect(redelegateAfterKeyAcceptance(false)).toBe(false);
        expect(redelegateAfterKeyAcceptance(true)).toBe(true);
    });
});

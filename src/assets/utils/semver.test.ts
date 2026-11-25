import { describe, expect, test } from 'bun:test';
import { compareVersions, isOlderThan, parseVersion } from './semver';

describe('semver', () => {
    test('parseVersion', () => {
        expect(parseVersion('1.2.3')).toEqual([1, 2, 3]);
        expect(parseVersion(' v1.2.3-beta.1+x ')).toEqual([1, 2, 3]);
        for (const bad of ['', '1.2', 'a.b.c', '1.2.3.4', null, undefined, 12]) expect(parseVersion(bad)).toBeNull();
    });
    test('compareVersions compare numériquement, pas en texte', () => {
        expect(compareVersions('1.10.0', '1.9.0')).toBeGreaterThan(0);
        expect(compareVersions('1.2.3', '1.2.3')).toBe(0);
        expect(compareVersions('0.9.9', '1.0.0')).toBeLessThan(0);
        expect(compareVersions('2.0.0', '1.99.99')).toBeGreaterThan(0);
        expect(compareVersions('x', '1.0.0')).toBeNull();
    });
    test('isOlderThan : strictement plus ancienne, jamais sur une valeur illisible', () => {
        expect(isOlderThan('1.4.0', '1.5.0')).toBe(true);
        expect(isOlderThan('1.5.0', '1.5.0')).toBe(false);
        expect(isOlderThan('1.6.0', '1.5.0')).toBe(false);
        expect(isOlderThan('0.0.0', '0.0.0')).toBe(false);
        expect(isOlderThan('inconnue', '1.5.0')).toBe(false);
        expect(isOlderThan('1.0.0', undefined)).toBe(false);
    });
});

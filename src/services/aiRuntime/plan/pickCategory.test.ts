import { describe, expect, test } from 'bun:test';
import { pickCategory } from './pickCategory';

describe('catégorie cible d’un salon (12 §4)', () => {
    const cats = [{ id: 'c1' }, { id: 'c2' }];
    test('catégorie donnée : celle-ci si elle existe dans la cible', () => { expect(pickCategory(cats, 'c2')).toBe('c2'); });
    test('catégorie donnée mais étrangère à la cible : refus (jamais la première par défaut)', () => { expect(pickCategory(cats, 'zz')).toBeNull(); });
    test('sans catégorie donnée : la première de la cible', () => { expect(pickCategory(cats)).toBe('c1'); });
    test('cible sans catégorie : refus', () => { expect(pickCategory([])).toBeNull(); });
});

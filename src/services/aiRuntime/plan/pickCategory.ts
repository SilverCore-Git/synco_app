/** Choix de la catégorie d'un salon créé par un plan (12 §4). Pur. */
import type { Category } from '@/types/types';

/** Catégorie cible d'un salon (12 §4) : `categoryId` s'il est donné, sinon la première catégorie visible de la cible. */
export function pickCategory(categories: readonly Pick<Category, 'id'>[], wanted?: string): string | null {
    if (wanted) return categories.some(c => c.id === wanted) ? wanted : null;
    return categories[0]?.id ?? null;
}

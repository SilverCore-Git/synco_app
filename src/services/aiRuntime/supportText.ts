/**
 * Texte écrit au support (L15j) : ce que l'utilisateur lit sur la carte DOIT être ce qui part, caractère pour
 * caractère. Un caractère invisible ou de contrôle pourrait cacher une part du message hors de l'organisation ou en
 * changer l'affichage : le texte qui en contient est REFUSÉ (jamais nettoyé en silence).
 *
 * Refusés : contrôles C0 et C1 (sauf saut de ligne `\n` et tabulation `\t`), `\r`, DEL, trait d'union conditionnel,
 * espaces et jonctions de largeur nulle (dont ZWJ), marques et isolats bidirectionnels, séparateurs de ligne et de
 * paragraphe, opérateurs invisibles, caractères de remplissage, sélecteurs de variante (sauf FE0E et FE0F, requis par
 * les émojis), caractères « tag » U+E0000–E007F, indicateurs d'annotation et BOM. Les espaces visibles (dont
 * l'espace insécable) restent permis et sont affichés tels quels.
 */
const HIDDEN = new RegExp(
    '[' + [
        '\\u0000-\\u0008', '\\u000b-\\u001f', '\\u007f-\\u009f',
        '\\u00ad', '\\u034f', '\\u061c', '\\u115f\\u1160', '\\u17b4\\u17b5', '\\u180b-\\u180f',
        '\\u200b-\\u200f', '\\u2028-\\u202e', '\\u2060-\\u206f', '\\u3164',
        '\\ufe00-\\ufe0d', '\\ufeff', '\\uffa0', '\\ufff9-\\ufffb',
        '\\u{e0000}-\\u{e007f}', '\\u{e0100}-\\u{e01ef}',
    ].join('') + ']',
    'u',
);

/** Vrai si le texte contient un caractère de contrôle (hors `\n`, `\t`), invisible, bidirectionnel ou « tag ». */
export const hasHiddenChars = (s: string): boolean => HIDDEN.test(s);

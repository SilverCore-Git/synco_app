import { describe, expect, test } from 'bun:test';
import { summarizeTool, noSummaryContext } from './summaryRegistry';
import * as support from './supportSummaries';
import { supportPreview } from './supportPreview';
import { checkSupportKindArgs } from '@/services/aiRuntime/agentSupport';
import { hasHiddenChars } from '@/services/aiRuntime/supportText';

const modules = { './supportSummaries.ts': support };
const sum = (tool: string, args: Record<string, unknown>) => summarizeTool(tool, args, noSummaryContext, modules);

describe('résumés de confirmation : support (demandeur)', () => {
    test('destinataire : l’équipe de Synco, hors de l’org', () => {
        expect(sum('create_support_ticket', { subject: 'Export PDF', text: 'x' })).toContain('l’équipe de Synco, hors de votre organisation');
        expect(sum('reply_support_ticket', { ticketId: 'cm3ticket', text: 'x' })).toContain('l’équipe de Synco, hors de votre organisation');
        expect(sum('reply_support_ticket', { ticketId: 'cm3ticket', text: 'x' })).toContain('cm3ticket');
    });

    test('fermer / rouvrir : identifiant lisible', () => {
        expect(sum('close_support_ticket', { ticketId: 't1' })).toContain('Fermer votre demande');
        expect(sum('reopen_support_ticket', { ticketId: 't1' })).toContain('Rouvrir votre demande');
    });
});

describe('aperçu intégral : ce qui part est ce qui est lu', () => {
    test('texte de 8000 caractères : affiché en entier, blancs et sauts de ligne inclus, sans réduction', () => {
        const text = `Bonjour,\n\n\tligne  avec   espaces insécables\n${'x'.repeat(7900)}`;
        const p = supportPreview('create_support_ticket', { subject: 'Sujet  à  espaces', text })!;
        expect(p.parts).toEqual([{ label: 'Sujet', text: 'Sujet  à  espaces' }, { label: 'Texte', text }]);
        expect(p.warning).toBeNull();
        const r = supportPreview('support.reply', { ticketId: 't', text: 'y'.repeat(8000) })!;
        expect(r.parts[0]!.text).toHaveLength(8000);
    });

    test('invariant : tout argument admis à l’envoi est affiché à l’identique, caractère pour caractère', () => {
        const samples = ['simple', 'a\nb\tc', '  espaces  ', 'émoji ❤️ 👍', 'x'.repeat(8000), ' 　'];
        for (const text of samples) {
            const args = { subject: 's', text };
            expect(checkSupportKindArgs('support.create', args)).toBe(true);
            const shown = supportPreview('support.create', args)!.parts.find(p => p.label === 'Texte')!.text;
            expect(shown).toBe(text);
        }
    });

    test('ticketId venu d’argsRefs : « la demande créée à l’étape m »', () => {
        const p = supportPreview('support.reply', { text: 'Suite' }, { ticketId: '$2.id' })!;
        expect(p.recipient).toContain('la demande créée à l’étape 2');
        expect(supportPreview('support.reply', { ticketId: 'cm3', text: 'x' })!.recipient).toContain('identifiant cm3');
    });

    test('autre outil : pas d’aperçu', () => {
        expect(supportPreview('send_message', { text: 'x' })).toBeNull();
    });
});

describe('caractères invisibles et de contrôle : refusés, jamais nettoyés', () => {
    const families: Record<string, string> = {
        'contrôle C0 (NUL)': '\u0000', 'contrôle C0 (ESC)': '\u001b', 'retour chariot': '\r', 'DEL': '\u007f', 'contrôle C1': '\u0085',
        'trait d’union conditionnel': '­', 'largeur nulle (ZWSP)': '​', 'jonction (ZWJ)': '‍', 'marque bidi LRM': '‎',
        'bidi RLO': '‮', 'isolat bidi': '⁦', 'séparateur de ligne': ' ', 'séparateur de paragraphe': ' ',
        'word joiner': '⁠', 'opérateur invisible': '⁢', 'BOM': '﻿', 'caractère tag': '\u{e0041}', 'tag annulation': '\u{e007f}',
        'sélecteur de variante': '︀', 'sélecteur supplémentaire': '\u{e0100}', 'remplissage hangul': 'ㅤ', 'remplissage demi-chasse': 'ﾠ',
        'indicateur d’annotation': '￹', 'Mongol (FVS)': '᠋', 'combinant jonction de graphème': '͏',
    };
    for (const [name, ch] of Object.entries(families)) {
        test(name, () => {
            expect(hasHiddenChars(`a${ch}b`)).toBe(true);
            expect(checkSupportKindArgs('support.create', { subject: 's', text: `a${ch}b` })).toBe(false);
            expect(checkSupportKindArgs('support.create', { subject: `a${ch}`, text: 'b' })).toBe(false);
            expect(checkSupportKindArgs('support.reply', { ticketId: 'cm3ticket', text: `a${ch}b` })).toBe(false);
            expect(supportPreview('support.create', { subject: 's', text: `a${ch}b` })!.warning).toContain('sera refusé');
        });
    }

    test('permis : saut de ligne, tabulation, espaces visibles, accents, émojis (FE0F)', () => {
        for (const s of ['a\nb', 'a\tb', 'a b', 'a b', 'é à ç', '❤️', '👍🏽', '日本語']) expect(hasHiddenChars(s)).toBe(false);
    });
});

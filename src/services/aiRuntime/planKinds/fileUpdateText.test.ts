import { describe, expect, test } from 'bun:test';
import { decodeUtf8Clipped, TextFileError } from '@/services/fileTextCodec';
import { creationFailureState, DeviceNotSentError } from '../plan/deviceErrors';

describe('lecture bornée d’un fichier texte', () => {
    test('sous la borne : tout le texte', () => {
        expect(decodeUtf8Clipped(new TextEncoder().encode('héllo'), 100)).toEqual({ text: 'héllo', truncated: false });
    });

    test('coupe sur une frontière de caractère, jamais au milieu', () => {
        const bytes = new TextEncoder().encode('aé€'); // 1 + 2 + 3 octets
        expect(decodeUtf8Clipped(bytes, 2)).toEqual({ text: 'a', truncated: true });
        expect(decodeUtf8Clipped(bytes, 3)).toEqual({ text: 'aé', truncated: true });
        expect(decodeUtf8Clipped(bytes, 5)).toEqual({ text: 'aé', truncated: true });
    });
});

describe('file.update_text : refus avant envoi', () => {
    test('file_changed est un échec franc (rien écrit), pas une issue inconnue', () => {
        expect(new TextFileError('file_changed').code).toBe('file_changed');
        expect(creationFailureState(new DeviceNotSentError(new TextFileError('file_changed').code))).toBe('failed');
    });
});

import { describe, expect, test } from 'bun:test';
import { addAutoAccept, autoAcceptLabel, isSensitiveAutoAcceptKey, parseAutoAccept, removeAutoAccept } from './aiAutoAccept';

describe('« Toujours accepter » (PC42)', () => {
    test("une action sensible n'entre jamais, même si le réglage stocké la contient", () => {
        expect(isSensitiveAutoAcceptKey('server.call:delete_task')).toBe(true);
        expect(isSensitiveAutoAcceptKey('server.call:create_email_report')).toBe(true);
        expect(isSensitiveAutoAcceptKey('server.call:create_task')).toBe(false);
        expect(addAutoAccept([], 'server.call:delete_task')).toBe(false);
        expect(addAutoAccept([], 'server.call:create_email_report')).toBe(false);
        expect(parseAutoAccept(['thread.create', 'server.call:delete_file', 'x y', 42, 'thread.create'])).toEqual(['thread.create']);
    });

    test('ajout, doublon et retrait', () => {
        expect(addAutoAccept(['thread.create'], 'folder.create')).toEqual(['thread.create', 'folder.create']);
        expect(addAutoAccept(['thread.create'], 'thread.create')).toEqual(['thread.create']);
        expect(removeAutoAccept(['a.b', 'c.d'], 'a.b')).toEqual(['c.d']);
        expect(parseAutoAccept('pas une liste')).toEqual([]);
    });

    test('libellés lisibles', () => {
        expect(autoAcceptLabel('thread.create').label).toBe("Création d'un salon");
        expect(autoAcceptLabel('server.call:create_task').label).toBe('Create task');
    });
});

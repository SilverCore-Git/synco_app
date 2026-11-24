/**
 * Exécution réelle des actions d'appareil (12 §4) : les routes NORMALES de l'utilisateur et les
 * fonctions existantes de l'app (`createFolderRequest`, `createTextFile`, création de salon avec clé
 * scellée et épinglage FC1), avec `X-Synco-Plan: <planId>/<n>` pour que l'API lie l'objet créé à
 * l'action. L'en-tête ne change aucun droit. Non couvert par les tests unitaires (réseau, E2EE) :
 * recette manuelle ; le choix de la catégorie est pur et testé (`pickCategory`).
 */
import type { JsonObject } from '@/assets/utils/aiActionPlan';
import sfetch from '@/assets/utils/sfetch';
import { encryptThreadKeyForMember, generateThreadKey } from '@/assets/utils/crypto';
import { resolveRecipientKey } from '@/assets/utils/keyTrust';
import { signKeyEnvelope } from '@/assets/utils/keyEnvelope';
import { openedOrg, user } from '@/assets/var';
import { createFolderRequest, createTextFile } from '@/services/fileActions';
import type { Category, Thread, User } from '@/types/types';
import type { DeviceCall } from './deviceRunner';
import { mapBounded } from './bounded';
import { DeviceHttpError, DeviceNotSentError } from './deviceErrors';
import { pickCategory } from './pickCategory';
import { planKindExecutor } from '../planKinds';

const PLAN_HEADER = 'X-Synco-Plan';
/** Résolutions de clés de membres en parallèle (salon d'org : des centaines de membres). */
const KEY_BATCH = 8;

const str = (v: JsonObject[string] | undefined): string | undefined => (typeof v === 'string' ? v : undefined);

async function postJson(path: string, body: unknown, header: string): Promise<Record<string, unknown>> {
    const res = await sfetch(path, { method: 'POST', body: JSON.stringify(body), headers: { [PLAN_HEADER]: header } });
    const data = await res.json().catch(() => ({})) as Record<string, unknown>;
    if (!res.ok || data.error) throw new DeviceHttpError(res.ok ? 400 : res.status);
    return data;
}

async function createCategory(args: JsonObject, header: string): Promise<Record<string, string>> {
    const org = openedOrg.value;
    if (!org) throw new DeviceNotSentError('no_org');
    const spaceId = str(args.spaceId);
    const space = spaceId ? org.spaces?.find(s => s.id === spaceId) : undefined;
    if (spaceId && !space) throw new DeviceNotSentError('unknown_space');
    const target = space ? space.categories : org.home.categories;
    const index = target.reduce((m, c) => Math.max(m, c.index + 1), 0);
    const data = await postJson(space ? `/api/categories/space/${space.id}` : `/api/categories/org/${org.id}`, { name: str(args.name), index }, header);
    const category = data as unknown as Category;
    if (!target.some(c => c.id === category.id)) target.push(category);
    return spaceId ? { id: category.id, spaceId } : { id: category.id };
}

async function createThread(args: JsonObject, header: string): Promise<Record<string, string>> {
    const org = openedOrg.value;
    const me = user.value;
    if (!org || !me) throw new DeviceNotSentError('no_org');
    const spaceId = str(args.spaceId);
    const space = spaceId ? org.spaces?.find(s => s.id === spaceId) : undefined;
    if (spaceId && !space) throw new DeviceNotSentError('unknown_space');
    const categoryId = pickCategory(space ? space.categories : org.home.categories, str(args.categoryId));
    if (!categoryId) throw new DeviceNotSentError('no_category');

    let members: User[] = space
        ? (org.members ?? []).filter(m => space.membersId.includes(m.userId)).map(m => m.user!).filter(Boolean)
        : (org.members ?? []).map(m => m.user!).filter(Boolean);
    if (!members.some(m => m.id === me.id)) members = [...members, me];

    const threadKey = await generateThreadKey();
    // Résolution des clés des membres par lots bornés (une org compte des centaines de membres) ; un membre
    // dont la clé est absente ou a changé (FC1, clé épinglée) est écarté, jamais contourné.
    const resolved = await mapBounded(members, KEY_BATCH, async (member): Promise<{ userId: string; encryptedKey: string } | null> => {
        if (typeof member.publicKey !== 'string' || !member.publicKey.trim().startsWith('{')) return null;
        try {
            return { userId: member.id, encryptedKey: await encryptThreadKeyForMember(threadKey, await resolveRecipientKey(member.id, member.publicKey)) };
        } catch { return null; }
    });
    const keys = resolved.filter((k): k is { userId: string; encryptedKey: string } => k !== null);
    if (keys.length === 0) throw new DeviceNotSentError('no_valid_key');

    const type = args.type === 'voice' ? 'vocal' : 'text';
    const data = await postJson(space ? `/api/threads/space/${space.id}` : `/api/threads/org/${org.id}`, { name: str(args.name), type, keys, index: 0, categoryId }, header);
    const thread = data as unknown as Thread & { workspaceId?: string };
    if (space) { thread.workspaceId = space.id; (space.threads ??= []).push(thread); }
    else (org.home.threads ??= []).push(thread);

    // Enveloppe FC4 du créateur (12 §4) : un échec ne défait pas le salon, la clé reste utilisable.
    try {
        const envelope = await signKeyEnvelope(threadKey, `thread:${thread.id}`, 1);
        await sfetch(`/api/threads/${thread.id}/key-envelope`, { method: 'POST', body: JSON.stringify({ ctx: `thread:${thread.id}`, version: 1, ...envelope }) });
    } catch { /* non bloquant */ }
    return space ? { id: thread.id, spaceId: space.id } : { id: thread.id };
}

/** Exécute une action d'appareil de la liste fermée ; rend `{ id, spaceId? }`. */
export async function executeDeviceAction(call: DeviceCall, planHeader: string, orgId: string): Promise<Record<string, string>> {
    const a = call.args;
    switch (call.kind) {
        case 'category.create': return createCategory(a, planHeader);
        case 'thread.create': return createThread(a, planHeader);
        case 'folder.create': {
            const spaceId = str(a.spaceId);
            if (!spaceId) throw new DeviceNotSentError('invalid_args');
            const folder = await createFolderRequest(spaceId, orgId, str(a.name) ?? '', str(a.parentFolderId), planHeader);
            return { id: folder.id, spaceId };
        }
        case 'file.create_text': {
            const spaceId = str(a.spaceId);
            if (!spaceId) throw new DeviceNotSentError('invalid_args');
            const file = await createTextFile({ spaceId, name: str(a.name) ?? '', content: str(a.content) ?? '', folderId: str(a.folderId), planHeader });
            return { id: file.id, spaceId };
        }
        default: {
            // Kind déposé dans `planKinds/<kind>.ts` (registre L15-0) : aucun fichier partagé à modifier par domaine.
            const executor = planKindExecutor(call.kind);
            if (!executor) throw new DeviceNotSentError('unknown_kind');
            return executor.execute(a, planHeader, orgId);
        }
    }
}

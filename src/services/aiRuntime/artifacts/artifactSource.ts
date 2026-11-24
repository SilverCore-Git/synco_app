/**
 * Source des artefacts (13 §3, §5.2, §7.1, L12b) : liste et lecture par les routes de l'API, ouverture de `meta`
 * et de `value` (`gcm1:`) sous `CK`, puis contrôles dans l'ordre de la spec. Tout écart rend l'artefact
 * illisible (`ArtifactUnreadableError`) sans jamais exposer le contenu. Aucune crypto maison : `decryptAiFieldStrict`.
 * Le clair n'est jamais conservé ici (pas de cache) ; l'appelant le garde en mémoire le temps de la vue.
 */
import { decryptAiFieldStrict } from '@/assets/utils/aiActionPlan';
import { buildFileName, findTextFormat } from '@/assets/utils/textFileFormats';
import { ArtifactUnreadableError, artifactMatches, sanitizeArtifactName, type ArtifactMeta, type ArtifactSource } from './artifactModel';

export const ARTIFACT_MAX_BYTES = 262_144;

/** Référence d'un artefact (13 §6.2) : lue dans la trame `artifact` ou dans les arguments de l'appel `send_file`. */
export interface ArtifactRef { sessionId: string; messageId: string; toolCallId: string; artifactId: string }

/** Réponse de `GET …/artifacts/:artifactId` (13 §5.2). */
export interface ArtifactWire { id: string; meta: string; value: string }

export interface ArtifactSourceDeps {
    ck: CryptoKey | Uint8Array;
    /** Lecture par l'API ; rejette si l'artefact est introuvable. */
    fetchArtifact(artifactId: string): Promise<ArtifactWire>;
}

const META_KEYS = ['ext', 'id', 'messageId', 'name', 'sessionId', 'sha256', 'size', 'toolCallId', 'v'];
const encoder = new TextEncoder();
type Sealed = { meta: string; value: string };

/** Ouvre `meta` (AAD `sessionId:artifactId:artifact_meta`) et contrôle chaque champ (13 §7.1, 1). */
export async function openArtifactMeta(ck: CryptoKey | Uint8Array, ref: ArtifactRef, wireMeta: string): Promise<{ meta: ArtifactMeta; ext: string }> {
    let obj: unknown;
    try {
        const clear = await decryptAiFieldStrict(ck, ref.sessionId, ref.artifactId, 'artifact_meta', wireMeta);
        if (encoder.encode(clear).length > 1024) throw new ArtifactUnreadableError();
        obj = JSON.parse(clear);
    } catch { throw new ArtifactUnreadableError(); }
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new ArtifactUnreadableError();
    const m = obj as Record<string, unknown>;
    const keys = Object.keys(m).sort();
    if (keys.length !== META_KEYS.length || keys.some((k, i) => k !== META_KEYS[i])) throw new ArtifactUnreadableError();
    const { ext, name, size, sha256 } = m;
    const format = typeof ext === 'string' && ext === ext.toLowerCase() ? findTextFormat(ext) : undefined;
    if (m.v !== 1 || m.id !== ref.artifactId || m.sessionId !== ref.sessionId || m.messageId !== ref.messageId || m.toolCallId !== ref.toolCallId) throw new ArtifactUnreadableError();
    if (!format || typeof name !== 'string' || name.length === 0) throw new ArtifactUnreadableError();
    if (typeof size !== 'number' || !Number.isInteger(size) || size < 1 || size > ARTIFACT_MAX_BYTES) throw new ArtifactUnreadableError();
    if (typeof sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(sha256)) throw new ArtifactUnreadableError();
    return {
        ext: format.ext,
        meta: { id: ref.artifactId, name: buildFileName(sanitizeArtifactName(name), format.ext), size, mimeType: format.mimeType, sha256 },
    };
}

/** Ouvre `value` (AAD `sessionId:artifactId:artifact`), vérifie taille et empreinte (13 §7.1, 2). */
export async function openArtifact(ck: CryptoKey | Uint8Array, ref: ArtifactRef, wire: Sealed): Promise<{ meta: ArtifactMeta; bytes: Uint8Array }> {
    const { meta } = await openArtifactMeta(ck, ref, wire.meta);
    let bytes: Uint8Array;
    try { bytes = encoder.encode(await decryptAiFieldStrict(ck, ref.sessionId, ref.artifactId, 'artifact', wire.value)); } catch { throw new ArtifactUnreadableError(); }
    if (bytes.length !== meta.size || bytes.includes(0)) throw new ArtifactUnreadableError();
    if (!(await artifactMatches(bytes, meta.sha256))) throw new ArtifactUnreadableError();
    return { meta, bytes };
}

export interface ArtifactLoader extends ArtifactSource {
    /** Déclare la référence d'un artefact (trame ou transcript) et rend ses métadonnées vérifiées. */
    load(ref: ArtifactRef): Promise<ArtifactMeta>;
}

export function createArtifactSource(deps: ArtifactSourceDeps): ArtifactLoader {
    const refs = new Map<string, ArtifactRef>();
    const fetchWire = async (id: string): Promise<Sealed> => {
        let w: ArtifactWire;
        try { w = await deps.fetchArtifact(id); } catch { throw new ArtifactUnreadableError(); }
        if (!w || w.id !== id || typeof w.meta !== 'string' || typeof w.value !== 'string') throw new ArtifactUnreadableError();
        return { meta: w.meta, value: w.value };
    };
    return {
        async load(ref) {
            const { meta } = await openArtifactMeta(deps.ck, ref, (await fetchWire(ref.artifactId)).meta);
            refs.set(ref.artifactId, ref);
            return meta;
        },
        async read(id) {
            const ref = refs.get(id);
            if (!ref) throw new ArtifactUnreadableError();
            return (await openArtifact(deps.ck, ref, await fetchWire(id))).bytes;
        },
    };
}

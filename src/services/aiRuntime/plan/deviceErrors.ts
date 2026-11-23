/**
 * Issue d'une création qui a échoué (12 §8.2) : `failed` n'est permis que si l'API a REFUSÉ la requête
 * (réponse HTTP 4xx ou 5xx) ou si rien n'est parti (contrôle local avant l'envoi). Une erreur de transport
 * ou une expiration après l'envoi laisse l'objet peut-être créé : l'issue est `unknown_outcome`.
 */
export class DeviceNotSentError extends Error {
    constructor(code: string) { super(code); this.name = 'DeviceNotSentError'; }
}

export class DeviceHttpError extends Error {
    readonly status: number;
    constructor(status: number, code = 'create_failed') { super(code); this.name = 'DeviceHttpError'; this.status = status; }
}

const statusOf = (e: unknown): number | null => {
    if (e instanceof DeviceHttpError) return e.status;
    const s = e && typeof e === 'object' ? (e as { status?: unknown }).status : undefined;
    return typeof s === 'number' ? s : null;
};

export function creationFailureState(e: unknown): 'failed' | 'unknown_outcome' {
    if (e instanceof DeviceNotSentError) return 'failed';
    const s = statusOf(e);
    return s !== null && s >= 400 && s < 600 ? 'failed' : 'unknown_outcome';
}

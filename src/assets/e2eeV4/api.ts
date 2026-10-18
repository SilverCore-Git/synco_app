import sfetch from '../utils/sfetch';
import { V4ApiError, type V4Api } from './session';

/**
 * Routes /api/e2ee/v4 de synco_api (src/routes/e2eeV4.ts). Ne transportent que des clés publiques,
 * des certificats et des enveloppes chiffrées.
 */

const BASE = '/api/e2ee/v4';

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await sfetch(`${BASE}${path}`, {
        method,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new V4ApiError(res.status, (data as { error?: string })?.error || `Erreur ${res.status}`, data as Record<string, unknown>);
    return data as T;
}

const orNull = async <T>(p: Promise<T>): Promise<T | null> => {
    try {
        return await p;
    } catch (e) {
        if (e instanceof V4ApiError && e.status === 404) return null;
        throw e;
    }
};

export const httpV4Api: V4Api = {
    init: (body) => call('POST', '/init', body),
    reset: (body) => call('POST', '/reset', body),
    listDevices: () => call('GET', '/devices'),
    getEnvelope: (id) => call('GET', `/devices/${encodeURIComponent(id)}/envelope`),
    renameDevice: (id, name) => call('PATCH', `/devices/${encodeURIComponent(id)}`, { name }),
    addDevice: (body) => call('POST', '/devices', body),
    rotate: (body) => call('POST', '/rotate', body),
    getRecovery: async () => (await orNull(call<{ recoveryEnvelope: string }>('GET', '/recovery')))?.recoveryEnvelope ?? null,
    putRecovery: (recoveryEnvelope) => call('PUT', '/recovery', { recoveryEnvelope }),
    deleteRecovery: () => call('DELETE', '/recovery'),
    createLink: (body) => call('POST', '/link', body),
    pendingLinks: () => call('GET', '/link/pending'),
    answerLink: (id, body) => call('POST', `/link/${encodeURIComponent(id)}/answer`, body),
    getLink: (id) => orNull(call('GET', `/link/${encodeURIComponent(id)}`)),
    cancelLink: (id) => call('DELETE', `/link/${encodeURIComponent(id)}`),
};

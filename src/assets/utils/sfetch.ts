import { keycloak } from "../keycloak";
import { Capacitor } from "@capacitor/core";
import { reportApiFailure, reportApiSuccess } from "@/composables/useApiHealth";

export default async function sfetch(url: string, arg?: any, retryCount = 0): Promise<Response> {
    const headers: Record<string, string> = { ...arg?.headers };

    if (keycloak.authenticated) {
        try {
            await keycloak.updateToken(60);
        } catch (error) {
            console.error('[sfetch] Failed to refresh token:', error);
            const redirectUri = Capacitor.isNativePlatform()
              ? 'fr.silvercore.synco://callback'
              : window.location.origin;
            keycloak.login({ redirectUri });
        }
    }

    if (keycloak.token) {
        headers['Authorization'] = `Bearer ${keycloak.token}`;
    }

    if (arg?.body instanceof FormData) {
        delete headers['Content-Type'];
    } else {
        if (!headers['Content-Type']) {
            headers['Content-Type'] = 'application/json';
        }
    }

    let response: Response;
    try {
        response = await fetch(`${import.meta.env.VITE_API_URL}${url}`, {
            ...arg,
            method: arg?.method || 'GET',
            headers,
            credentials: 'include'
        });
    } catch (error: any) {
        // Une requête annulée (changement de vue, nouvelle recherche...)
        // n'est pas une coupure serveur — seule une vraie erreur réseau
        // (y compris un 502 sans en-tête CORS, qui ressort côté navigateur
        // comme une TypeError opaque) doit déclencher la bannière.
        if (error?.name !== 'AbortError') {
            reportApiFailure();
        }
        throw error;
    }

    // 502/503/504 = la passerelle ne peut pas joindre le backend, contrairement
    // à un 4xx applicatif qui prouve au contraire que le serveur a bien répondu.
    if (response.status === 502 || response.status === 503 || response.status === 504) {
        reportApiFailure();
    } else {
        reportApiSuccess();
    }

    if ((response.status === 401 || response.status === 403) && retryCount < 1 && keycloak.authenticated) {
        console.log('[sfetch] Token rejected by server. Forcing token refresh...');
        try {
            await keycloak.updateToken(-1);
            return await sfetch(url, arg, retryCount + 1);
        } catch (error) {
            console.error('[sfetch] Failed to force refresh token', error);
        }
    }

    return response;
}
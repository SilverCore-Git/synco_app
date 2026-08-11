import { keycloak } from "../keycloak";
import { Capacitor } from "@capacitor/core";

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

    const response = await fetch(`${import.meta.env.VITE_API_URL}${url}`, {
        ...arg,
        method: arg?.method || 'GET',
        headers,
        credentials: 'include'
    });

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
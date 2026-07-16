import keycloak from "../keycloak";

export default async function sfetch(url: string, arg?: any) {
    
    try {
        await keycloak.updateToken(30);
    } catch (e) {
        console.warn("Failed to refresh token in sfetch", e);
    }

    const headers: Record<string, string> = { ...arg?.headers };

    if (keycloak.token) 
    {
        headers['Authorization'] = `Bearer ${keycloak.token}`;
    }

    if (arg?.body instanceof FormData)
    {
        delete headers['Content-Type'];
    } 
    else 
    {
        if (!headers['Content-Type']) 
        {
            headers['Content-Type'] = 'application/json';
        }
    }

    const apiUrl = import.meta.env.VITE_API_URL;
    if (!apiUrl || (!apiUrl.startsWith('http://') && !apiUrl.startsWith('https://'))) {
        console.error('Configuration invalide: VITE_API_URL doit être une URL HTTP(S) valide');
        throw new Error('Invalid API URL configuration');
    }

    const response = await fetch(`${apiUrl}${url}`, {
        ...arg,
        method: arg?.method || 'GET',
        headers,
        credentials: 'include'
    });

    if (!response.ok) {
        console.error(`[sfetch] API Error ${response.status} on ${url}`);
        if (response.status === 401) {
            const cleanUrl = window.location.origin + window.location.pathname;
            keycloak.login({ redirectUri: cleanUrl });
        }
    }

    return response;
    
}
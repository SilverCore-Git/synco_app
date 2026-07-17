import keycloak from "../keycloak";

export default async function sfetch(url: string, arg?: any) {
    
    const headers: Record<string, string> = { ...arg?.headers };

    if (keycloak.authenticated) {
        try {
            await keycloak.updateToken(30);
        } catch (error) {
            console.error('[sfetch] Failed to refresh token:', error);
            keycloak.login();
        }
    }

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

    return await fetch(`${import.meta.env.VITE_API_URL}${url}`, {
        ...arg,
        method: arg?.method || 'GET',
        headers,
        credentials: 'include'
    });
    
}
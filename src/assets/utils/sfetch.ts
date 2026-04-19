import keycloak from "../keycloak";

export default async function sfetch(url: string, arg?: any) {
    
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

    return await fetch('http://localhost:9000' + url, {
        ...arg,
        method: arg?.method || 'GET',
        headers
    });
    
}
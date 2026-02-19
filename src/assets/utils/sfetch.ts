
export default async function
(url: string, arg?: any)
{
    return await fetch('http://localhost:9000' + url, {
        ...arg,
        method: arg?.method || 'GET',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${await window.Clerk.session?.getToken()}`
        }
    });
}
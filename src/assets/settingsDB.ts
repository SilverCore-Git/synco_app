import sfetch from "./utils/sfetch";

// Shared across all sdb.get() callers so N settings items (theme, devMode, ...)
// loading at once don't each fire their own GET /api/users/me.
let profilePromise: Promise<any> | null = null;

async function fetchProfile(): Promise<any> {
    if (!profilePromise) {
        profilePromise = sfetch('/api/users/me').then(res => res.ok ? res.json() : null);
    }
    return profilePromise;
}

export const sdb = {

    // App settings live in our own DB (User.data.settings, via /api/users/me and
    // /api/users/me/settings) rather than as Keycloak user attributes: the realm's
    // User Profile schema silently drops any attribute it doesn't declare, even
    // when written through the admin API, so a value would "save" (200/201) but
    // never come back on the next read.
    async get(user: any, key: string): Promise<any>
    {
        if (!user) return undefined;

        const profile = await fetchProfile();
        return profile?.data?.settings?.[key];
    },

    async set(user: any, key: string, value: any)
    {
        if (!user) return;

        return await sfetch('/api/users/me/settings', {
            method: 'POST',
            body: JSON.stringify({ settings: { [key]: value } })
        });
    }

};

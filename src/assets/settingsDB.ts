import sfetch from "./utils/sfetch";

export const sdb = {
    
    async get(user: any, key: string): Promise<any> 
    {
        if (!user) return undefined;
        
        if (!user.profile) {
            try { await user.loadUserProfile(); } catch (e) { console.error(e); }
        }
        
        const attributes = user.profile?.attributes || {};
        const val = attributes[key] ? attributes[key][0] : undefined;
        
        if (val === 'true') return true;
        if (val === 'false') return false;
        if (!isNaN(Number(val)) && val !== '') return Number(val);
        
        return val;
    },

    async set(user: any, key: string, value: any) 
    {
        if (!user) return;
        
        if (!user.profile) user.profile = { attributes: {} };
        if (!user.profile.attributes) user.profile.attributes = {};
        user.profile.attributes[key] = [String(value)];
        
        return await sfetch('/api/users/me/update-attr', {
            method: 'POST',
            body: JSON.stringify({ attributs: { [key]: String(value) } })
        })
    }

};
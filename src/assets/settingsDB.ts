export const sdb = {
    
    async get(user: any, key: string): Promise<any> 
    {
        if (!user) return undefined;
        const settings = (user.unsafeMetadata?.settings as Record<string, any>) || {};
        return settings[key];
    },

    async set(user: any, key: string, value: any) 
    {
        if (!user) return;
        const currentSettings = (user.unsafeMetadata?.settings as Record<string, any>) || {};
        
        return await user.update({
            unsafeMetadata: {
                ...user.unsafeMetadata,
                settings: {
                    ...currentSettings,
                    [key]: value
                }
            }
        });
    }

};
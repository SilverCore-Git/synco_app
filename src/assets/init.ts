import sfetch from "./utils/sfetch";
import { isLoaded, organizations, user, openedOrg } from "./var";

class Init 
{

    constructor () {}

    public async run()
    {
        try {
            await Promise.all([
                this.InitUser(),
                this.initOrg(),
                this.initOpenedOrg()
            ]);
        }
        catch (e) {
            console.log(e);
        }
        finally {
            isLoaded.value = true;
        }
    }

    private async InitUser()
    {
        user.value = await sfetch('/api/users/me').then(res => res.json());
    }


    private async initOrg()
    {
        const orgs = await sfetch('/api/users/me/organizations').then(res => res.json());
        organizations.value = Array.isArray(orgs) ? orgs : [];
    }

    private async initOpenedOrg()
    {
        const path = window.location.pathname;
        const orgId = path.split('/')[1];
        
        if (orgId && !['invite', 'root'].includes(orgId)) {
            try {
                const res = await sfetch(`/api/orgs/${orgId}`);
                if (res.ok) {
                    openedOrg.value = await res.json();
                }
            } catch (e) {
                console.error('Failed to prefetch org', e);
            }
        }
    }

}


export const refetchUser = async () => {
    user.value = await sfetch('/api/users/me').then(res => res.json());
}

export default new Init();
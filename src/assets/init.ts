import sfetch from "./utils/sfetch";
import { isLoaded, organizations, user } from "./var";

class Init 
{

    constructor () {}

    public async run()
    {
        try {
            await Promise.all([
                this.InitUser(),
                this.initOrg()
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

}


export const refetchUser = async () => {
    user.value = await sfetch('/api/users/me').then(res => res.json());
}

export default new Init();
import sfetch from "./utils/sfetch";
import { isLoaded, organizations } from "./var";


class Init 
{

    constructor () {}

    public async run()
    {
        await Promise.all([
            this.InitUser(),
            this.initOrg()
        ])
        isLoaded.value = true;
    }

    private async InitUser()
    {
        await sfetch('/api/users/me').then(res => res.json());
    }


    private async initOrg()
    {

        const orgs = await sfetch('/api/users/me/organizations').then(res => res.json());
        organizations.value = orgs;

    }

}

export default new Init();
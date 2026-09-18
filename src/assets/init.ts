import sfetch from "./utils/sfetch";
import { isLoaded, organizations, user, openedOrg } from "./var";
import router from "../router";

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
        let orgId = path.split('/')[1];

        // No org in the URL (fresh launch landing on "/"): fall back to the
        // last org the user had open, so the app doesn't always restart on
        // the org selection screen.
        const isFreshLaunch = !orgId;
        if (isFreshLaunch) {
            orgId = localStorage.getItem('lastOpenedOrgId') || '';
        }

        if (orgId && !['invite', 'root'].includes(orgId)) {
            try {
                const res = await sfetch(`/api/orgs/${orgId}`);
                if (res.ok) {
                    openedOrg.value = await res.json();
                    if (isFreshLaunch) {
                        // showView explicite : sur mobile (OrgLayout.showRouterView),
                        // l'absence du paramètre atterrit correctement sur le contenu
                        // par défaut, mais un lien explicite est plus robuste et évite
                        // toute ambiguïté si cette logique change côté OrgLayout.
                        router.replace({ name: 'OrgHome', params: { orgId }, query: { showView: '1' } });
                    }
                } else if (isFreshLaunch) {
                    // Org no longer accessible (left, deleted...): drop the stale preference.
                    localStorage.removeItem('lastOpenedOrgId');
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
import type { Org } from "./types/org";
import type { WorkSpace } from "./types/workSpace";

const organizations: Org[] = [
    {
        id: "org-8fec6cfc42a14c09bc7f1291eba954c0",
        name: "SilverTeams Core",
        logo: "https://api.dicebear.com/7.x/identicon/svg?seed=SilverCore&backgroundColor=1e1e1e&color=1ed760",
        stats: {
            memberCount: 12,
            onlineCount: 8
        },
        config: {
            maxNotesPerSpace: 500,
            maxFileStoragePerSpace: 1024, // 1 Go
            maxUsersPerSpace: 50,
            maxTotalUsers: 100
        }
    },
    {
        id: "org-5357410fce6d45959ed4d0bac84595a8",
        name: "Neo-Defense Corp",
        logo: "https://api.dicebear.com/7.x/identicon/svg?seed=NeoDefense&backgroundColor=1e1e1e&color=bfc3c7",
        stats: {
            memberCount: 450,
            onlineCount: 124
        },
        config: {
            maxNotesPerSpace: 2000,
            maxFileStoragePerSpace: 10240, // 10 Go
            maxUsersPerSpace: 200,
            maxTotalUsers: 1000
        }
    }
];

const workSpace: WorkSpace[] = [

    {
        id: "fezr435TGFREDsgz",
        org_id: "org-8fec6cfc42a14c09bc7f1291eba954c0",
        name: "General",
        logo: "https://api.dicebear.com/7.x/identicon/svg?seed=General&backgroundColor=1e1e1e&color=1ed760"
    },

    {
        id: "fezr43GFREDsgz",
        org_id: "org-8fec6cfc42a14c09bc7f1291eba954c0",
        name: "fdsfds",
        logo: "bi-people"
    },

    {
        id: "fezr43GFREDsg432z",
        org_id: "org-5357410fce6d45959ed4d0bac84595a8",
        name: "fdsfds",
        logo: "bi-people"
    },

];

export { organizations, workSpace };
export default organizations;
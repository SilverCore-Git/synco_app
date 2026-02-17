import type { Org } from "./types/org";
import type { WorkSpace, Category, Thread } from "./types/workSpace";

const organizations: Org[] = [
    {
        id: "org-8fec6cfc42a14c09bc7f1291eba954c0",
        name: "SilverTeams Core",
        logo: "https://api.dicebear.com/7.x/identicon/svg?seed=SilverCore&backgroundColor=1e1e1e&color=1ed760",
        stats: { memberCount: 12, onlineCount: 8 },
        config: {
            maxNotesPerSpace: 500,
            maxFileStoragePerSpace: 1024,
            maxUsersPerSpace: 50,
            maxTotalUsers: 100
        }
    },
    {
        id: "org-5357410fce6d45959ed4d0bac84595a8",
        name: "Neo-Defense Corp",
        logo: "https://api.dicebear.com/7.x/identicon/svg?seed=NeoDefense&backgroundColor=1e1e1e&color=bfc3c7",
        stats: { memberCount: 450, onlineCount: 124 },
        config: {
            maxNotesPerSpace: 2000,
            maxFileStoragePerSpace: 10240,
            maxUsersPerSpace: 200,
            maxTotalUsers: 1000
        }
    }
];

const workSpaces: WorkSpace[] = [
    {
        id: "ws-silver-gen",
        org_id: "org-8fec6cfc42a14c09bc7f1291eba954c0",
        name: "QG Opérationnel",
        logo: "bi-shield-lock",
        categories: [
            {
                id: "cat-1",
                name: "Canaux Textuels",
                threads: [
                    { id: "th-1", index: 1, name: "briefing-rd", type: "text" },
                    { id: "th-2", index: 2, name: "déploiement-prod", type: "text" }
                ]
            },
            {
                id: "cat-2",
                name: "Salons Vocaux",
                threads: [
                    { id: "th-3", index: 3, name: "Cafétéria", type: "vocal" }
                ]
            }
        ]
    },
    {
        id: "ws-silver-dev",
        org_id: "org-8fec6cfc42a14c09bc7f1291eba954c0",
        name: "Labo Tech",
        logo: "bi-code-slash",
        categories: [
            {
                id: "cat-3",
                name: "Développement",
                threads: [
                    { id: "th-4", index: 1, name: "architecture-e2ee", type: "text" },
                    { id: "th-5", index: 2, name: "bugs-tracking", type: "text" }
                ]
            },
            {
                id: "cat-4",
                name: "Vocal",
                threads: [
                    { id: "th-6", index: 3, name: "Pair Programming", type: "vocal" }
                ]
            }
        ]
    },
    {
        id: "ws-neo-intel",
        org_id: "org-5357410fce6d45959ed4d0bac84595a8",
        name: "Intelligence",
        logo: "bi-eye",
        categories: [
            {
                id: "cat-5",
                name: "Opérations",
                threads: [
                    { id: "th-7", index: 1, name: "rapports-terrain", type: "text" }
                ]
            },
            {
                id: "cat-6",
                name: "Urgence",
                threads: [
                    { id: "th-8", index: 2, name: "Salle de crise", type: "vocal" }
                ]
            }
        ]
    }
];

export { organizations, workSpaces };
export default organizations;
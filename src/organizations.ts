import type { Org } from "./types/org";
import type { WorkSpace } from "./types/workSpace";

// Fonction utilitaire pour générer des threads en masse
const generateThreads = (count: number, prefix: string) => {
    return Array.from({ length: count }, (_, i) => ({
        id: `th-${prefix}-${i + 1}`,
        index: i + 1,
        name: `${prefix}-channel-${i + 1}`,
        type: (i % 5 === 0 ? 'vocal' : 'text') as 'text' | 'vocal'
    }));
};

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
        },
        home: [
            {
                id: "cat-home-1",
                index: 1,
                name: "Annonces",
                threads: [
                    { id: "th-h1", index: 1, name: "nouveautés", type: "text" },
                    { id: "th-h2", index: 2, name: "roadmap", type: "text" }
                ]
            }
        ]
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
        },
        home: []
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
                index: 1,
                name: "Administration",
                threads: [
                    { id: "th-1", index: 1, name: "briefing-rd", type: "text" },
                    { id: "th-2", index: 2, name: "déploiement-prod", type: "text" }
                ]
            },
            {
                id: "cat-2",
                index: 2,
                name: "Communication",
                threads: [
                    { id: "th-5", index: 1, name: "Général", type: "text" },
                    { id: "th-6", index: 2, name: "Cafétéria", type: "vocal" }
                ]
            }
        ]
    },
    {
        id: "ws-massive-logs",
        org_id: "org-8fec6cfc42a14c09bc7f1291eba954c0",
        name: "Archives & Logs",
        logo: "bi-archive",
        categories: [
            {
                id: "cat-massive-1",
                index: 1,
                name: "Rapports Hebdomadaires (20)",
                threads: generateThreads(20, "week")
            },
            {
                id: "cat-massive-2",
                index: 2,
                name: "Archives Système (40)",
                threads: generateThreads(40, "arch")
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
                index: 1,
                name: "Surveillance",
                threads: [
                    { id: "th-18", index: 1, name: "secteur-alpha", type: "text" }
                ]
            }
        ]
    }
];

export { organizations, workSpaces };
export default organizations;
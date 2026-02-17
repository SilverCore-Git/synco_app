import type { Org } from "./types/org";
import type { WorkSpace, Thread } from "./types/workSpace";

// Fonction utilitaire pour générer des threads en masse avec liaison de catégorie
const generateThreads = (count: number, prefix: string, categoryId: string): Thread[] => {
    return Array.from({ length: count }, (_, i) => ({
        id: `th-${prefix}-${i + 1}`,
        categoryId: categoryId,
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
        home: {
            categories: [
                { id: "fdsfds3455346", index: 1, name: "Général" },
            ],
            threads: [
                { id: "thrad-home-1", categoryId: 'fdsfds3455346', type: "text", index: 1, name: "Annonces" }
            ]
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
        },
        home: {
            categories: [
                { id: "cat-1", index: 1, name: "Administration" },
                { id: "cat-2", index: 2, name: "Communication" }
            ],
            threads: [
                { id: "th-1", categoryId: "cat-1", index: 1, name: "briefing-rd", type: "text" },
                { id: "th-2", categoryId: "cat-1", index: 2, name: "déploiement-prod", type: "text" },
                { id: "th-5", categoryId: "cat-2", index: 1, name: "Général", type: "text" },
                { id: "th-6", categoryId: "cat-2", index: 2, name: "Cafétéria", type: "vocal" }
            ]
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
            { id: "cat-1", index: 1, name: "Administration" },
            { id: "cat-2", index: 2, name: "Communication" }
        ],
        threads: [
            { id: "th-1", categoryId: "cat-1", index: 1, name: "briefing-rd", type: "text" },
            { id: "th-2", categoryId: "cat-1", index: 2, name: "déploiement-prod", type: "text" },
            { id: "th-5", categoryId: "cat-2", index: 1, name: "Général", type: "text" },
            { id: "th-6", categoryId: "cat-2", index: 2, name: "Cafétéria", type: "vocal" }
        ]
    },
    {
        id: "ws-massive-logs",
        org_id: "org-8fec6cfc42a14c09bc7f1291eba954c0",
        name: "Archives & Logs",
        logo: "bi-archive",
        categories: [
            { id: "cat-massive-1", index: 1, name: "Rapports Hebdomadaires" },
            { id: "cat-massive-2", index: 2, name: "Archives Système" }
        ],
        threads: [
            ...generateThreads(20, "week", "cat-massive-1"),
            ...generateThreads(40, "arch", "cat-massive-2")
        ]
    },
    {
        id: "ws-neo-intel",
        org_id: "org-5357410fce6d45959ed4d0bac84595a8",
        name: "Intelligence",
        logo: "bi-eye",
        categories: [
            { id: "cat-5", index: 1, name: "Surveillance" }
        ],
        threads: [
            { id: "th-18", categoryId: "cat-5", index: 1, name: "secteur-alpha", type: "text" }
        ]
    }
];

export { organizations, workSpaces };
export default organizations;
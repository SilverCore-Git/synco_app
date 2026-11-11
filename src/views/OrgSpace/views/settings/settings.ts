import type { Permission } from '@/config/permissions.config';

interface settingsView {
    name: string;
    icon: string; // bi 
    route: string; // /settings/{{ route }}
    permission: Permission;
}


const STATS_SETTINGS_ROUTE = 'OrgSettingsStats';

const settingsViews: settingsView[] = [
    {
        name: 'Paramètres généraux',
        icon: 'bi-gear-fill',
        route: 'OrgSettingsGeneral',
        permission: 'ORG_GENERAL'
    },
    {
        name: 'Gestion des Membres',
        icon: 'bi-people-fill',
        route: 'OrgSettingsMembers',
        permission: 'ORG_MEMBERS'
    },
    {
        name: 'Rôles & Permissions',
        icon: 'bi-shield-lock',
        route: 'OrgSettingsRoles',
        permission: 'ORG_ROLES'
    },
    {
        name: 'Webhooks',
        icon: 'bi-link-45deg',
        route: 'OrgSettingsWebhooks',
        permission: 'ORG_WEBHOOKS'
    },
    {
        name: 'Stockage',
        icon: 'bi-hdd-network',
        route: 'OrgSettingsStorage',
        permission: 'ORG_STORAGE'
    },
    {
        name: 'Synco AI',
        icon: 'bi-robot',
        route: 'OrgSettingsAI',
        permission: 'ORG_AI'
    },
    {
        name: 'Liens de partage',
        icon: 'bi-box-arrow-up-right',
        route: 'OrgSettingsLinks',
        permission: 'ORG_STORAGE'
    },
    {
        // Ouvert aussi par SPACE_STATS sur un seul space : voir useSettingsAccess.
        name: 'Statistiques',
        icon: 'bi-bar-chart-line-fill',
        route: STATS_SETTINGS_ROUTE,
        permission: 'ORG_STATS'
    }
]


export {
    settingsViews,
    STATS_SETTINGS_ROUTE
}

export type {
    settingsView
}
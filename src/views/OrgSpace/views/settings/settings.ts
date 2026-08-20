import type { Permission } from '@/config/permissions.config';

interface settingsView {
    name: string;
    icon: string; // bi 
    route: string; // /settings/{{ route }}
    permission: Permission;
}


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
    }
]


export {
    settingsViews
}

export type {
    settingsView
}
interface settingsView {
    name: string;
    icon: string; // bi 
    route: string; // /settings/{{ route }}
}


const settingsViews: settingsView[] = [
    {
        name: 'Paramètres généraux',
        icon: 'bi-gear-fill',
        route: 'OrgSettingsGeneral'
    },
    {
        name: 'Gestion des Membres',
        icon: 'bi-people-fill',
        route: 'OrgSettingsMembers'
    },
    {
        name: 'Webhooks',
        icon: 'bi-link-45deg',
        route: 'OrgSettingsWebhooks'
    },
    {
        name: 'Stockage',
        icon: 'bi-hdd-network',
        route: 'OrgSettingsStorage'
    },
    {
        name: 'Intelligence Artificielle',
        icon: 'bi-robot',
        route: 'OrgSettingsAI'
    }
]


export {
    settingsViews
}

export type {
    settingsView
}
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
    }
]


export {
    settingsViews
}

export type {
    settingsView
}
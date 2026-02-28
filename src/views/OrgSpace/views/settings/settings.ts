interface settingsView {
    name: string;
    icon: string; // bi 
    route: string; // /settings/{{ route }}
}


const settingsViews: settingsView[] = [
    {
        name: 'Paramètres généraux',
        icon: 'bi-gear',
        route: 'OrgSettingsGeneral'
    },
    {
        name: 'Sécurité',
        icon: 'bi-shield-fill',
        route: 'OrgSettingsSecurity'
    }
]


export {
    settingsViews
}

export type {
    settingsView
}
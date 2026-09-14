// Vue affichée dans l'Agenda (mois / semaine / jour), persistée via les
// attributs Keycloak — même mécanisme que showUsersBar (useUsersBar.ts).
// Tant que l'utilisateur n'a jamais choisi explicitement, aucune valeur
// n'est écrite et la vue par défaut dépend du device courant (semaine sur
// desktop, jour sur mobile) ; dès qu'un choix est fait, il est mémorisé et
// prime sur ce défaut, quel que soit l'appareil utilisé ensuite.

import { computed } from 'vue';
import useSettingsItem from './useSettingsItem';
import { isLittleScreen } from '@/assets/var';

export type AgendaViewMode = 'month' | 'week' | 'day';

const { Item: viewModeSetting } = useSettingsItem('agendaViewMode', undefined);

export const useAgendaViewMode = () => {
    const viewMode = computed<AgendaViewMode>({
        get: () => {
            if (viewModeSetting.value === 'month' || viewModeSetting.value === 'week' || viewModeSetting.value === 'day') {
                return viewModeSetting.value;
            }
            return isLittleScreen.value ? 'day' : 'week';
        },
        set: (val: AgendaViewMode) => {
            viewModeSetting.value = val;
        }
    });

    return { viewMode };
};

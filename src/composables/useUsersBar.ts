import { ref, computed } from 'vue';
import useSettingsItem from './useSettingsItem';
import { isLittleScreen } from '@/assets/var';

const { Item: showUsersBarSetting } = useSettingsItem('showUsersBar', true);
const showUsersBarMobile = ref(false);

// Certaines pages (Tâches, Fichiers) masquent la barre par défaut sans
// toucher à la préférence enregistrée de l'utilisateur : on revient au
// réglage normal dès qu'on quitte ces pages (ex: retour dans un salon).
const hiddenByRoute = ref(false);
const routeOverride = ref<boolean | null>(null);

export const useUsersBar = () => {
    const showUsersBar = computed({
        get: () => {
            if (hiddenByRoute.value) {
                return routeOverride.value ?? false;
            }
            if (isLittleScreen.value) {
                return showUsersBarMobile.value;
            }
            return showUsersBarSetting.value !== undefined ? showUsersBarSetting.value : true;
        },
        set: (val) => {
            if (hiddenByRoute.value) {
                routeOverride.value = val;
                return;
            }
            if (isLittleScreen.value) {
                showUsersBarMobile.value = val;
            } else {
                showUsersBarSetting.value = val;
            }
        }
    });

    const setUsersBarHiddenByRoute = (hidden: boolean) => {
        hiddenByRoute.value = hidden;
        if (!hidden) routeOverride.value = null;
    };

    return { showUsersBar, setUsersBarHiddenByRoute };
};

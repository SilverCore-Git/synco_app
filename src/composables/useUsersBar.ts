import { ref, computed } from 'vue';
import useSettingsItem from './useSettingsItem';
import { isLittleScreen } from '@/assets/var';

const { Item: showUsersBarSetting } = useSettingsItem('showUsersBar', true);
const showUsersBarMobile = ref(false);

export const useUsersBar = () => {
    const showUsersBar = computed({
        get: () => {
            if (isLittleScreen.value) {
                return showUsersBarMobile.value;
            }
            return showUsersBarSetting.value !== undefined ? showUsersBarSetting.value : true;
        },
        set: (val) => {
            if (isLittleScreen.value) {
                showUsersBarMobile.value = val;
            } else {
                showUsersBarSetting.value = val;
            }
        }
    });

    return { showUsersBar };
};

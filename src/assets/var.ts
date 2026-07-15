import type { User, Org } from "@/types/types";
import { computed, ref } from "vue";


const organizations = ref<any[]>([]);
const openedOrg = ref<Org | null>(null);
const user = ref<User | null>(null);
const kcToken = ref<string>('');
const isLoaded = ref<boolean>(false);
const isLittleScreen = ref<boolean>(false);
const member = computed(() => {
    return openedOrg.value?.members?.find(m => m.userId == user.value?.id);
});

const todoEnabled = computed(() => {
    if (!openedOrg.value) return false;
    return openedOrg.value.activeModules?.todo || false;
});

const filesEnabled = computed(() => {
    if (!openedOrg.value) return false;
    return openedOrg.value.activeModules?.files !== false; // defaults to true
});


export { organizations, openedOrg, isLoaded, user, member, isLittleScreen, kcToken, todoEnabled, filesEnabled };
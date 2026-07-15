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
    return openedOrg.value?.activeModules?.todo === true;
});


export { organizations, openedOrg, isLoaded, user, member, isLittleScreen, kcToken, todoEnabled };
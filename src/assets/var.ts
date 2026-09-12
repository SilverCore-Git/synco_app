import type { User, Org } from "@/types/types";
import { computed, ref } from "vue";


const organizations = ref<any[]>([]);
const openedOrg = ref<Org | null>(null);
const user = ref<User | null>(null);
const kcToken = ref<string>('');
const isLoaded = ref<boolean>(false);
const isLittleScreen = ref<boolean>(false);
// Hauteur réelle (px) de la UserCard flottante (OrgLayout.vue) mesurée via
// ResizeObserver — elle varie selon que le cadre d'appel vocal est affiché.
// Les listes scrollables (ThreadsBar...) l'utilisent pour réserver exactement
// la place qu'il faut en bas plutôt qu'une marge fixe devinée.
const userCardHeight = ref<number>(0);
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

const aiEnabled = computed(() => {
    if (!openedOrg.value) return false;
    return openedOrg.value.activeModules?.ai === true;
});

const onlyOfficeEnabled = computed(() => {
    if (!openedOrg.value) return false;
    return openedOrg.value.activeModules?.onlyoffice === true;
});

const agendaEnabled = computed(() => {
    if (!openedOrg.value) return false;
    return openedOrg.value.activeModules?.agenda || false;
});


export { organizations, openedOrg, isLoaded, user, member, isLittleScreen, kcToken, todoEnabled, filesEnabled, aiEnabled, onlyOfficeEnabled, agendaEnabled, userCardHeight };
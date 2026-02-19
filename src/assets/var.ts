import type { Org, OrgLittle } from "@/types/types";
import { ref } from "vue";


const organizations = ref<OrgLittle[]>([]);
const openedOrg = ref<Org | null>(null);
const isLoaded = ref<boolean>(false);


export { organizations, openedOrg, isLoaded };
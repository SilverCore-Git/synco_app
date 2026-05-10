import type { User, Org } from "@/types/types";
import { ref } from "vue";


const organizations = ref<any[]>([]);
const openedOrg = ref<Org | null>(null);
const user = ref<User | null>(null);
const isLoaded = ref<boolean>(false);


export { organizations, openedOrg, isLoaded, user };
import { computed } from "vue";
import { openedOrg } from "./var";
import keycloak from "./keycloak";

const isAdmin = computed(() => {

    const userId = localStorage.getItem('userId');
    const user = openedOrg.value?.members?.find(user => user.user?.id == userId);

    return (
        user?.userId === openedOrg.value?.ownerId
        || user?.role === 'ADMIN'
        || user?.role === 'OWNER'
    )

})

export default isAdmin;
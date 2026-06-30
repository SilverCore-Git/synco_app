import { computed } from "vue";
import { openedOrg } from "./var";

const isAdmin = computed(() => {

    const userId = localStorage.getItem('userId');
    const user = openedOrg.value?.members?.find(user => user.userId == userId);

    return (
        user?.userId === openedOrg.value?.ownerId
        || user?.role === 'admin'
        || user?.role === 'owner'
    )

})

export default isAdmin;
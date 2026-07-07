import { computed } from "vue";
import { openedOrg } from "./var";

const isAdmin = computed(() => {

    const userId = localStorage.getItem('userId');
    
    if (userId && openedOrg.value?.ownerId === userId) {
        return true;
    }

    const user = openedOrg.value?.members?.find(user => user.userId == userId);

    return (
        user?.role === 'ADMIN'
        || user?.role === 'OWNER'
        || user?.role === 'admin'
        || user?.role === 'owner'
    )

})

export default isAdmin;
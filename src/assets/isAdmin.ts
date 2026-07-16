import { computed } from "vue";
import { openedOrg, user } from "./var";

const isAdmin = computed(() => {
    const currentUserId = user.value?.id;
    
    if (currentUserId && openedOrg.value?.ownerId === currentUserId) {
        return true;
    }

    const member = openedOrg.value?.members?.find(m => m.userId === currentUserId);

    return (
        member?.role === 'ADMIN'
        || member?.role === 'OWNER'
        || member?.role === 'admin'
        || member?.role === 'owner'
    )
})

export default isAdmin;
import { computed } from "vue";
import { openedOrg } from "./var";

const isAdmin = computed(() => {

    const user = openedOrg.value?.members?.find(user => user.user?.clerkId == window.Clerk.user?.id);

    return (
        user?.userId === openedOrg.value?.ownerId
        || user?.role === 'ADMIN'
        || user?.role === 'OWNER'
    )

})

export default isAdmin;
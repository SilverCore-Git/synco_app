<template>
    <Transition name="fade">
        <button
            v-if="activeCall"
            @click="goToCall"
            class="
                absolute top-4 left-4 z-30
                flex items-center gap-2.5 pl-2 pr-3 py-2 rounded-2xl
                bg-(--bg2) border border-(--primary)/40
                shadow-lg hover:border-(--primary) hover:bg-(--primary)/10
                transition-colors text-left
            "
            title="Revenir au salon vocal"
        >
            <span class="relative flex items-center justify-center w-7 h-7 rounded-full bg-(--primary)/15 text-(--primary) shrink-0">
                <i class="bi bi-mic-fill text-xs" />
                <span class="absolute inset-0 rounded-full border-2 border-(--primary) animate-ping opacity-60" />
            </span>
            <span class="min-w-0">
                <span class="block text-[10px] font-black uppercase tracking-wide text-(--primary) leading-none">En vocal</span>
                <span class="block text-xs font-semibold text-(--text) truncate max-w-40 leading-tight mt-0.5">{{ activeCall.threadName }}</span>
            </span>
            <i class="bi bi-chevron-right text-(--text2) text-xs shrink-0" />
        </button>
    </Transition>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { openedOrg } from '@/assets/var';
import useLiveKit from '@/composables/useLiveKit';

const route = useRoute();
const router = useRouter();
const { room, isConnected } = useLiveKit();

// Le nom de la room LiveKit est le threadId (cf. /api/livekit/token côté
// back) : on retrouve le workspace/salon correspondant côté front pour
// savoir si l'appel en cours concerne bien le workspace actuellement ouvert.
const activeCall = computed(() => {
    if (!isConnected.value || !room.value || !openedOrg.value) return null;

    const threadId = room.value.name;
    const currentSpaceId = route.params.spaceId as string | undefined;
    if (!currentSpaceId) return null;

    const space = openedOrg.value.spaces?.find(s => s.id === currentSpaceId);
    const thread = space?.threads?.find(t => t.id === threadId);
    if (!space || !thread) return null;

    // Déjà sur la page du salon vocal actif : le bandeau n'apporterait rien.
    if (route.params.threadId === threadId) return null;

    return { spaceId: space.id, threadId: thread.id, threadName: thread.name };
});

const goToCall = () => {
    if (!activeCall.value) return;
    router.push({
        name: 'SpaceThreadView',
        params: {
            orgId: route.params.orgId,
            spaceId: activeCall.value.spaceId,
            threadId: activeCall.value.threadId
        },
        query: { type: 'vocal', showView: '1' }
    });
};
</script>

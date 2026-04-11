<template>

    <div class="flex flex-col w-full">

        <button
            @click="handleAction"
            class="
                w-full flex items-center justify-start 
                text-left gap-2 px-2 py-1.5 rounded-lg
                transition-all duration-200 group cursor-pointer
                hover:bg-(--primary)/5 active:scale-95
                hover:text-(--text) 
            "
            :class="[
                isActiveInRoom
                    ? 'border-l-3 border-(--primary) bg-(--primary)/10 text-(--text)' 
                    : 'text-(--text)/60',
            ]"
        >

            <div class="flex items-center justify-center w-5 h-5">
                <i
                    v-if="isSpeakingInThisRoom"
                    class="bi bi-soundwave text-lg text-(--primary) animate-pulse"
                />
                <i
                    v-else
                    class="bi bi-volume-up-fill text-lg group-hover:opacity-100"
                    :class="isActiveInRoom ? 'opacity-100' : 'opacity-40'"
                />
            </div>

            <span class="text-sm font-medium truncate lowercase tracking-wide">
                {{ thread.name }}
            </span>

            <div 
                v-if="isActiveInRoom && currentParticipants.length > 0" 
                class="ml-auto text-[10px] bg-black/20 px-1.5 py-0.5 rounded-full opacity-60"
            >
                {{ currentParticipants.length }}
            </div>

        </button>

        <div 
            v-if="isActiveInRoom && currentParticipants.length > 0" 
            class="flex flex-col gap-1 ml-7 mt-1 mb-2"
        >

            <div 
                v-for="p in currentParticipants" 
                :key="p.identity"
                class="flex items-center gap-2 py-1 px-1 rounded transition-colors"
                :class="p.isSpeaking ? 'text-(--primary)' : 'text-(--text)/70'"
            >

                <div class="relative">
                    <img 
                        :src="JSON.parse(p.metadata!).avatarUrl" 
                        class="w-5 h-5 rounded-full object-cover transition-transform"
                        :class="p.isSpeaking ? 'scale-110 ring-2 ring-(--primary)' : ''"
                    />
                </div>
                
                <span class="text-xs truncate font-medium">
                    {{ JSON.parse(p.metadata!).name || 'Anonyme' }}
                </span>

                <i v-if="!p.isMicrophoneEnabled" class="bi bi-mic-mute-fill text-[10px] ml-auto opacity-40" />

            </div>

        </div>

    </div>

</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import type { Thread } from '@/types/workSpace';
import useLiveKit from '@/composables/useLiveKit';
import sfetch from '@/assets/utils/sfetch';
import { useRoute, useRouter } from 'vue-router';

const props = defineProps<{
  thread: Thread;
  active?: boolean;
}>();

const emit = defineEmits(['click']);

const route = useRoute();
const router = useRouter();

const { room, isConnected, connectToRoom, allParticipants: currentParticipants } = useLiveKit();

const isActiveInRoom = computed(() => {
    return isConnected.value && room.value?.name === props.thread.id;
});

const isSpeakingInThisRoom = computed(() => {
    return isActiveInRoom.value && room.value?.localParticipant.isSpeaking;
});

const handleAction = async () => {
    
    if (isActiveInRoom.value) 
    {
        const name = (route.name == 'OrgHome' || route.name == 'OrgThreadHome') 
                 ? 'OrgThreadHome' : 'SpaceThreadView';
        router.push({ name, params: { ...route.params, threadId: props.thread.id }, query: { ...route.query,  type: 'vocal' } })
    } 
    else 
    {

        const res = await sfetch('/api/livekit/token', {
            method: 'POST',
            body: JSON.stringify({ threadId: props.thread.id }),
        });

        if (res.ok) 
        {
            const data = await res.json();
            await connectToRoom(data.url, data.token, props.thread.id);
        }

    }

};

</script>
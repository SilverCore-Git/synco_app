<template>

                <div
                    :key="msg.id" 
                    class="group relative px-4 py-2 flex justify-start items-start gap-3 hover:bg-white/6 rounded-lg transition-colors"
                    :class="selectedMessage == msg.id ? ' border border-(--primary) border-dashed animate-pulse' : ''"
                >

                    <div 
                        class="
                            absolute -top-5 right-3 sdropdown 
                             flex-raw items-start z-80
                            rounded-xl border border-(--text)/10
                            bg-(--bg) shadow-xl ring-1 ring-white/5 focus:outline-none
                        "
                        :class="showPlusDropdown ? 'flex' : 'hidden group-hover:flex'"
                    >

                        <button class="dropdown-item-annimate dropdown-item-style">
                            <i class="bi bi-clipboard text-lg" />
                        </button>

                        <button class="dropdown-item-annimate dropdown-item-style">
                            <i class="bi bi-arrow-90deg-left text-lg" />
                        </button>
                        
                        <button class="dropdown-item-annimate dropdown-item-style">
                            <i class="bi bi-arrow-90deg-right text-lg" />
                        </button>

                        <button @click="showPlusDropdown = !showPlusDropdown" class="dropdown-item-annimate dropdown-item-style">
                            <i class="bi bi-three-dots text-lg" />
                        </button>

                        <div 
                            v-if="showPlusDropdown"
                            class="
                                flex flex-col items-start absolute top-full mt-2 right-0
                                rounded-xl border border-(--text)/10 sdropdown w-56 z-90
                                bg-(--bg) shadow-xl ring-1 ring-white/5 focus:outline-none
                            "
                        >

                            <button 
                                @click="openDeleteConfirm" 
                                class="dropdown-item-annimate dropdown-item-style  text-red-400! hover:bg-red-500/10!"
                            >
                                Supprimer le message
                            </button>
                        
                        </div>
                    
                    </div>

                    <img 
                        v-if="msg.sender"
                        :src="msg.sender?.avatarUrl || `https://ui-avatars.com/api/?name=${msg.sender?.name}&background=128a60&color=fff`"
                        :alt="msg.sender?.name"
                        @error="(e: any) => e.target.src = `https://ui-avatars.com/api/?name=${msg.sender?.name}&background=128a60&color=fff`"
                        class="rounded-full w-9 h-9 object-cover shrink-0"
                    />

                    <div class="min-w-0 flex-1">

                        <div class="flex items-baseline gap-2">

                            <span class="text-(--primary) font-bold text-xs tracking-tighter truncate">
                                {{ msg.sender?.name || 'Anonyme' }}
                            </span>

                            <span class="text-(--text)/20 text-[10px] whitespace-nowrap">
                                {{ formatTime(msg.createdAt as any) }}
                            </span>

                        </div>

                        <p class="text-(--text)/80 text-sm leading-relaxed wrap-break-word whitespace-pre-wrap">
                            {{ msg.content }}
                        </p>

                    </div>

                </div>

        <ConfirmDelete 
            :show="showDeleteConfirm"
            itemType="le message"
            :itemName="msg.content.substring(0, 50)"
            @confirm="deleteMessage"
            @cancel="showDeleteConfirm = false"
        />

</template>

<script setup lang="ts">

import { ref } from 'vue';
import ConfirmDelete from '@/components/common/ConfirmDelete.vue';

defineProps<{
    msg: any;
    selectedMessage: string | null;
}>();

const formatTime = (d: string) => new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const showPlusDropdown = ref<boolean>(false);
const showDeleteConfirm = ref<boolean>(false);

const openDeleteConfirm = () => {
    showPlusDropdown.value = false;
    showDeleteConfirm.value = true;
};

const deleteMessage = async () => {
    // mettre la ligique
    showDeleteConfirm.value = false;
};

</script>
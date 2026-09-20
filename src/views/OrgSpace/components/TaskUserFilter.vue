<template>
    <DropDown align="left" content-iner-t-w="min-w-[280px]" @toggled="onToggled">
        <template #trigger>
            <button type="button" class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs transition-all whitespace-nowrap bg-(--text)/5 text-(--text)/70 hover:bg-(--text)/10 h-full min-w-0 max-w-[140px]">
                <template v-if="!modelValue">
                    <i class="bi bi-people-fill shrink-0"></i>
                    <span class="truncate">Toutes</span>
                </template>
                <template v-else-if="modelValue === currentUserId">
                    <img v-if="me?.avatarUrl" :src="me.avatarUrl" class="w-5 h-5 rounded-full object-cover shrink-0">
                    <div v-else class="w-5 h-5 rounded-full bg-(--primary)/20 text-(--primary) flex items-center justify-center text-[9px] font-bold shrink-0">
                        {{ ($p(me?.name) || '?').substring(0, 2).toUpperCase() }}
                    </div>
                    <span class="truncate">Moi</span>
                </template>
                <template v-else>
                    <img v-if="selectedMember?.user?.avatarUrl" :src="selectedMember.user.avatarUrl" class="w-5 h-5 rounded-full object-cover shrink-0">
                    <div v-else class="w-5 h-5 rounded-full bg-(--text)/10 flex items-center justify-center text-[9px] shrink-0">
                        {{ ($p(selectedMember?.user?.name) || '?').substring(0, 2).toUpperCase() }}
                    </div>
                    <span class="truncate">{{ $p(selectedMember?.user?.name) || 'Membre' }}</span>
                </template>
                <i class="bi bi-chevron-down text-[10px] opacity-60 shrink-0"></i>
            </button>
        </template>

        <template #content>
            <div>
                <button
                    type="button"
                    @click="select(null)"
                    class="dropdown-item-style"
                    :class="!modelValue ? '!bg-(--primary)/15 !text-(--primary)' : ''"
                >
                    <i class="bi bi-people-fill mr-2"></i>
                    Toutes les tâches
                </button>
                <button
                    type="button"
                    @click="select(currentUserId)"
                    class="dropdown-item-style"
                    :class="modelValue === currentUserId ? '!bg-(--primary)/15 !text-(--primary)' : ''"
                >
                    <i class="bi bi-person-fill mr-2"></i>
                    Mes tâches
                </button>

                <div class="border-t border-(--border-color) my-1.5"></div>

                <div class="relative px-1 pb-1.5">
                    <i class="bi bi-search absolute left-3.5 top-1/2 -translate-y-1/2 text-(--text2) text-xs"></i>
                    <input
                        v-model="search"
                        @click.stop
                        type="text"
                        placeholder="Rechercher un membre..."
                        class="w-full bg-(--bg3) border border-(--border-color) rounded-lg pl-8 pr-3 py-1.5 text-xs text-(--text) placeholder:text-(--text2) focus:outline-none focus:border-(--primary)/50"
                    />
                </div>

                <div class="max-h-52 overflow-y-auto">
                    <button
                        v-for="member in filteredMembers" :key="member.id"
                        type="button"
                        @click="select(member.userId)"
                        class="dropdown-item-style"
                        :class="modelValue === member.userId ? '!bg-(--primary)/15 !text-(--primary)' : ''"
                    >
                        <img v-if="member.user?.avatarUrl" :src="member.user.avatarUrl" class="w-5 h-5 rounded-full object-cover mr-2">
                        <div v-else class="w-5 h-5 rounded-full bg-(--text)/10 flex items-center justify-center text-[9px] mr-2 shrink-0">
                            {{ ($p(member.user?.name) || member.userId).substring(0, 2).toUpperCase() }}
                        </div>
                        <span class="truncate">{{ $p(member.user?.name) || member.userId }}</span>
                    </button>
                    <p v-if="filteredMembers.length === 0" class="text-xs text-center text-(--text2) py-3">
                        Aucun résultat
                    </p>
                </div>
            </div>
        </template>
    </DropDown>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import DropDown from '@/components/DropDown.vue';
import type { OrgMember, User } from '@/types/types';

const props = defineProps<{
    members: OrgMember[];
    modelValue: string | null;
    currentUserId: string | null;
    me?: User | null;
}>();

const emit = defineEmits<{
    'update:modelValue': [string | null];
}>();

const search = ref('');

const selectedMember = computed(() => props.members.find(m => m.userId === props.modelValue));

const filteredMembers = computed(() => {
    if (!search.value.trim()) return props.members;
    const s = search.value.toLowerCase();
    return props.members.filter(m => (m.user?.name || m.userId).toLowerCase().includes(s));
});

const select = (userId: string | null) => {
    emit('update:modelValue', userId);
};

const onToggled = (open: boolean) => {
    if (open) search.value = '';
};
</script>

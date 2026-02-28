<template>

    <button
        @click="emit('click')"
        class="
            w-full flex items-start justify-start text-left gap-2 px-2 py-1.5 rounded-lg
            transition-all duration-200 group cursor-pointer
            hover:bg-(--primary)/5 active:scale-95
            hover:text-(--text) 
        "
        :class="
            active
                ? 'border-l-3 border-(--primary) bg-(--primary)/10 text-(--text)' 
                : 'text-(--text)/60' 
        "
    >

        <div class="flex items-center justify-center w-5 h-5">
            <i 
                class="bi text-xl group-hover:opacity-100"
                :class="[
                    icon,
                    active ? 'opacity-100' : 'opacity-40'
                ]"
            />
        </div>

        <span class="text-sm font-medium truncate lowercase tracking-wide">
            {{ name }}
        </span>

    </button>

</template>

<script lang="ts" setup>
 
defineProps<{
  icon: string;
  name: string;
  active?: boolean;
}>();

const emit = defineEmits(['click']);

</script>
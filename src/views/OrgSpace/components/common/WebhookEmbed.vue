<template>
    <div class="flex flex-col gap-2 mt-2 w-full max-w-[500px]">
        <div 
            v-for="(embed, index) in embeds" 
            :key="'embed-' + index"
            class="flex flex-col border-l-4 rounded bg-white/5 p-3 overflow-hidden"
            :style="{ borderLeftColor: embed.color ? `#${embed.color.toString(16).padStart(6, '0')}` : '#7c3aed' }"
        >
            <div v-if="embed.author" class="flex items-center gap-2 mb-2">
                <img v-if="embed.author.icon_url" :src="embed.author.icon_url" class="w-5 h-5 rounded-full" />
                <span class="text-xs font-semibold text-(--text)/80">{{ embed.author.name }}</span>
            </div>

            <div v-if="embed.title" class="font-bold text-sm text-(--text) mb-1">
                <a v-if="embed.url" :href="embed.url" target="_blank" class="hover:underline text-(--primary)">{{ embed.title }}</a>
                <span v-else>{{ embed.title }}</span>
            </div>

            <div v-if="embed.description" class="text-xs text-(--text)/70 mb-2 whitespace-pre-wrap">
                {{ embed.description }}
            </div>

            <div v-if="embed.fields && embed.fields.length > 0" class="flex flex-wrap gap-x-4 gap-y-2 mb-2">
                <div v-for="(field, fIdx) in embed.fields" :key="'field-' + fIdx" :class="field.inline ? 'w-[calc(50%-1rem)]' : 'w-full'">
                    <div class="text-[10px] font-bold text-(--text)/60 uppercase">{{ field.name }}</div>
                    <div class="text-xs text-(--text)/80">{{ field.value }}</div>
                </div>
            </div>

            <img v-if="embed.image && embed.image.url" :src="embed.image.url" class="rounded max-h-64 object-contain mt-2" />
            
            <div v-if="embed.thumbnail && embed.thumbnail.url" class="absolute top-3 right-3">
                <img :src="embed.thumbnail.url" class="w-16 h-16 rounded object-cover" />
            </div>

            <div v-if="embed.footer" class="flex items-center gap-2 mt-2 pt-2 border-t border-white/10">
                <img v-if="embed.footer.icon_url" :src="embed.footer.icon_url" class="w-4 h-4 rounded-full" />
                <span class="text-[10px] text-(--text)/50">{{ embed.footer.text }}</span>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
defineProps<{
    embeds: any[];
}>();
</script>
